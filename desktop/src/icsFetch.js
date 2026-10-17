'use strict';
// Fetches an imported calendar (ICS) subscription for the page (build plan
// phase 8, step 3). The page never fetches outside sites itself (its CSP only
// allows the Supabase host); it asks main through one IPC call, and main does
// the fetch with these rules:
//  - https only, port 443, no user name or password in the link;
//  - every address the host resolves to must be public: loopback, private,
//    link local, unique local, carrier grade NAT, multicast and the like are
//    refused, checked at CONNECT time (so a name cannot change between the
//    check and the connection), and again on every redirect;
//  - at most 3 redirects, each to an https link that passes the same checks;
//  - 15 seconds for the whole fetch, 5 MB for the body (also after gzip);
//  - no cookies, no credentials, no keep alive;
//  - the answer must be a calendar (BEGIN:VCALENDAR).
// A failure is one reason code (lib/icsSubscriptions.ts FETCH_ERROR_TEXT has
// the words). The link itself is never logged: it is often a secret.
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const zlib = require('node:zlib');

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;

function ipv4Private(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || // this network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier grade NAT
    (a === 169 && b === 254) || // link local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && p[2] === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && p[2] === 2) || // documentation
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && p[2] === 100) ||
    (a === 203 && b === 0 && p[2] === 113) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

// True for any address that is not a plain public unicast address.
function isPrivateAddress(ip) {
  const s = String(ip).toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (net.isIPv4(s)) return ipv4Private(s);
  if (!net.isIPv6(s)) return true;
  // IPv4 mapped or compatible (::ffff:10.0.0.1, ::ffff:a00:1, ::10.0.0.1).
  const mapped = /^(?:0{0,4}:){0,5}(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return ipv4Private(mapped[1]);
  const hexMapped = /^(?:0{0,4}:){0,5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (s === '::' || s === '::1') return true;
  const first = parseInt(s.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 old site local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && parseInt(s.split(':')[1] || '0', 16) === 0x0db8) return true; // documentation
  if (first === 0x0064 && s.startsWith('64:ff9b:')) return true; // NAT64, may reach private v4
  if (first === 0x2002) return true; // 6to4, may embed a private v4
  if (first === 0) return true; // other ::/8 forms
  return false;
}

// A link main may open, or null.
function checkUrl(raw) {
  let s = String(raw || '').trim();
  if (!s || s.length > MAX_URL_LENGTH) return null;
  if (/^webcals?:\/\//i.test(s)) s = s.replace(/^webcals?:\/\//i, 'https://');
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return null;
  // A literal address is never looked up, so it is checked here.
  if (net.isIP(host) && isPrivateAddress(host)) return null;
  u.hash = '';
  return u;
}

// dns.lookup that refuses a name if ANY of its addresses is not public.
// Used by the connection itself, so the address checked is the one connected to.
function makeSafeLookup(lookup = dns.lookup) {
  return function safeLookup(hostname, options, callback) {
    const opts = typeof options === 'object' && options !== null ? options : {};
    const cb = typeof options === 'function' ? options : callback;
    lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return cb(err);
      const list = Array.isArray(addresses) ? addresses : [];
      if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
        const e = new Error('blocked address');
        e.code = 'BELIFIC_BLOCKED_ADDRESS';
        return cb(e);
      }
      if (opts.all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  };
}

// One GET, no redirects followed. Resolves with { status, headers, stream }.
function realRequest(url, { signal, lookup }) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup,
        agent: false,
        signal,
        headers: {
          'User-Agent': 'Belific-Desktop (calendar subscription)',
          Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1',
          'Accept-Encoding': 'gzip, deflate',
        },
      },
      (res) => resolve({ status: res.statusCode || 0, headers: res.headers, stream: res }),
    );
    req.on('error', reject);
  });
}

function readCapped(stream, max, signal) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onAbort = () => {
      stream.destroy();
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    stream.on('data', (c) => {
      size += c.length;
      if (size > max) {
        stream.destroy();
        reject(Object.assign(new Error('too large'), { code: 'BELIFIC_TOO_LARGE' }));
        return;
      }
      chunks.push(c);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function decoderFor(encoding) {
  const e = String(encoding || '').trim().toLowerCase();
  if (!e || e === 'identity') return null;
  if (e === 'gzip' || e === 'x-gzip') return zlib.createGunzip();
  if (e === 'deflate') return zlib.createInflate();
  return 'unsupported';
}

// Returns { ok: true, text, finalHost } or { ok: false, reason }.
async function fetchIcs(raw, { request = realRequest, lookup = makeSafeLookup(), timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  let url = checkUrl(raw);
  if (!url) return { ok: false, reason: 'invalid-url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; ; hop++) {
      const res = await request(url.toString(), { signal: controller.signal, lookup });
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        res.stream.resume?.();
        if (hop >= MAX_REDIRECTS) return { ok: false, reason: 'too-many-redirects' };
        let next;
        try {
          next = new URL(String(res.headers.location), url);
        } catch {
          return { ok: false, reason: 'redirect-refused' };
        }
        const checked = checkUrl(next.toString());
        if (!checked || next.protocol !== 'https:') return { ok: false, reason: 'redirect-refused' };
        url = checked;
        continue;
      }
      if (res.status !== 200) {
        res.stream.resume?.();
        return { ok: false, reason: 'http-status' };
      }
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.stream.destroy?.();
        return { ok: false, reason: 'too-large' };
      }
      const decoder = decoderFor(res.headers['content-encoding']);
      if (decoder === 'unsupported') {
        res.stream.destroy?.();
        return { ok: false, reason: 'not-calendar' };
      }
      const body = decoder ? await readCapped(res.stream.pipe(decoder), maxBytes, controller.signal) : await readCapped(res.stream, maxBytes, controller.signal);
      const text = body.toString('utf8').replace(/^﻿/, '');
      if (!/^\s*BEGIN:VCALENDAR/i.test(text.slice(0, 1024))) return { ok: false, reason: 'not-calendar' };
      return { ok: true, text, finalHost: url.hostname };
    }
  } catch (err) {
    if (err && err.code === 'BELIFIC_BLOCKED_ADDRESS') return { ok: false, reason: 'blocked-address' };
    if (err && err.code === 'BELIFIC_TOO_LARGE') return { ok: false, reason: 'too-large' };
    if (controller.signal.aborted || (err && err.name === 'AbortError')) return { ok: false, reason: 'timeout' };
    if (err && /^Z_|incorrect header/i.test(String(err.code || err.message))) return { ok: false, reason: 'not-calendar' };
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

// What main may write to its log about a link: the host only.
function hostForLog(raw) {
  const u = checkUrl(raw);
  return u ? u.hostname : 'invalid';
}

module.exports = { fetchIcs, checkUrl, isPrivateAddress, makeSafeLookup, hostForLog, MAX_BYTES, TIMEOUT_MS, MAX_REDIRECTS };
