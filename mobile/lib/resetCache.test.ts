// Run with `npm test` from mobile/. "Reset local cache and resync" (build plan
// phase 7): it must never lose a change that is not on the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetLocalCacheAndResync, type ResetDeps } from './resetCache.ts';

interface World {
  signedIn: boolean;
  pushThrows: boolean;
  state: string;
  lastError: string | null;
  // whether pushAll moves lastSuccessAt forward (a skipped sync does not)
  pushAdvances: boolean;
  pending: number;
  // writes that arrive while the lock is taken
  lateWrites: number;
  now: number;
  lastSuccessMs: number | null;
  log: string[];
  cleared: boolean;
}

function make(over: Partial<World> = {}) {
  const w: World = { signedIn: true, pushThrows: false, state: 'idle', lastError: null, pushAdvances: true, pending: 0, lateWrites: 0, now: 1_000_000, lastSuccessMs: 500_000, log: [], cleared: false, ...over };
  const deps: ResetDeps = {
    signedIn: async () => (w.log.push('signedIn'), w.signedIn),
    pushAll: async () => {
      w.log.push('push');
      if (w.pushThrows) throw new Error('offline');
      if (w.pushAdvances) w.lastSuccessMs = w.now + 10;
    },
    status: () => (w.log.push('status'), { state: w.state, lastSuccessAt: w.lastSuccessMs === null ? null : new Date(w.lastSuccessMs).toISOString(), lastError: w.lastError }),
    pending: async () => (w.log.push('pending'), w.pending),
    withLock: async (fn) => {
      w.log.push('lock');
      w.pending += w.lateWrites;
      return fn();
    },
    clearLocal: async () => {
      w.log.push('clear');
      w.cleared = true;
    },
    nowMs: () => w.now,
  };
  const pull = async () => void w.log.push('pull');
  return { w, deps, pull };
}

test('success: signed in, synced, nothing waiting: it clears and downloads, in that order', async () => {
  const { w, deps, pull } = make();
  const r = await resetLocalCacheAndResync(deps, pull);
  assert.deepEqual(r, { kind: 'done', pulled: true, message: 'Reset. Your data was downloaded again from your account.' });
  assert.deepEqual(w.log, ['signedIn', 'push', 'status', 'pending', 'lock', 'pending', 'clear', 'pull']);
});

test('REFUSE: signed out (this computer holds the only copy): nothing is pushed or cleared', async () => {
  const { w, deps, pull } = make({ signedIn: false });
  const r = await resetLocalCacheAndResync(deps, pull);
  assert.equal(r.kind, 'refused');
  assert.equal(r.kind === 'refused' && r.reason, 'signedOut');
  assert.match(r.message, /only copy/);
  assert.equal(w.cleared, false);
  assert.deepEqual(w.log, ['signedIn']);
});

test('REFUSE: the sync throws: nothing is cleared', async () => {
  const { w, deps, pull } = make({ pushThrows: true });
  const r = await resetLocalCacheAndResync(deps, pull);
  assert.equal(r.kind === 'refused' && r.reason, 'syncFailed');
  assert.equal(w.cleared, false);
  assert.ok(!w.log.includes('pull'));
});

test('REFUSE: the sync ended in an error or offline state: nothing is cleared, the error is shown', async () => {
  for (const state of ['error', 'offline', 'syncing', 'signed-out']) {
    const { w, deps, pull } = make({ state, lastError: state === 'error' ? 'upsert failed: 500' : null });
    const r = await resetLocalCacheAndResync(deps, pull);
    assert.equal(r.kind === 'refused' && r.reason, 'syncFailed', state);
    assert.equal(w.cleared, false, state);
    if (state === 'error') assert.match(r.message, /upsert failed: 500/);
  }
});

test('REFUSE: a sync that was skipped (no success newer than the start) does not count, even if "idle"', async () => {
  const { w, deps, pull } = make({ pushAdvances: false });
  const r = await resetLocalCacheAndResync(deps, pull);
  assert.equal(r.kind === 'refused' && r.reason, 'syncFailed');
  assert.equal(w.cleared, false);
  const never = make({ pushAdvances: false, lastSuccessMs: null });
  assert.equal((await resetLocalCacheAndResync(never.deps, never.pull)).kind, 'refused');
  assert.equal(never.w.cleared, false);
});

test('REFUSE: changes still in the outbox after the sync: nothing is cleared, it says how many', async () => {
  const { w, deps, pull } = make({ pending: 3 });
  const r = await resetLocalCacheAndResync(deps, pull);
  assert.equal(r.kind === 'refused' && r.reason, 'unsynced');
  assert.match(r.message, /3 changes could not be uploaded yet/);
  assert.equal(w.cleared, false);
  const one = make({ pending: 1 });
  assert.match((await resetLocalCacheAndResync(one.deps, one.pull)).message, /1 change could not/);
});

test('REFUSE: a write that arrives between the check and the lock is seen, nothing is cleared', async () => {
  const { w, deps, pull } = make({ lateWrites: 2 });
  const r = await resetLocalCacheAndResync(deps, pull);
  assert.equal(r.kind === 'refused' && r.reason, 'unsynced');
  assert.match(r.message, /2 changes were made while resetting/);
  assert.equal(w.cleared, false, 'the last look under the lock saved it');
  assert.deepEqual(w.log.slice(-3), ['pending', 'lock', 'pending']);
});

test('the download failing after the clear is reported honestly: the data is on the account', async () => {
  const { w, deps } = make();
  const r = await resetLocalCacheAndResync(deps, async () => {
    throw new Error('network');
  });
  assert.equal(r.kind, 'done');
  assert.equal(r.kind === 'done' && r.pulled, false);
  assert.match(r.message, /press Sync now/);
  assert.equal(w.cleared, true);
});

test('every refusal reaches the person as a sentence that begins with what happened and ends with "nothing was reset"', async () => {
  const cases = [make({ signedIn: false }), make({ pushThrows: true }), make({ state: 'error', lastError: 'x' }), make({ pending: 2 }), make({ lateWrites: 1 })];
  for (const c of cases) {
    const r = await resetLocalCacheAndResync(c.deps, c.pull);
    assert.equal(r.kind, 'refused');
    assert.match(r.message, /nothing was reset/i);
  }
});
