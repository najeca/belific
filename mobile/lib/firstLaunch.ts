// The phone's first launch and sign in gate (PLAN_phone_parity item A, phase 2, 3.58.0). Pure, with injected
// storage and actions, so firstLaunch.test.ts runs it with fakes: no React Native, no Supabase, no network.
// lib/phoneAccount.ts wires it to the app.
//
// Rules:
// - Signed out and never chose "Use without an account": the full Sign in screen (first launch, and after any
//   sign out, which forgets that choice).
// - "Use without an account": Today, and the screen does not come back until a sign out (a local key, never synced).
// - After a sign in, a hold is written BEFORE anything syncs. The account is asked "do you have any Belific rows?"
//   (a read, limit 1 per table). Rows: the hold goes and the usual first sync runs. None: the hold stays and the
//   "This account has no tasks yet" sheet shows; nothing on this phone is uploaded until the person chooses.
//   The hold survives a relaunch, so the sheet comes back instead of a silent upload.

// Local only, never synced: "this phone is used without an account".
export const NO_ACCOUNT_KEY = 'belific_phone_no_account';
// Local only: a sign in whose account has not been checked yet, or was found empty and is waiting for a choice.
// Holds the user id. lib/sync.ts reads it as a literal and syncs nothing while it is set.
export const ACCOUNT_CHECK_KEY = 'belific_phone_account_check';

export type GateScreen = 'sign-in' | 'checking' | 'empty-account' | 'check-failed' | 'app';

export interface GateInput {
  // A stored session exists.
  signedIn: boolean;
  // NO_ACCOUNT_KEY is set.
  noAccount: boolean;
  // ACCOUNT_CHECK_KEY is set (for this session's user).
  checkPending: boolean;
  // The result of the check, once it has run in this launch.
  check: 'none' | 'running' | 'empty' | 'has-rows' | 'failed';
}

export function gateScreen(s: GateInput): GateScreen {
  if (!s.signedIn) return s.noAccount ? 'app' : 'sign-in';
  if (!s.checkPending) return 'app';
  if (s.check === 'empty') return 'empty-account';
  if (s.check === 'failed') return 'check-failed';
  if (s.check === 'has-rows') return 'app';
  return 'checking';
}

export interface FirstLaunchDeps {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  // Does the signed in account have any Belific row at all (any table)? Throws when it cannot tell.
  accountHasRows(): Promise<boolean>;
  // The usual first sync: pull, merge, upload this phone's rows (lib/sync.ts onSignedIn).
  startSync(): Promise<void>;
  // Local sign out (scope local) and sync off.
  signOutLocal(): Promise<void>;
}

// Before a sign in finishes (and before anything syncs): the hold.
export async function holdBeforeSync(userId: string, d: Pick<FirstLaunchDeps, 'setItem'>): Promise<void> {
  await d.setItem(ACCOUNT_CHECK_KEY, userId);
}

// Is a hold waiting for this user? A hold for another user (left by an earlier session) counts too: it is safer to ask.
export async function checkPending(d: Pick<FirstLaunchDeps, 'getItem'>): Promise<boolean> {
  return (await d.getItem(ACCOUNT_CHECK_KEY)) !== null;
}

export type CheckResult = 'has-rows' | 'empty' | 'failed';

// The check after a sign in (or on a launch with the hold still set). With rows: hold off, and the first sync is
// awaited, so the screen says "Getting your tasks…" until the account's tasks are on the phone and Today never shows
// empty first (a failed sync still moves on: the sync line says why). Empty or unknown: the hold stays.
export async function checkAccount(d: FirstLaunchDeps): Promise<CheckResult> {
  let has: boolean;
  try {
    has = await d.accountHasRows();
  } catch {
    return 'failed';
  }
  if (!has) return 'empty';
  await d.removeItem(ACCOUNT_CHECK_KEY);
  await d.removeItem(NO_ACCOUNT_KEY);
  await d.startSync().catch(() => {});
  return 'has-rows';
}

// "Start fresh with this account": the person chose; this phone's tasks (if any) are kept and saved to it.
export async function startFresh(d: FirstLaunchDeps): Promise<void> {
  await d.removeItem(ACCOUNT_CHECK_KEY);
  await d.removeItem(NO_ACCOUNT_KEY);
  d.startSync().catch(() => {});
}

// "Sign out and try another way": nothing was uploaded; back to the Sign in screen.
export async function signOutAndRetry(d: FirstLaunchDeps): Promise<void> {
  await d.signOutLocal();
  await afterSignOut(d);
}

// After any sign out (Settings, account deletion, the sheet): the Sign in screen comes back.
export async function afterSignOut(d: Pick<FirstLaunchDeps, 'removeItem'>): Promise<void> {
  await d.removeItem(ACCOUNT_CHECK_KEY);
  await d.removeItem(NO_ACCOUNT_KEY);
}

// "Use without an account".
export async function useWithoutAccount(d: Pick<FirstLaunchDeps, 'setItem'>): Promise<void> {
  await d.setItem(NO_ACCOUNT_KEY, '1');
}

export type SignInMethod = 'apple' | 'google' | 'unknown';

// Which method the session came from, from the public fields of a Supabase user.
export function methodOf(user: { app_metadata?: { provider?: unknown } | null } | null | undefined): SignInMethod {
  const p = user?.app_metadata?.provider;
  return p === 'apple' || p === 'google' ? p : 'unknown';
}

// Every sentence of the screen and the sheet, in one place so one test reads them all.
export const FIRST_LAUNCH_TEXT = {
  heading: 'Sign in to see your tasks',
  intro: 'Your tasks are kept with your account. Sign in to see them on this phone.',
  google: 'Continue with Google',
  apple: 'Continue with Apple',
  noAccount: 'Use without an account',
  noAccountNote: 'Your tasks stay on this phone only. You can sign in later in Settings.',
  checking: 'Getting your tasks…',
  checkFailed: 'Could not reach your account to check for tasks. Nothing on this phone was uploaded.',
  tryAgain: 'Try again',
  cancelGoogle: 'Cancel',
} as const;

export const EMPTY_ACCOUNT_TEXT = {
  heading: 'This account has no tasks yet',
  signOut: 'Sign out and try another way',
  startFresh: 'Start fresh',
  startFreshNote: 'Use this account from now on. Anything already on this phone is saved to it.',
  nothingUploaded: 'Nothing on this phone has been uploaded to this account.',
} as const;

// What the sheet says about where the tasks may be. Apple and Google are separate accounts here: an Apple sign in
// that hides its email never matches the Google one, so it opens a new, empty account.
export function emptyAccountBody(method: SignInMethod): string {
  if (method === 'apple') {
    return 'You signed in with Apple. If you used Google before, your tasks are under your Google account, not this one. Apple and Google are separate accounts in Belific, so choose Sign out and try another way, then Continue with Google.';
  }
  if (method === 'google') {
    return 'You signed in with Google. If you used Apple before, your tasks are under your Apple account, not this one. Apple and Google are separate accounts in Belific, so choose Sign out and try another way, then Continue with Apple. If you have more than one Google account, the tasks may be under another one.';
  }
  return 'If you signed in another way before, your tasks are under that account, not this one. Choose Sign out and try another way to use it.';
}
