// The phone's first launch gate and the empty account sheet (firstLaunch.ts, 3.58.0), with fakes: no React Native,
// no Supabase, no network, no real sign in.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACCOUNT_CHECK_KEY,
  EMPTY_ACCOUNT_TEXT,
  FIRST_LAUNCH_TEXT,
  NO_ACCOUNT_KEY,
  afterSignOut,
  checkAccount,
  checkPending,
  emptyAccountBody,
  gateScreen,
  holdBeforeSync,
  methodOf,
  signOutAndRetry,
  startFresh,
  useWithoutAccount,
  type FirstLaunchDeps,
  type GateInput,
} from './firstLaunch.ts';
import { createPhoneGoogleFlow } from './phoneGoogleFlow.ts';
import { FAILURE_TEXT } from './authCore.ts';
import { pkceChallengeOf } from './phoneAuthCore.ts';
import { ACCOUNT_TABLES } from './syncServer.ts';
import { TIMESTAMPED_TABLES } from './syncCore.ts';

function fakes(over: Partial<FirstLaunchDeps> = {}) {
  const store = new Map<string, string>();
  const log = { synced: 0, signedOut: 0, asked: 0 };
  const d: FirstLaunchDeps = {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
    accountHasRows: async () => {
      log.asked += 1;
      return false;
    },
    startSync: async () => void (log.synced += 1),
    signOutLocal: async () => void (log.signedOut += 1),
    ...over,
  };
  return { d, store, log };
}

const base: GateInput = { signedIn: false, noAccount: false, checkPending: false, check: 'none' };

test('first launch, signed out: the Sign in screen', () => {
  assert.equal(gateScreen(base), 'sign-in');
});

test('"Use without an account" opens the app and is remembered on this phone', async () => {
  const { d, store } = fakes();
  await useWithoutAccount(d);
  assert.equal(store.get(NO_ACCOUNT_KEY), '1');
  assert.equal(gateScreen({ ...base, noAccount: true }), 'app');
});

test('after any sign out the Sign in screen comes back, and a leftover hold goes', async () => {
  const { d, store } = fakes();
  store.set(NO_ACCOUNT_KEY, '1');
  store.set(ACCOUNT_CHECK_KEY, 'pending');
  await afterSignOut(d);
  assert.equal(store.has(NO_ACCOUNT_KEY), false);
  assert.equal(store.has(ACCOUNT_CHECK_KEY), false);
  assert.equal(gateScreen(base), 'sign-in');
});

test('signed in with no hold (an existing signed in phone): the app as before', () => {
  assert.equal(gateScreen({ ...base, signedIn: true }), 'app');
  assert.equal(gateScreen({ ...base, signedIn: true, noAccount: true }), 'app');
});

test('signed in with the hold: checking, then the empty sheet, a failed check, or the app', () => {
  const held = { ...base, signedIn: true, checkPending: true };
  assert.equal(gateScreen({ ...held, check: 'none' }), 'checking');
  assert.equal(gateScreen({ ...held, check: 'running' }), 'checking');
  assert.equal(gateScreen({ ...held, check: 'empty' }), 'empty-account');
  assert.equal(gateScreen({ ...held, check: 'failed' }), 'check-failed');
  assert.equal(gateScreen({ ...held, check: 'has-rows' }), 'app');
});

test('a hold without a session (a sign in that failed) does not trap the person', () => {
  assert.equal(gateScreen({ ...base, checkPending: true, check: 'empty' }), 'sign-in');
});

test('the hold is written before anything syncs and reads back as pending', async () => {
  const { d, store } = fakes();
  assert.equal(await checkPending(d), false);
  await holdBeforeSync('pending', d);
  assert.equal(store.get(ACCOUNT_CHECK_KEY), 'pending');
  assert.equal(await checkPending(d), true);
});

test('an account with tasks: the hold goes and the first sync runs (and is awaited)', async () => {
  let finished = false;
  const { d, store, log } = fakes({
    accountHasRows: async () => true,
    startSync: async () => {
      await new Promise((r) => setTimeout(r, 5));
      finished = true;
    },
  });
  store.set(ACCOUNT_CHECK_KEY, 'pending');
  assert.equal(await checkAccount(d), 'has-rows');
  assert.equal(finished, true);
  assert.equal(store.has(ACCOUNT_CHECK_KEY), false);
  assert.equal(log.signedOut, 0);
});

test('an account with tasks whose first sync fails still opens the app (the sync line says why)', async () => {
  const { d } = fakes({ accountHasRows: async () => true, startSync: async () => { throw new Error('offline'); } });
  assert.equal(await checkAccount(d), 'has-rows');
});

test('an empty account: the sheet, the hold stays, nothing is synced or uploaded', async () => {
  const { d, store, log } = fakes();
  store.set(ACCOUNT_CHECK_KEY, 'pending');
  assert.equal(await checkAccount(d), 'empty');
  assert.equal(store.get(ACCOUNT_CHECK_KEY), 'pending');
  assert.equal(log.synced, 0);
});

test('a check that cannot reach the account: failed, the hold stays, nothing is synced', async () => {
  const { d, store, log } = fakes({ accountHasRows: async () => { throw new Error('Network request failed'); } });
  store.set(ACCOUNT_CHECK_KEY, 'pending');
  assert.equal(await checkAccount(d), 'failed');
  assert.equal(store.get(ACCOUNT_CHECK_KEY), 'pending');
  assert.equal(log.synced, 0);
});

test('"Start fresh": the hold goes and sync starts only now', async () => {
  const { d, store, log } = fakes();
  store.set(ACCOUNT_CHECK_KEY, 'pending');
  store.set(NO_ACCOUNT_KEY, '1');
  await checkAccount(d);
  assert.equal(log.synced, 0);
  await startFresh(d);
  assert.equal(log.synced, 1);
  assert.equal(store.has(ACCOUNT_CHECK_KEY), false);
  assert.equal(store.has(NO_ACCOUNT_KEY), false);
});

test('"Sign out and try another way": a local sign out, nothing synced, back to the Sign in screen', async () => {
  const { d, store, log } = fakes();
  store.set(ACCOUNT_CHECK_KEY, 'pending');
  await checkAccount(d);
  await signOutAndRetry(d);
  assert.equal(log.signedOut, 1);
  assert.equal(log.synced, 0);
  assert.equal(store.has(ACCOUNT_CHECK_KEY), false);
  assert.equal(gateScreen(base), 'sign-in');
});

test('the sign in method comes from the public user fields', () => {
  assert.equal(methodOf({ app_metadata: { provider: 'apple' } }), 'apple');
  assert.equal(methodOf({ app_metadata: { provider: 'google' } }), 'google');
  assert.equal(methodOf({ app_metadata: { provider: 'email' } }), 'unknown');
  assert.equal(methodOf(null), 'unknown');
});

test('the sheet says plainly what an Apple sign in with the tasks under Google means', () => {
  const apple = emptyAccountBody('apple');
  assert.match(apple, /You signed in with Apple/);
  assert.match(apple, /your tasks are under your Google account, not this one/);
  assert.match(apple, /Apple and Google are separate accounts/);
  assert.match(apple, /Sign out and try another way, then Continue with Google/);
  assert.match(emptyAccountBody('google'), /Continue with Apple/);
  assert.match(emptyAccountBody('unknown'), /Sign out and try another way/);
});

test('the words: Google and Apple only, no email, plain sentences', () => {
  assert.equal(FIRST_LAUNCH_TEXT.heading, 'Sign in to see your tasks');
  assert.equal(FIRST_LAUNCH_TEXT.google, 'Continue with Google');
  assert.equal(FIRST_LAUNCH_TEXT.apple, 'Continue with Apple');
  assert.equal(FIRST_LAUNCH_TEXT.noAccount, 'Use without an account');
  assert.equal(EMPTY_ACCOUNT_TEXT.heading, 'This account has no tasks yet');
  assert.equal(EMPTY_ACCOUNT_TEXT.signOut, 'Sign out and try another way');
  assert.equal(EMPTY_ACCOUNT_TEXT.startFresh, 'Start fresh');
  const all = [...Object.values(FIRST_LAUNCH_TEXT), ...Object.values(EMPTY_ACCOUNT_TEXT), emptyAccountBody('apple'), emptyAccountBody('google')].join(' ');
  assert.doesNotMatch(all, /e-?mail/i);
});

test('the account check reads every Belific table, the sync tables and completions', () => {
  assert.deepEqual([...ACCOUNT_TABLES].sort(), [...TIMESTAMPED_TABLES, 'routine_completions'].sort());
});

test('the screen file: 14 px text or more, 44 pt touch targets or more, no danger colour', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'app', 'welcome.tsx'), 'utf8');
  for (const m of src.matchAll(/fontSize: (\d+)/g)) assert.ok(Number(m[1]) >= 14, `fontSize ${m[1]}`);
  for (const m of src.matchAll(/minHeight: (\d+|MIN_TOUCH)/g)) assert.ok(m[1] === 'MIN_TOUCH' || Number(m[1]) >= 44, `minHeight ${m[1]}`);
  assert.doesNotMatch(src, /danger/);
});

// The in app sign in sheet (expo-web-browser openAuthSessionAsync) hands the link back to the flow itself.
const ORIGIN = 'https://example-project.supabase.co';
const VERIFIER = 'cd'.repeat(56);
const URL_OK = `${ORIGIN}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent('belific://auth-callback')}&code_challenge=${pkceChallengeOf(VERIFIER)}&code_challenge_method=s256&prompt=select_account&skip_http_redirect=true`;

function google(openResult: unknown) {
  const log = { exchanges: 0, held: 0, after: 0, order: [] as string[] };
  const flow = createPhoneGoogleFlow({
    origin: ORIGIN,
    auth: {
      signInWithOAuth: async () => ({ data: { url: URL_OK, flowId: 'clientflow_1234' }, error: null }),
      exchangeCodeForSession: async () => {
        log.exchanges += 1;
        log.order.push('exchange');
        return { data: { session: {} }, error: null };
      },
    },
    openUrl: async () => openResult,
    prepare: async () => {},
    randomIsSecure: () => true,
    readVerifier: async () => VERIFIER,
    beforeExchange: async () => {
      log.held += 1;
      log.order.push('hold');
    },
    afterSignIn: async () => void (log.after += 1),
  });
  return { flow, log };
}

test('Google in the in app sheet: the returned link is exchanged once, after the hold', async () => {
  const { flow, log } = google({ type: 'success', url: 'belific://auth-callback?code=ABC' });
  await flow.start();
  assert.equal(log.exchanges, 1);
  assert.deepEqual(log.order, ['hold', 'exchange']);
  assert.equal(log.after, 1);
  assert.deepEqual(flow.getState(), { busy: false, message: null });
});

test('Google in the in app sheet: closing it says the sign in was cancelled, nothing is exchanged', async () => {
  for (const type of ['cancel', 'dismiss']) {
    const { flow, log } = google({ type });
    await flow.start();
    assert.equal(log.exchanges, 0);
    assert.equal(log.held, 0);
    assert.deepEqual(flow.getState(), { busy: false, message: FAILURE_TEXT.cancelled });
  }
});

test('Google in the in app sheet: a link for another project is refused, nothing is exchanged', async () => {
  const { flow, log } = google({ type: 'success', url: 'otherapp://auth-callback?code=ABC' });
  await flow.start();
  assert.equal(log.exchanges, 0);
});
