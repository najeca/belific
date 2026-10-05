'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { KvStore, validateKey } = require('../src/kvstore');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'belific-kv-'));
}

test('validateKey accepts app keys and rejects anything unsafe', () => {
  for (const ok of ['belific_tasks', 'a', 'x.y-z_1', 'A'.repeat(128)]) {
    assert.equal(validateKey(ok), ok);
  }
  const bad = ['', 'a/b', 'a\\b', '../x', 'a b', 'é', 'A'.repeat(129), 'a\0b', undefined, null, 5, {}];
  for (const key of bad) {
    assert.throws(() => validateKey(key), /Invalid storage key/, `should reject ${String(key)}`);
  }
});

test('get on a missing key is null; set then get round trips exact text', async () => {
  const store = new KvStore(tmpDir());
  assert.equal(await store.getItem('belific_tasks'), null);
  const value = JSON.stringify([{ id: '1', title: 'café ☕ "quoted"\nnewline' }]);
  await store.setItem('belific_tasks', value);
  assert.equal(await store.getItem('belific_tasks'), value);
});

test('persistence: data written by one instance is read by a fresh instance', async () => {
  const dir = tmpDir();
  const first = new KvStore(dir);
  await first.setItem('belific_brain_dump', '[{"id":"a"}]');
  await first.setItem('belific_tasks', '[]');
  const second = new KvStore(dir);
  assert.equal(await second.getItem('belific_brain_dump'), '[{"id":"a"}]');
  assert.equal(await second.getItem('belific_tasks'), '[]');
});

test('atomic write: no temp files remain and a failed rename leaves the old value intact', async () => {
  const dir = tmpDir();
  const store = new KvStore(dir);
  await store.setItem('k', 'old');
  assert.deepEqual(
    fs.readdirSync(dir).filter((n) => n.endsWith('.tmp')),
    [],
  );
  // Make the target a directory so rename must fail: the write errors, the
  // error is reported and thrown, and no temp file is left behind.
  const target = path.join(dir, 'blocked.kv');
  fs.mkdirSync(target);
  const errors = [];
  const failing = new KvStore(dir, (err, ctx) => errors.push(ctx));
  await assert.rejects(() => failing.setItem('blocked', 'new'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /setItem blocked/);
  assert.deepEqual(
    fs.readdirSync(dir).filter((n) => n.endsWith('.tmp')),
    [],
  );
  assert.equal(await store.getItem('k'), 'old');
});

test('writes to the same key are applied in order', async () => {
  const store = new KvStore(tmpDir());
  const writes = [];
  for (let i = 0; i < 50; i++) writes.push(store.setItem('k', String(i)));
  await Promise.all(writes);
  assert.equal(await store.getItem('k'), '49');
});

test('removeItem and multiRemove delete keys; removing a missing key is fine', async () => {
  const store = new KvStore(tmpDir());
  await store.setItem('a', '1');
  await store.setItem('b', '2');
  await store.setItem('c', '3');
  await store.removeItem('a');
  await store.multiRemove(['b', 'missing']);
  assert.equal(await store.getItem('a'), null);
  assert.equal(await store.getItem('b'), null);
  assert.equal(await store.getItem('c'), '3');
  await assert.rejects(() => store.multiRemove(['c', '../evil']), /Invalid storage key/);
  assert.equal(await store.getItem('c'), '3');
});

test('invalid keys never touch the filesystem', async () => {
  const dir = tmpDir();
  const store = new KvStore(dir);
  await assert.rejects(() => store.setItem('../escape', 'x'), /Invalid storage key/);
  await assert.rejects(() => store.getItem('a/b'), /Invalid storage key/);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(fs.existsSync(path.join(dir, '..', 'escape.kv')), false);
});

test('setItem rejects non-string values', async () => {
  const store = new KvStore(tmpDir());
  await assert.rejects(() => store.setItem('k', { a: 1 }), /must be a string/);
});

test('readAll returns every stored key and ignores unrelated files', async () => {
  const dir = tmpDir();
  const store = new KvStore(dir);
  await store.setItem('one', '1');
  await store.setItem('two', '2');
  fs.writeFileSync(path.join(dir, 'stray.txt'), 'x');
  assert.deepEqual(await store.readAll(), { one: '1', two: '2' });
});
