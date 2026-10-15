import { AppState, type AppStateStatus } from 'react-native';
import { PROJECT_FINGERPRINT, supabase } from './supabase';
import { kv } from './kv';
import { storageLock } from './lock';
import { ENABLED_KEY, OUTBOX_KEY, onQueued, outboxStore, setSyncEnabled } from './outbox';
import { createSupabaseServer } from './syncServer';
import { ensureProject } from './projectGuard';
import { DELETED, HOLD_KEY, LAST_USER_KEY } from './accountSwitch';
import { REVOKE_KEY } from './revokePending';
import { authStorage } from './kv';
import {
  loadBrainDumpItemsRaw,
  loadCustomCategoriesRaw,
  loadCustomEventsRaw,
  loadProjectsRaw,
  loadRoutineCompletions,
  loadRoutinesRaw,
  loadTasksRaw,
  saveBrainDumpItems,
  saveCustomCategories,
  saveCustomEvents,
  saveProjects,
  saveRoutineCompletions,
  saveRoutines,
  saveTasks,
} from './storage';
import { TIMESTAMPED_TABLES, type TimestampedTable } from './syncCore';
import { META, createSyncEngine, type LocalAdapter, type SyncStatus } from './syncEngine';

// Sync for optional accounts (decision 013, checkpoint 5). Shared by the
// iPhone and the desktop. The rules live in syncCore.ts and syncEngine.ts
// (pure, tested against a fake server); this file only connects them to
// Supabase, storage.ts and the persisted outbox.
//
// Signed out (the default, and the desktop until checkpoint 6) costs one
// local session check per trigger and never touches the network.

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// Table requests go through the app's client, which is created with the
// belific schema (supabase.ts), so every one carries the schema profile header.
const server = createSupabaseServer(supabase, getUserId);

const LOADERS: Record<TimestampedTable, () => Promise<object[]>> = {
  custom_events: loadCustomEventsRaw,
  brain_dump_items: loadBrainDumpItemsRaw,
  routines: loadRoutinesRaw,
  tasks: loadTasksRaw,
  projects: loadProjectsRaw,
  custom_categories: loadCustomCategoriesRaw,
};
const SAVERS: Record<TimestampedTable, (rows: never[]) => Promise<void>> = {
  custom_events: saveCustomEvents,
  brain_dump_items: saveBrainDumpItems,
  routines: saveRoutines,
  tasks: saveTasks,
  projects: saveProjects,
  custom_categories: saveCustomCategories,
};

const local: LocalAdapter = {
  withLock: (fn) => storageLock.run(fn),
  load: async (table) => (await LOADERS[table]()) as Record<string, unknown>[],
  save: (table, rows) => SAVERS[table](rows as never[]),
  loadCompletions: loadRoutineCompletions,
  saveCompletions: saveRoutineCompletions,
  getMeta: (key) => kv.getItem(key),
  setMeta: async (key, value) => {
    if (value === null) await kv.removeItem(key);
    else await kv.setItem(key, value);
  },
};

const engine = createSyncEngine({ server, local, outbox: outboxStore });

let signedIn = false;

// Sync state belongs to one project. Called before anything signs in or syncs;
// if this build points at a different project than the stored state was made
// for, the state is reset first (projectGuard.ts). Runs once per launch; a
// failure is retried on the next call.
const SYNC_STATE_KEYS = [ENABLED_KEY, OUTBOX_KEY, META.caps, META.seenCompletions, ...TIMESTAMPED_TABLES.map((t) => META.cursor(t)), LAST_USER_KEY, HOLD_KEY];
let projectChecked: Promise<void> | null = null;

export function ensureCurrentProject(): Promise<void> {
  if (!projectChecked) {
    projectChecked = ensureProject({
      fingerprint: PROJECT_FINGERPRINT,
      getItem: (k) => kv.getItem(k),
      setItem: (k, v) => kv.setItem(k, v),
      removeItem: (k) => kv.removeItem(k),
      stateKeys: SYNC_STATE_KEYS,
      forgetKeys: [META.caps, META.seenCompletions, ...TIMESTAMPED_TABLES.map((t) => META.cursor(t)), HOLD_KEY],
      lastUserKey: LAST_USER_KEY,
      differentAccountMarker: DELETED,
      disableSync: () => setSyncEnabled(false),
      signOutLocal: async () => {
        await supabase.auth.signOut({ scope: 'local' });
      },
      cancelPendingSignIn: async () => {
        await globalThis.belificDesktop?.auth.cancel();
      },
      dropRevokePending: () => authStorage.removeItem(REVOKE_KEY),
    })
      .then(async (result) => {
        if (result === 'switched') {
          signedIn = false;
          await engine.refreshPending();
        }
      })
      .catch((e) => {
        projectChecked = null;
        throw e;
      });
  }
  return projectChecked;
}

export type PublicSyncStatus = SyncStatus & { signedIn: boolean };

export function getSyncStatus(): PublicSyncStatus {
  return { ...engine.getStatus(), signedIn };
}

export function subscribeSyncStatus(listener: (s: PublicSyncStatus) => void): () => void {
  return engine.subscribe((s) => listener({ ...s, signedIn }));
}

// A full sync: pull every table, merge, push the outbox. Safe to call any
// time; signed out it returns at once. Existing signed in iPhones turn the
// outbox on here on their first launch of this version.
// Desktop only: after a sign in as a different account the person must choose
// what happens to this computer's data first (cp6.1). Nothing syncs until then.
// The key is read as a literal so this file stays free of desktop code; on
// iOS belificDesktop is absent and this never reads anything.
async function accountChoiceHeld(): Promise<boolean> {
  if (!globalThis.belificDesktop) return false;
  try {
    return (await kv.getItem('belific_account_choice_pending')) !== null;
  } catch {
    return true;
  }
}

export async function runFullSync(): Promise<void> {
  await ensureCurrentProject();
  if (await accountChoiceHeld()) return;
  const userId = await getUserId();
  signedIn = userId !== null;
  if (signedIn) await setSyncEnabled(true);
  await engine.sync();
}

// After a successful sign in: the first full pass uploads local rows,
// downloads the account's rows and resolves same-id rows by the rules.
export async function onSignedIn(): Promise<void> {
  await ensureCurrentProject();
  if (await accountChoiceHeld()) return;
  signedIn = true;
  await setSyncEnabled(true);
  await engine.sync();
}

// After sign out or account deletion: stop queueing, forget the queue and
// every cursor, so a different account starts from a full pass.
export async function onSignedOut(): Promise<void> {
  signedIn = false;
  await setSyncEnabled(false);
  const keys = [META.caps, META.seenCompletions, ...TIMESTAMPED_TABLES.map((t) => META.cursor(t))];
  await kv.multiRemove(keys);
  await engine.refreshPending();
}

export const SYNC_POLL_MS = 120 * 1000;
const DRAIN_DELAY_MS = 1500;

// Triggers (decision 013 item 5): foreground, every 120 s while the app is
// active (on the desktop that means while the window is visible), and a
// short debounce after each local write. Returns a stop function.
export function startSyncLoop(): () => void {
  let state: AppStateStatus = AppState.currentState;
  let drainTimer: ReturnType<typeof setTimeout> | null = null;

  const poll = setInterval(() => {
    if (state === 'active') runFullSync().catch(() => {});
  }, SYNC_POLL_MS);

  const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (state.match(/inactive|background/) && next === 'active') runFullSync().catch(() => {});
    state = next;
  });

  const stopQueued = onQueued(() => {
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = setTimeout(() => {
      drainTimer = null;
      engine.drain().catch(() => {});
    }, DRAIN_DELAY_MS);
  });

  return () => {
    clearInterval(poll);
    sub.remove();
    stopQueued();
    if (drainTimer) clearTimeout(drainTimer);
  };
}
