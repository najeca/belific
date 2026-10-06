import { supabase } from './supabase';
import { onSignedIn, onSignedOut } from './sync';

// Desktop sign in with Apple through the system browser (decision 012,
// checkpoint 6). Web/desktop only: nothing on iOS imports this file.
//
// Flow: signInWithOAuth (PKCE, skipBrowserRedirect) builds the Apple URL and
// stores the code verifier in the encrypted session store. The main process
// opens the URL in the system browser, validates the belific://auth-callback
// link (exact shape, started in this run, inside a time window, single use)
// and hands only the code (plus the flow id) to completeAppleSignIn, which
// exchanges it with the locally stored verifier. Nothing here logs a code or
// a token.
const REDIRECT_TO = 'belific://auth-callback';

export interface AuthUiState {
  busy: boolean;
  message: string | null;
}

let ui: AuthUiState = { busy: false, message: null };
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
  if (!d) throw new Error('Sign in is only available in the desktop app.');
  return d;
}

const BEGIN_MESSAGES: Record<string, string> = {
  'backup-failed': 'Could not make the safety backup, so sign in did not start. Nothing was changed.',
  'no-browser': 'Could not open your browser.',
  refused: 'Sign in could not start.',
};

// Starts sign in: opens Apple's page in the system browser. The result
// arrives later through handleAuthCallback.
export async function startAppleSignIn(): Promise<void> {
  setUi({ busy: true, message: 'Finish signing in in your browser…' });
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw new Error('Sign in could not start.');
    const result = await bridge().auth.begin(data.url);
    if (!result.ok) throw new Error(BEGIN_MESSAGES[result.reason ?? ''] ?? 'Sign in could not start.');
  } catch (err) {
    setUi({ busy: false, message: err instanceof Error ? err.message : 'Sign in could not start.' });
  }
}

// A callback the main process has already validated.
export async function handleAuthCallback(payload: {
  code?: string;
  flowId?: string | null;
  error?: boolean;
}): Promise<void> {
  if (payload.error || !payload.code) {
    setUi({ busy: false, message: 'Sign in was cancelled.' });
    return;
  }
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(
      payload.code,
      payload.flowId ? { flowId: payload.flowId } : undefined,
    );
    // The error text is never shown or logged: it can echo request details.
    if (error) throw new Error('Sign in could not be completed. Please try again.');
    setUi({ busy: false, message: null });
    // Turns sync on and runs the first full pass (checkpoint 5 rules).
    onSignedIn().catch(() => {});
  } catch (err) {
    setUi({ busy: false, message: err instanceof Error ? err.message : 'Sign in could not be completed.' });
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

// Clears the session, the outbox, the cursors and the sync flag. Local data
// stays. If the server cannot be reached the session is still dropped here.
export async function signOutDesktop(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
  await onSignedOut();
  setUi({ busy: false, message: null });
}

// Same Edge Function path as the iPhone (guideline 5.1.1(v)); the function
// allows the app://belific origin.
export async function deleteAccountDesktop(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw new Error('The account could not be deleted. Please try again.');
  await supabase.auth.signOut({ scope: 'local' });
  await onSignedOut();
}

export async function getAccountLabel(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  return user.email ?? 'Apple account';
}

export async function isSessionPersistent(): Promise<boolean> {
  try {
    return (await globalThis.belificDesktop?.auth.status())?.persistent ?? true;
  } catch {
    return true;
  }
}
