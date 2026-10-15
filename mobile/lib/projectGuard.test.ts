// Project switch safety (projectGuard.ts): state from another Supabase project
// must never carry over. Fake storage and actions, plus one test with real
// supabase-js clients for the session. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { PROJECT_KEY, ensureProject, projectFingerprint, type ProjectGuardDeps } from './projectGuard.ts';
import { DELETED, HOLD_KEY, LAST_USER_KEY } from './accountSwitch.ts';
import { META } from './syncEngine.ts';
import { TIMESTAMPED_TABLES } from './syncCore.ts';

const FORGET = [META.caps, META.seenCompletions, ...TIMESTAMPED_TABLES.map((t) => META.cursor(t)), HOLD_KEY];
const STATE = ['belific_sync_enabled', 'belific_sync_outbox', ...FORGET, LAST_USER_KEY];
const NEW_FP = 'newproj.supabase.co/belific';

function setup(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const calls: string[] = [];
  const d: ProjectGuardDeps = {
    fingerprint: NEW_FP,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
    stateKeys: STATE,
    forgetKeys: FORGET,
    lastUserKey: LAST_USER_KEY,
    differentAccountMarker: DELETED,
    disableSync: async () => {
      calls.push('disableSync');
      store.set('belific_sync_enabled', 'false');
      store.delete('belific_sync_outbox');
    },
    signOutLocal: async () => void calls.push('signOutLocal'),
    cancelPendingSignIn: async () => void calls.push('cancelPendingSignIn'),
    dropRevokePending: async () => void calls.push('dropRevokePending'),
  };
  return { store, calls, d };
}

const OLD_STATE = {
  belific_sync_enabled: 'true',
  belific_sync_outbox: '{"entries":[{"table":"tasks"}]}',
  [META.caps]: '{"serverUpdatedAt":true}',
  [META.cursor('tasks')]: '2026-10-10T10:00:00+00:00',
  [META.cursor('projects')]: '2026-10-10T10:00:00+00:00',
  [META.seenCompletions]: '["r|2026-10-01"]',
  [LAST_USER_KEY]: 'old-user-id',
  [HOLD_KEY]: 'old-user-id',
  belific_tasks: '[{"id":"t1","title":"keep me"}]',
};

test('fingerprint is host and schema', () => {
  assert.equal(projectFingerprint('https://abc.supabase.co', 'belific'), 'abc.supabase.co/belific');
  assert.notEqual(projectFingerprint('https://abc.supabase.co', 'belific'), projectFingerprint('https://abc.supabase.co', 'public'));
});

test('a brand new install just records the fingerprint', async () => {
  const { store, calls, d } = setup({ belific_tasks: '[]' });
  assert.equal(await ensureProject(d), 'first');
  assert.equal(store.get(PROJECT_KEY), NEW_FP);
  assert.deepEqual(calls, []);
});

test('the same project again changes nothing', async () => {
  const { store, calls, d } = setup({ ...OLD_STATE, [PROJECT_KEY]: NEW_FP });
  const before = new Map(store);
  assert.equal(await ensureProject(d), 'same');
  assert.deepEqual([...store], [...before]);
  assert.deepEqual(calls, []);
});

for (const [label, initial] of [
  ['state from before the fingerprint existed (an install from the old project)', OLD_STATE],
  ['a different stored fingerprint', { ...OLD_STATE, [PROJECT_KEY]: 'oldproj.supabase.co/public' }],
] as const) {
  test(`switch: ${label}`, async () => {
    const { store, calls, d } = setup(initial);
    assert.equal(await ensureProject(d), 'switched');
    // signs out locally, ends a pending sign in, drops old revoke tokens, sync off + outbox gone
    for (const c of ['cancelPendingSignIn', 'signOutLocal', 'dropRevokePending', 'disableSync']) assert.ok(calls.includes(c), c);
    assert.equal(store.get('belific_sync_outbox'), undefined);
    assert.equal(store.get('belific_sync_enabled'), 'false');
    // cursor, caps, seen completions and the pending choice are gone: the next pull is a full one
    for (const k of FORGET) assert.equal(store.get(k), undefined, k);
    // the old user id does not survive; the next sign in counts as a different account
    assert.equal(store.get(LAST_USER_KEY), DELETED);
    // local data is kept
    assert.equal(store.get('belific_tasks'), OLD_STATE.belific_tasks);
    assert.equal(store.get(PROJECT_KEY), NEW_FP);
    // and it only happens once
    calls.length = 0;
    assert.equal(await ensureProject(d), 'same');
    assert.deepEqual(calls, []);
  });
}

test('a failing sign out or cancel does not stop the reset', async () => {
  const { store, d } = setup(OLD_STATE);
  d.signOutLocal = async () => {
    throw new Error('offline');
  };
  d.cancelPendingSignIn = async () => {
    throw new Error('no bridge');
  };
  assert.equal(await ensureProject(d), 'switched');
  assert.equal(store.get(LAST_USER_KEY), DELETED);
  assert.equal(store.get(META.cursor('tasks')), undefined);
});

test('if the outbox cannot be emptied the fingerprint is not written, so it runs again', async () => {
  const { store, d } = setup(OLD_STATE);
  d.disableSync = async () => {
    throw new Error('disk full');
  };
  await assert.rejects(ensureProject(d), /disk full/);
  assert.equal(store.get(PROJECT_KEY), undefined);
  assert.equal(store.get(LAST_USER_KEY), 'old-user-id');
});

test('after the switch the existing account choice flow decides (a different account)', async () => {
  const { decideOnSignIn } = await import('./accountSwitch.ts');
  const { store, d } = setup(OLD_STATE);
  await ensureProject(d);
  const outcome = await decideOnSignIn('new-project-user', {
    getItem: d.getItem,
    setItem: d.setItem,
    removeItem: d.removeItem,
    hasLocalData: async () => true,
    backup: async () => {},
    clearLocalData: async () => {},
  });
  assert.equal(outcome, 'choose');
  assert.equal(store.get(HOLD_KEY), 'new-project-user');
});

test('a session stored for another project is never read by this one', async () => {
  // supabase-js keys the stored session by the project host, so a session
  // written for one project is invisible to a client for another.
  const memory = new Map<string, string>();
  const storage = {
    getItem: async (k: string) => memory.get(k) ?? null,
    setItem: async (k: string, v: string) => void memory.set(k, v),
    removeItem: async (k: string) => void memory.delete(k),
  };
  const mk = (url: string) =>
    createClient(url, 'anon', { auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u', exp: 4102444800 })}.sig`;
  memory.set(
    'sb-oldproj-auth-token',
    JSON.stringify({ access_token: jwt, refresh_token: 'r', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'old-user' } }),
  );
  assert.equal((await mk('https://oldproj.supabase.co').auth.getSession()).data.session?.user.id, 'old-user', 'control: same project reads it');
  assert.equal((await mk('https://newproj.supabase.co').auth.getSession()).data.session, null);
});
