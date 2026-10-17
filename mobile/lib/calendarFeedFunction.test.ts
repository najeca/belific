// belific-calendar-feed (supabase/functions/belific-calendar-feed), build plan
// phase 8 step 2. The rules are in core.ts and run here against a fake
// database with two users; index.ts (Deno wiring) is checked as text because
// Deno is not installed on this machine. Nothing is deployed or called.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { handleFeed, RateLimiter, rowToTask, tokenFrom, TASK_COLUMNS, TOKEN_LIMIT, UNKNOWN_LIMIT, TEXT, type FeedDb, type TaskRow } from '../supabase/functions/belific-calendar-feed/core.ts';
import { parseIcs } from './icsParse.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FN = path.join(ROOT, 'supabase/functions/belific-calendar-feed');
const INDEX = fs.readFileSync(path.join(FN, 'index.ts'), 'utf8');
const CODE = INDEX.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const TOKEN_ONE = 'a'.repeat(21) + 'B'.repeat(22);
const TOKEN_TWO = 'Z9_-'.repeat(10) + 'xyz';
const TOKEN_NEW = 'N'.repeat(43);
const USER_ONE = '11111111-1111-1111-1111-111111111111';
const USER_TWO = '22222222-2222-2222-2222-222222222222';
const TODAY = new Date('2026-10-17T10:00:00Z');

// A fake of the two reads: settings rows (key, value, deleted_at per user) and
// task rows per user. It records every call.
function fakeDb() {
  const state = {
    settings: [
      { user_id: USER_ONE, key: 'calendar.feed_token', value: TOKEN_ONE, deleted_at: null as string | null },
      { user_id: USER_TWO, key: 'calendar.feed_token', value: TOKEN_TWO, deleted_at: null as string | null },
      { user_id: USER_TWO, key: 'feature.priority', value: TOKEN_ONE, deleted_at: null as string | null },
    ],
    tasks: {
      [USER_ONE]: [
        { id: 'one-a', title: 'Dentist', emoji: '🦷', due_date: '2026-10-18', start_time: '09:00', duration_minutes: 60, completed: false, updated_at: '2026-10-01T00:00:00Z', deleted_at: null },
        { id: 'one-b', title: 'Allday thing', due_date: '2026-10-18', completed: false, updated_at: '2026-10-01T00:00:00Z' },
        { id: 'one-gone', title: 'Deleted', due_date: '2026-10-18', start_time: '10:00', completed: false, updated_at: '2026-10-01T00:00:00Z', deleted_at: '2026-10-02T00:00:00Z' },
      ] as TaskRow[],
      [USER_TWO]: [] as TaskRow[],
    } as Record<string, TaskRow[]>,
    calls: [] as string[],
    fail: null as null | 'owner' | 'tasks' | 'throw',
  };
  const db: FeedDb = {
    async ownerOfToken(token) {
      state.calls.push('owner');
      if (state.fail === 'owner') return 'error';
      if (state.fail === 'throw') throw new Error('connection to 10.0.0.3 refused for user_settings');
      const rows = state.settings.filter((s) => s.key === 'calendar.feed_token' && s.value === token && !s.deleted_at);
      return rows.length === 1 ? rows[0].user_id : null;
    },
    async tasksOf(userId) {
      state.calls.push(`tasks:${userId}`);
      if (state.fail === 'tasks') return 'error';
      return state.tasks[userId] ?? [];
    },
  };
  return { state, db };
}

function deps(db: FeedDb, now = () => TODAY) {
  return { db, tokenLimiter: new RateLimiter(TOKEN_LIMIT.max, TOKEN_LIMIT.windowMs), unknownLimiter: new RateLimiter(UNKNOWN_LIMIT.max, UNKNOWN_LIMIT.windowMs), now };
}

function req(query: string, method = 'GET', ip = '203.0.113.7') {
  const headers = new Map([['x-forwarded-for', `${ip}, 10.0.0.1`]]);
  return { method, url: `https://vlogfwnmaqorhialcqbr.supabase.co/functions/v1/belific-calendar-feed${query}`, headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? null } };
}

// Nothing a caller could learn from: no token, user id, table, or error text.
function assertNoLeak(body: string | null) {
  const b = body ?? '';
  for (const bad of [TOKEN_ONE, TOKEN_TWO, TOKEN_NEW, USER_ONE, USER_TWO, 'user_settings', 'tasks', '10.0.0.3', 'refused', 'Error', 'calendar.feed_token']) assert.ok(!b.includes(bad), `leaked ${bad}`);
}

test('the right token: 200, text/calendar, that user\'s timed tasks only, no cache, no CORS', async () => {
  const { state, db } = fakeDb();
  const res = await handleFeed(req(`?t=${TOKEN_ONE}`), deps(db));
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'text/calendar; charset=utf-8');
  assert.match(res.headers['Cache-Control'], /no-store/);
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(!Object.keys(res.headers).some((h) => h.toLowerCase().startsWith('access-control')));
  const cal = parseIcs(res.body!);
  assert.deepEqual(cal.events.map((e) => e.title), ['🦷 Dentist']);
  assert.deepEqual(state.calls, ['owner', `tasks:${USER_ONE}`]);
  assert.ok(!res.body!.includes(TOKEN_ONE));
});

test('a wrong token: the same 404 as every other failure, and no task is read', async () => {
  const { state, db } = fakeDb();
  const res = await handleFeed(req(`?t=${'q'.repeat(43)}`), deps(db));
  assert.equal(res.status, 404);
  assert.equal(res.body, `${TEXT.notFound}\n`);
  assert.deepEqual(state.calls, ['owner']);
  assertNoLeak(res.body);
});

test('malformed or missing tokens are refused before any database read, with the same 404', async () => {
  const { state, db } = fakeDb();
  for (const q of ['', '?t=', '?t=short', `?t=${TOKEN_ONE}x`, `?t=${TOKEN_ONE}&t=${TOKEN_TWO}`, `?token=${TOKEN_ONE}`, `?t=${TOKEN_ONE.slice(0, 42)}%27`, '?t=' + encodeURIComponent("' or 1=1 --".padEnd(43, 'a'))]) {
    const res = await handleFeed(req(q), deps(db));
    assert.equal(res.status, 404, q);
    assert.equal(res.body, `${TEXT.notFound}\n`);
  }
  assert.deepEqual(state.calls, []);
  assert.equal(tokenFrom('not a url'), null);
});

test('a regenerated token: the old link stops at once, the new one works', async () => {
  const { state, db } = fakeDb();
  const d = deps(db);
  assert.equal((await handleFeed(req(`?t=${TOKEN_ONE}`), d)).status, 200);
  state.settings[0].value = TOKEN_NEW; // the new value reaches the server (sync)
  const old = await handleFeed(req(`?t=${TOKEN_ONE}`), d);
  assert.equal(old.status, 404);
  assertNoLeak(old.body);
  const fresh = await handleFeed(req(`?t=${TOKEN_NEW}`), d);
  assert.equal(fresh.status, 200);
  assert.deepEqual(parseIcs(fresh.body!).events.map((e) => e.title), ['🦷 Dentist']);
});

test('a feed turned off (tombstoned token row) answers 404', async () => {
  const { state, db } = fakeDb();
  state.settings[0].deleted_at = '2026-10-17T09:00:00Z';
  assert.equal((await handleFeed(req(`?t=${TOKEN_ONE}`), deps(db))).status, 404);
});

test('a user with no tasks gets a valid, empty calendar', async () => {
  const { db } = fakeDb();
  const res = await handleFeed(req(`?t=${TOKEN_TWO}`), deps(db));
  assert.equal(res.status, 200);
  const cal = parseIcs(res.body!);
  assert.equal(cal.events.length, 0);
  assert.match(res.body!, /^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
});

test('never another user\'s data: the user id comes only from the token lookup; query parameters are ignored', async () => {
  const { state, db } = fakeDb();
  const res = await handleFeed(req(`?t=${TOKEN_TWO}&user_id=${USER_ONE}&uid=${USER_ONE}`), deps(db));
  assert.equal(res.status, 200);
  assert.deepEqual(state.calls, ['owner', `tasks:${USER_TWO}`]);
  assert.ok(!res.body!.includes('Dentist'));
  // A token that matches a different setting's VALUE is not a feed token.
  state.calls.length = 0;
  state.settings[0].value = TOKEN_NEW;
  const other = await handleFeed(req(`?t=${TOKEN_ONE}`), deps(db));
  assert.equal(other.status, 404, 'TOKEN_ONE is still the value of feature.priority for user two, but that is not the feed key');
});

test('rate limit per token: the 31st request in 10 minutes is 429 with Retry-After; it recovers after the window', async () => {
  const { state, db } = fakeDb();
  let now = TODAY.getTime();
  const d = deps(db, () => new Date(now));
  for (let i = 0; i < TOKEN_LIMIT.max; i++) assert.equal((await handleFeed(req(`?t=${TOKEN_ONE}`, 'GET', `198.51.100.${i}`), d)).status, 200);
  const before = state.calls.length;
  const limited = await handleFeed(req(`?t=${TOKEN_ONE}`, 'GET', '198.51.100.200'), d);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers['Retry-After']) > 0);
  assert.equal(state.calls.length, before, 'no database read while limited');
  assertNoLeak(limited.body);
  // Another token is not affected.
  assert.equal((await handleFeed(req(`?t=${TOKEN_TWO}`), d)).status, 200);
  now += TOKEN_LIMIT.windowMs;
  assert.equal((await handleFeed(req(`?t=${TOKEN_ONE}`), d)).status, 200);
});

test('guessing is capped per caller: after 20 bad tokens the caller gets 429 and no database read; another caller is unaffected', async () => {
  const { state, db } = fakeDb();
  const d = deps(db);
  for (let i = 0; i < UNKNOWN_LIMIT.max; i++) {
    const res = await handleFeed(req(`?t=${String(i).padStart(43, 'g')}`), d);
    assert.equal(res.status, 404);
  }
  const reads = state.calls.length;
  const blocked = await handleFeed(req(`?t=${TOKEN_ONE}`), d);
  assert.equal(blocked.status, 429);
  assert.equal(state.calls.length, reads, 'not even a lookup');
  assert.equal((await handleFeed(req(`?t=${TOKEN_ONE}`, 'GET', '192.0.2.50'), d)).status, 200);
});

test('the limiter stays bounded in memory', () => {
  const l = new RateLimiter(1, 1000, 100);
  for (let i = 0; i < 1000; i++) l.hit(`k${i}`, 0);
  assert.ok((l as unknown as { hits: Map<string, unknown> }).hits.size <= 100);
});

test('database failures and exceptions: 503 with one fixed sentence, nothing leaked', async () => {
  for (const fail of ['owner', 'tasks', 'throw'] as const) {
    const { state, db } = fakeDb();
    state.fail = fail;
    const res = await handleFeed(req(`?t=${TOKEN_ONE}`), deps(db));
    assert.equal(res.status, 503, fail);
    assert.equal(res.body, `${TEXT.unavailable}\n`);
    assertNoLeak(res.body);
  }
});

test('methods: HEAD has no body; POST, PUT, DELETE and OPTIONS are 405 with no CORS', async () => {
  const { db } = fakeDb();
  const head = await handleFeed(req(`?t=${TOKEN_ONE}`, 'HEAD'), deps(db));
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const r = await handleFeed(req(`?t=${TOKEN_ONE}`, m), deps(db));
    assert.equal(r.status, 405, m);
    assert.equal(r.headers.Allow, 'GET, HEAD');
    assert.ok(!Object.keys(r.headers).some((h) => h.toLowerCase().startsWith('access-control')));
  }
});

test('rows are read defensively: junk values are dropped, never a crash', () => {
  assert.equal(rowToTask({}), null);
  const t = rowToTask({ id: 'x', title: 5, completed: 'yes', recurrence_days: ['Mon', 'Funday', 3], duration_minutes: 'long', recurrence_month_day: 2.5, emoji: '🙂'.repeat(20) })!;
  assert.equal(t.title, '');
  assert.equal(t.completed, false);
  assert.deepEqual(t.recurrenceDays, ['Mon']);
  assert.equal(t.durationMinutes, undefined);
  assert.equal(t.recurrenceMonthDay, undefined);
  assert.ok(t.emoji!.length <= 16);
});

test('index.ts: the service role is read once, used for exactly the two agreed reads, never written with, never logged', () => {
  assert.equal((CODE.match(/SUPABASE_SERVICE_ROLE_KEY/g) ?? []).length, 1);
  assert.match(CODE, /db: \{ schema: BELIFIC_SCHEMA \}/);
  assert.match(CODE, /persistSession: false/);
  assert.equal((CODE.match(/\.from\(/g) ?? []).length, 2);
  assert.match(CODE, /\.from\('user_settings'\)\s*\.select\('user_id'\)\s*\.eq\('key', FEED_TOKEN_KEY\)\s*\.eq\('value', token\)\s*\.is\('deleted_at', null\)/);
  assert.match(CODE, /\.from\('tasks'\)\s*\.select\(TASK_COLUMNS\.join\(','\)\)\s*\.eq\('user_id', userId\)/);
  assert.doesNotMatch(CODE, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(CODE, /Access-Control/i);
  // Logs carry only the status or a fixed sentence.
  for (const line of CODE.split('\n').filter((l) => /console\./.test(l))) assert.doesNotMatch(line.replace(/console\.\w+\(/, ''), /token|userId|user_id|url|serviceKey|req\b|error\b|err\b/i, line);
  assert.deepEqual([...TASK_COLUMNS], ['id', 'title', 'emoji', 'due_date', 'start_time', 'duration_minutes', 'completed', 'recurrence', 'recurrence_days', 'recurrence_month_day', 'updated_at', 'deleted_at']);
  for (const never of ['notes', 'subtasks', 'priority', 'project_key', 'list_key', 'actual_minutes', 'timer_started_at', 'reminder_minutes']) assert.ok(!(TASK_COLUMNS as readonly string[]).includes(never), never);
});

test('the vendor copies are byte for byte the lib files, and they import nothing outside the folder', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/vendor-feed.js'), 'utf8');
  const files = JSON.parse(/const FILES = (\[[^\]]+\])/.exec(script)![1].replace(/'/g, '"')) as string[];
  const vendor = path.join(FN, 'vendor');
  assert.deepEqual(fs.readdirSync(vendor).sort(), [...files].sort());
  for (const f of files) assert.equal(fs.readFileSync(path.join(vendor, f), 'utf8'), fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8'), `${f} drifted: run node scripts/vendor-feed.js`);
  for (const f of [...files.map((x) => path.join(vendor, x)), path.join(FN, 'core.ts')]) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^(?:import|export)[^'"]*from '([^']+)'/gm)) {
      const spec = m[1];
      assert.ok(spec.startsWith('./') && spec.endsWith('.ts'), `${path.basename(f)} imports ${spec}`);
      assert.ok(fs.existsSync(path.join(path.dirname(f), spec)), `${path.basename(f)} imports missing ${spec}`);
    }
  }
});

test('config.toml turns JWT verification off for this function only', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8');
  assert.match(toml, /\[functions\.belific-calendar-feed\]\r?\nverify_jwt = false/);
  assert.equal((toml.match(/^verify_jwt = false/gm) ?? []).length, 1);
});

test('003: exactly one grant (select on belific.user_settings to service_role); the rollback revokes exactly that', () => {
  const strip = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim();
  const up = strip(fs.readFileSync(path.join(ROOT, 'supabase/belific_schema/003_calendar_feed_grants.sql'), 'utf8'));
  const down = strip(fs.readFileSync(path.join(ROOT, 'supabase/belific_schema/003_calendar_feed_grants_rollback.sql'), 'utf8'));
  assert.equal(up.replace(/\s+/g, ' '), 'begin; grant select on table belific.user_settings to service_role; commit;');
  assert.equal(down.replace(/\s+/g, ' '), 'begin; revoke select on table belific.user_settings from service_role; commit;');
});
