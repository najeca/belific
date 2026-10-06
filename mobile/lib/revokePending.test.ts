import test from 'node:test';
import assert from 'node:assert/strict';
import { REVOKE_KEY, isRevokePending, noteRevokeFailed, retryRevoke, type RevokeDeps } from './revokePending.ts';

function fake(results: Array<'done' | 'dead' | 'offline' | 'throw'>) {
  const store = new Map<string, string>();
  const seen: string[] = [];
  const d: RevokeDeps = {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
    revoke: async (t) => {
      seen.push(t.refresh_token);
      const r = results.shift() ?? 'offline';
      if (r === 'throw') throw new Error('network');
      return r;
    },
  };
  return { store, seen, d };
}
const tokens = { access_token: 'A1', refresh_token: 'R1' };

test('a failed revoke is remembered with its tokens, and the note is visible', async () => {
  const { store, d } = fake([]);
  assert.equal(await isRevokePending(d), false);
  await noteRevokeFailed(d, tokens);
  assert.equal(await isRevokePending(d), true);
  assert.deepEqual(JSON.parse(store.get(REVOKE_KEY)!), tokens);
});

test('retry offline keeps the flag; back online clears it', async () => {
  const { d, seen } = fake(['offline', 'throw', 'done']);
  await noteRevokeFailed(d, tokens);
  assert.equal(await retryRevoke(d), true);
  assert.equal(await retryRevoke(d), true);
  assert.equal(await isRevokePending(d), true);
  assert.equal(await retryRevoke(d), false);
  assert.equal(await isRevokePending(d), false);
  assert.deepEqual(seen, ['R1', 'R1', 'R1']);
});

test('a session the server already considers gone also clears the flag', async () => {
  const { d } = fake(['dead']);
  await noteRevokeFailed(d, tokens);
  assert.equal(await retryRevoke(d), false);
  assert.equal(await isRevokePending(d), false);
});

test('nothing pending means nothing is called; a corrupt entry is dropped', async () => {
  const { d, store, seen } = fake([]);
  assert.equal(await retryRevoke(d), false);
  store.set(REVOKE_KEY, 'not json');
  assert.equal(await retryRevoke(d), false);
  assert.equal(store.has(REVOKE_KEY), false);
  assert.deepEqual(seen, []);
});
