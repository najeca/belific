'use strict';
// Sign in with Apple through the system browser (decision 012). Pure logic,
// no Electron imports, so it is unit tested.
//
// What Supabase's PKCE redirect really contains (auth-js 2.111): the client
// appends its own `sb_flow_id` to redirect_to, and the server appends `code`.
// There is NO OAuth `state` in the redirect (state lives between Supabase
// and Apple). So the callback is
//   belific://auth-callback?sb_flow_id=<id>&code=<code>
// and a failure is `?error=...&error_description=...`. Validation therefore
// rests on: a sign in started in THIS run, inside a time window, single use;
// the exact link shape; the flow id (when present) matching the one we
// started; and finally the exchange itself, which needs the locally stored
// code verifier, so a forged or replayed code cannot succeed.
const CALLBACK = 'belific://auth-callback';
const SCHEME = 'belific';
const WINDOW_MS = 10 * 60 * 1000;
const CODE_PATTERN = /^[A-Za-z0-9._~-]{1,512}$/;
const FLOW_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// Returns { code, flowId } for a good link, { error: true, flowId } for a
// provider error link, or null for anything else. Never throws, never logs.
function parseCallback(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:`) return null;
  if (url.host !== 'auth-callback' || url.username || url.password || url.port) return null;
  // Windows appends one trailing slash to protocol launches.
  if (url.pathname !== '' && url.pathname !== '/') return null;
  if (url.hash) return null;
  const params = url.searchParams;
  const flowRaw = params.get('sb_flow_id');
  if (flowRaw !== null && !FLOW_PATTERN.test(flowRaw)) return null;
  const flowId = flowRaw;
  if (params.has('error')) return { error: true, flowId };
  const codes = params.getAll('code');
  if (codes.length !== 1 || !CODE_PATTERN.test(codes[0])) return null;
  return { code: codes[0], flowId };
}

// Checks the OAuth URL the renderer asks main to open: only the Belific
// Supabase authorize endpoint, over https. Returns { flowId } (the id the
// client put into redirect_to, or null) or false if the URL is refused.
function checkAuthorizeUrl(raw, supabaseHost) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.origin !== supabaseHost || url.pathname !== '/auth/v1/authorize') return false;
  if (url.searchParams.get('provider') !== 'apple') return false;
  const redirect = url.searchParams.get('redirect_to');
  if (!redirect) return false;
  let r;
  try {
    r = new URL(redirect);
  } catch {
    return false;
  }
  if (`${r.protocol}//${r.host}` !== CALLBACK) return false;
  const flowId = r.searchParams.get('sb_flow_id');
  if (flowId !== null && !FLOW_PATTERN.test(flowId)) return false;
  return { flowId };
}

// One pending sign in at most, started in this run.
class AuthGate {
  constructor(supabaseHost, windowMs = WINDOW_MS) {
    this.host = supabaseHost;
    this.windowMs = windowMs;
    this.pending = null;
  }

  // Registers a sign in. Returns false (and registers nothing) for a URL
  // that is not the Belific authorize URL.
  begin(authorizeUrl, now = Date.now()) {
    const checked = checkAuthorizeUrl(authorizeUrl, this.host);
    if (!checked) return false;
    this.pending = { startedAt: now, flowId: checked.flowId };
    return true;
  }

  // Decides about an incoming link. { ok: true, code, flowId } consumes the
  // pending sign in (single use). { ok: false, reason } never exposes the link.
  accept(raw, now = Date.now()) {
    const parsed = parseCallback(raw);
    if (!parsed) return { ok: false, reason: 'invalid' };
    const pending = this.pending;
    if (!pending) return { ok: false, reason: 'no-pending' };
    if (now - pending.startedAt > this.windowMs || now < pending.startedAt) {
      this.pending = null;
      return { ok: false, reason: 'expired' };
    }
    if (parsed.flowId !== pending.flowId) return { ok: false, reason: 'mismatch' };
    this.pending = null;
    if (parsed.error) return { ok: false, reason: 'provider-error', consumed: true };
    return { ok: true, code: parsed.code, flowId: pending.flowId };
  }

  cancel() {
    this.pending = null;
  }
}

module.exports = { parseCallback, checkAuthorizeUrl, AuthGate, CALLBACK, SCHEME, WINDOW_MS };
