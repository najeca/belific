// Pure sign in code for the desktop (checkpoint 12, decision 026). No imports,
// no network, no storage, so it is unit tested and can never leak a token: it
// only ever sees provider names, reasons and the public parts of a user.
//
// Written for the desktop. Since 2.18.1 the iPhone imports it too, for its Google
// sign in: only the pure parts (provider names, REDIRECT_TO, oauthOptions, the
// failure sentences, the account label). The Sign in page wording stays here, but
// the desktop page itself and everything that talks to Electron do not
// (lib/phoneAuthCore.ts and the iOS marker script keep that apart).

export type SignInProvider = 'apple' | 'google';

// The only providers the desktop opens in the system browser. The main process
// checks the same list again (desktop/src/authLink.js) before it opens a URL.
export const SIGN_IN_PROVIDERS: readonly SignInProvider[] = ['apple', 'google'];

export function isSignInProvider(value: unknown): value is SignInProvider {
  return typeof value === 'string' && (SIGN_IN_PROVIDERS as readonly string[]).includes(value);
}

export const PROVIDER_NAME: Record<SignInProvider, string> = {
  apple: 'Apple',
  google: 'Google',
};

// Where the provider sends the person afterwards (through Supabase). The main
// process only accepts exactly this link.
export const REDIRECT_TO = 'belific://auth-callback';

// The options for signInWithOAuth. PKCE and the system browser: the page never
// leaves the app. Google gets an account chooser so a browser that is already
// signed in to one Google account cannot pick it silently.
export function oauthOptions(provider: SignInProvider): {
  redirectTo: string;
  skipBrowserRedirect: true;
  queryParams?: Record<string, string>;
} {
  const base = { redirectTo: REDIRECT_TO, skipBrowserRedirect: true as const };
  return provider === 'google' ? { ...base, queryParams: { prompt: 'select_account' } } : base;
}

// Every sentence of the Sign in page. One place, so one test reads them all.
// There is no "Use email" here on purpose: it arrives with 2.19.0.
export const SIGN_IN_TEXT = {
  heading: 'Sign in',
  intro: 'Sign in to keep your tasks on all your devices.',
  apple: 'Continue with Apple',
  google: 'Continue with Google',
  notNow: 'Not now',
  optional: 'You can use Belific without an account.',
  openButton: 'Sign in',
  waiting: 'Finish signing in in your browser…',
  stillWaiting: 'Still waiting for you to finish signing in in your browser…',
} as const;

// What a failed start or finish says. Provider agnostic on purpose: Apple and
// Google fail with the same words, so the text never tells a stranger which
// kind of account exists, and a provider error page text is never echoed.
export const FAILURE_TEXT = {
  cancelled: 'Sign in was cancelled.',
  notCompleted: 'Sign in could not be completed. Please try again.',
  notStarted: 'Sign in could not start.',
  desktopOnly: 'Sign in is only available in the desktop app.',
} as const;

const BEGIN_REASON_TEXT: Record<string, string> = {
  'backup-failed': 'Could not make the safety backup, so sign in did not start. Nothing was changed.',
  'no-browser': 'Could not open your browser.',
  busy: 'A sign in is already open in your browser.',
  refused: FAILURE_TEXT.notStarted,
};

// The sentence for a reason the main process gave when it refused to begin.
// Anything unknown gets the generic start failure, never the raw reason.
export function beginFailureText(reason: string | undefined): string {
  return (reason && Object.prototype.hasOwnProperty.call(BEGIN_REASON_TEXT, reason) ? BEGIN_REASON_TEXT[reason] : undefined) ?? FAILURE_TEXT.notStarted;
}

// What the account line shows: the email when there is one, otherwise the name
// of the provider the person used ("Apple account" is also what an Apple user
// who hid their email sees). Works from the public fields of a Supabase user.
export interface UserLike {
  email?: string | null;
  app_metadata?: { provider?: unknown } | null;
  identities?: Array<{ provider?: unknown }> | null;
}

export function accountLabel(user: UserLike | null | undefined): string | null {
  if (!user) return null;
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email) return email;
  const named = [user.app_metadata?.provider, user.identities?.[0]?.provider].find(isSignInProvider);
  return named ? `${PROVIDER_NAME[named]} account` : 'Your account';
}
