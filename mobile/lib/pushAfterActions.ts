// Push after (PLAN_push_after P2 and P3): what a push writes, for both apps. The rule is lib/pushAfter.ts (pure).
//
// Every path that moves a task onto a time (a drag, a resize or nudge on the desktop, a new time or length in the
// details, the add flow, Plan my day's A time) does:
//   const start = await pushStart(task);     // before its own write: the rows as they were, what is inside the task
//   ... its own write (and carry) as before ...
//   const r = await pushFinish(start, { id, title, dayKey, startMin });
//   if (r) offer r.text with r.undo         // the Undo bar: "Moved Gym to 3:00pm and pushed 2 tasks later"
// r is null when nothing was in the way (or the setting is off): the path says what it always said.
//
// The writes: a one off task gets its new start (updateTask); a day of a repeating series (shown or stored) is stored
// through "this day only" (seriesActions.editThisDay), so the series and its first (root) row are never changed and a
// series' first time is never sent to every repeat day; what a pushed shift holds moves with it (breakCarry, the done
// ones and a root row stay). The pushes are written last block first, so a block never lands inside a shift that has
// not moved yet. On the desktop they are one gesture (one Ctrl+Z); the Undo bar on both apps writes the rows back.
// Sync is unchanged: each row is an ordinary edit, last write wins.
import type { Task } from './types';
import { loadTasksRaw, loadUserSetting, updateTask, updateTasks } from './storage';
import { editThisDay } from './seriesActions';
import { carryBreaks } from './breakCarry';
import { insideItemsOf } from './shifts';
import { dateKey } from './kanban';
import { isSeriesRow } from './rollover';
import { idDate } from './series';
import { rootTaskId } from './recurrence';
import { dayHostEntries } from './hosting';
import { toMinutes } from './timebox';
import { PUSH_AFTER_KEY, parsePushAfter, pushFields, pushPlan, pushUndoRows, pushedText, type PushMove } from './pushAfter';

export async function pushAfterOn(): Promise<boolean> {
  try {
    return parsePushAfter(await loadUserSetting(PUSH_AFTER_KEY));
  } catch {
    return true;
  }
}

export interface PushStart {
  before: Task[];
  // The tasks inside the moved task before its move (they go with it, they are never in its way).
  carried: string[];
}

export interface PushReport {
  // "Moved Gym to 3:00pm and pushed 2 tasks later", or why nothing was pushed.
  text: string;
  pushed: number;
  // Puts the move and every push back.
  undo: () => Promise<void>;
}

// Before the path's own write. `task` is the task as it is before the move (none for a new one).
export async function pushStart(task?: Pick<Task, 'id' | 'dueDate'> | null): Promise<PushStart> {
  const before = await loadTasksRaw();
  const carried = task && task.dueDate ? insideItemsOf(before, task, dateKey(new Date())).map((e) => e.full.id) : [];
  return { before, carried };
}

const nowMin = (d: Date) => d.getHours() * 60 + d.getMinutes();
const len = (e: { startMin: number; endMin: number }) => e.endMin - e.startMin;

async function writeMove(m: PushMove, dayKey: string, movedRoot: string): Promise<void> {
  const e = m.entry;
  // What is inside a pushed block goes with it, first (breakCarry reads the block where it was): its rows and the breaks
  // inside it. Done rows, a series' root row and the moved task itself stay.
  const rowIds = new Set(m.rows.map((r) => r.full.id));
  const keep = (t: Task) => (rowIds.has(t.id) || (!!t.cutsBelow && rootTaskId(t.id) !== movedRoot)) && !t.completed && !(isSeriesRow(t) && !idDate(t.id));
  await carryBreaks(e.full, { dayKey, startMin: m.fromMin, endMin: m.fromMin + len(e) }, dayKey, m.toMin, 'day', keep);
  const rows = await loadTasksRaw();
  const current = e.projected ? e.full : rows.find((t) => t.id === e.full.id && !t.deletedAt);
  if (!current) return;
  const fields = pushFields(m, current);
  if (!fields) return;
  if (e.projected || isSeriesRow(current)) await editThisDay(current, fields);
  else await updateTask({ ...current, ...fields });
}

// After the path's own write: the moved task now starts at `startMin` on `dayKey`. Pushes what is in its way, or says
// why it does not. null when nothing is in the way or push after is off.
// `added`: a new task (pushStart was called after it was stored, so its Undo keeps it).
export async function pushFinish(start: PushStart, moved: { id: string; title: string; dayKey: string; startMin: number; added?: boolean }): Promise<PushReport | null> {
  if (!(await pushAfterOn())) return null;
  const now = new Date();
  const todayKey = dateKey(now);
  const tasks = await loadTasksRaw();
  const root = rootTaskId(moved.id);
  const entry = dayHostEntries(tasks, moved.dayKey, todayKey).find((e) => rootTaskId(e.full.id) === root && !e.cont && e.startMin === moved.startMin);
  if (!entry) return null;
  const plan = pushPlan({
    tasks,
    dayKey: moved.dayKey,
    todayKey,
    nowMin: nowMin(now),
    moved: { id: entry.full.id, startMin: entry.startMin, endMin: entry.endMin, breaks: !!entry.full.cutsBelow },
    carried: start.carried,
  });
  if (!plan) return null;
  // No new gesture: on the desktop the pushes join the move's own entry, so one Ctrl+Z puts all of it back.
  if ('moves' in plan) for (const m of [...plan.moves].reverse()) await writeMove(m, moved.dayKey, root);
  const after = await loadTasksRaw();
  const back = pushUndoRows(start.before, after, new Date().toISOString());
  return {
    text: 'refused' in plan ? plan.refused : pushedText(moved.title, moved.startMin, plan.moves.length, moved.added),
    pushed: 'refused' in plan ? 0 : plan.moves.length,
    undo: () => updateTasks(back),
  };
}

// The Undo of a move that pushed nothing (the phone's drag and details): the rows before it written back, which also
// takes back what moved with it (a shift's rows).
export async function undoSince(start: PushStart): Promise<() => Promise<void>> {
  const back = pushUndoRows(start.before, await loadTasksRaw(), new Date().toISOString());
  return () => updateTasks(back);
}

// A new task just stored with a day and a time (Quick capture, the add flow): pushes what it overlaps.
export async function pushAdded(task: Task | null | undefined): Promise<PushReport | null> {
  if (!task || !task.dueDate || !task.startTime) return null;
  const startMin = toMinutes(task.startTime);
  if (startMin === null) return null;
  return pushFinish(await pushStart(null), { id: task.id, title: task.title, dayKey: task.dueDate, startMin, added: true });
}
