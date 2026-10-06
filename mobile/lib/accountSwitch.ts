// Desktop account switching (cp6.1, M2). Pure logic with injected storage so
// it is unit tested; desktopAuth.ts wires it to kv and the backup IPC.
//
// Rule: when the account that just signed in is not the one this computer
// last used (or that account was deleted) AND local data exists, nothing is
// uploaded until the person chooses. A "hold" flag is persisted, so even a
// relaunch with the session still stored does not sync (sync.ts checks it).
export const LAST_USER_KEY = 'belific_last_user_id';
// Also read by lib/sync.ts as a literal (that file must not import desktop code).
export const HOLD_KEY = 'belific_account_choice_pending';
export const DELETED = 'deleted';

export interface AccountDeps {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  hasLocalData(): Promise<boolean>;
  // A labelled safety backup of the local data. Throws if it fails.
  backup(): Promise<void>;
  // Removes every local data row and the sync bookkeeping.
  clearLocalData(): Promise<void>;
}

export type SignInDecision = 'proceed' | 'choose';

export async function decideOnSignIn(userId: string, d: AccountDeps): Promise<SignInDecision> {
  const last = await d.getItem(LAST_USER_KEY);
  // First ever sign in here: as before (the pre-signin backup already exists).
  if (last === null || last === userId) {
    await d.setItem(LAST_USER_KEY, userId);
    return 'proceed';
  }
  // A different account, or the previous one was deleted.
  if (!(await d.hasLocalData())) {
    await d.setItem(LAST_USER_KEY, userId);
    return 'proceed';
  }
  await d.setItem(HOLD_KEY, userId);
  return 'choose';
}

// "Upload this computer's data to this account". The backup comes first; if it
// fails nothing changes and the choice stays open.
export async function chooseUpload(userId: string, d: AccountDeps): Promise<void> {
  await d.backup();
  await d.setItem(LAST_USER_KEY, userId);
  await d.removeItem(HOLD_KEY);
}

// "Start empty on this account (a backup of the local data is kept)".
export async function chooseEmpty(userId: string, d: AccountDeps): Promise<void> {
  await d.backup();
  await d.clearLocalData();
  await d.setItem(LAST_USER_KEY, userId);
  await d.removeItem(HOLD_KEY);
}

// The user id of an unanswered choice, e.g. after a relaunch.
export async function pendingChoice(d: Pick<AccountDeps, 'getItem'>): Promise<string | null> {
  return d.getItem(HOLD_KEY);
}

// Delete account: the next sign in counts as a different account.
export async function markAccountDeleted(d: AccountDeps): Promise<void> {
  await d.setItem(LAST_USER_KEY, DELETED);
  await d.removeItem(HOLD_KEY);
}

// Plain sign out keeps the last user id, but an unanswered choice is dropped.
export async function dropChoice(d: Pick<AccountDeps, 'removeItem'>): Promise<void> {
  await d.removeItem(HOLD_KEY);
}

// True when any user data row exists (a tombstoned row does not count).
export function dataKeysHaveRows(values: Array<string | null>): boolean {
  for (const raw of values) {
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (Array.isArray(parsed) && parsed.some((r) => r && typeof r === 'object' && !(r as { deletedAt?: string }).deletedAt)) {
      return true;
    }
  }
  return false;
}
