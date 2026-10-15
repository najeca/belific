// The iPhone's Google sign in, as a flow with injected parts (2.18.1). Pure
// apart from what it is given, so phoneGoogleFlow.test.ts runs it with fakes:
// no React Native, no Supabase client, no network. phoneGoogleAuth.ts wires it
// to Linking and the app's client.
//
// Steps: prepare (project check, SHA-256 challenge support) -> ask the client
// for the Google URL (PKCE, skipBrowserRedirect) -> the gate checks the URL ->
// open it in the system browser -> the browser returns belific://auth-callback
// -> the gate checks the link -> one code exchange with the stored verifier ->
// sync starts. Nothing here logs, and only fixed sentences reach the screen:
// a code, a token or a provider/server message is never shown.
import { FAILURE_TEXT, SIGN_IN_TEXT, beginFailureText, oauthOptions } from './authCore.ts';
import { PhoneAuthGate } from './phoneAuthCore.ts';

export interface PhoneSignInState {
  busy: boolean;
  message: string | null;
}

export interface PhoneGoogleDeps {
  // This build's Supabase origin, e.g. https://<ref>.supabase.co
  origin: string;
  auth: {
    signInWithOAuth(credentials: { provider: 'google'; options: ReturnType<typeof oauthOptions> }): Promise<{
      data: { url?: string | null; flowId?: string | null } | null;
      error: unknown;
    }>;
    exchangeCodeForSession(
      authCode: string,
      options?: { flowId?: string | null },
    ): Promise<{ data: { session?: unknown } | null; error: unknown }>;
  };
  openUrl(url: string): Promise<unknown>;
  // Project check and SHA-256 support; throws if the sign in must not start.
  prepare(): Promise<void>;
  // Is crypto.getRandomValues secure (phoneAuthCore.randomnessIsSecure)? The PKCE
  // verifier is drawn from it; without it the browser never opens.
  randomIsSecure(): boolean;
  // The PKCE verifier the client stored for this flow, or null.
  readVerifier(flowId: string): Promise<string | null>;
  // After a good exchange: turn sync on and run the first pass.
  afterSignIn(): Promise<void>;
  now?: () => number;
}

export function createPhoneGoogleFlow(deps: PhoneGoogleDeps) {
  const now = deps.now ?? (() => Date.now());
  const gate = new PhoneAuthGate(deps.origin);
  let state: PhoneSignInState = { busy: false, message: null };
  const listeners = new Set<(s: PhoneSignInState) => void>();

  function set(next: Partial<PhoneSignInState>): void {
    state = { ...state, ...next };
    for (const l of listeners) l(state);
  }

  // Starts a sign in: opens the browser. The result arrives through handleLink.
  async function start(): Promise<void> {
    set({ busy: true, message: SIGN_IN_TEXT.waiting });
    gate.cancel(); // a deliberate new attempt replaces an earlier one
    try {
      await deps.prepare();
      if (!deps.randomIsSecure()) throw new Error('not-started');
      const { data, error } = await deps.auth.signInWithOAuth({ provider: 'google', options: oauthOptions('google') });
      if (error || !data?.url || !data.flowId) throw new Error('not-started');
      const verifier = await deps.readVerifier(data.flowId).catch(() => null);
      const begun = gate.begin(data.url, now(), data.flowId, verifier);
      if (!begun.ok) throw new Error('not-started');
      try {
        await deps.openUrl(data.url);
      } catch {
        gate.cancel();
        set({ busy: false, message: beginFailureText('no-browser') });
        return;
      }
    } catch {
      gate.cancel();
      set({ busy: false, message: FAILURE_TEXT.notStarted });
    }
  }

  // "Cancel" while the browser sign in is open.
  function cancel(): void {
    gate.cancel();
    set({ busy: false, message: null });
  }

  // Every belific:// link the app receives. Anything the gate does not accept
  // is ignored quietly: the screen changes only for a sign in that is pending.
  async function handleLink(url: string): Promise<void> {
    const decision = gate.accept(url, now());
    if (!decision.ok) {
      if (decision.reason === 'expired') set({ busy: false, message: FAILURE_TEXT.notCompleted });
      else if (decision.reason === 'provider-error') {
        set(decision.ended ? { busy: false, message: FAILURE_TEXT.cancelled } : { busy: true, message: SIGN_IN_TEXT.stillWaiting });
      }
      return;
    }
    let ok = false;
    try {
      await deps.prepare();
      const { data, error } = await deps.auth.exchangeCodeForSession(decision.code, { flowId: decision.flowId });
      // The error text is never shown or logged: it can echo request details.
      ok = !error && !!data?.session;
    } catch {
      ok = false;
    }
    const { ended } = gate.finish(ok, now());
    if (!ok) {
      set(ended ? { busy: false, message: FAILURE_TEXT.notCompleted } : { busy: true, message: SIGN_IN_TEXT.stillWaiting });
      return;
    }
    set({ busy: false, message: null });
    deps.afterSignIn().catch(() => {});
  }

  return {
    start,
    cancel,
    handleLink,
    getState: (): PhoneSignInState => state,
    subscribe(listener: (s: PhoneSignInState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type PhoneGoogleFlow = ReturnType<typeof createPhoneGoogleFlow>;
