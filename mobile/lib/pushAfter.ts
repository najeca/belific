// Push after (PLAN_push_after, D7 of PLAN_desktop_parity, 3.73.0). Pure: NO runtime imports besides siblings; see
// pushAfter.test.ts. Shared by the desktop and the phone; lib/pushAfterActions.ts writes what this works out.
//
// When a task is dropped or moved onto a time that overlaps other timed tasks on the same day, the overlapped tasks are
// pushed later by just enough to clear it, one after another, stopping at the first gap big enough. It is worked out
// AFTER the moved task's own write (the day as it is now stored), so the drop is never held up by it.
//
//  * The blockers are the day's timed blocks (dayHostEntries, what the Timebox draws), less: the moved task (every time
//    of it, and every day row of its series), what moved with it (`carried`), done tasks and done times (they never
//    move and never push; an overlap with one is left as it is), quick reminders (no length), breaks (walls, below),
//    tasks inside a break (its guests), yesterday's overnight rest, the rows inside a longer block (they go with it),
//    the first row of a repeating series (the root row is never written by a push), and on today the blocks that
//    ended before now (late, not in the way). Events and subscribed calendars are not tasks and never block.
//  * The chain: blockers by start (then title). The moved task ends at `e`. A blocker that starts before `e` and ends
//    after the moved task's start moves to start at `e` (one that starts before the moved task and overlaps only its
//    start too: the dropped task wins the time it was dropped on); `e` becomes its new end; and so on. It stops at the
//    first blocker that already starts at or after `e`.
//  * A longer block with others inside it (a shift) is ONE blocker: the rows inside move with it by the same amount
//    (`rows`, written by breakCarry) and count once; the chain goes on from the shift's end.
//  * A task dropped inside a shift (a block of 2 hours or more that holds it whole) pushes nothing: it is a row of the
//    shift. A shift dropped over shorter blocks takes them in as its rows the same way.
//  * Breaks are walls: a break never moves; a pushed block that would overlap one jumps to the break's end (the breaks
//    inside a pushed shift go with it instead). A break, or a task inside one, never pushes anything.
//  * Midnight: nothing is pushed past 24:00 or to another day. When the chain does not fit, nothing is pushed at all
//    (`refused`): the drop itself stays, side by side as before, and the note says why.
//  * A task with several times a day: only the time in the way moves; when that would clash with another of its times
//    the whole push is refused as at midnight.
import type { Task } from './types.ts';
import { dayHostEntries, hostDay, type DayHostEntry } from './hosting.ts';
import { nestDay } from './nesting.ts';
import { idDate } from './series.ts';
import { rootTaskId } from './recurrence.ts';
import { isSeriesRow } from './rollover.ts';
import { moveTimeFields } from './times.ts';
import { toTime } from './timebox.ts';
import { formatTime } from './data.ts';

const DAY_END = 24 * 60;
// A shift (shifts.ts SHIFT_MIN_MINUTES): what is dropped inside one becomes its row instead of pushing it.
export const PUSH_SHIFT_MIN = 120;

// The user_settings row (synced, last write wins, no database change): `on` or `off`, on when never set.
export const PUSH_AFTER_KEY = 'push.after';
export const parsePushAfter = (value: string | null | undefined): boolean => value !== 'off';
export const PUSH_AFTER_LABEL = 'Push later tasks when times overlap';
export const PUSH_AFTER_HINT =
  'When a task is moved onto a time that other tasks already use, they move later, one after another, to the first free time. Done tasks and breaks never move. Off keeps them side by side.';

export interface PushMoved {
  // The moved task's id (any row of its series: every day row of the series is left out on this day).
  id: string;
  startMin: number;
  endMin: number;
  // The moved task is a break (Split on).
  breaks?: boolean;
}

export interface PushInput {
  tasks: Task[];
  dayKey: string;
  todayKey: string;
  // Minutes after midnight now; only used on today.
  nowMin: number;
  moved: PushMoved;
  // Task ids that moved with the moved task (what was inside it): never blockers.
  carried?: Iterable<string>;
}

export interface PushMove {
  entry: DayHostEntry;
  fromMin: number;
  toMin: number;
  // The blocks inside a pushed shift, which go with it (counted once, with it).
  rows: DayHostEntry[];
}

export type PushPlan = { moves: PushMove[] } | { refused: string; count: number } | null;

const len = (e: { startMin: number; endMin: number }) => e.endMin - e.startMin;
const isDone = (e: DayHostEntry) => !!e.task.completed || !!e.full.completed;
// The first row of a repeating series (its id has no day): a push never writes it.
export const isRootRow = (e: Pick<DayHostEntry, 'full' | 'projected'>): boolean => !e.projected && isSeriesRow(e.full) && !idDate(e.full.id);

export const tasksText = (n: number): string => (n === 1 ? '1 task' : `${n} tasks`);
export const refusalText = (n: number): string => `Not enough room before midnight to push ${tasksText(n)}. They overlap for now.`;
export const clashText = (title: string): string => `Not pushing: ${title} would clash with another of its own times. They overlap for now.`;
// The Undo bar after a push: "Moved Gym to 3:00pm and pushed 2 tasks later".
export function pushedText(title: string, startMin: number, n: number): string {
  return `Moved ${title || 'the task'} to ${formatTime(toTime(startMin))} and pushed ${tasksText(n)} later`;
}

export function pushPlan(input: PushInput): PushPlan {
  const { tasks, dayKey, todayKey, nowMin, moved } = input;
  if (moved.breaks || dayKey < todayKey) return null;
  if (!(moved.endMin > moved.startMin)) return null;
  const root = rootTaskId(moved.id);
  const carried = new Set(input.carried ?? []);
  const entries = dayHostEntries(tasks, dayKey, todayKey);
  const { hostOf, breakIds } = hostDay(entries);
  const mine = entries.filter((e) => rootTaskId(e.full.id) === root && !e.cont);
  // A moved task that is a guest of a break pushes nothing (it sits in free time).
  if (mine.some((e) => hostOf.has(e.id) && e.startMin === moved.startMin)) return null;
  const others = entries.filter((e) => rootTaskId(e.full.id) !== root && !carried.has(e.full.id));
  const walls = others.filter((e) => breakIds.has(e.id));
  const plain = others.filter((e) => !e.breaks && !hostOf.has(e.id) && !e.cont);
  // Dropped inside a shift: it is a row of the shift, nothing is pushed.
  const span = { startMin: moved.startMin, endMin: moved.endMin };
  if (plain.some((e) => !isDone(e) && len(e) >= PUSH_SHIFT_MIN && e.startMin <= span.startMin && span.endMin <= e.endMin && len(e) > len(span))) return null;
  // A shift dropped over shorter blocks takes them in as its rows.
  const asRows = len(span) >= PUSH_SHIFT_MIN ? (e: DayHostEntry) => span.startMin <= e.startMin && e.endMin <= span.endMin && len(e) < len(span) : () => false;
  const free = plain.filter((e) => !asRows(e));
  const { shellOf, inside } = nestDay(free);
  const byId = new Map(free.map((e) => [e.id, e]));
  const past = dayKey === todayKey ? (e: DayHostEntry) => e.endMin <= nowMin : () => false;
  const blockers = free
    .filter((e) => !shellOf.has(e.id) && !isDone(e) && !isRootRow(e) && !past(e))
    .sort((a, b) => a.startMin - b.startMin || a.task.title.localeCompare(b.task.title) || a.id.localeCompare(b.id));
  const moves: PushMove[] = [];
  let e = span.endMin;
  for (const b of blockers) {
    if (b.endMin <= span.startMin) continue;
    if (b.startMin >= e) break;
    const L = len(b);
    // The breaks wholly inside this block go with it; the others are walls.
    const own = (w: DayHostEntry) => b.startMin <= w.startMin && w.endMin <= b.endMin;
    let at = e;
    for (let guard = 0; guard < 100; guard += 1) {
      const wall = walls.find((w) => !own(w) && at < w.endMin && w.startMin < at + L);
      if (!wall) break;
      at = wall.endMin;
    }
    const rows = (inside.get(b.id) ?? []).flatMap((id) => {
      const x = byId.get(id);
      return x ? [x] : [];
    });
    moves.push({ entry: b, fromMin: b.startMin, toMin: at, rows });
    e = at + L;
  }
  if (moves.length === 0) return null;
  if (moves.some((m) => m.toMin + len(m.entry) > DAY_END)) return { refused: refusalText(moves.length), count: moves.length };
  // Several times of one task: each moved time must still fit with its others (and two of them never both move).
  const multi = new Map<string, number>();
  for (const m of moves) {
    if (!m.entry.time) continue;
    multi.set(m.entry.full.id, (multi.get(m.entry.full.id) ?? 0) + 1);
    const ok = moveTimeFields(m.entry.full, m.entry.time, toTime(m.toMin));
    if (!ok.ok || (multi.get(m.entry.full.id) ?? 0) > 1) return { refused: clashText(m.entry.full.title), count: moves.length };
  }
  return { moves };
}

// The new fields of one pushed block: its start, or for one time of a task with several, its times.
export function pushFields(m: PushMove, current: Task = m.entry.full): Partial<Task> | null {
  const to = toTime(m.toMin);
  if (!m.entry.time) return { startTime: to };
  const r = moveTimeFields(current, m.entry.time, to);
  return r.ok ? r.fields : null;
}
