// A tiny async mutex (checkpoint 5, decision 013 item 2). Pure, no imports,
// so `node --test` can use it. `run` queues the function behind every earlier
// one and releases even when it throws. Not re-entrant: never call `run` on
// the same lock from inside its own `run`.
export interface Mutex {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createMutex(): Mutex {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const result = tail.then(fn);
      tail = result.catch(() => {});
      return result;
    },
  };
}

// The one lock around every read, modify, write of app data in storage.ts and
// around the merge step of a sync pull (V7b, N5). Shared by both.
export const storageLock = createMutex();
