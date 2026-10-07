import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STREAK_LOOKBACK_DAYS,
  STREAK_TEXT,
  bestLine,
  computeStreaks,
  dayLabel,
  seriesStreak,
  streakLine,
  windowLine,
  type SeriesStreak,
} from './seriesStreak.ts';
import { OCCURRENCE_TOMBSTONE_KEEP_DAYS, keepsOccurrenceTombstone } from './series.ts';
import { addDays, dateKey, parseDateKey } from './kanban.ts';
import { mergeRows } from './syncCore.ts';
import type { Task } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TODAY = '2026-10-07'; // a Wednesday

const key = (from: string, n: number) => dateKey(addDays(parseDateKey(from), n));
const range = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let k = from; k <= to; k = key(k, 1)) out.push(k);
  return out;
};

const row = (id: string, dueDate: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: 'Stretch',
  dueDate,
  completed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  recurrence: 'daily',
  ...extra,
});

// A daily series: the root row on `start`, a completed row for every other done
// day, a tombstone for every skipped day.
function daily(root: string, start: string, done: string[], skipped: string[] = [], rule: Partial<Task> = {}): Task[] {
  const rows: Task[] = [row(root, start, { completed: done.includes(start), ...rule })];
  for (const d of done) if (d !== start) rows.push(row(`${root}:${d}`, d, { completed: true, completedAt: `${d}T09:00:00.000Z`, ...rule }));
  for (const d of skipped) rows.push(row(`${root}:${d}`, d, { deletedAt: '2026-10-01T00:00:00.000Z', ...rule }));
  return rows;
}

const streak = (rows: Task[], root = 's', extra: { legacyDates?: Set<string>; todayKey?: string; lookbackDays?: number } = {}) =>
  seriesStreak({ root, rows, todayKey: TODAY, ...extra });

test('a daily run ending yesterday, today still open: the run counts up to yesterday', () => {
  const s = streak(daily('s', '2026-10-02', range('2026-10-02', '2026-10-06')))!;
  assert.equal(s.current, 5);
  assert.equal(s.best, 5);
  assert.equal(s.week[6].state, 'open');
  assert.equal(streakLine(s), '5 days in a row');
});

test('ticking today adds one', () => {
  const s = streak(daily('s', '2026-10-02', range('2026-10-02', TODAY)))!;
  assert.equal(s.current, 6);
  assert.equal(s.week[6].state, 'done');
});

test('a day not done ends the run silently; the new run starts from the next tick; best keeps the old one', () => {
  const s = streak(daily('s', '2026-09-30', ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']))!;
  assert.equal(s.current, 2);
  assert.equal(s.best, 4);
});

test('yesterday not done: nothing to show, today open does not matter', () => {
  const s = streak(daily('s', '2026-10-01', range('2026-10-01', '2026-10-04')))!;
  assert.equal(s.current, 0);
  assert.equal(streakLine(s), null);
  assert.equal(bestLine(s), 'Best: 4 days in a row');
});

test('a series that just started shows nothing (a run of 1 is never shown)', () => {
  const s = streak(daily('s', TODAY, [TODAY]))!;
  assert.equal(s.current, 1);
  assert.equal(streakLine(s), null);
  assert.equal(bestLine(s), null);
});

test('a skipped day is neutral: the run continues across it and it is not counted as done', () => {
  const s = streak(daily('s', '2026-10-01', ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06'], ['2026-10-03']))!;
  assert.equal(s.current, 5);
  assert.equal(s.week.find((d) => d.key === '2026-10-03')!.state, 'skipped');
  assert.equal(s.done7, 5);
  assert.equal(s.scheduled7, 5); // the skipped day and the open day are not scheduled for the count
});

test('without that tombstone the same days are a break (why the tombstone is kept 400 days)', () => {
  const s = streak(daily('s', '2026-10-01', ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06']))!;
  assert.equal(s.current, 3);
});

test('a never ticked projected day is simply not done (no row exists for it)', () => {
  const s = streak(daily('s', '2026-10-01', ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']))!;
  assert.equal(s.week.find((d) => d.key === '2026-10-04')!.state, 'notDone');
  assert.equal(s.current, 2);
});

test('a stale open stored row is not done either', () => {
  const rows = daily('s', '2026-10-01', ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06']);
  rows.push(row('s:2026-10-03', '2026-10-03')); // stored, never completed
  assert.equal(streak(rows)!.current, 3);
});

test('the day is the occurrence day, not the time it was ticked', () => {
  const rows = daily('s', '2026-10-04', range('2026-10-04', '2026-10-06'));
  const late = rows.find((r) => r.id === 's:2026-10-06')!;
  late.completedAt = '2026-10-07T00:30:00.000Z'; // ticked after midnight, on yesterday's card
  const s = streak(rows)!;
  assert.equal(s.week.find((d) => d.key === '2026-10-06')!.state, 'done');
  assert.equal(s.week[6].state, 'open');
  assert.equal(s.current, 3);
});

test('weekly Mon and Thu: only those days count, the run survives the days between', () => {
  const rule: Partial<Task> = { recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'] };
  // Mon 21 Sep, Thu 24, Mon 28, Thu 1 Oct, Mon 5 Oct all done; today is Wednesday.
  const s = streak(daily('s', '2026-09-21', ['2026-09-21', '2026-09-24', '2026-09-28', '2026-10-01', '2026-10-05'], [], rule))!;
  assert.equal(s.current, 5);
  assert.equal(s.unit, 'times');
  assert.equal(streakLine(s), '5 in a row');
  assert.equal(bestLine(s), 'Best: 5 in a row');
  // Tuesday 6 Oct is not scheduled at all
  assert.equal(s.week.find((d) => d.key === '2026-10-06')!.state, 'off');
});

test('weekly: the run only ends when a scheduled day passes undone', () => {
  const rule: Partial<Task> = { recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'] };
  const s = streak(daily('s', '2026-09-21', ['2026-09-21', '2026-09-24', '2026-09-28', '2026-10-01'], [], rule))!;
  assert.equal(s.current, 0); // Monday 5 Oct passed undone
  assert.equal(s.best, 4);
});

test('monthly on the 31st falls on the last day of shorter months', () => {
  const rule: Partial<Task> = { recurrence: 'monthly', recurrenceMonthDay: 31 };
  const s = seriesStreak({ root: 's', rows: daily('s', '2026-07-31', ['2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31'], [], rule), todayKey: '2026-11-02' })!;
  assert.equal(s.current, 4);
  assert.equal(s.unit, 'times');
});

test('every other week counts only the weeks that are on', () => {
  const rule: Partial<Task> = { recurrence: 'biweekly', recurrenceDays: ['Mon'] };
  const s = streak(daily('s', '2026-09-21', ['2026-09-21', '2026-10-05'], [], rule))!;
  assert.equal(s.current, 2);
  assert.equal(s.week.find((d) => d.key === '2026-10-05')!.state, 'done');
});

test('an ended series (rule cleared on every row) and a deleted one have no streak', () => {
  const ended = daily('s', '2026-10-01', range('2026-10-01', '2026-10-06')).map((r) => ({ ...r, recurrence: undefined }));
  assert.equal(streak(ended), null);
  const deleted = daily('s', '2026-10-01', range('2026-10-01', '2026-10-03')).map((r) => ({ ...r, recurrence: undefined, deletedAt: r.completed ? undefined : '2026-10-04T00:00:00.000Z' }));
  assert.equal(streak(deleted), null);
  assert.equal(computeStreaks([...ended, ...deleted.map((r) => ({ ...r, id: `d${r.id}` }))], [], TODAY).size, 0);
});

test('a task that never repeated has no streak', () => {
  assert.equal(streak([row('s', TODAY, { recurrence: undefined })]), null);
});

// ---- converted routines ----

const legacy = (dates: string[]) => new Set(dates);

test('a converted routine keeps its history: the run spans the conversion day', () => {
  const rows = daily('rt_r1', '2026-10-06', ['2026-10-06']);
  const s = streak(rows, 'rt_r1', { legacyDates: legacy(range('2026-09-27', '2026-10-05')) })!;
  assert.equal(s.current, 10);
  assert.equal(s.unit, 'days');
  assert.equal(streak(rows, 'rt_r1')!.current, 1);
});

test('legacy ticks after the conversion day still count (a phone that has not updated)', () => {
  const rows = daily('rt_r1', '2026-10-05', ['2026-10-05']);
  const s = streak(rows, 'rt_r1', { legacyDates: legacy(['2026-10-03', '2026-10-04', '2026-10-06']) })!;
  assert.equal(s.current, 4);
});

test('nothing before the first known day counts as a miss; a gap inside the history does', () => {
  const rows = daily('rt_r1', '2026-10-05', []);
  const s = streak(rows, 'rt_r1', { todayKey: '2026-10-05', legacyDates: legacy(['2026-10-01', '2026-10-02', '2026-10-04']) })!;
  assert.equal(s.week.find((d) => d.key === '2026-09-30')!.state, 'off');
  assert.equal(s.week.find((d) => d.key === '2026-10-03')!.state, 'notDone');
  assert.equal(s.best, 2);
});

test('legacy dates only apply to rt_ roots', () => {
  const rows = daily('plain', '2026-10-06', ['2026-10-06']);
  assert.equal(streak(rows, 'plain', { legacyDates: legacy(range('2026-09-27', '2026-10-05')) })!.current, 1);
});

test('after an Undo and a second conversion the history follows the new routine id and the old series is gone', () => {
  const oldSeries = daily('rt_old', '2026-10-01', range('2026-10-01', '2026-10-03')).map((r) => ({ ...r, recurrence: undefined, deletedAt: r.completed ? undefined : '2026-10-04T00:00:00.000Z' }));
  const newSeries = daily('rt_new', '2026-10-06', ['2026-10-06']);
  const completions = [...range('2026-09-28', '2026-10-05')].flatMap((date) => [
    { routineId: 'old', date },
    { routineId: 'new', date }, // the copies Undo made
  ]);
  const map = computeStreaks([...oldSeries, ...newSeries], completions, TODAY);
  assert.deepEqual([...map.keys()], ['rt_new']);
  assert.equal(map.get('rt_new')!.current, 9);
});

// ---- windows, labels and wording ----

test('last 7 and last 30 counts: done of scheduled, with skipped and open days left out', () => {
  // 20 Sep to 6 Oct ticked except Fri 2 Oct (not done) and Sat 3 Oct (skipped); today open.
  const done = range('2026-09-20', '2026-10-06').filter((d) => d !== '2026-10-02' && d !== '2026-10-03');
  const s = streak(daily('s', '2026-09-20', done, ['2026-10-03']))!;
  assert.equal(s.done7, 4); // 1, 4, 5, 6 Oct
  assert.equal(s.scheduled7, 5); // plus the 2nd; the 3rd (skipped) and today (open) are left out
  assert.equal(s.done30, 15);
  assert.equal(s.scheduled30, 16);
  assert.equal(windowLine(7, s.done7, s.scheduled7), 'Last 7 days: 4 of 5');
});

test('the week strip has seven days ending today and every square has a text label', () => {
  const s = streak(daily('s', '2026-10-01', ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06'], ['2026-10-03']))!;
  assert.equal(s.week.length, 7);
  assert.equal(s.week[6].key, TODAY);
  assert.deepEqual(
    s.week.map((d) => dayLabel(d, TODAY)),
    ['Thursday, done', 'Friday, done', 'Saturday, skipped', 'Sunday, done', 'Monday, done', 'Tuesday, done', 'Today, open'],
  );
});

test('day labels use the plain words for every state, with Today for today', () => {
  const t = TODAY;
  assert.equal(dayLabel({ key: '2026-10-05', state: 'done' }, t), 'Monday, done');
  assert.equal(dayLabel({ key: '2026-10-06', state: 'notDone' }, t), 'Tuesday, not done');
  assert.equal(dayLabel({ key: '2026-10-04', state: 'skipped' }, t), 'Sunday, skipped');
  assert.equal(dayLabel({ key: '2026-10-01', state: 'off' }, t), 'Thursday, not scheduled');
  assert.equal(dayLabel({ key: t, state: 'open' }, t), 'Today, open');
  assert.equal(dayLabel({ key: t, state: 'done' }, t), 'Today, done');
});

test('lines: streak and best only from 2, never a zero; window lines hidden when nothing was done', () => {
  assert.equal(streakLine({ current: 0, unit: 'days' }), null);
  assert.equal(streakLine({ current: 1, unit: 'days' }), null);
  assert.equal(streakLine({ current: 2, unit: 'days' }), '2 days in a row');
  assert.equal(streakLine({ current: 2, unit: 'times' }), '2 in a row');
  assert.equal(bestLine({ best: 1, unit: 'days' }), null);
  assert.equal(bestLine({ best: 9, unit: 'days' }), 'Best: 9 days in a row');
  assert.equal(windowLine(7, 0, 7), null);
  assert.equal(windowLine(30, 0, 0), null);
  assert.equal(windowLine(7, 5, 6), 'Last 7 days: 5 of 6');
  assert.equal(windowLine(30, 21, 30), 'Last 30 days: 21 of 30');
});

// Decision 007: no loss framing, no warning, no zero. Every string the feature
// can produce is checked: the fixed texts, every line for a range of numbers,
// and every day label.
const BANNED = /\b(lost|lose|losing|broke|broken|break|breaks|missed|miss|behind|fail|failed|overdue|late|risk|danger|warning|hurry|keep it up|don't|zero|streak at risk)\b|\b0 (days|of)\b|\b0 in a row\b/i;

function everyString(): string[] {
  const out: string[] = Object.values(STREAK_TEXT);
  for (let n = 0; n <= 40; n++) {
    for (const unit of ['days', 'times'] as const) {
      const l = streakLine({ current: n, unit });
      const b = bestLine({ best: n, unit });
      if (l) out.push(l);
      if (b) out.push(b);
    }
    for (const sched of [0, 1, 7, 30]) {
      const a = windowLine(7, n, sched);
      const c = windowLine(30, n, sched);
      if (a) out.push(a);
      if (c) out.push(c);
    }
  }
  for (const state of ['done', 'notDone', 'skipped', 'open', 'off'] as const) {
    for (let d = 0; d < 7; d++) out.push(dayLabel({ key: key('2026-10-04', d), state }, TODAY));
    out.push(dayLabel({ key: TODAY, state }, TODAY));
  }
  return out;
}

test('banned wording: nothing the feature can say contains loss framing, a warning or a zero', () => {
  const strings = everyString();
  assert.ok(strings.length > 100);
  for (const s of strings) assert.ok(!BANNED.test(s), `banned wording in: ${s}`);
});

test('the Settings label and every Progress string are in the checked list', () => {
  const text = Object.values(STREAK_TEXT);
  assert.ok(text.includes('Show streaks'));
  assert.ok(text.includes('Progress'));
  for (const s of text) assert.ok(!BANNED.test(s), s);
});

test('the wording test itself catches what it is for', () => {
  for (const bad of ['You lost your streak', 'Streak at risk', '0 days in a row', 'You missed Tuesday', 'Last 7 days: 0 of 7', 'Don\'t break it']) {
    assert.ok(BANNED.test(bad), bad);
  }
});

// ---- the lookback and the 400 day tombstone retention ----

test('only the last 366 days are walked; older history is ignored', () => {
  const start = key(TODAY, -500);
  const s = streak(daily('s', start, range(start, key(TODAY, -1))))!;
  assert.equal(s.current, STREAK_LOOKBACK_DAYS - 1);
  assert.equal(s.best, STREAK_LOOKBACK_DAYS - 1);
});

test('the tombstone is kept longer than the streak looks back', () => {
  assert.ok(OCCURRENCE_TOMBSTONE_KEEP_DAYS > STREAK_LOOKBACK_DAYS);
});

test('keepsOccurrenceTombstone: kept for 400 days and for any day ahead, otherwise the normal prune applies', () => {
  const at = (days: number) => key(TODAY, days);
  assert.equal(keepsOccurrenceTombstone({ id: `s:${at(-399)}` }, TODAY), true);
  assert.equal(keepsOccurrenceTombstone({ id: `s:${at(-400)}` }, TODAY), true);
  assert.equal(keepsOccurrenceTombstone({ id: `s:${at(-401)}` }, TODAY), false);
  assert.equal(keepsOccurrenceTombstone({ id: `s:${at(30)}` }, TODAY), true);
  assert.equal(keepsOccurrenceTombstone({ id: 'plain', dueDate: at(-5) }, TODAY), false, 'an ordinary deleted task');
  assert.equal(keepsOccurrenceTombstone({ id: 'root', dueDate: at(-5), recurrence: 'daily' }, TODAY), true, 'a skipped root row keeps its rule');
  assert.equal(keepsOccurrenceTombstone({ id: 'root', dueDate: at(-500), recurrence: 'daily' }, TODAY), false);
  assert.equal(keepsOccurrenceTombstone({ id: 'plain' }, TODAY), false);
});

// A kept or a pruned skip tombstone never brings the skipped day back after a
// pull (the sync rule: a tombstone wins; a pruned one is re-delivered by the
// server, which never prunes).
const merge = (local: Task[], remote: Task[], mode: 'full' | 'incremental') =>
  mergeRows<Task>({ local, remote, keyOf: (t) => t.id, pending: new Map(), preserveFields: [], mode });

test('pull: a kept tombstone beats an older live copy from the server and is pushed again', () => {
  const tomb = row('s:2026-10-03', '2026-10-03', { deletedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
  const stale = row('s:2026-10-03', '2026-10-03', { updatedAt: '2026-09-01T00:00:00.000Z' });
  for (const mode of ['full', 'incremental'] as const) {
    const r = merge([tomb], [stale], mode);
    assert.equal(r.rows.find((t) => t.id === tomb.id)!.deletedAt, tomb.deletedAt, mode);
    assert.ok(r.toEnqueue.some((t) => t.id === tomb.id), mode);
  }
});

test('pull: a pruned tombstone comes back from the server as a tombstone, and the skipped day stays neutral', () => {
  const tomb = row('s:2026-10-03', '2026-10-03', { deletedAt: '2026-10-01T00:00:00.000Z' });
  const base = daily('s', '2026-10-01', ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06']);
  for (const mode of ['full', 'incremental'] as const) {
    const pulled = merge(base, [tomb], mode).rows;
    assert.ok(pulled.some((t) => t.id === tomb.id && t.deletedAt), mode);
    assert.equal(streak(pulled)!.current, 5, mode);
  }
});

test('pull: a stale live copy never replaces the tombstone, so the skipped day does not turn into a not done day or a done one', () => {
  const tomb = row('s:2026-10-03', '2026-10-03', { deletedAt: '2026-10-01T00:00:00.000Z' });
  const base = daily('s', '2026-10-01', ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06'], ['2026-10-03']);
  const stale = row('s:2026-10-03', '2026-10-03', { updatedAt: '2026-09-01T00:00:00.000Z' });
  const pulled = merge(base, [stale], 'full').rows;
  const s = streak(pulled)!;
  assert.equal(s.week.find((d) => d.key === '2026-10-03')!.state, 'skipped');
  assert.equal(s.current, 5);
  assert.ok(tomb.deletedAt);
});

// ---- time zones and DST ----
// Dates are stepped with calendar arithmetic. The walk across a clock change
// must see every calendar day exactly once, in any zone.

function walkAcross(start: string, today: string): void {
  const days = range(start, today);
  const rows = daily('s', start, days.slice(0, -1));
  const s = seriesStreak({ root: 's', rows, todayKey: today })!;
  assert.equal(s.current, days.length - 1, `${start}..${today} in ${process.env.TZ ?? 'local'}`);
  assert.equal(s.week.length, 7);
  assert.equal(new Set(s.week.map((d) => d.key)).size, 7);
  assert.equal(s.week[6].key, today);
  assert.equal(s.done7, 6);
}

const DST_SPANS: Array<[string, string]> = [
  ['2026-03-25', '2026-04-02'], // Europe spring forward (29 March)
  ['2026-10-21', '2026-10-30'], // Europe fall back (25 October)
  ['2026-03-05', '2026-03-12'], // US spring forward (8 March)
  ['2026-10-29', '2026-11-06'], // US fall back (1 November)
  ['2026-09-23', '2026-10-01'], // Auckland spring forward (27 September)
  ['2026-04-01', '2026-04-09'], // Auckland fall back (5 April)
];

test('DST: a run across every clock change counts each calendar day once', () => {
  for (const [a, b] of DST_SPANS) walkAcross(a, b);
});

const ZONES: Array<{ tz: string; probe: [number, number, number]; offset: number }> = [
  { tz: 'Europe/London', probe: [2026, 9, 25], offset: 0 },
  { tz: 'America/New_York', probe: [2026, 10, 1], offset: 300 },
  { tz: 'Pacific/Auckland', probe: [2026, 8, 27], offset: -780 },
];

test('DST: the same walk in London, New York and Auckland', (t) => {
  if (process.env.BELIFIC_STREAK_TZ_CHILD) return; // the child runs the test above
  const file = fileURLToPath(import.meta.url);
  let effective = 0;
  for (const z of ZONES) {
    const r = spawnSync(process.execPath, ['--test', '--test-name-pattern=DST: a run across every clock change', file], {
      env: { ...process.env, TZ: z.tz, BELIFIC_STREAK_TZ_CHILD: '1' },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, `${z.tz}\n${r.stdout}\n${r.stderr}`);
    // Did TZ take effect in the child? Ask a child for the offset on the probe day.
    const probe = spawnSync(process.execPath, ['-e', `console.log(new Date(${z.probe[0]}, ${z.probe[1]}, ${z.probe[2]}, 12).getTimezoneOffset())`], {
      env: { ...process.env, TZ: z.tz },
      encoding: 'utf8',
    });
    if (Number(probe.stdout.trim()) === z.offset) effective += 1;
  }
  // If TZ does not take effect (some Windows Node builds), the walk above still
  // ran, in the machine's own zone; the source test below is the fallback proof.
  t.diagnostic(`TZ took effect in ${effective} of ${ZONES.length} zones`);
});

test('fallback proof: the streak code steps dates by the calendar, never by milliseconds', () => {
  const src = readFileSync(join(HERE, 'seriesStreak.ts'), 'utf8');
  for (const bad of [/86400000/, /24\s*\*\s*60\s*\*\s*60/, /\.getTime\(\)/, /Date\.now\(\)/, /setTime\(/]) assert.ok(!bad.test(src), String(bad));
  assert.ok(/addDays\(/.test(src));
});
