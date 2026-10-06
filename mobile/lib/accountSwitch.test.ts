import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLD_KEY,
  LAST_USER_KEY,
  DELETED,
  chooseEmpty,
  chooseUpload,
  dataKeysHaveRows,
  decideOnSignIn,
  dropChoice,
  markAccountDeleted,
  pendingChoice,
  type AccountDeps,
} from './accountSwitch.ts';

function fake(hasData: boolean, failBackup = false) {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const d: AccountDeps = {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
    hasLocalData: async () => hasData,
    backup: async () => {
      calls.push('backup');
      if (failBackup) throw new Error('disk full');
    },
    clearLocalData: async () => void calls.push('clear'),
  };
  return { store, calls, d };
}

test('first ever sign in proceeds and records the user', async () => {
  const { store, d } = fake(true);
  assert.equal(await decideOnSignIn('u1', d), 'proceed');
  assert.equal(store.get(LAST_USER_KEY), 'u1');
  assert.equal(store.has(HOLD_KEY), false);
});

test('same user id proceeds as today', async () => {
  const { store, d } = fake(true);
  store.set(LAST_USER_KEY, 'u1');
  assert.equal(await decideOnSignIn('u1', d), 'proceed');
  assert.equal(store.has(HOLD_KEY), false);
});

test('different user with local data holds everything and asks', async () => {
  const { store, calls, d } = fake(true);
  store.set(LAST_USER_KEY, 'u1');
  assert.equal(await decideOnSignIn('u2', d), 'choose');
  assert.equal(store.get(HOLD_KEY), 'u2');
  assert.equal(store.get(LAST_USER_KEY), 'u1');
  assert.deepEqual(calls, []);
  assert.equal(await pendingChoice(d), 'u2');
});

test('different user with no local data proceeds', async () => {
  const { store, d } = fake(false);
  store.set(LAST_USER_KEY, 'u1');
  assert.equal(await decideOnSignIn('u2', d), 'proceed');
  assert.equal(store.get(LAST_USER_KEY), 'u2');
});

test('upload choice: backup first, then the account is recorded and the hold lifted', async () => {
  const { store, calls, d } = fake(true);
  store.set(LAST_USER_KEY, 'u1');
  await decideOnSignIn('u2', d);
  await chooseUpload('u2', d);
  assert.deepEqual(calls, ['backup']);
  assert.equal(store.get(LAST_USER_KEY), 'u2');
  assert.equal(store.has(HOLD_KEY), false);
});

test('empty choice: backup, then clear, then the account is recorded and the hold lifted', async () => {
  const { store, calls, d } = fake(true);
  store.set(LAST_USER_KEY, 'u1');
  await decideOnSignIn('u2', d);
  await chooseEmpty('u2', d);
  assert.deepEqual(calls, ['backup', 'clear']);
  assert.equal(store.get(LAST_USER_KEY), 'u2');
  assert.equal(store.has(HOLD_KEY), false);
});

test('a failed backup changes nothing: no clear, hold stays, choice stays open', async () => {
  const { store, calls, d } = fake(true, true);
  store.set(LAST_USER_KEY, 'u1');
  await decideOnSignIn('u2', d);
  await assert.rejects(chooseEmpty('u2', d));
  await assert.rejects(chooseUpload('u2', d));
  assert.deepEqual(calls, ['backup', 'backup']);
  assert.equal(store.get(HOLD_KEY), 'u2');
  assert.equal(store.get(LAST_USER_KEY), 'u1');
});

test('delete account, then sign in again (even as the same user id) with local data asks', async () => {
  const { store, d } = fake(true);
  await decideOnSignIn('u1', d);
  await markAccountDeleted(d);
  assert.equal(store.get(LAST_USER_KEY), DELETED);
  assert.equal(await decideOnSignIn('u1', d), 'choose');
  assert.equal(store.get(HOLD_KEY), 'u1');
});

test('delete account, then sign in with no local data proceeds', async () => {
  const { d, store } = fake(false);
  await decideOnSignIn('u1', d);
  await markAccountDeleted(d);
  assert.equal(await decideOnSignIn('u9', d), 'proceed');
  assert.equal(store.get(LAST_USER_KEY), 'u9');
});

test('signing out drops an unanswered choice but keeps the last user', async () => {
  const { store, d } = fake(true);
  store.set(LAST_USER_KEY, 'u1');
  await decideOnSignIn('u2', d);
  await dropChoice(d);
  assert.equal(store.has(HOLD_KEY), false);
  assert.equal(store.get(LAST_USER_KEY), 'u1');
});

test('dataKeysHaveRows ignores empty lists, junk and tombstones', () => {
  assert.equal(dataKeysHaveRows([null, '[]', 'not json', '{}']), false);
  assert.equal(dataKeysHaveRows(['[{"id":"a","deletedAt":"2026-01-01"}]']), false);
  assert.equal(dataKeysHaveRows([null, '[{"id":"a"}]']), true);
});
