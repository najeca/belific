'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { KvStore } = require('../src/kvstore');
const { SecureStore, fileKey, PREFIX } = require('../src/secureStore');
const { ensureFirstSigninBackup, FLAG_KEY } = require('../src/firstSignin');
const { backupNow } = require('../src/backups');

// A fake cipher: reversible, authenticated, and visibly not plain text.
function fakeCipher(available = true) {
  return {
    isAvailable: () => available,
    encrypt: (s) => Buffer.from('ENC[' + Buffer.from(s, 'utf8').toString('hex') + ']'),
    decrypt: (buf) => {
      const m = /^ENC\[([0-9a-f]*)\]$/.exec(buf.toString());
      if (!m) throw new Error('bad ciphertext');
      return Buffer.from(m[1], 'hex').toString('utf8');
    },
  };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'belific-secure-'));

test('round trip: stored encrypted, never as plain text, survives a new instance', async () => {
  const dir = tmp();
  const kv = new KvStore(dir);
  const store = new SecureStore(kv, fakeCipher());
  const session = JSON.stringify({ access_token: 'TOKEN-PLAIN-123' });
  assert.deepEqual(await store.setItem('sb-session', session), { persisted: true });
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  const onDisk = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.ok(onDisk.startsWith(PREFIX));
  assert.equal(onDisk.includes('TOKEN-PLAIN-123'), false);
  const again = new SecureStore(new KvStore(dir), fakeCipher());
  assert.equal(await again.getItem('sb-session'), session);
  await again.removeItem('sb-session');
  assert.equal(await new SecureStore(new KvStore(dir), fakeCipher()).getItem('sb-session'), null);
});

test('tampered file reads as no value and reports an error without the content', async () => {
  const dir = tmp();
  const kv = new KvStore(dir);
  await new SecureStore(kv, fakeCipher()).setItem('k', 'value');
  await kv.setItem(fileKey('k'), PREFIX + Buffer.from('garbage').toString('base64'));
  const errors = [];
  const store = new SecureStore(new KvStore(dir), fakeCipher(), (e) => errors.push(String(e.message)));
  assert.equal(await store.getItem('k'), null);
  assert.equal(errors.length, 1);
  // a plain text file planted in place is also ignored
  await kv.setItem(fileKey('k'), 'plain-text-token');
  assert.equal(await new SecureStore(new KvStore(dir), fakeCipher()).getItem('k'), null);
});

test('unavailable encryption: memory only, nothing written, reads work this run', async () => {
  const dir = tmp();
  const store = new SecureStore(new KvStore(dir), fakeCipher(false));
  assert.equal(store.persistent, false);
  assert.deepEqual(await store.setItem('k', 'v'), { persisted: false });
  assert.equal(await store.getItem('k'), 'v');
  assert.deepEqual(fs.readdirSync(dir), []);
  // a new run has nothing
  assert.equal(await new SecureStore(new KvStore(dir), fakeCipher(false)).getItem('k'), null);
});

test('first sign in backup is taken exactly once, with a recognisable name', async () => {
  const dir = tmp();
  const data = path.join(dir, 'data');
  const backups = path.join(dir, 'backups');
  const kv = new KvStore(data);
  await kv.setItem('belific_tasks', '[1]');
  let calls = 0;
  const backup = (label, now) => {
    calls += 1;
    return backupNow(data, backups, now, 14, label);
  };
  const now = new Date(2026, 9, 6, 12, 0, 0);
  const first = await ensureFirstSigninBackup({ kv, backup, now });
  assert.equal(first.took, true);
  assert.ok(fs.existsSync(path.join(backups, '2026-10-06-pre-signin', 'belific_tasks.kv')));
  const second = await ensureFirstSigninBackup({ kv, backup, now });
  assert.equal(second.took, false);
  assert.equal(calls, 1);
  assert.notEqual(await kv.getItem(FLAG_KEY), null);
});

test('a failed pre-signin backup leaves the flag unset so the next attempt retries', async () => {
  const dir = tmp();
  const kv = new KvStore(path.join(dir, 'data'));
  await assert.rejects(ensureFirstSigninBackup({ kv, backup: async () => { throw new Error('disk full'); } }));
  assert.equal(await kv.getItem(FLAG_KEY), null);
});

test('labelled backups are never pruned and bad labels are refused', async () => {
  const dir = tmp();
  const data = path.join(dir, 'data');
  const backups = path.join(dir, 'backups');
  await new KvStore(data).setItem('a', '1');
  await backupNow(data, backups, new Date(2026, 0, 1), 14, 'pre-signin');
  for (let d = 2; d < 20; d++) await backupNow(data, backups, new Date(2026, 0, d), 3);
  assert.ok(fs.existsSync(path.join(backups, '2026-01-01-pre-signin')));
  assert.equal(fs.readdirSync(backups).length, 4);
  await assert.rejects(backupNow(data, backups, new Date(), 14, '../x'));
});
