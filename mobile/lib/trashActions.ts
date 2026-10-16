import { addTask, loadListsRaw, loadProjectsRaw, loadTasksRaw, updateTask } from './storage';
import { planRestore, trashEntries, type TrashEntry } from './trash';

// The Trash and Restore, on the desktop (build plan phase 6). The rules are pure
// (trash.ts). Restore reads the LATEST stored rows, makes the new task (if it is
// not already there) and touches the old tombstone so the entry leaves the Trash
// on every device after a sync. Every write is an ordinary task write, queued
// for sync. One at a time, so a double click cannot write twice.
let chain: Promise<unknown> = Promise.resolve();

export async function loadTrash(nowMs: number = Date.now()): Promise<TrashEntry[]> {
  return trashEntries(await loadTasksRaw(), nowMs);
}

export function restoreFromTrash(entry: TrashEntry): Promise<{ restoredId: string; created: boolean } | null> {
  const run = chain.then(async () => {
    if (!entry.restorable) return null;
    const [tasks, labels, lists] = await Promise.all([loadTasksRaw(), loadProjectsRaw(), loadListsRaw()]);
    const plan = planRestore(entry.row, tasks, labels, lists, new Date().toISOString());
    if (!plan) return null;
    if (plan.create) await addTask(plan.create);
    await updateTask(plan.touch);
    return { restoredId: plan.restoredId, created: !!plan.create };
  });
  chain = run.catch(() => undefined);
  return run;
}
