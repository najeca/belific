import { supabase } from './supabase';
import { runFullSync, getSyncStatus } from './sync';
import { outboxStore } from './outbox';
import { storageLock } from './lock';
import { clearAllData } from './storage';
import { EMPTY_OUTBOX } from './syncCore';
import { resetLocalCacheAndResync, type ResetResult } from './resetCache';

// The real effects behind "Reset local cache and resync" (desktop Settings,
// Data). The rules and every refusal are in resetCache.ts; this only connects
// them to the session, the sync engine, the outbox and local storage.
export function resetLocalCache(): Promise<ResetResult> {
  return resetLocalCacheAndResync(
    {
      signedIn: async () => !!(await supabase.auth.getSession()).data.session?.user,
      pushAll: () => runFullSync(),
      status: () => {
        const s = getSyncStatus();
        return { state: s.state, lastSuccessAt: s.lastSuccessAt, lastError: s.lastError };
      },
      pending: async () => (await outboxStore.read()).entries.length,
      withLock: (fn) => storageLock.run(fn),
      clearLocal: async () => {
        // The outbox keeps a copy in memory as well as on disk: reset both.
        await outboxStore.update(() => EMPTY_OUTBOX);
        await clearAllData();
      },
      nowMs: () => Date.now(),
    },
    () => runFullSync(),
  );
}
