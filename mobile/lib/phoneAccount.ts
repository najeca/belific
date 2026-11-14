import { supabase } from './supabase';
import { kv } from './kv';
import { ensureCurrentProject, onSignedIn, onSignedOut } from './sync';
import { accountHasRows } from './syncServer';
import { signOutThisDevice } from './phoneAuthCore';
import {
  ACCOUNT_CHECK_KEY,
  NO_ACCOUNT_KEY,
  afterSignOut,
  checkAccount,
  gateScreen,
  holdBeforeSync,
  methodOf,
  signOutAndRetry,
  startFresh,
  useWithoutAccount,
  type FirstLaunchDeps,
  type GateInput,
  type GateScreen,
  type SignInMethod,
} from './firstLaunch';

// The phone's sign in gate, wired to the app (3.58.0). The rules are in firstLaunch.ts; this file holds the live
// state for app/welcome.tsx and app/index.tsx and connects the rules to kv, the Supabase client and sync.

export interface PhoneGateState extends GateInput {
  loaded: boolean;
  method: SignInMethod;
  screen: GateScreen;
}

let state: PhoneGateState = { loaded: false, signedIn: false, noAccount: false, checkPending: false, check: 'none', method: 'unknown', screen: 'sign-in' };
const listeners = new Set<(s: PhoneGateState) => void>();

function set(patch: Partial<PhoneGateState>): void {
  const next = { ...state, ...patch };
  state = { ...next, screen: gateScreen(next) };
  for (const l of listeners) l(state);
}

const deps: FirstLaunchDeps = {
  getItem: (k) => kv.getItem(k),
  setItem: (k, v) => kv.setItem(k, v),
  removeItem: (k) => kv.removeItem(k),
  accountHasRows: async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new Error('no session');
    return accountHasRows(supabase, userId);
  },
  startSync: onSignedIn,
  // Local scope only, as Settings' Sign out: the other apps sharing the login stay signed in.
  signOutLocal: async () => {
    await signOutThisDevice(supabase.auth);
    await onSignedOut();
  },
};

export function getPhoneGate(): PhoneGateState {
  return state;
}

export function subscribePhoneGate(listener: (s: PhoneGateState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Reads the session and the two local keys. On a launch with the hold still set (the app was closed during the check,
// or the sheet was left unanswered) the check runs again.
export async function loadPhoneGate(): Promise<void> {
  try {
    await ensureCurrentProject();
  } catch {
    // The project check is retried by the next sync; the gate still reads what is stored.
  }
  const [session, noAccount, pending] = await Promise.all([
    supabase.auth.getSession().then(({ data }) => data.session).catch(() => null),
    kv.getItem(NO_ACCOUNT_KEY).catch(() => null),
    kv.getItem(ACCOUNT_CHECK_KEY).catch(() => null),
  ]);
  const user = session?.user ?? null;
  set({ loaded: true, signedIn: !!user, noAccount: noAccount !== null, checkPending: pending !== null, method: methodOf(user) });
  if (user && pending !== null && state.check === 'none') await runCheck();
}

async function runCheck(): Promise<void> {
  set({ check: 'running' });
  const result = await checkAccount(deps);
  set({ check: result, checkPending: result !== 'has-rows' });
}

// Before a sign in creates its session (Apple before signInWithIdToken, Google before the code exchange).
export async function holdPhoneSync(): Promise<void> {
  await holdBeforeSync('pending', deps);
}

// After a good sign in (Apple or Google): the account is checked before anything syncs.
export async function afterPhoneSignIn(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  set({ signedIn: !!data.session, checkPending: true, check: 'none', method: methodOf(data.session?.user) });
  await runCheck();
}

export async function retryPhoneCheck(): Promise<void> {
  await runCheck();
}

export async function chooseStartFresh(): Promise<void> {
  await startFresh(deps);
  set({ checkPending: false, check: 'has-rows', noAccount: false });
}

export async function chooseSignOutAndRetry(): Promise<void> {
  await signOutAndRetry(deps);
  set({ signedIn: false, checkPending: false, check: 'none', noAccount: false, method: 'unknown' });
}

export async function chooseNoAccount(): Promise<void> {
  await useWithoutAccount(deps);
  set({ noAccount: true });
}

// After any other sign out (Settings, Delete account): the Sign in screen comes back.
export async function phoneSignedOut(): Promise<void> {
  await afterSignOut(deps);
  set({ signedIn: false, checkPending: false, check: 'none', noAccount: false, method: 'unknown' });
}

// A sign in that failed after the hold was written: the hold goes, nothing else changes.
export async function dropPhoneHold(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  await kv.removeItem(ACCOUNT_CHECK_KEY).catch(() => {});
}
