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

// One pending sign in at most, started in this run. It survives stray or
// failed links: only a successful exchange, cancel, expiry, sign out (cancel)
// or MAX_FAILURES failed attempts end it. onEnd(reason) runs exactly once per
// ended sign in so the owner can wipe the PKCE verifier.
const MAX_FAILURES = 3;

class AuthGate {
  constructor(supabaseHost, windowMs = WINDOW_MS, onEnd = () => {}) {
    this.host = supabaseHost;
    this.windowMs = windowMs;
    this.onEnd = onEnd;
    this.pending = null;
  }

  _end(reason) {
    if (!this.pending) return;
    this.pending = null;
    this.onEnd(reason);
  }

  _expired(now) {
    const p = this.pending;
    return !!p && (now - p.startedAt > this.windowMs || now < p.startedAt);
  }

  // Ends an expired sign in (called by a timer and before every decision).
  sweep(now = Date.now()) {
    if (this._expired(now)) this._end('expired');
  }

  get active() {
    return this.pending !== null;
  }

  // { ok: true } registers a sign in. { ok: false, reason: 'refused' } for a
  // URL that is not the Belific authorize URL, 'busy' while another is running.
  begin(authorizeUrl, now = Date.now()) {
    this.sweep(now);
    if (this.pending) return { ok: false, reason: 'busy' };
    const checked = checkAuthorizeUrl(authorizeUrl, this.host);
    if (!checked) return { ok: false, reason: 'refused' };
    this.pending = { startedAt: now, flowId: checked.flowId, failures: 0, exchanging: false };
    return { ok: true };
  }

  // Decides about an incoming link. { ok: true, code, flowId } hands the code
  // out for ONE exchange at a time; the sign in stays pending until finish().
  // { ok: false, reason } never exposes the link.
  accept(raw, now = Date.now()) {
    const parsed = parseCallback(raw);
    if (!parsed) return { ok: false, reason: 'invalid' };
    if (this._expired(now)) {
      this._end('expired');
      return { ok: false, reason: 'expired' };
    }
    const pending = this.pending;
    if (!pending) return { ok: false, reason: 'no-pending' };
    if (parsed.flowId !== pending.flowId) return { ok: false, reason: 'mismatch' };
    if (pending.exchanging) return { ok: false, reason: 'busy' };
    if (parsed.error) {
      this._fail();
      return { ok: false, reason: 'provider-error', ended: !this.pending };
    }
    pending.exchanging = true;
    return { ok: true, code: parsed.code, flowId: pending.flowId };
  }

  _fail() {
    this.pending.failures += 1;
    this.pending.exchanging = false;
    if (this.pending.failures >= MAX_FAILURES) this._end('too-many-failures');
  }

  // The renderer reports the exchange result. Success ends the sign in; a
  // failure keeps it alive (up to MAX_FAILURES). Returns { ended }.
  finish(success, now = Date.now()) {
    this.sweep(now);
    if (!this.pending || !this.pending.exchanging) return { ended: !this.pending };
    if (success) {
      this._end('success');
      return { ended: true };
    }
    this._fail();
    return { ended: !this.pending };
  }

  cancel() {
    this._end('cancelled');
  }
}

module.exports = { parseCallback, checkAuthorizeUrl, AuthGate, CALLBACK, SCHEME, WINDOW_MS, MAX_FAILURES };
