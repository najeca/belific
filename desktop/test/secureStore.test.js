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

test('L2: an encryption error falls back to memory, reports persisted:false and flags the store', async () => {
  const dir = tmp();
  const bad = { ...fakeCipher(), encrypt: () => { throw new Error('boom'); } };
  const errors = [];
  const store = new SecureStore(new KvStore(dir), bad, (e) => errors.push(e.message));
  assert.equal(store.persistent, true);
  assert.deepEqual(await store.setItem('k', 'SECRETVAL'), { persisted: false });
  assert.equal(await store.getItem('k'), 'SECRETVAL');
  assert.equal(store.persistent, false);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].includes('SECRETVAL'), false);
});

test('M3: secure files are left out of readAll, daily backups and labelled backups', async () => {
  const dir = tmp();
  const data = path.join(dir, 'data');
  const backups = path.join(dir, 'backups');
  const kv = new KvStore(data);
  await kv.setItem('belific_tasks', '[1]');
  await new SecureStore(kv, fakeCipher()).setItem('sb-session', 'TOKEN-PLAIN');
  await kv.setItem('secure.fake', 'FAKE-SECURE-VALUE');
  assert.ok(fs.readdirSync(data).filter((n) => n.startsWith('secure.')).length >= 2);
  assert.deepEqual(Object.keys(await kv.readAll()), ['belific_tasks']);
  for (const label of [null, 'pre-signin', 'account-switch']) {
    const target = await backupNow(data, backups, new Date(2026, 9, 6), 14, label);
    assert.deepEqual(fs.readdirSync(target), ['belific_tasks.kv']);
  }
});

test('L4: a labelled backup folder is never replaced, a numeric suffix is added', async () => {
  const dir = tmp();
  const data = path.join(dir, 'data');
  const backups = path.join(dir, 'backups');
  const kv = new KvStore(data);
  await kv.setItem('a', 'ONE');
  const first = await backupNow(data, backups, new Date(2026, 9, 6), 14, 'account-switch');
  await kv.setItem('a', 'TWO');
  const second = await backupNow(data, backups, new Date(2026, 9, 6), 14, 'account-switch');
  const third = await backupNow(data, backups, new Date(2026, 9, 6), 14, 'account-switch');
  assert.deepEqual(
    [first, second, third].map((p) => path.basename(p)),
    ['2026-10-06-account-switch', '2026-10-06-account-switch-2', '2026-10-06-account-switch-3'],
  );
  assert.equal(fs.readFileSync(path.join(first, 'a.kv'), 'utf8'), 'ONE');
  assert.equal(fs.readFileSync(path.join(second, 'a.kv'), 'utf8'), 'TWO');
});

test('L4: the page may not touch secure.* keys or the first sign in flag', () => {
  const { assertRendererKey } = require('../src/ipcPolicy');
  assert.throws(() => assertRendererKey('secure.abc'));
  assert.throws(() => assertRendererKey(FLAG_KEY));
  assert.equal(assertRendererKey('belific_tasks'), 'belific_tasks');
  assert.equal(assertRendererKey('belific_last_user_id'), 'belific_last_user_id');
});

test('L3: only the allow listed https pages open in the browser', () => {
  const { isAllowedExternal } = require('../src/externalLinks');
  for (const ok of [
    'https://uucycebkpgwbktdytxvr.supabase.co/auth/v1/authorize?provider=apple',
    'https://najeca.github.io/belific/privacy.html',
    'https://github.com/najeca/belific/issues',
  ]) assert.equal(isAllowedExternal(ok), true, ok);
  for (const bad of [
    'http://najeca.github.io/belific/privacy.html',
    'https://najeca.github.io.evil.com/belific/',
    'https://najeca.github.io/other/',
    'https://github.com/other/repo',
    'https://user@github.com/najeca/belific/issues',
    'https://github.com:444/najeca/belific/issues',
    'https://evil.example/',
    'file:///c:/windows/system32/calc.exe',
    'javascript:alert(1)',
    'belific://auth-callback',
    '',
    null,
  ]) assert.equal(isAllowedExternal(bad), false, String(bad));
});
