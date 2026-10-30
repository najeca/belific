// Moving a task out of the break it is during (3.9.0, lib/hosting.ts), shared by the desktop and the
// iPhone. Each action writes through the task's own ops (lib/taskOps.ts), so a day of a repeating task
// changes that day only (3.20.0) and returns an undo that puts back exactly the
// rows it changed.
import type { Task } from './types.ts';
import { loadTasksRaw, updateTask } from './storage';
import { opsForProjected, opsForTask } from './taskOps';
import { DETAILS_LONGER, breakEntries, breakLosesGuests, dayHostEntries, fitRefusal, longerNote, moveOutFields, removeTimeOutFields, type BreakSpan, type Span } from './hosting.ts';
import { timesOf } from './times.ts';
import { toMinutes } from './timebox.ts';
import { taskDuration } from './drag.ts';
import { dateKey } from './kanban.ts';

export interface HostedRef {
  // The real task (for a projected day, that day's occurrence) and the time inside the break.
  full: Task;
  time?: string;
  projected: boolean;
}

export type OutResult = { ok: true; text: string; undo: () => Promise<void> } | { ok: false; note: string };

const TIME_KEYS = ['dueDate', 'startTime', 'extraTimes', 'timesDone', 'durationMinutes', 'completed', 'completedAt'] as const;

// What undo writes: every row the action changed goes back as it was. The day row the action created
// (a day of a repeating task stored for that day alone, under that day's id) takes back the times it showed
// before. Any other new row (the next day stored to carry the series) already matches the series: it is
// left alone.
async function writeWithUndo(g: HostedRef, fields: Partial<Task>): Promise<() => Promise<void>> {
  const before = new Map((await loadTasksRaw()).map((t) => [t.id, t]));
  const ops = g.projected ? opsForProjected(g.full) : opsForTask(g.full);
  await ops.patchDay(fields);
  const after = await loadTasksRaw();
  const changed = after.filter((t) => {
    const b = before.get(t.id);
    return !b || JSON.stringify(b) !== JSON.stringify(t);
  });
  return async () => {
    const now = new Map((await loadTasksRaw()).map((t) => [t.id, t]));
    for (const row of changed) {
      const cur = now.get(row.id);
      if (!cur) continue;
      const old = before.get(row.id);
      if (old) {
        await updateTask(old);
        continue;
      }
      if (row.id !== g.full.id) continue;
      const back: Task = { ...cur };
      for (const k of TIME_KEYS) (back as unknown as Record<string, unknown>)[k] = g.full[k];
      await updateTask(back);
    }
  };
}

export async function moveOutOfBreak(g: HostedRef, brk: Pick<BreakSpan, 'endMin'> & { title: string }): Promise<OutResult> {
  const plan = moveOutFields(g.full, g.time, brk);
  if (!plan.ok) return plan;
  const undo = await writeWithUndo(g, plan.fields);
  return { ok: true, text: `Moved ${g.full.title} out of ${brk.title}`, undo };
}

export async function removeTimeInBreak(g: HostedRef): Promise<OutResult> {
  const plan = removeTimeOutFields(g.full, g.time);
  if (!plan.ok) return plan;
  const undo = await writeWithUndo(g, plan.fields);
  return { ok: true, text: `${g.full.title} has no time now`, undo };
}

// 3.11.0: may this change go ahead? `task` is the task as it is (null for a new one), `fields` the change.
// A refusal is the note to show: 'drop' (a drag, a new task) "Longer than the break (1 h)", 'details'
// "Longer than the break. Shorten it or move it out." Only a change of a time, a length or the day counts.
export async function breakRefusal(task: Task | null, fields: Partial<Task>, kind: 'drop' | 'details'): Promise<string | null> {
  if (!('startTime' in fields || 'extraTimes' in fields || 'durationMinutes' in fields || 'dueDate' in fields)) return null;
  const next = { ...(task ?? {}), ...fields } as Task;
  // A Split task is refused only for what a hosted task is: sticking out of the break it is inside (3.22.0).
  if (!next.dueDate) return null;
  const spans = (t: Task): Span[] => timesOf(t).flatMap((time) => {
    const s = toMinutes(time);
    return s === null ? [] : [[s, s + taskDuration(t)] as Span];
  });
  const after = spans(next);
  if (after.length === 0) return null;
  const before = task && task.dueDate === next.dueDate ? spans(task) : [];
  const breaks = breakEntries(dayHostEntries(await loadTasksRaw(), next.dueDate, dateKey(new Date()))).filter((e) => e.full.id !== next.id);
  const b = fitRefusal(breaks, before, after, !next.cutsBelow);
  if (!b) return null;
  return kind === 'drop' ? longerNote(b) : DETAILS_LONGER;
}

// 3.11.1: a resize or a keyboard nudge of a block. Refused (DETAILS_LONGER) when it would take a task out of
// the break `task` is (it shrank, moved, or went to another day), or when it is a task whose new times fall
// foul of 3.11.0's rule (a hosted time lengthened past its break, a start inside a break it does not fit).
// `dayKey` is the day the block is drawn on. Nothing is written here.
export async function blockChangeRefusal(task: Task, fields: Partial<Task>, dayKey: string): Promise<string | null> {
  if (task.cutsBelow) {
    if (!('startTime' in fields || 'extraTimes' in fields || 'durationMinutes' in fields || 'dueDate' in fields)) return null;
    const tasks = await loadTasksRaw();
    const today = dateKey(new Date());
    const before = dayHostEntries(tasks, dayKey, today);
    const gone = !!task.recurrence && 'dueDate' in fields && fields.dueDate !== dayKey;
    const next = tasks.flatMap((t) => (t.id !== task.id ? [t] : gone ? [] : [{ ...t, ...fields }]));
    if (breakLosesGuests(before, dayHostEntries(next, dayKey, today), task.id)) return DETAILS_LONGER;
  }
  // A Split task that is itself inside a longer break is hosted like any task (3.22.0): it may not stick out of it.
  return breakRefusal(task, fields, 'details');
}
