'use strict';
// The main process ICS fetch (build plan phase 8, step 3): the link rules, the
// address check at connect time, redirects, limits. The network is a fake
// transport here; scripts in the session note ran it against the real internet.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { Readable } = require('node:stream');
const { fetchIcs, checkUrl, isPrivateAddress, makeSafeLookup, hostForLog, MAX_BYTES } = require('../src/icsFetch');

const CAL = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const ok = (body = CAL, headers = {}) => ({ status: 200, headers, stream: Readable.from([Buffer.from(body)]) });
const redirect = (location, status = 302) => ({ status, headers: { location }, stream: Readable.from([]) });

// A fake transport: answers by URL, records each request (and the lookup it was given).
function fake(routes) {
  const calls = [];
  const request = async (url, opts) => {
    calls.push({ url, hasLookup: typeof opts.lookup === 'function', hasSignal: !!opts.signal });
    const r = routes[url];
    if (!r) throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
    return typeof r === 'function' ? r(opts) : r;
  };
  return { request, calls };
}

test('addresses: private, loopback, link local, CGNAT, multicast, mapped and NAT64 forms are refused; public ones pass', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fd00::1', 'fc12::1', 'fe80::1', 'ff02::1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '2002:a00:1::1', '2001:db8::1', 'not-an-ip']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '142.250.180.14', '172.32.0.1', '2607:f8b0:4004:c07::64', '2a00:1450:4009:81f::200e']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('links: https on 443 only, no user name or password, no local literal addresses; webcal becomes https', () => {
  assert.equal(checkUrl('webcal://example.com/a.ics').toString(), 'https://example.com/a.ics');
  assert.equal(checkUrl('https://example.com/a.ics#frag').toString(), 'https://example.com/a.ics');
  for (const bad of ['http://example.com/a.ics', 'file:///c:/a.ics', 'https://u:p@example.com/a', 'https://example.com:8443/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://169.254.169.254/latest', 'https://[::ffff:10.0.0.1]/a', '', 'x'.repeat(3000)]) {
    assert.equal(checkUrl(bad), null, bad);
  }
  assert.equal(hostForLog('https://calendar.google.com/calendar/ical/me/private-SECRET/basic.ics'), 'calendar.google.com');
  assert.equal(hostForLog('http://x'), 'invalid');
});

test('the connect-time lookup refuses a name if any of its addresses is private (DNS rebinding to 127.0.0.1, 10.x, ::1)', async () => {
  const lookupWith = (addresses) => makeSafeLookup((host, opts, cb) => cb(null, addresses));
  const run = (lk) => new Promise((resolve) => lk('evil.example', {}, (err, address) => resolve(err ? err.code : address)));
  assert.equal(await run(lookupWith([{ address: '127.0.0.1', family: 4 }])), 'BELIFIC_BLOCKED_ADDRESS');
  assert.equal(await run(lookupWith([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }])), 'BELIFIC_BLOCKED_ADDRESS');
  assert.equal(await run(lookupWith([{ address: '::1', family: 6 }])), 'BELIFIC_BLOCKED_ADDRESS');
  assert.equal(await run(lookupWith([])), 'BELIFIC_BLOCKED_ADDRESS');
  assert.equal(await run(lookupWith([{ address: '93.184.216.34', family: 4 }])), '93.184.216.34');
  const all = await new Promise((resolve) => lookupWith([{ address: '93.184.216.34', family: 4 }])('x', { all: true }, (e, list) => resolve(list)));
  assert.deepEqual(all, [{ address: '93.184.216.34', family: 4 }]);
});

test('a blocked lookup becomes "blocked-address"; every request carries the safe lookup and the timeout signal', async () => {
  const f = fake({
    'https://evil.example/a.ics': () => {
      throw Object.assign(new Error('blocked'), { code: 'BELIFIC_BLOCKED_ADDRESS' });
    },
  });
  assert.deepEqual(await fetchIcs('https://evil.example/a.ics', { request: f.request }), { ok: false, reason: 'blocked-address' });
  assert.deepEqual(f.calls[0], { url: 'https://evil.example/a.ics', hasLookup: true, hasSignal: true });
});

test('a good calendar: text returned, BOM removed, gzip decoded', async () => {
  const f = fake({ 'https://cal.example/a.ics': ok('\uFEFF' + CAL), 'https://cal.example/gz.ics': { status: 200, headers: { 'content-encoding': 'gzip' }, stream: Readable.from([zlib.gzipSync(CAL)]) } });
  assert.deepEqual(await fetchIcs('https://cal.example/a.ics', { request: f.request }), { ok: true, text: CAL, finalHost: 'cal.example' });
  assert.equal((await fetchIcs('https://cal.example/gz.ics', { request: f.request })).text, CAL);
});

test('redirects: followed up to 3 times to https; to http, to a local address or a 4th time is refused', async () => {
  const f = fake({
    'https://a.example/1': redirect('https://b.example/2'),
    'https://b.example/2': redirect('/3', 301),
    'https://b.example/3': ok(),
    'https://a.example/http': redirect('http://b.example/plain'),
    'https://a.example/local': redirect('https://127.0.0.1/admin'),
    'https://a.example/meta': redirect('https://169.254.169.254/latest/meta-data'),
    'https://a.example/cred': redirect('https://user:pw@b.example/x'),
    'https://a.example/r1': redirect('https://a.example/r2'),
    'https://a.example/r2': redirect('https://a.example/r3'),
    'https://a.example/r3': redirect('https://a.example/r4'),
    'https://a.example/r4': redirect('https://a.example/r5'),
    'https://a.example/r5': ok(),
  });
  const r = await fetchIcs('https://a.example/1', { request: f.request });
  assert.equal(r.ok, true);
  assert.equal(r.finalHost, 'b.example');
  for (const [u, reason] of [['https://a.example/http', 'redirect-refused'], ['https://a.example/local', 'redirect-refused'], ['https://a.example/meta', 'redirect-refused'], ['https://a.example/cred', 'redirect-refused'], ['https://a.example/r1', 'too-many-redirects']]) {
    assert.deepEqual(await fetchIcs(u, { request: f.request }), { ok: false, reason }, u);
  }
  assert.ok(!f.calls.some((c) => c.url.includes('127.0.0.1') || c.url.includes('169.254') || c.url.startsWith('http:')), 'never requested');
});

test('size: a declared length over 5 MB, a stream that keeps going, and a gzip bomb are all refused', async () => {
  const big = Buffer.alloc(1024 * 1024, 'a');
  const f = fake({
    'https://a.example/declared': { status: 200, headers: { 'content-length': String(MAX_BYTES + 1) }, stream: Readable.from([Buffer.from(CAL)]) },
    'https://a.example/stream': { status: 200, headers: {}, stream: Readable.from([Buffer.from('BEGIN:VCALENDAR\r\n'), big, big, big, big, big, big]) },
    'https://a.example/bomb': { status: 200, headers: { 'content-encoding': 'gzip' }, stream: Readable.from([zlib.gzipSync(Buffer.concat([Buffer.from('BEGIN:VCALENDAR\r\n'), Buffer.alloc(8 * 1024 * 1024, 'a')]))]) },
  });
  for (const u of ['https://a.example/declared', 'https://a.example/stream', 'https://a.example/bomb']) assert.deepEqual(await fetchIcs(u, { request: f.request }), { ok: false, reason: 'too-large' }, u);
});

test('time: a server that never answers, or answers too slowly, is "timeout"', async () => {
  const hang = fake({ 'https://slow.example/a': (opts) => new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  assert.deepEqual(await fetchIcs('https://slow.example/a', { request: hang.request, timeoutMs: 50 }), { ok: false, reason: 'timeout' });
  const trickle = new Readable({ read() {} });
  trickle.push('BEGIN:VCALENDAR\r\n');
  const slow = fake({ 'https://slow.example/b': { status: 200, headers: {}, stream: trickle } });
  assert.deepEqual(await fetchIcs('https://slow.example/b', { request: slow.request, timeoutMs: 50 }), { ok: false, reason: 'timeout' });
});

test('not a calendar, a refusing server, an unknown encoding, a network error: one reason each, no server text', async () => {
  const f = fake({
    'https://a.example/html': ok('<html>Sign in to Google</html>'),
    'https://a.example/404': { status: 404, headers: {}, stream: Readable.from([Buffer.from('Not found: /secret/path')]) },
    'https://a.example/br': { status: 200, headers: { 'content-encoding': 'br' }, stream: Readable.from([Buffer.from('x')]) },
  });
  assert.deepEqual(await fetchIcs('https://a.example/html', { request: f.request }), { ok: false, reason: 'not-calendar' });
  assert.deepEqual(await fetchIcs('https://a.example/404', { request: f.request }), { ok: false, reason: 'http-status' });
  assert.deepEqual(await fetchIcs('https://a.example/br', { request: f.request }), { ok: false, reason: 'not-calendar' });
  assert.deepEqual(await fetchIcs('https://a.example/nothing-here', { request: f.request }), { ok: false, reason: 'network' });
  assert.deepEqual(await fetchIcs('http://a.example/x', { request: f.request }), { ok: false, reason: 'invalid-url' });
});
