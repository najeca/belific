'use strict';
// Runs the REAL belific-calendar-feed index.ts under Deno, locally, against a
// fake PostgREST in this process (build plan phase 8). Nothing reaches
// Supabase: SUPABASE_URL points at 127.0.0.1 and the service key is a dummy.
// Checks over real HTTP: the right token, a wrong token, a regenerated token,
// a turned off feed, a user with no tasks, isolation between users, the rate
// limit, a database failure, HEAD and POST, and exactly what the function
// asked the database for.
//
//   DENO=<path to deno> node scripts/feed-local-test.js
// (Deno is not a project dependency; any Deno 2 works. It downloads
// jsr:@supabase/supabase-js on first run.)
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DENO = process.env.DENO || 'deno';
const FN = path.join(__dirname, '..', 'supabase', 'functions', 'belific-calendar-feed', 'index.ts');
// Deno.serve's default port under `deno run`.
const FEED_PORT = 8000;
const SERVICE_KEY = 'local-test-service-key-not-real';
const T1 = 'a'.repeat(21) + 'B'.repeat(22);
const T2 = 'Z9_-'.repeat(10) + 'xyz';
const T_NEW = 'N'.repeat(43);
const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const today = new Date();
const key = (d) => d.toISOString().slice(0, 10);
const tomorrow = key(new Date(today.getTime() + 86400000));

const db = {
  user_settings: [
    { user_id: U1, key: 'calendar.feed_token', value: T1, deleted_at: null },
    { user_id: U2, key: 'calendar.feed_token', value: T2, deleted_at: null },
  ],
  tasks: [
    { user_id: U1, id: 'one-a', title: 'Dentist', emoji: '🦷', due_date: tomorrow, start_time: '09:00', duration_minutes: 60, completed: false, recurrence: null, recurrence_days: null, recurrence_month_day: null, updated_at: '2026-10-01T00:00:00Z', deleted_at: null, notes: 'PRIVATE NOTE' },
    { user_id: U1, id: 'one-b', title: 'Untimed', emoji: null, due_date: tomorrow, start_time: null, duration_minutes: null, completed: false, recurrence: null, recurrence_days: null, recurrence_month_day: null, updated_at: '2026-10-01T00:00:00Z', deleted_at: null },
  ],
};
const seen = [];
let failNext = false;

// Just enough PostgREST for the two queries: eq.<v>, is.null, select, order, limit, offset.
const rest = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  seen.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), profile: req.headers['accept-profile'], apikey: req.headers.apikey, auth: req.headers.authorization, method: req.method });
  const table = url.pathname.replace('/rest/v1/', '');
  if (failNext) {
    failNext = false;
    res.writeHead(500, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ message: 'permission denied for table user_settings', code: '42501' }));
  }
  if (req.method !== 'GET' || !db[table] || req.headers['accept-profile'] !== 'belific') {
    res.writeHead(400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ message: 'not faked' }));
  }
  let rows = db[table];
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    if (v === 'is.null') rows = rows.filter((r) => r[k] === null);
    else if (v.startsWith('eq.')) rows = rows.filter((r) => String(r[k]) === v.slice(3));
  }
  const cols = (url.searchParams.get('select') || '*').split(',');
  const offset = Number(url.searchParams.get('offset') || 0);
  const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
  rows = rows.slice(offset, limit === undefined ? undefined : offset + limit).map((r) => (cols[0] === '*' ? r : Object.fromEntries(cols.map((c) => [c, r[c]]))));
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(rows));
});

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
const get = (q, opts = {}) => fetch(`http://127.0.0.1:${FEED_PORT}/belific-calendar-feed${q}`, opts).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.text() }));
const leaks = (b) => [T1, T2, T_NEW, U1, U2, 'user_settings', 'permission', '42501', 'PRIVATE'].some((s) => b.includes(s));

async function main() {
  await new Promise((r) => rest.listen(0, '127.0.0.1', r));
  const restUrl = `http://127.0.0.1:${rest.address().port}`;
  const deno = spawn(DENO, ['run', '--no-config', '--node-modules-dir=none', `--allow-net=127.0.0.1,0.0.0.0,jsr.io,esm.sh,cdn.jsdelivr.net,registry.npmjs.org`, '--allow-env', '--allow-read', FN], {
    env: { ...process.env, SUPABASE_URL: restUrl, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Outside the repo, so Deno does not read mobile/package.json.
    cwd: require('node:os').tmpdir(),
  });
  let log = '';
  deno.stdout.on('data', (d) => (log += d));
  deno.stderr.on('data', (d) => (log += d));
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    try {
      await get('');
      up = true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!up) {
    deno.kill();
    rest.close();
    throw new Error(`the function did not start:
${log}`);
  }
  try {
    let r = await get(`?t=${T1}`);
    check(r.status === 200 && r.headers.get('content-type') === 'text/calendar; charset=utf-8', 'right token: 200 text/calendar');
    check(r.body.includes('SUMMARY:🦷 Dentist') && !r.body.includes('Untimed') && !r.body.includes('PRIVATE'), 'right token: the timed task, title and emoji only');
    check(/no-store/.test(r.headers.get('cache-control') || '') && r.headers.get('referrer-policy') === 'no-referrer' && !r.headers.get('access-control-allow-origin'), 'right token: no-store, no-referrer, no CORS');
    const q1 = seen.filter((s) => s.path === '/rest/v1/user_settings').pop();
    check(q1 && q1.query.select === 'user_id' && q1.query.key === 'eq.calendar.feed_token' && q1.query.value === `eq.${T1}` && q1.query.deleted_at === 'is.null' && q1.profile === 'belific' && q1.apikey === SERVICE_KEY, 'lookup asks for user_id only, by key, value and live row, in the belific schema');
    const q2 = seen.filter((s) => s.path === '/rest/v1/tasks').pop();
    check(q2 && q2.query.user_id === `eq.${U1}` && q2.query.select === 'id,title,emoji,due_date,start_time,duration_minutes,completed,recurrence,recurrence_days,recurrence_month_day,updated_at,deleted_at', 'tasks read for that user only, the agreed columns only');
    check(seen.every((s) => s.method === 'GET' && ['/rest/v1/user_settings', '/rest/v1/tasks'].includes(s.path)), 'only GETs to the two tables');

    let before = seen.length;
    r = await get(`?t=${'q'.repeat(43)}`);
    check(r.status === 404 && r.body === 'Not found\n' && !leaks(r.body), 'wrong token: 404 Not found, nothing leaked');
    check(seen.slice(before).every((s) => s.path === '/rest/v1/user_settings'), 'wrong token: no task read');

    before = seen.length;
    r = await get('?t=short');
    check(r.status === 404 && seen.length === before, 'malformed token: 404 with no database read');

    db.user_settings[0].value = T_NEW;
    r = await get(`?t=${T1}`);
    check(r.status === 404, 'regenerated: the old link is 404 at once');
    r = await get(`?t=${T_NEW}`);
    check(r.status === 200 && r.body.includes('Dentist'), 'regenerated: the new link works');

    db.user_settings[0].deleted_at = new Date().toISOString();
    r = await get(`?t=${T_NEW}`);
    check(r.status === 404, 'turned off (tombstone): 404');

    r = await get(`?t=${T2}&user_id=${U1}`);
    check(r.status === 200 && !r.body.includes('Dentist') && /BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/.test(r.body) && !r.body.includes('BEGIN:VEVENT'), 'user with no tasks: a valid empty calendar; user_id in the query is ignored');

    failNext = true;
    r = await get(`?t=${T2}`);
    check(r.status === 503 && !leaks(r.body), 'database error: 503, the server text is not passed on');

    r = await get(`?t=${T2}`, { method: 'HEAD' });
    check(r.status === 200 && r.body === '', 'HEAD: 200, no body');
    r = await get(`?t=${T2}`, { method: 'POST' });
    check(r.status === 405, 'POST: 405');

    let limited = null;
    for (let i = 0; i < 40 && !limited; i++) {
      const x = await get(`?t=${T2}`);
      if (x.status === 429) limited = x;
    }
    check(limited && Number(limited.headers.get('retry-after')) > 0, 'rate limit per token: 429 with Retry-After');

    check(!leaks(log) && !log.includes(SERVICE_KEY), 'the function log holds no token, user id, key or database text');
  } finally {
    deno.kill();
    rest.close();
  }
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  if (failures) {
    console.log('--- function log ---\n' + log);
    process.exit(1);
  }
}

main().catch((e) => {
  console.log(`FAIL harness: ${e.stack || e}`);
  process.exit(1);
});
