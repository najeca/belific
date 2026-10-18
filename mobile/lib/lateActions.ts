import { loadCustomEvents, loadTasksRaw } from './storage';
import { patchTask } from './taskActions';
import { projectOccurrences } from './series';
import { dateKey } from './kanban';
import { busyFromEvents, busyFromTasks, isLate, lateMove } from './lateTasks';
import type { Task } from './types';

// Late timed tasks (2.27.0, item 7): what the small action on a faded block
// offers, and doing it. Desktop only. Busy today: the tasks placed on today
// (stored rows and the days of repeating series shown there) and the person's
// own events. Calendars subscribed by link are not counted (they are shown
// beside, not planned around). Nothing moves until the action is pressed.

export async function lateMoveFor(id: string, now = new Date()): Promise<ReturnType<typeof lateMove> | null> {
  const [tasks, events] = await Promise.all([loadTasksRaw(), loadCustomEvents()]);
  const t = tasks.find((x) => x.id === id);
  if (!t || !isLate(t, now)) return null;
  const today = dateKey(now);
  const placed: Task[] = [...tasks, ...projectOccurrences(tasks, [today], today)];
  return lateMove(t, [...busyFromTasks(placed, today, id), ...busyFromEvents(events, today)], now);
}

// Works the slot out again at the moment of pressing (the board may have
// changed since the label was drawn), then writes one ordinary task edit.
export async function moveLateTask(id: string, now = new Date()): Promise<boolean> {
  const move = await lateMoveFor(id, now);
  if (!move) return false;
  await patchTask(id, move.patch);
  return true;
}
