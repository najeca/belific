'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { KvStore } = require('../src/kvstore');
const { SecureStore } = require('../src/secureStore');
const { SignIn } = require('../src/signin');
const { WINDOW_MS } = require('../src/authLink');

const HOST = 'https://uucycebkpgwbktdytxvr.supabase.co';
const authorize = `${HOST}/auth/v1/authorize?provider=apple&redirect_to=${encodeURIComponent('belific://auth-callback')}`;
const link = (code) => `belific://auth-callback?code=${code}`;
const cipher = { isAvailable: () => true, encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() };

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'belific-signin-'));
  const secure = new SecureStore(new KvStore(dir), cipher);
  return { dir, secure, signIn: new SignIn(secure, HOST) };
}
const KEY = 'sb-x-auth-token-code-verifier';

test('verifiers are never written to disk, even with encryption available', async () => {
  const { dir, secure } = setup();
  assert.deepEqual(await secure.setItem(KEY, 'VERIFIER-123'), { persisted: false });
  assert.equal(await secure.setItem('sb-x-auth-token', '{"s":1}').then((r) => r.persisted), true);
  for (const f of fs.readdirSync(dir)) assert.equal(fs.readFileSync(path.join(dir, f), 'utf8').includes('VERIFIER'), false);
  assert.equal(await secure.getItem(KEY), 'VERIFIER-123');
});

test('M1: a junk code destroys the verifier in the exchange, the failure restores it, the real code works', async () => {
  const { secure, signIn } = setup();
  await secure.setItem(KEY, 'V1');
  assert.equal(signIn.begin(authorize, 0).ok, true);
  assert.equal(signIn.onLink(link('junk'), 10).ok, true);
  await secure.removeItem(KEY); // what auth-js does, even for a failed exchange
  assert.equal(await secure.getItem(KEY), null);
  assert.equal(signIn.finish(false, 20).ended, false);
  assert.equal(await secure.getItem(KEY), 'V1');
  assert.equal(signIn.onLink(link('real'), 30).ok, true);
  await secure.removeItem(KEY);
  assert.equal(signIn.finish(true, 40).ended, true);
  assert.equal(secure.hasVerifiers(), false);
});

test('L1: cancel, expiry, a failed begin, three failures leave no verifier; a busy begin keeps the live one', async () => {
  const { secure, signIn } = setup();
  await secure.setItem(KEY, 'V');
  signIn.begin(authorize, 0);
  signIn.cancel();
  assert.equal(secure.hasVerifiers(), false);

  await secure.setItem(KEY, 'V');
  signIn.begin(authorize, 0);
  signIn.sweep(WINDOW_MS + 1);
  assert.equal(secure.hasVerifiers(), false);

  await secure.setItem(KEY, 'V');
  assert.equal(signIn.begin('https://evil.example/', 0).ok, false);
  assert.equal(secure.hasVerifiers(), false);

  await secure.setItem(KEY, 'V');
  signIn.begin(authorize, 0);
  for (let i = 0; i < 3; i++) {
    signIn.onLink(link('j' + i), 5 + i);
    await secure.removeItem(KEY);
    signIn.finish(false, 9 + i);
  }
  assert.equal(secure.hasVerifiers(), false);
  assert.equal(signIn.gate.active, false);

  await secure.setItem(KEY, 'LIVE');
  signIn.begin(authorize, 100);
  await secure.setItem(KEY, 'CLOBBER');
  assert.equal(signIn.begin(authorize, 101).reason, 'busy');
  assert.equal(await secure.getItem(KEY), 'LIVE');
});

test('M1: a replayed code after success is ignored', async () => {
  const { secure, signIn } = setup();
  await secure.setItem(KEY, 'V');
  signIn.begin(authorize, 0);
  assert.equal(signIn.onLink(link('c'), 1).ok, true);
  signIn.finish(true, 2);
  assert.equal(signIn.onLink(link('c'), 3).reason, 'no-pending');
});
