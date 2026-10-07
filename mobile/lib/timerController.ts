import { addActual, elapsedSeconds, isLongRun, parseTimer, pruneTimer, type TimerState } from './timer.ts';

// The timer rules (checkpoint 8.3, decision 022), with everything outside
// them (the clock, the stored timer, the tasks) passed in so the rules are
// tested in node (timerController.test.ts). lib/taskTimer.ts binds the real
// store. Calls run one after another, so two quick presses cannot interleave.

export interface TimerTask {
  id: string;
  completed: boolean;
  deletedAt?: string;
  actualSeconds?: number;
}

export interface TimerDeps {
  now(): number;
  readTimer(): Promise<string | null>;
  writeTimer(value: string | null): Promise<void>;
  readTask(id: string): Promise<TimerTask | undefined>;
  // Sets the task's actualSeconds (the controller computes the new total).
  writeActual(id: string, seconds: number): Promise<void>;
  onChange?(timer: TimerState | null): void;
}

// A run over 12 hours is never added without asking: `confirm` carries the
// task it is about (the one that was running) and the time it ran.
export type StartResult = { kind: 'started' } | { kind: 'refused' } | { kind: 'confirm'; taskId: string; seconds: number };
export type StopResult = { kind: 'stopped'; seconds: number } | { kind: 'none' } | { kind: 'confirm'; taskId: string; seconds: number };

export function createTimerController(deps: TimerDeps) {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };

  async function read(): Promise<TimerState | null> {
    return parseTimer(await deps.readTimer());
  }
  async function write(t: TimerState | null): Promise<void> {
    await deps.writeTimer(t ? JSON.stringify(t) : null);
    deps.onChange?.(t);
  }
  // Adds seconds to a task's Actual (reads the stored value first).
  async function credit(taskId: string, seconds: number): Promise<void> {
    if (seconds <= 0) return;
    const task = await deps.readTask(taskId);
    if (!task || task.deletedAt) return;
    await deps.writeActual(taskId, addActual(task.actualSeconds, seconds));
  }

  return {
    current: () => serial(read),

    // Startup: drop a stored timer whose task is gone, deleted or completed.
    init: () =>
      serial(async () => {
        const raw = await deps.readTimer();
        const t = parseTimer(raw);
        const kept = pruneTimer(t, t ? await deps.readTask(t.taskId) : undefined);
        if (kept === null && raw !== null) await write(null);
        else deps.onChange?.(kept);
        return kept;
      }),

    // Starts the timer on a task; one at a time, so a running one is stopped
    // first and its time saved (unless it ran over 12 hours: then nothing is
    // started and the caller asks what to do with that time).
    start: (taskId: string) =>
      serial<StartResult>(async () => {
        const target = await deps.readTask(taskId);
        if (!target || target.deletedAt || target.completed) return { kind: 'refused' };
        const cur = await read();
        if (cur?.taskId === taskId) return { kind: 'started' };
        if (cur) {
          const seconds = elapsedSeconds(cur.startedAt, deps.now());
          if (isLongRun(seconds)) return { kind: 'confirm', taskId: cur.taskId, seconds };
          await credit(cur.taskId, seconds);
        }
        await write({ taskId, startedAt: deps.now() });
        return { kind: 'started' };
      }),

    // Stops this task's timer and adds the elapsed time to its Actual.
    stop: (taskId: string) =>
      serial<StopResult>(async () => {
        const cur = await read();
        if (!cur || cur.taskId !== taskId) return { kind: 'none' };
        const seconds = elapsedSeconds(cur.startedAt, deps.now());
        if (isLongRun(seconds)) return { kind: 'confirm', taskId, seconds };
        await credit(taskId, seconds);
        await write(null);
        return { kind: 'stopped', seconds };
      }),

    // The answer to a "forgotten timer" prompt: stops the timer and adds
    // exactly `seconds` (the elapsed time, or what the user typed; 0 adds
    // nothing).
    resolveLong: (taskId: string, seconds: number) =>
      serial(async () => {
        const cur = await read();
        if (!cur || cur.taskId !== taskId) return false;
        await credit(taskId, seconds);
        await write(null);
        return true;
      }),

    // Completing a task stops its timer. Returns the seconds to add to the
    // completed task (0 for a run over 12 hours, which is dropped).
    settleOnComplete: (taskId: string) =>
      serial(async () => {
        const cur = await read();
        if (!cur || cur.taskId !== taskId) return 0;
        const seconds = elapsedSeconds(cur.startedAt, deps.now());
        await write(null);
        return isLongRun(seconds) ? 0 : seconds;
      }),

    // A deleted, tombstoned or merged task: its timer is cleared, nothing added.
    discard: (taskId: string) =>
      serial(async () => {
        const cur = await read();
        if (cur?.taskId !== taskId) return false;
        await write(null);
        return true;
      }),
  };
}

export type TimerController = ReturnType<typeof createTimerController>;
