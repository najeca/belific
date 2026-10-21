// Which task's timer is running, and what starting one does to the others
// (build plan phase 2). Pure: NO runtime imports besides siblings; see
// timerSession.test.ts. The maths of one timer is taskTimer.ts.
//
// One timer runs at a time. Starting a second one stops the first, adding its
// whole elapsed minutes, so a person never has two clocks counting the same
// hour. A timer that has been running for more than 24 hours is never added
// silently, so starting another task asks first (kind 'confirm').
//
// Timers sync (timerStartedAt), so two timers can still arrive from two
// devices. Then the most recently started one is the active one, and the
// others stay listed so they can be stopped.
import type { Task } from './types.ts';
import { isTimerRunning, startTimer, stopTimer, STALE_TIMER_MS } from './taskTimer.ts';
import { dateKey, isDateKey, parseDateKey } from './kanban.ts';
import { toMinutes } from './timebox.ts';

export function runningTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.deletedAt && isTimerRunning(t))
    .sort((a, b) => Date.parse(b.timerStartedAt as string) - Date.parse(a.timerStartedAt as string) || a.id.localeCompare(b.id));
}

export function activeTimerTask(tasks: Task[]): Task | null {
  return runningTasks(tasks)[0] ?? null;
}

export interface TimerPatch {
  id: string;
  fields: Partial<Task>;
}

export type StartPlan =
  | { kind: 'ok'; patches: TimerPatch[] }
  // Another timer ran for more than 24 hours: ask what to add to it first.
  | { kind: 'confirm'; taskId: string; elapsedMinutes: number }
  | { kind: 'missing' };

export type StopFields =
  | { kind: 'stopped'; fields: Partial<Task> }
  | { kind: 'confirm'; elapsedMinutes: number }
  | { kind: 'notRunning' };

// The fields a stopped timer writes: the new total, and the start cleared.
export function stoppedFields(task: Task, nowMs: number): StopFields {
  const r = stopTimer(task, nowMs);
  if (r.kind === 'stopped') return { kind: 'stopped', fields: { actualMinutes: r.task.actualMinutes, timerStartedAt: undefined } };
  return r;
}

// `startedAtMs` counts the new timer from an earlier moment (Part C, "Start from": the
// scheduled start of a time that has already begun). It never changes when the others stop.
export function planStart(tasks: Task[], id: string, nowMs: number, startedAtMs?: number): StartPlan {
  const target = tasks.find((t) => t.id === id && !t.deletedAt);
  if (!target) return { kind: 'missing' };
  if (isTimerRunning(target)) return { kind: 'ok', patches: [] };
  const patches: TimerPatch[] = [];
  for (const other of runningTasks(tasks)) {
    const stopped = stoppedFields(other, nowMs);
    if (stopped.kind === 'confirm') return { kind: 'confirm', taskId: other.id, elapsedMinutes: stopped.elapsedMinutes };
    if (stopped.kind === 'stopped') patches.push({ id: other.id, fields: stopped.fields });
  }
  const from = startedAtMs !== undefined && startedAtMs < nowMs ? startedAtMs : nowMs;
  patches.push({ id, fields: { timerStartedAt: startTimer(target, from).timerStartedAt } });
  return { kind: 'ok', patches };
}

// ---- "Start from" (Part C, P1) ----
export interface StartFromChoice {
  // 'HH:mm' of the scheduled time.
  time: string;
  startedAtMs: number;
  minutesAgo: number;
}

// The scheduled times of a task's day that started less than 24 hours ago (any time today
// that has begun, answer 4 of the Part C plan), most recent first. Empty when the task is
// not planned for today or has no time. `extraTimes` is the Part C list; the first time is
// always `startTime`.
export function startFromChoices(
  task: Pick<Task, 'dueDate' | 'startTime'> & { extraTimes?: string[] },
  now: Date,
): StartFromChoice[] {
  if (!isDateKey(task.dueDate) || task.dueDate !== dateKey(now)) return [];
  const day = parseDateKey(task.dueDate);
  const times = [task.startTime, ...(task.extraTimes ?? [])].filter((t): t is string => typeof t === 'string');
  const out: StartFromChoice[] = [];
  const seen = new Set<string>();
  for (const time of times) {
    const m = toMinutes(time);
    if (m === null || seen.has(time)) continue;
    seen.add(time);
    const startedAtMs = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m).getTime();
    const minutesAgo = Math.floor((now.getTime() - startedAtMs) / 60000);
    if (minutesAgo < 1 || now.getTime() - startedAtMs >= STALE_TIMER_MS) continue;
    out.push({ time, startedAtMs, minutesAgo });
  }
  return out.sort((a, b) => b.startedAtMs - a.startedAtMs);
}
