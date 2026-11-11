// D5 of PLAN_breaks_as_gaps (P3, 3.34.0): breaks follow the task under them. Shifts S4 (3.39.0): so does everything drawn
// inside the task (the blocks fully inside its time), and for a task that crosses midnight what is inside its overnight
// part on the next day.
// When a task moves (a drag, a nudge, a
// new time or day in its details), the breaks that sat wholly inside its old span on that day move by the same
// amount, in the same gesture, so one Ctrl+Z puts everything back (lib/undoStack.ts groups the writes of one
// gesture). Nothing is stored: which breaks go with a task is read from the times, as hosting and cutting are.
// A break itself never carries anything, and the tasks inside a break do not move with it (they leave the gap and
// the usual note says so).
import type { Task } from './types.ts';
import { dayHostEntries } from './hosting.ts';
import { carryPlan, type CarryFrom } from './gaps.ts';
import { toTime } from './timebox.ts';
import { moveTimeFields } from './times.ts';
import { addDays, dateKey, parseDateKey } from './kanban.ts';
import { loadTasksRaw, updateTask } from './storage';
import { editRepeatingTime, moveDay } from './seriesActions';

// Moves the breaks. `source` is how the task itself was changed: 'day' (a drag, a nudge: that day only on a
// repeating break) or 'panel' (the details: a repeating break follows every repeat day without a time of its own,
// as the task did). Returns how many breaks moved.
export async function carryBreaks(host: Pick<Task, 'id' | 'cutsBelow'>, from: CarryFrom, toDay: string, toStart: number, source: 'day' | 'panel' = 'day'): Promise<number> {
  if (host.cutsBelow) return 0;
  const tasks = await loadTasksRaw();
  const today = dateKey(new Date());
  const entries = dayHostEntries(tasks, from.dayKey, today);
  const after = (k: string) => dateKey(addDays(parseDateKey(k), 1));
  const nextDay = from.endMin > 24 * 60 ? after(from.dayKey) : undefined;
  const next = nextDay ? dayHostEntries(tasks, nextDay, today) : [];
  const moves = carryPlan(entries, host.id, from, toDay, toStart, next, nextDay, after(toDay));
  for (const m of moves) {
    const brk = m.entry.full;
    const to = toTime(m.startMin);
    if (m.dayKey !== m.fromDay) {
      if (brk.recurrence) await moveDay(brk, m.dayKey, { startTime: to });
      else await updateTask({ ...brk, dueDate: m.dayKey, startTime: to });
      continue;
    }
    let fields: Partial<Task> = { startTime: to };
    if (m.entry.time) {
      const moved = moveTimeFields(brk, m.entry.time, to);
      if (!moved.ok) continue;
      fields = moved.fields;
    }
    if (brk.recurrence || m.entry.projected) await editRepeatingTime(brk, m.entry.projected, fields, source);
    else await updateTask({ ...brk, ...fields });
  }
  return moves.length;
}
