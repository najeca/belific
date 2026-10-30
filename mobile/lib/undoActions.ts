import { applyTaskPlan, loadListsRaw, loadProjectsRaw } from './storage';
import { stack, stepStack, type StepOutcome } from './undoStack';

// Undo and redo of task changes on the desktop (3.21.0): the top of the stack (lib/undoStack.ts) is planned and
// its inverse written through the storage layer as ordinary edits (a new updatedAt, queued for sync), inside the
// storage lock. Undo and redo never record themselves (applyTaskPlan does not record).
export type UndoOutcome = StepOutcome;

// One at a time: two quick presses never read "nothing done yet" twice.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

async function step(dir: 'undo' | 'redo'): Promise<UndoOutcome> {
  const [labels, lists] = await Promise.all([loadProjectsRaw(), loadListsRaw()]);
  const result = await applyTaskPlan((rows, nowIso) => stepStack(stack, dir, rows, nowIso, { labels, lists }));
  return result.outcome;
}

export const undoLast = () => serial(() => step('undo'));
export const redoLast = () => serial(() => step('redo'));
