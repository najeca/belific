// Moving a task out of the break it is during (3.9.0, lib/hosting.ts), shared by the desktop and the
// iPhone. Each action writes through the task's own ops (lib/taskOps.ts), so a day of a repeating task
// asks This day only / All days like every other new time, and returns an undo that puts back exactly the
// rows it changed.
import type { Task } from './types.ts';
import { loadTasksRaw, updateTask } from './storage';
import { opsForProjected, opsForTask } from './taskOps';
import { moveOutFields, removeTimeOutFields, type BreakSpan } from './hosting.ts';

export interface HostedRef {
  // The real task (for a projected day, that day's occurrence) and the time inside the break.
  full: Task;
  time?: string;
  projected: boolean;
}

export type OutResult = { ok: true; text: string; undo: () => Promise<void> } | { ok: false; note: string };

const TIME_KEYS = ['dueDate', 'startTime', 'extraTimes', 'timesDone', 'durationMinutes', 'completed', 'completedAt'] as const;

// What undo writes: every row the action changed goes back as it was. A row the action created (a day
// of a repeating task stored by This day only) takes back the times it showed before.
async function writeWithUndo(g: HostedRef, fields: Partial<Task>): Promise<() => Promise<void>> {
  const before = new Map((await loadTasksRaw()).map((t) => [t.id, t]));
  const ops = g.projected ? opsForProjected(g.full) : opsForTask(g.full);
  await ops.patch(fields);
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
