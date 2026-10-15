// Google sign in on the iPhone (2.18.1, decision 026 and the phone move
// checkpoint): the pure rules. No React Native, no Supabase client, no storage,
// no network, so `node --test` covers them (phoneAuthCore.test.ts). The wiring
// is in phoneGoogleAuth.ts.
//
// The phone opens the system browser (Safari) with Linking and gets
// belific://auth-callback back. This file is the phone's own copy of the safety
// rules the desktop keeps in desktop/src/authLink.js (the Electron main
// process, which the iOS bundle must never contain):
//   - the browser is opened only for the exact Belific authorize URL: this
//     project's https origin, /auth/v1/authorize, exactly one provider
//     (google), redirect_to exactly belific://auth-callback, a flow id in it
//     (the "state" of this flow, see below) and a SHA-256 PKCE challenge;
//   - a link is accepted only while a sign in started in THIS run is pending,
//     inside a time window, once, with the same flow id;
//   - three failed attempts end the sign in;
//   - every refusal is a reason code, never the link, a code or a token. The
//     caller shows fixed sentences and logs nothing.
//
// What Supabase's PKCE redirect really contains (auth-js 2.111): only `code`
// (or `error`) appended to the redirect_to we sent. The client appends a
// `sb_flow_id` too only when `experimental.appendPkceFlowIdToRedirects` is on,
// and it is off here on purpose: the project's redirect allow list compares the
// whole URL including the query string, so an extra parameter could stop the
// exact entry `belific://auth-callback` from matching. There is no OAuth
// `state` in the redirect either (that one lives between Supabase and Google).
// So the "state" this file can check is: a sign in started in THIS run is
// pending, inside the window, one exchange at a time, a flow id that matches
// when the link carries one (and none when it was not asked for), and then the
// exchange itself, which is bound to THIS flow's locally stored PKCE verifier
// (the flow id the client returned when it built the URL, passed to
// exchangeCodeForSession), so a forged, replayed or foreign code cannot succeed.
import { sha256 as nobleSha256 } from '@noble/hashes/sha2';
import { REDIRECT_TO } from './authCore.ts';

export const PHONE_SIGN_IN_WINDOW_MS = 10 * 60 * 1000;
export const PHONE_MAX_FAILURES = 3;
const CODE_PATTERN = /^[A-Za-z0-9._~-]{1,512}$/;
const FLOW_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// What auth-js 2.111 stores when the verifier came from crypto.getRandomValues:
// 56 values, each cut to two hex digits (lib/helpers.js generatePKCEVerifier).
// Its other branch, used only when `crypto` does not exist at all, draws from
// Math.random over an alphabet with capitals and - . _ ~, so a 112 character
// lower case hex string cannot come from it (odds about (16/66)^112).
const VERIFIER_PATTERN = /^[0-9a-f]{112}$/;
// The only provider the system browser is opened for. Apple uses its native
// sheet (lib/auth.ts), so no Apple browser flow exists on the phone.
export const PHONE_BROWSER_PROVIDERS: readonly string[] = ['google'];

export type PhoneCallback = { code: string; flowId: string | null } | { error: true; flowId: string | null } | null;

// A good link -> { code, flowId }; a provider error link -> { error: true };
// anything else -> null. Never throws, never logs.
export function parsePhoneCallback(raw: unknown): PhoneCallback {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'belific:') return null;
  if (url.host !== 'auth-callback' || url.username || url.password || url.port) return null;
  if (url.pathname !== '' && url.pathname !== '/') return null;
  if (url.hash) return null;
  const params = url.searchParams;
  const flowRaw = params.get('sb_flow_id');
  if (flowRaw !== null && !FLOW_PATTERN.test(flowRaw)) return null;
  if (params.has('error')) return { error: true, flowId: flowRaw };
  const codes = params.getAll('code');
  if (codes.length !== 1 || !CODE_PATTERN.test(codes[0])) return null;
  return { code: codes[0], flowId: flowRaw };
}

// Checks the URL the app is about to open in the browser. Returns the flow id
// its redirect_to carries (null when it carries none, which is the normal case),
// or false. `origin` is this build's Supabase origin.
export function checkPhoneAuthorizeUrl(raw: unknown, origin: string): { flowId: string | null; challenge: string } | false {
  if (typeof raw !== 'string') return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.origin !== origin || url.pathname !== '/auth/v1/authorize') return false;
  const providers = url.searchParams.getAll('provider');
  if (providers.length !== 1 || !PHONE_BROWSER_PROVIDERS.includes(providers[0])) return false;
  const redirects = url.searchParams.getAll('redirect_to');
  if (redirects.length !== 1) return false;
  let r: URL;
  try {
    r = new URL(redirects[0]);
  } catch {
    return false;
  }
  if (`${r.protocol}//${r.host}` !== REDIRECT_TO || r.username || r.password || r.port) return false;
  if (r.pathname !== '' && r.pathname !== '/') return false;
  const flowId = r.searchParams.get('sb_flow_id');
  if (flowId !== null && !FLOW_PATTERN.test(flowId)) return false;
  // PKCE must be real: a SHA-256 challenge. React Native has no WebCrypto, and
  // auth-js then silently sends the verifier itself as the challenge ("plain"),
  // which anyone who sees the browser address can read. Refuse that.
  const methods = url.searchParams.getAll('code_challenge_method');
  const challenges = url.searchParams.getAll('code_challenge');
  if (methods.length !== 1 || methods[0].toLowerCase() !== 's256') return false;
  if (challenges.length !== 1 || !CHALLENGE_PATTERN.test(challenges[0])) return false;
  return { flowId, challenge: challenges[0] };
}

// True only for a verifier that came from the getRandomValues branch and whose
// SHA-256 is exactly the challenge in the URL. The hash is computed from bytes
// built here, so a missing or odd TextEncoder cannot make a bad challenge pass.
export function verifierMatchesChallenge(verifier: unknown, challenge: string): boolean {
  return typeof verifier === 'string' && VERIFIER_PATTERN.test(verifier) && pkceChallengeOf(verifier) === challenge;
}

// Where auth-js 2.111 keeps the verifier of one flow: `<storageKey>-flow-<id>-code-verifier`,
// with the default storage key sb-<first label of the host>-auth-token. A test
// compares this with what the real client writes, so an upgrade that renames it
// fails the test, and at run time a missing verifier means the browser stays closed.
export function pkceVerifierStorageKey(supabaseUrl: string, flowId: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token-flow-${flowId}-code-verifier`;
}

// Is crypto.getRandomValues a real, secure source? auth-js draws the verifier
// from it (and uses Math.random only if `crypto` does not exist at all). On the
// phone the function comes from react-native-get-random-values, which has an
// insecure Math.random branch for a debugger without native sync calls. This
// calls it twice with Math.random watched: it must exist, never touch
// Math.random, and give different, non constant bytes.
export interface RandomHost {
  crypto?: { getRandomValues?: unknown } | undefined;
}

export function randomnessIsSecure(host: RandomHost, math: { random: () => number } = Math): boolean {
  const crypto = host.crypto;
  const draw = crypto?.getRandomValues;
  if (!crypto || typeof draw !== 'function') return false;
  const original = math.random;
  let used = 0;
  math.random = () => {
    used += 1;
    return original.call(math);
  };
  const a = new Uint8Array(32);
  const b = new Uint8Array(32);
  try {
    draw.call(crypto, a);
    draw.call(crypto, b);
  } catch {
    return false;
  } finally {
    math.random = original;
  }
  if (used > 0) return false;
  if (a.every((v) => v === a[0]) || b.every((v) => v === b[0])) return false;
  return !a.every((v, i) => v === b[i]);
}

export type PhoneEndReason = 'success' | 'cancelled' | 'expired' | 'too-many-failures';

interface Pending {
  startedAt: number;
  // The flow id the redirect carries (normally none) ...
  redirectFlowId: string | null;
  // ... and the one the client returned for this URL, which selects the stored
  // PKCE verifier for the exchange.
  exchangeFlowId: string | null;

  failures: number;
  exchanging: boolean;
}

export type PhoneBeginResult = { ok: true } | { ok: false; reason: 'refused' | 'busy' };
export type PhoneAcceptResult =
  | { ok: true; code: string; flowId: string | null }
  | { ok: false; reason: 'invalid' | 'expired' | 'no-pending' | 'mismatch' | 'busy' | 'provider-error'; ended?: boolean };

// One pending sign in at most, started in this run (the object lives in memory
// only, so a relaunch forgets it and a late link is ignored). Only a successful
// exchange, cancel, expiry or PHONE_MAX_FAILURES failures end it.
export class PhoneAuthGate {
  private pending: Pending | null = null;
  private readonly origin: string;
  private readonly windowMs: number;
  private readonly onEnd: (reason: PhoneEndReason) => void;

  constructor(origin: string, windowMs: number = PHONE_SIGN_IN_WINDOW_MS, onEnd: (reason: PhoneEndReason) => void = () => {}) {
    this.origin = origin;
    this.windowMs = windowMs;
    this.onEnd = onEnd;
  }

  private end(reason: PhoneEndReason): void {
    if (!this.pending) return;
    this.pending = null;
    this.onEnd(reason);
  }

  private expired(now: number): boolean {
    const p = this.pending;
    return !!p && (now - p.startedAt > this.windowMs || now < p.startedAt);
  }

  sweep(now: number = Date.now()): void {
    if (this.expired(now)) this.end('expired');
  }

  get active(): boolean {
    return this.pending !== null;
  }

  // `exchangeFlowId` is the flow id signInWithOAuth returned with the URL and
  // `verifier` the PKCE verifier the client stored for it (read back from the
  // session store). The browser opens only if the challenge in the URL is S256
  // AND the verifier proves it came from secure randomness: it has the shape of
  // the getRandomValues branch and hashes to exactly that challenge.
  begin(authorizeUrl: string, now: number = Date.now(), exchangeFlowId: string | null = null, verifier: string | null = null): PhoneBeginResult {
    this.sweep(now);
    if (this.pending) return { ok: false, reason: 'busy' };
    const checked = checkPhoneAuthorizeUrl(authorizeUrl, this.origin);
    if (!checked) return { ok: false, reason: 'refused' };
    if (!verifierMatchesChallenge(verifier, checked.challenge)) return { ok: false, reason: 'refused' };
    if (exchangeFlowId !== null && !FLOW_PATTERN.test(exchangeFlowId)) return { ok: false, reason: 'refused' };
    this.pending = { startedAt: now, redirectFlowId: checked.flowId, exchangeFlowId, failures: 0, exchanging: false };
    return { ok: true };
  }

  // Decides about an incoming link. { ok: true } hands the code out for ONE
  // exchange at a time; the sign in stays pending until finish().
  accept(raw: unknown, now: number = Date.now()): PhoneAcceptResult {
    const parsed = parsePhoneCallback(raw);
    if (!parsed) return { ok: false, reason: 'invalid' };
    if (this.expired(now)) {
      this.end('expired');
      return { ok: false, reason: 'expired' };
    }
    const pending = this.pending;
    if (!pending) return { ok: false, reason: 'no-pending' };
    if (parsed.flowId !== pending.redirectFlowId) return { ok: false, reason: 'mismatch' };
    if (pending.exchanging) return { ok: false, reason: 'busy' };
    if ('error' in parsed) {
      this.fail();
      return { ok: false, reason: 'provider-error', ended: this.pending === null };
    }
    pending.exchanging = true;
    return { ok: true, code: parsed.code, flowId: pending.exchangeFlowId };
  }

  private fail(): void {
    const p = this.pending;
    if (!p) return;
    p.failures += 1;
    p.exchanging = false;
    if (p.failures >= PHONE_MAX_FAILURES) this.end('too-many-failures');
  }

  // The exchange result. Success ends the sign in; a failure keeps it alive
  // (up to PHONE_MAX_FAILURES). Returns { ended }.
  finish(success: boolean, now: number = Date.now()): { ended: boolean } {
    this.sweep(now);
    if (!this.pending || !this.pending.exchanging) return { ended: this.pending === null };
    if (success) {
      this.end('success');
      return { ended: true };
    }
    this.fail();
    return { ended: this.pending === null };
  }

  cancel(): void {
    this.end('cancelled');
  }
}

// --- SHA-256 for PKCE -------------------------------------------------------
// Hermes has no crypto.subtle. auth-js then sends code_challenge_method=plain
// (see checkPhoneAuthorizeUrl). The digest comes from @noble/hashes (audited,
// dependency free, pure JavaScript; pinned exactly in package.json), installed
// as crypto.subtle.digest only when the platform has none. Every byte string we
// hash ourselves is built by asciiBytes below, so none of our own checks depends
// on TextEncoder.
export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}

// Bytes of an ASCII string, built by hand (no TextEncoder).
export function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Base64 without padding, URL alphabet (RFC 7636), no btoa.
export function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64URL[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64URL[n & 63];
  }
  return out;
}

// The S256 challenge of a verifier, computed here from hand built bytes.
export function pkceChallengeOf(verifier: string): string {
  return base64url(sha256(asciiBytes(verifier)));
}

// UTF-8 encoder for hosts without TextEncoder (auth-js needs one too).
class Utf8Encoder {
  encode(text: string = ''): Uint8Array {
    const bytes: number[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0) as number;
      if (cp < 0x80) bytes.push(cp);
      else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
      else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
    return new Uint8Array(bytes);
  }
}

// The slice of the global object this touches, so a test can pass a fake.
export interface CryptoHost {
  TextEncoder?: unknown;
  crypto?: { subtle?: { digest?: unknown }; getRandomValues?: unknown } | undefined;
}

type BytesLike = ArrayBuffer | ArrayBufferView;

function toBytes(data: BytesLike): Uint8Array {
  return ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
}

// Installs what auth-js needs for a real S256 challenge (TextEncoder and
// crypto.subtle.digest('SHA-256')) where the platform has none. Returns what it
// installed; never replaces anything that exists.
export function ensureSha256Challenge(host: CryptoHost): { textEncoder: boolean; digest: boolean } {
  const installed = { textEncoder: false, digest: false };
  if (typeof host.TextEncoder === 'undefined') {
    host.TextEncoder = Utf8Encoder;
    installed.textEncoder = true;
  }
  if (!host.crypto) host.crypto = {};
  const crypto = host.crypto;
  if (typeof crypto.subtle === 'undefined') {
    crypto.subtle = {
      digest: async (algorithm: unknown, data: BytesLike): Promise<ArrayBuffer> => {
        const name = typeof algorithm === 'string' ? algorithm : (algorithm as { name?: unknown } | null)?.name;
        if (typeof name !== 'string' || name.toUpperCase() !== 'SHA-256') throw new Error('Only SHA-256 is available');
        const out = sha256(toBytes(data));
        return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
      },
    };
    installed.digest = true;
  }
  return installed;
}

// The path expo-router is given for an incoming belific://auth-callback link
// (app/+native-intent.ts). Without this the router would try to open a screen
// called auth-callback. The link goes to Settings, where the sign in was
// started; the code itself is read by phoneGoogleAuth.ts from Linking.
export function systemPathFor(path: string): string {
  let target: string | null = null;
  try {
    const url = new URL(path, 'belific://app/');
    if (url.protocol === 'belific:' && url.host === 'auth-callback') target = '/settings';
    else if (url.protocol === 'belific:' && url.host === 'app' && /^\/auth-callback\/?$/.test(url.pathname)) target = '/settings';
  } catch {
    // an unreadable path is left to the router
  }
  return target ?? path;
}

// --- Sign out on the phone ---------------------------------------------------
// The login is shared with the desktop (and with Landis and Proload). Supabase's
// default sign out scope is "global", which ends EVERY session of the user on
// every device. The phone ends only its own, like the desktop does (2.11.2).
// lib/auth.ts uses this for both Sign Out and Delete account.
export interface LocalSignOutClient {
  signOut(options: { scope: 'local' }): Promise<{ error: unknown }>;
}

export async function signOutThisDevice(auth: LocalSignOutClient): Promise<void> {
  const { error } = await auth.signOut({ scope: 'local' });
  if (error) throw error;
}
