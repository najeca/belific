import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { onSignedIn, onSignedOut } from './sync';
import { authStorage, kv } from './kv';
import { clearAllData } from './storage';
import {
  chooseEmpty,
  chooseUpload,
  dataKeysHaveRows,
  USER_DATA_KEYS,
  decideOnSignIn,
  dropChoice,
  markAccountDeleted,
  pendingChoice,
  type AccountDeps,
} from './accountSwitch';
import { isRevokePending, noteRevokeFailed, retryRevoke, type RevokeDeps } from './revokePending';
import { FAILURE_TEXT, SIGN_IN_TEXT, accountLabel, beginFailureText, oauthOptions, type SignInProvider } from './authCore';

// Desktop sign in with Apple or Google through the system browser (decision
// 012, checkpoints 6 and 12). Web/desktop only: nothing on iOS imports this
// file, and nothing here imports expo-apple-authentication.
//
// Flow: signInWithOAuth (PKCE, skipBrowserRedirect) builds the provider URL and
// stores the code verifier in the encrypted session store. The main process
// opens the URL in the system browser, validates the belific://auth-callback
// link (exact shape, started in this run, inside a time window, single use)
// and hands only the code (plus the flow id) to completeAppleSignIn, which
// exchanges it with the locally stored verifier. Nothing here logs a code or
// a token. The pure parts (providers, options, wording) are in authCore.ts.

export interface AuthUiState {
  busy: boolean;
  message: string | null;
  // The user id of a sign in waiting for the account switching choice (M2).
  choice: string | null;
  // A sign out whose server revoke is still to be retried (M3).
  revokePending: boolean;
}

let ui: AuthUiState = { busy: false, message: null, choice: null, revokePending: false };
const listeners = new Set<(s: AuthUiState) => void>();

function setUi(next: Partial<AuthUiState>): void {
  ui = { ...ui, ...next };
  for (const l of listeners) l(ui);
}

export function getAuthUi(): AuthUiState {
  return ui;
}

export function subscribeAuthUi(listener: (s: AuthUiState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function bridge() {
  const d = globalThis.belificDesktop;
  if (!d) throw new Error(FAILURE_TEXT.desktopOnly);
  return d;
}

// Starts sign in: opens the provider's page in the system browser. The result
// arrives later through handleAuthCallback.
async function startSignIn(provider: SignInProvider): Promise<void> {
  setUi({ busy: true, message: SIGN_IN_TEXT.waiting });
  try {
    // A deliberate new attempt replaces any earlier one (main refuses a second
    // begin while one runs, and wipes the old verifier on cancel).
    await bridge().auth.cancel();
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: oauthOptions(provider) });
    if (error || !data?.url) throw new Error(FAILURE_TEXT.notStarted);
    const result = await bridge().auth.begin(data.url);
    if (!result.ok) throw new Error(beginFailureText(result.reason));
  } catch (err) {
    // A failed start leaves no verifier behind. Only our own sentences are
    // shown: an error from the client or the network is never echoed.
    await globalThis.belificDesktop?.auth.cancel().catch(() => {});
    const own = err instanceof Error && isOwnMessage(err.message);
    setUi({ busy: false, message: own ? (err as Error).message : FAILURE_TEXT.notStarted });
  }
}

const OWN_MESSAGES: ReadonlySet<string> = new Set<string>([
  FAILURE_TEXT.notStarted,
  FAILURE_TEXT.desktopOnly,
  beginFailureText('backup-failed'),
  beginFailureText('no-browser'),
  beginFailureText('busy'),
]);

function isOwnMessage(message: string): boolean {
  return OWN_MESSAGES.has(message);
}

export const startAppleSignIn = (): Promise<void> => startSignIn('apple');
export const startGoogleSignIn = (): Promise<void> => startSignIn('google');

// "Not now" on the Sign in page while a browser sign in is open: ends it and
// wipes its verifier. Without one running it does nothing.
export async function cancelSignIn(): Promise<void> {
  if (!ui.busy) return;
  await globalThis.belificDesktop?.auth.cancel().catch(() => {});
  setUi({ busy: false, message: null });
}

// A callback the main process has already validated. A failed exchange keeps
// the pending sign in alive (main restores the verifier), so a stray link can
// not destroy a real one; main closes it after three failures.
export async function handleAuthCallback(payload: {
  code?: string;
  flowId?: string | null;
  error?: boolean;
}): Promise<void> {
  if (payload.error || !payload.code) {
    setUi({ busy: false, message: FAILURE_TEXT.cancelled });
    return;
  }
  let ok = false;
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      payload.code,
      payload.flowId ? { flowId: payload.flowId } : undefined,
    );
    // The error text is never shown or logged: it can echo request details.
    ok = !error && !!data?.session;
  } catch {
    ok = false;
  }
  const { ended } = await bridge()
    .auth.finish(ok)
    .catch(() => ({ ended: true }));
  if (!ok) {
    setUi(
      ended
        ? { busy: false, message: FAILURE_TEXT.notCompleted }
        : { busy: true, message: SIGN_IN_TEXT.stillWaiting },
    );
    return;
  }
  setUi({ busy: false, message: null });
  await completeSignIn();
}


const accountDeps: AccountDeps = {
  getItem: (k) => kv.getItem(k),
  setItem: (k, v) => kv.setItem(k, v),
  removeItem: (k) => kv.removeItem(k),
  hasLocalData: async () => dataKeysHaveRows(await Promise.all(USER_DATA_KEYS.map((k) => kv.getItem(k)))),
  backup: async () => {
    await bridge().actions.backupNow('account-switch');
  },
  clearLocalData: clearAllData,
};

// Decides whether this sign in may start syncing now or needs the account
// choice first (checkpoint 6.1, M2). Nothing is uploaded until it is answered.
async function completeSignIn(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) {
    setUi({ message: FAILURE_TEXT.notCompleted });
    return;
  }
  const decision = await decideOnSignIn(userId, accountDeps);
  if (decision === 'choose') {
    setUi({ choice: userId });
    return;
  }
  // Turns sync on and runs the first full pass (checkpoint 5 rules).
  onSignedIn().catch(() => {});
}

// An unanswered choice survives a relaunch (the hold flag is persisted).
export async function restoreAccountChoice(): Promise<void> {
  try {
    const pending = await pendingChoice(accountDeps);
    if (pending && !ui.choice) setUi({ choice: pending });
  } catch {
    // nothing to restore
  }
}

export async function answerAccountChoice(upload: boolean): Promise<void> {
  const userId = ui.choice;
  if (!userId) return;
  try {
    if (upload) {
      await chooseUpload(userId, accountDeps);
      setUi({ choice: null, message: null });
      onSignedIn().catch(() => {});
    } else {
      await chooseEmpty(userId, accountDeps);
      setUi({ choice: null, message: null });
      // Reload so every pane starts from the empty data; the launch sync
      // then downloads this account's rows.
      globalThis.location?.reload();
    }
  } catch {
    setUi({ message: 'Could not make the safety backup, so nothing was changed. Please try again.' });
  }
}

// Subscribes to validated callbacks from the main process. Returns the unsubscribe.
export function listenForAuthCallbacks(): () => void {
  const d = globalThis.belificDesktop;
  if (!d) return () => {};
  return d.auth.onCallback((payload) => {
    handleAuthCallback(payload).catch(() => {});
  });
}

// Throwaway client that only revokes: it never touches the stored session.
async function revokeWithTokens(tokens: { access_token: string; refresh_token: string }): Promise<'done' | 'dead' | 'offline'> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;
  const memory = new Map<string, string>();
  const temp = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: async (k: string) => memory.get(k) ?? null,
        setItem: async (k: string, v: string) => void memory.set(k, v),
        removeItem: async (k: string) => void memory.delete(k),
      },
    },
  });
  const set = await temp.auth.setSession(tokens);
  if (set.error) {
    // A rejected token means the session is already gone; anything else is the network.
    const status = (set.error as { status?: number }).status;
    return status && status >= 400 && status < 500 ? 'dead' : 'offline';
  }
  // Local scope: only this device's session ends, never the iPhone's.
  const out = await temp.auth.signOut({ scope: 'local' });
  return out.error ? 'offline' : 'done';
}

const revokeDeps: RevokeDeps = {
  getItem: (k) => authStorage.getItem(k),
  setItem: (k, v) => authStorage.setItem(k, v),
  removeItem: (k) => authStorage.removeItem(k),
  revoke: revokeWithTokens,
};

export async function refreshRevokePending(): Promise<void> {
  try {
    setUi({ revokePending: await isRevokePending(revokeDeps) });
  } catch {
    // leave as is
  }
}

// Retries a pending revoke: on launch and when the network comes back.
export async function retryPendingRevoke(): Promise<void> {
  try {
    setUi({ revokePending: await retryRevoke(revokeDeps) });
  } catch {
    // stays pending
  }
}

// Clears the session, the outbox, the cursors and the sync flag. Local data
// stays. If the server cannot be reached the session is still dropped here,
// and the tokens needed to revoke it later are kept encrypted (M3).
export async function signOutDesktop(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const tokens = data.session
    ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
    : null;
  // Local scope (2.11.2): the default is global, which would also sign the
  // iPhone out. auth-js drops the stored session even when the server call fails.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error && tokens) await noteRevokeFailed(revokeDeps, tokens);
  // Ends any sign in in progress and wipes its verifier (L1).
  await bridge().auth.cancel();
  await dropChoice(accountDeps);
  await onSignedOut();
  setUi({ busy: false, message: null, choice: null, revokePending: !!error && !!tokens });
}

// Same Edge Function path as the iPhone (guideline 5.1.1(v)); the function
// allows the app://belific origin.
export async function deleteAccountDesktop(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw new Error('The account could not be deleted. Please try again.');
  await supabase.auth.signOut({ scope: 'local' });
  // The next sign in counts as a different account (M2).
  await markAccountDeleted(accountDeps);
  await bridge().auth.cancel();
  await onSignedOut();
  setUi({ choice: null });
}

export async function getAccountLabel(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return accountLabel(data.session?.user);
}

export async function isSessionPersistent(): Promise<boolean> {
  try {
    return (await globalThis.belificDesktop?.auth.status())?.persistent ?? true;
  } catch {
    // An error is not proof that the session is kept safely.
    return false;
  }
}
