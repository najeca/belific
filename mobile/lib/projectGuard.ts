// Project switch safety. Sync state belongs to one Supabase project (and one
// schema). If the app now points at a different project than the one that
// state was made for, none of it may be used: a cursor from the old project
// would hide rows the new one has, a queued write could land under another
// account, and the old user id would pass the "same account" test.
//
// A fingerprint of the project (host and schema) is stored with the sync state.
// When it differs at start, or is missing while sync state exists (every
// install made before this check, which all came from the old project), the
// guard signs out locally, forgets the cursors and the outbox, ends any pending
// sign in, and leaves the person's local data alone. The last user id becomes
// the "deleted" marker, so the next sign in counts as a different account and
// the existing account choice flow (lib/accountSwitch.ts) asks what to do with
// this computer's data. Resetting the cursors makes the next pull a full one,
// which queues every local row the new project lacks.
//
// Pure, with injected storage and actions, so it is unit tested
// (projectGuard.test.ts). lib/sync.ts wires it up.

export const PROJECT_KEY = 'belific_sync_project';

export function projectFingerprint(url: string, schema: string): string {
  return `${new URL(url).host}/${schema}`;
}

export interface ProjectGuardDeps {
  fingerprint: string;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  // Every key that holds sync state from a project (enabled flag, outbox,
  // caps, cursors, last user id, pending choice). Used to tell a brand new
  // install from an old one that predates the fingerprint.
  stateKeys: string[];
  // Keys removed on a switch: caps, seen completions, cursors, the pending
  // account choice.
  forgetKeys: string[];
  lastUserKey: string;
  // Value that makes the next sign in count as a different account.
  differentAccountMarker: string;
  // Sync off and the outbox emptied.
  disableSync(): Promise<void>;
  signOutLocal(): Promise<void>;
  // Ends a sign in in progress and wipes its code verifier (desktop).
  cancelPendingSignIn(): Promise<void>;
  // Drops a stored "revoke this session later" record, which holds tokens of
  // the old project.
  dropRevokePending(): Promise<void>;
}

export type ProjectCheck = 'same' | 'first' | 'switched';

async function attempt(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // Each step is independent; one failing must not leave the rest undone.
  }
}

export async function ensureProject(d: ProjectGuardDeps): Promise<ProjectCheck> {
  const stored = await d.getItem(PROJECT_KEY);
  if (stored === d.fingerprint) return 'same';

  if (stored === null) {
    let hasState = false;
    for (const key of d.stateKeys) {
      if ((await d.getItem(key)) !== null) {
        hasState = true;
        break;
      }
    }
    if (!hasState) {
      await d.setItem(PROJECT_KEY, d.fingerprint);
      return 'first';
    }
  }

  await attempt(d.cancelPendingSignIn);
  await attempt(d.signOutLocal);
  await attempt(d.dropRevokePending);
  // These two are the ones that protect the new project: let a failure show,
  // so the fingerprint is not written and the guard runs again next time.
  await d.disableSync();
  for (const key of d.forgetKeys) await d.removeItem(key);
  await d.setItem(d.lastUserKey, d.differentAccountMarker);
  await d.setItem(PROJECT_KEY, d.fingerprint);
  return 'switched';
}
