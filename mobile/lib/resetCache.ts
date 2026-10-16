// "Reset local cache and resync" (build plan phase 7). Pure, with every effect
// passed in; see resetCache.test.ts.
//
// The point is to throw away this computer's copy and download it again from the
// account, to fix a copy that has gone wrong. It must NEVER lose a change that
// is not on the server yet, so it refuses unless it can prove everything is
// there:
//  1. It needs an account. Signed out, this computer's data is the only copy,
//     so nothing is reset.
//  2. It first does a full sync (pull, then push the whole outbox). That sync
//     must really have run and finished: the engine must report it idle with a
//     success time NEWER than the start of this reset (a sync that was skipped,
//     went offline or errored does not count).
//  3. The outbox must then be empty.
//  4. Only then, holding the storage lock (so no write can slip in), it checks
//     the outbox is still empty, clears the local data and the sync bookkeeping,
//     and pulls everything back.
// Any refusal leaves everything exactly as it was: nothing was cleared.
export interface ResetDeps {
  signedIn(): Promise<boolean>;
  // A full sync: pull, then push everything queued.
  pushAll(): Promise<void>;
  status(): { state: string; lastSuccessAt: string | null; lastError: string | null };
  // How many changes are waiting in the outbox.
  pending(): Promise<number>;
  // The storage lock every local write takes.
  withLock<T>(fn: () => Promise<T>): Promise<T>;
  // Forgets the local data, the outbox and the sync cursors.
  clearLocal(): Promise<void>;
  nowMs(): number;
}

export type RefuseReason = 'signedOut' | 'syncFailed' | 'unsynced';

export type ResetResult =
  | { kind: 'refused'; reason: RefuseReason; message: string }
  // pulled: false when the download after the reset failed (the data is on the
  // server; Sync now brings it back).
  | { kind: 'done'; pulled: boolean; message: string };

export const RESET_WARNING =
  'This deletes the copy of your data on this computer and downloads it again from your account. Everything not yet uploaded is uploaded first, and if anything cannot be uploaded nothing is deleted.';

const stopped = (message: string, reason: RefuseReason): ResetResult => ({ kind: 'refused', reason, message });

export async function resetLocalCacheAndResync(deps: ResetDeps, pullAll: () => Promise<void>): Promise<ResetResult> {
  if (!(await deps.signedIn())) {
    return stopped('Sign in first. Without an account this computer holds the only copy of your data, so nothing was reset.', 'signedOut');
  }
  const startedMs = deps.nowMs();
  try {
    await deps.pushAll();
  } catch {
    return stopped('Syncing failed, so nothing was reset. Check your connection and try again.', 'syncFailed');
  }
  const s = deps.status();
  const ranAt = s.lastSuccessAt ? Date.parse(s.lastSuccessAt) : NaN;
  if (s.state !== 'idle' || Number.isNaN(ranAt) || ranAt < startedMs) {
    const why = s.lastError ? ` (${s.lastError})` : '';
    return stopped(`The sync did not finish${why}, so nothing was reset. Try again when it can sync.`, 'syncFailed');
  }
  const waiting = await deps.pending();
  if (waiting > 0) {
    return stopped(`${waiting} ${waiting === 1 ? 'change' : 'changes'} could not be uploaded yet, so nothing was reset.`, 'unsynced');
  }
  // The last look is under the lock, so a write made a moment ago is seen.
  const cleared = await deps.withLock(async () => {
    const late = await deps.pending();
    if (late > 0) return late;
    await deps.clearLocal();
    return 0;
  });
  if (cleared > 0) {
    return stopped(`${cleared} ${cleared === 1 ? 'change' : 'changes'} were made while resetting and could not be uploaded yet, so nothing was reset.`, 'unsynced');
  }
  try {
    await pullAll();
    return { kind: 'done', pulled: true, message: 'Reset. Your data was downloaded again from your account.' };
  } catch {
    return { kind: 'done', pulled: false, message: 'Reset, but the download did not finish. Your data is safe on your account: press Sync now to bring it back.' };
  }
}
