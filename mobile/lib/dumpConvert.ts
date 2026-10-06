// A legacy phone Brain Dump item becomes a Task in place on its first edit
// (checkpoint 8.2). Many edits can arrive before the first write finishes, so
// the conversion is shared per item: the first edit creates the Task and
// deletes the item once; every later edit updates that same Task. Pure with
// injected storage; see dumpConvert.test.ts.
import type { BrainDumpItem, Task } from './types.ts';
import { dumpItemToTask } from './thoughts.ts';

export interface ConvertDeps {
  newId(): string;
  nowIso(): string;
  addTask(task: Task): Promise<void>;
  updateTask(task: Task): Promise<void>;
  deleteDumpItem(id: string): Promise<void>;
}

export function createDumpConverter(deps: ConvertDeps) {
  const converted = new Map<string, Promise<Task>>();

  async function ensureTask(item: BrainDumpItem): Promise<Task> {
    let p = converted.get(item.id);
    if (!p) {
      p = (async () => {
        const task = dumpItemToTask(item, deps.newId(), deps.nowIso());
        // The Task is written first: a crash between the two writes leaves a
        // duplicate rather than a loss.
        await deps.addTask(task);
        await deps.deleteDumpItem(item.id);
        return task;
      })();
      converted.set(item.id, p);
      p.catch(() => converted.delete(item.id));
    }
    return p;
  }

  // Applies an edit to the item's Task, creating it first if needed. Edits are
  // applied one after another so none is lost.
  let chain: Promise<unknown> = Promise.resolve();
  function edit(item: BrainDumpItem, fields: Partial<Task>): Promise<Task> {
    const run = chain.then(async () => {
      const base = await ensureTask(item);
      const next: Task = { ...base, ...fields, id: base.id, updatedAt: deps.nowIso() };
      await deps.updateTask(next);
      converted.set(item.id, Promise.resolve(next));
      return next;
    });
    chain = run.catch(() => {});
    return run;
  }

  return { edit, taskFor: ensureTask };
}
