'use strict';
// Sign in with Apple or Google through the system browser (decisions 012 and
// 026). Pure logic,
// no Electron imports, so it is unit tested.
//
// What Supabase's PKCE redirect really contains (auth-js 2.111): the server
// appends `code` to the redirect_to we sent. auth-js adds its own `sb_flow_id`
// to redirect_to only when `experimental.appendPkceFlowIdToRedirects` is on,
// and it is off here (the redirect allow list compares the whole URL including
// the query string, so an extra parameter could stop the exact entry from
// matching). There is NO OAuth `state` in the redirect either (state lives
// between Supabase and the provider). So the callback is normally
//   belific://auth-callback?code=<code>
// (with `sb_flow_id=<id>` too if that option is ever turned on) and a failure
// is `?error=...&error_description=...`. Validation therefore rests on: a sign
// in started in THIS run, inside a time window, single use; the exact link
// shape; the flow id, when the link carries one, matching the one we started
// (none on both sides is a match); and finally the exchange itself, which needs
// the locally stored code verifier, so a forged or replayed code cannot succeed.
const CALLBACK = 'belific://auth-callback';
const SCHEME = 'belific';
const WINDOW_MS = 10 * 60 * 1000;
const CODE_PATTERN = /^[A-Za-z0-9._~-]{1,512}$/;
const FLOW_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
// The only providers the system browser may be opened for. Anything else
// (email, github, a mixed case spelling, a second provider parameter) is refused.
const PROVIDERS = ['apple', 'google'];

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
// Supabase authorize endpoint, over https, for exactly one allowed provider. Returns { flowId } (the id the
// client put into redirect_to, or null) or false if the URL is refused.
function checkAuthorizeUrl(raw, supabaseHost) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.origin !== supabaseHost || url.pathname !== '/auth/v1/authorize') return false;
  const providers = url.searchParams.getAll('provider');
  if (providers.length !== 1 || !PROVIDERS.includes(providers[0])) return false;
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

module.exports = { parseCallback, checkAuthorizeUrl, AuthGate, CALLBACK, SCHEME, WINDOW_MS, MAX_FAILURES, PROVIDERS };
