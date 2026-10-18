import { addTask, loadTasksRaw } from './storage';
import { completeTaskById, patchTask } from './taskActions';
import { finishWrites, type Draft } from './planningDraft';
import { skipOccurrence } from './seriesActions';

// Finish in Daily Planning or Daily Shutdown (build plan phase 5): the only
// place these flows write. The writes are worked out from the LATEST stored rows
// at the moment Finish is pressed (so a task completed or moved on the other
// device since the flow opened is not rolled), then each one goes through
// patchTask, which reads the row fresh again. Every write is an ordinary task
// edit, queued for sync like any other. Cancel never reaches this file.
let chain: Promise<unknown> = Promise.resolve();

export function finishFlow(draft: Draft, todayKey: string, mode: 'planning' | 'shutdown', carry: ReadonlySet<string> = new Set()): Promise<{ patched: number; added: number }> {
  const run = chain.then(async () => {
    const tasks = await loadTasksRaw();
    const w = finishWrites(tasks, draft, todayKey, mode, carry);
    for (const t of w.adds) await addTask(t);
    for (const p of w.patches) {
      // Completing goes through setTaskCompleted (it ticks the subtasks too).
      const { completed, ...rest } = p.fields;
      if (Object.keys(rest).length > 0) await patchTask(p.id, rest);
      if (completed !== undefined) await completeTaskById(p.id, completed);
    }
    // Missed days of a series skipped in the flow: the usual skip tombstone.
    for (const occ of draft.skips ?? []) await skipOccurrence(occ);
    return { patched: w.patches.length, added: w.adds.length };
  });
  chain = run.catch(() => {});
  return run;
}
