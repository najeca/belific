import { kv } from './kv';
import { backfillUpdatedAt, backfillCreatedAndUpdatedAt } from './migrations';
import { stripLegacyTasks } from './legacyTask';
import { dateKey } from './kanban';
import { isUpcomingOccurrence } from './series';
import type {
  BrainDumpItem,
  CustomCategory,
  CustomEvent,
  Project,
  Routine,
  RoutineCompletion,
  Task,
} from './types';

import { storageLock } from './lock';
import { queueCompletionAdd, queueCompletionDelete, queueRows } from './outbox';

// Sync (checkpoint 5, decision 013): every read, modify, write below runs
// inside storageLock, the same lock the sync merge takes, so a pull can never
// overwrite a write made while it waited on the network (V7b). Each write is
// queued in the persisted outbox (lib/outbox.ts) inside that same lock; the
// outbox is drained by lib/sync.ts. Nothing here talks to the network.

const KEYS = {
  CUSTOM_EVENTS: 'belific_custom_events',
  TIMER_SETTINGS: 'belific_pomodoro',
  NOTIFICATIONS_ENABLED: 'belific_notifications_enabled',
  FIRST_LAUNCH: 'belific_first_launch',
  BRAIN_DUMP: 'belific_brain_dump',
  CUSTOM_CATEGORIES: 'belific_custom_categories',
  ROUTINES: 'belific_routines',
  ROUTINE_COMPLETIONS: 'belific_routine_completions',
  TASKS: 'belific_tasks',
  PROJECTS: 'belific_projects',
  SCHEMA_MIGRATED_V2: 'belific_schema_migrated_v2',
} as const;

// How long a tombstoned (soft-deleted) row is kept around before being
// pruned for real — long enough that a device which hasn't synced in a
// while still gets a chance to see the delete before the row vanishes
// from the source of truth entirely.
const TOMBSTONE_RETENTION_DAYS = 90;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// Filters out tombstoned rows entirely (never shown to callers) and
// separately reports whether any tombstone was old enough to prune from
// storage for real — same two-step shape as the RoutineCompletion
// prune-on-load below, just generalized. String comparison on ISO
// timestamps is safe: fixed-width, lexicographic order matches
// chronological order.
function pruneAndHideTombstones<T extends { deletedAt?: string }>(
  items: T[],
  // Tombstones this says to keep even when they are old.
  keep?: (item: T) => boolean,
): { visible: T[]; forStorage: T[]; changed: boolean } {
  const cutoff = isoDaysAgo(TOMBSTONE_RETENTION_DAYS);
  const forStorage = items.filter((i) => !i.deletedAt || i.deletedAt >= cutoff || (keep?.(i) ?? false));
  const visible = forStorage.filter((i) => !i.deletedAt);
  return { visible, forStorage, changed: forStorage.length !== items.length };
}

// Loads raw, unfiltered rows including tombstones — only the migration
// function and internal helpers below should use this; every other
// caller wants loadCustomEvents.
export async function loadCustomEventsRaw(): Promise<CustomEvent[]> {
  try {
    const data = await kv.getItem(KEYS.CUSTOM_EVENTS);
    return data ? (JSON.parse(data) as CustomEvent[]) : [];
  } catch {
    return [];
  }
}

export async function loadCustomEvents(): Promise<CustomEvent[]> {
  const all = await loadCustomEventsRaw();
  const { visible, changed } = pruneAndHideTombstones(all);
  if (changed) await storageLock.run(async () => saveCustomEvents(pruneAndHideTombstones(await loadCustomEventsRaw()).forStorage));
  return visible;
}

export async function saveCustomEvents(events: CustomEvent[]): Promise<void> {
  try {
    await kv.setItem(KEYS.CUSTOM_EVENTS, JSON.stringify(events));
  } catch {
    // noop
  }
}

export function addCustomEvent(event: CustomEvent): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadCustomEventsRaw();
    const stamped = { ...event, updatedAt: new Date().toISOString() };
    await saveCustomEvents([...existing, stamped]);
    await queueRows('custom_events', [stamped]);
  });
}

// Bulk variant for materialized recurring series — one load/save round
// trip instead of one per occurrence.
export function addCustomEvents(events: CustomEvent[]): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadCustomEventsRaw();
    const now = new Date().toISOString();
    const stamped = events.map((e) => ({ ...e, updatedAt: now }));
    await saveCustomEvents([...existing, ...stamped]);
    await queueRows('custom_events', stamped);
  });
}

// Removes one occurrence plus every other row sharing its seriesId with
// a date on or after it — "this and all future occurrences". Tombstoned
// (deletedAt set), not removed outright — see CustomEvent.deletedAt.
export function deleteCustomEventSeriesFrom(seriesId: string, fromDate: string): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadCustomEventsRaw();
    const now = new Date().toISOString();
    const affected: CustomEvent[] = [];
    const merged = existing.map((e) => {
      if (e.seriesId === seriesId && e.date >= fromDate) {
        const tombstoned = { ...e, deletedAt: now, updatedAt: now };
        affected.push(tombstoned);
        return tombstoned;
      }
      return e;
    });
    await saveCustomEvents(merged);
    await queueRows('custom_events', affected);
  });
}

// Tombstoned, not removed outright — see CustomEvent.deletedAt.
export function deleteCustomEvent(id: string): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadCustomEventsRaw();
    const now = new Date().toISOString();
    let tombstoned: CustomEvent | undefined;
    const merged = existing.map((e) => {
      if (e.id !== id) return e;
      tombstoned = { ...e, deletedAt: now, updatedAt: now };
      return tombstoned;
    });
    await saveCustomEvents(merged);
    if (tombstoned) await queueRows('custom_events', [tombstoned]);
  });
}

export function updateCustomEvent(updated: CustomEvent): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadCustomEventsRaw();
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    await saveCustomEvents(existing.map((e) => (e.id === updated.id ? stamped : e)));
    await queueRows('custom_events', [stamped]);
  });
}

export async function loadCustomEventsForDate(dateKey: string): Promise<CustomEvent[]> {
  const all = await loadCustomEvents();
  return all.filter((e) => e.date === dateKey);
}

export async function loadNotificationsEnabled(): Promise<boolean> {
  try {
    const data = await kv.getItem(KEYS.NOTIFICATIONS_ENABLED);
    return data === null ? true : data === 'true';
  } catch {
    return true;
  }
}

export async function saveNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await kv.setItem(KEYS.NOTIFICATIONS_ENABLED, String(enabled));
  } catch {
    // noop
  }
}

export async function loadBrainDumpItemsRaw(): Promise<BrainDumpItem[]> {
  try {
    const data = await kv.getItem(KEYS.BRAIN_DUMP);
    return data ? (JSON.parse(data) as BrainDumpItem[]) : [];
  } catch {
    return [];
  }
}

export async function loadBrainDumpItems(): Promise<BrainDumpItem[]> {
  const all = await loadBrainDumpItemsRaw();
  const { visible, changed } = pruneAndHideTombstones(all);
  if (changed) await storageLock.run(async () => saveBrainDumpItems(pruneAndHideTombstones(await loadBrainDumpItemsRaw()).forStorage));
  return visible;
}

export async function saveBrainDumpItems(items: BrainDumpItem[]): Promise<void> {
  try {
    await kv.setItem(KEYS.BRAIN_DUMP, JSON.stringify(items));
  } catch {
    // noop
  }
}

export function addBrainDumpItem(item: BrainDumpItem): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadBrainDumpItemsRaw();
    const stamped = { ...item, updatedAt: new Date().toISOString() };
    await saveBrainDumpItems([...existing, stamped]);
    await queueRows('brain_dump_items', [stamped]);
  });
}

export function updateBrainDumpItem(updated: BrainDumpItem): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadBrainDumpItemsRaw();
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    await saveBrainDumpItems(existing.map((i) => (i.id === updated.id ? stamped : i)));
    await queueRows('brain_dump_items', [stamped]);
  });
}

// Tombstoned, not removed outright — see BrainDumpItem.deletedAt.
export function deleteBrainDumpItem(id: string): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadBrainDumpItemsRaw();
    const now = new Date().toISOString();
    let tombstoned: BrainDumpItem | undefined;
    const merged = existing.map((i) => {
      if (i.id !== id) return i;
      tombstoned = { ...i, deletedAt: now, updatedAt: now };
      return tombstoned;
    });
    await saveBrainDumpItems(merged);
    if (tombstoned) await queueRows('brain_dump_items', [tombstoned]);
  });
}

// Whether to show starter/example content in place of an empty state —
// on Today (routines, top 3 tasks, full schedule), Tasks, and Brain
// Dump alike. True for as long as none of those stores have any real
// data yet, false the moment any one of them gets its first real
// entry — deliberately not a one-time flag, since a per-screen visit
// order would make a single-use flag show the starter on whichever
// screen the user opens first and never on the other two.
export async function shouldShowStarterRoutine(): Promise<boolean> {
  try {
    // Uses the public, tombstone-filtered loaders (not raw AsyncStorage
    // reads) — otherwise a store containing only soft-deleted rows would
    // count as "has data" and starter content would never come back,
    // even though nothing is actually visible anymore.
    const [customEvents, dumpItems, routines, tasks] = await Promise.all([
      loadCustomEvents(),
      loadBrainDumpItems(),
      loadRoutines(),
      loadTasks(),
    ]);

    return !(customEvents.length > 0 || dumpItems.length > 0 || routines.length > 0 || tasks.length > 0);
  } catch {
    return false;
  }
}

export async function loadCustomCategoriesRaw(): Promise<CustomCategory[]> {
  try {
    const data = await kv.getItem(KEYS.CUSTOM_CATEGORIES);
    return data ? (JSON.parse(data) as CustomCategory[]) : [];
  } catch {
    return [];
  }
}

// No delete path exists for CustomCategory yet (see types.ts comment),
// so there's nothing to tombstone-filter today — this still goes
// through the same shape as every other loader so a future delete
// feature is a one-line addition here, not a new pattern.
export async function loadCustomCategories(): Promise<CustomCategory[]> {
  const all = await loadCustomCategoriesRaw();
  return all.filter((c) => !c.deletedAt);
}

export async function saveCustomCategories(categories: CustomCategory[]): Promise<void> {
  try {
    await kv.setItem(KEYS.CUSTOM_CATEGORIES, JSON.stringify(categories));
  } catch {
    // noop
  }
}

export function addCustomCategory(category: CustomCategory): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadCustomCategoriesRaw();
    const stamped = { ...category, updatedAt: new Date().toISOString() };
    await saveCustomCategories([...existing, stamped]);
    await queueRows('custom_categories', [stamped]);
  });
}

// --- Routines ---

export async function loadRoutinesRaw(): Promise<Routine[]> {
  try {
    const data = await kv.getItem(KEYS.ROUTINES);
    return data ? (JSON.parse(data) as Routine[]) : [];
  } catch {
    return [];
  }
}

export async function loadRoutines(): Promise<Routine[]> {
  const all = await loadRoutinesRaw();
  const { visible, changed } = pruneAndHideTombstones(all);
  if (changed) await storageLock.run(async () => saveRoutines(pruneAndHideTombstones(await loadRoutinesRaw()).forStorage));
  return visible;
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  try {
    await kv.setItem(KEYS.ROUTINES, JSON.stringify(routines));
  } catch {
    // noop
  }
}

export function addRoutine(routine: Routine): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadRoutinesRaw();
    const stamped = { ...routine, updatedAt: new Date().toISOString() };
    await saveRoutines([...existing, stamped]);
    await queueRows('routines', [stamped]);
  });
}

export function updateRoutine(updated: Routine): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadRoutinesRaw();
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    await saveRoutines(existing.map((r) => (r.id === updated.id ? stamped : r)));
    await queueRows('routines', [stamped]);
  });
}

// Tombstoned, not removed outright — see Routine.deletedAt.
export function deleteRoutine(id: string): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadRoutinesRaw();
    const now = new Date().toISOString();
    let tombstoned: Routine | undefined;
    const merged = existing.map((r) => {
      if (r.id !== id) return r;
      tombstoned = { ...r, deletedAt: now, updatedAt: now };
      return tombstoned;
    });
    await saveRoutines(merged);
    if (tombstoned) await queueRows('routines', [tombstoned]);
    // A deleted routine's completion history is meaningless on its own
    // (nothing displays it — no streak/history view exists), so it's
    // cleaned up here rather than left as orphaned rows. Completions are
    // never tombstoned (see the section comment below) — a real removal
    // here is correct, not an inconsistency. Remote deletes are pushed
    // per-row below, same as deleteRoutineCompletion does individually.
    const completions = await loadRoutineCompletions();
    const toRemove = completions.filter((c) => c.routineId === id);
    await saveRoutineCompletions(completions.filter((c) => c.routineId !== id));
    for (const c of toRemove) await queueCompletionDelete(c.routineId, c.date);
  });
}

// --- Routine completions ---
// Reversible by design: toggling a routine off for today deletes its
// completion row rather than marking it some other way — there is no
// state where "un-completing" isn't a real, working operation.

export async function loadRoutineCompletions(): Promise<RoutineCompletion[]> {
  try {
    const data = await kv.getItem(KEYS.ROUTINE_COMPLETIONS);
    // Never pruned (checkpoint 5, gap G2): completions are the history that
    // streaks and XP will read, and the old 90 day prune made the sync
    // re-download them on every pass. About 3,650 small rows a year.
    return data ? (JSON.parse(data) as RoutineCompletion[]) : [];
  } catch {
    return [];
  }
}

export async function saveRoutineCompletions(completions: RoutineCompletion[]): Promise<void> {
  try {
    await kv.setItem(KEYS.ROUTINE_COMPLETIONS, JSON.stringify(completions));
  } catch {
    // noop
  }
}

export function addRoutineCompletion(routineId: string, date: string): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadRoutineCompletions();
    const completedAt = new Date().toISOString();
    await saveRoutineCompletions([...existing, { routineId, date, completedAt }]);
    await queueCompletionAdd({ routineId, date, completedAt });
  });
}

export function deleteRoutineCompletion(routineId: string, date: string): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadRoutineCompletions();
    await saveRoutineCompletions(
      existing.filter((c) => !(c.routineId === routineId && c.date === date)),
    );
    await queueCompletionDelete(routineId, date);
  });
}

// --- Tasks ---

export async function loadTasksRaw(): Promise<Task[]> {
  try {
    const data = await kv.getItem(KEYS.TASKS);
    // Rows are cleaned of fields that no longer exist (lib/legacyTask.ts).
    return data ? stripLegacyTasks(JSON.parse(data) as Task[]) : [];
  } catch {
    return [];
  }
}

// A tombstone of a skipped occurrence (id `root:YYYY-MM-DD`, decision 023) is
// kept for as long as that day is today or later: it is what hides the day, and
// the usual 90 day prune would otherwise bring a day skipped far ahead back.
function keepsSkip(task: Task): boolean {
  return isUpcomingOccurrence(task.id, dateKey(new Date()));
}

export async function loadTasks(): Promise<Task[]> {
  const all = await loadTasksRaw();
  const { visible, changed } = pruneAndHideTombstones(all, keepsSkip);
  if (changed) {
    await storageLock.run(async () => saveTasks(pruneAndHideTombstones(await loadTasksRaw(), keepsSkip).forStorage));
  }
  return visible;
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  try {
    await kv.setItem(KEYS.TASKS, JSON.stringify(tasks));
  } catch {
    // noop
  }
}

export function addTask(task: Task): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadTasksRaw();
    const stamped = { ...task, updatedAt: new Date().toISOString() };
    await saveTasks([...existing, stamped]);
    await queueRows('tasks', [stamped]);
  });
}

export function updateTask(updated: Task): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadTasksRaw();
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    await saveTasks(existing.map((t) => (t.id === updated.id ? stamped : t)));
    await queueRows('tasks', [stamped]);
  });
}

// Tombstoned, not removed outright — see Task.deletedAt.
export function deleteTask(id: string): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadTasksRaw();
    const now = new Date().toISOString();
    let tombstoned: Task | undefined;
    const merged = existing.map((t) => {
      if (t.id !== id) return t;
      tombstoned = { ...t, deletedAt: now, updatedAt: now };
      return tombstoned;
    });
    await saveTasks(merged);
    if (tombstoned) await queueRows('tasks', [tombstoned]);
  });
}

// --- Projects ---
// Lightweight tag only — see the Project type comment in types.ts.

export async function loadProjectsRaw(): Promise<Project[]> {
  try {
    const data = await kv.getItem(KEYS.PROJECTS);
    return data ? (JSON.parse(data) as Project[]) : [];
  } catch {
    return [];
  }
}

// Hides tombstoned labels (deleteProject, desktop, checkpoint 4.3) from every
// reader, including the iPhone's Tasks filter and Task form picker.
export async function loadProjects(): Promise<Project[]> {
  const all = await loadProjectsRaw();
  return all.filter((p) => !p.deletedAt);
}

export async function saveProjects(projects: Project[]): Promise<void> {
  try {
    await kv.setItem(KEYS.PROJECTS, JSON.stringify(projects));
  } catch {
    // noop
  }
}

export function addProject(project: Project): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadProjectsRaw();
    const stamped = { ...project, updatedAt: new Date().toISOString() };
    await saveProjects([...existing, stamped]);
    await queueRows('projects', [stamped]);
  });
}

// A real edit (a rename): stamps updatedAt and pushes, like addProject.
// Desktop only today (checkpoint 4.3); the iPhone has no project edit path.
export function updateProject(updated: Project): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadProjectsRaw();
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    await saveProjects(existing.map((p) => (p.key === updated.key ? stamped : p)));
    await queueRows('projects', [stamped]);
  });
}

// Tombstoned, not removed outright (same as deleteTask): deletedAt and
// updatedAt are set and the row is pushed, so the delete wins the sync merge
// and reaches other devices. loadProjects hides it everywhere. Desktop only
// today (checkpoint 4.3); callers move or clear the tasks that used it.
export function deleteProject(key: string): Promise<void> {
  return storageLock.run(async () => {
    const existing = await loadProjectsRaw();
    const now = new Date().toISOString();
    let tombstoned: Project | undefined;
    const merged = existing.map((p) => {
      if (p.key !== key) return p;
      tombstoned = { ...p, deletedAt: now, updatedAt: now };
      return tombstoned;
    });
    await saveProjects(merged);
    if (tombstoned) await queueRows('projects', [tombstoned]);
  });
}

// Applies a change to several projects at once under the lock and queues the
// changed ones. `stamp` sets updatedAt (a real edit, e.g. a recolour); the
// desktop's lazy colour fill passes false (a silent fill, checkpoint 4.1).
export function patchProjects(
  change: (projects: Project[]) => Project[],
  opts: { stamp: boolean },
): Promise<Project[]> {
  return storageLock.run(async () => {
    const before = await loadProjectsRaw();
    const after = change(before);
    const now = new Date().toISOString();
    const beforeByKey = new Map(before.map((p) => [p.key, JSON.stringify(p)]));
    const changed: Project[] = [];
    const result = after.map((p) => {
      if (beforeByKey.get(p.key) === JSON.stringify(p)) return p;
      const row = opts.stamp ? { ...p, updatedAt: now } : p;
      changed.push(row);
      return row;
    });
    if (changed.length > 0) {
      await saveProjects(result);
      await queueRows('projects', changed);
    }
    return result;
  });
}

export async function clearAllData(): Promise<void> {
  try {
    await kv.multiRemove([
      KEYS.CUSTOM_EVENTS,
      KEYS.TIMER_SETTINGS,
      KEYS.FIRST_LAUNCH,
      KEYS.NOTIFICATIONS_ENABLED,
      KEYS.BRAIN_DUMP,
      KEYS.CUSTOM_CATEGORIES,
      KEYS.ROUTINES,
      KEYS.ROUTINE_COMPLETIONS,
      KEYS.TASKS,
      KEYS.PROJECTS,
      KEYS.SCHEMA_MIGRATED_V2,
      // Sync bookkeeping (lib/outbox.ts, lib/syncEngine.ts META): with the
      // data gone, the next sync must start from a full pass again.
      'belific_sync_outbox',
      'belific_sync_caps',
      'belific_sync_seen_completions',
      'belific_sync_cursor_custom_events',
      'belific_sync_cursor_brain_dump_items',
      'belific_sync_cursor_routines',
      'belific_sync_cursor_tasks',
      'belific_sync_cursor_projects',
      'belific_sync_cursor_custom_categories',
    ]);
  } catch {
    // noop
  }
}

// One-time upgrade for optional-account cloud backup: every mutable
// type needs `updatedAt` for last-write-wins conflict resolution, and
// Project/CustomCategory had no timestamps at all before this. Runs
// once per install (gated by SCHEMA_MIGRATED_V2, same pattern as
// belific_owner_seeded) and only ever backfills missing fields — it
// never rewrites ids, never touches rows that already have updatedAt,
// and never removes anything. Safe to call on every app launch; it
// no-ops immediately after the first real run.
export function migrateToSyncableSchema(): Promise<void> {
  return storageLock.run(async () => {
    try {
      const already = await kv.getItem(KEYS.SCHEMA_MIGRATED_V2);
      if (already === 'true') return;

      const migrationTimestamp = new Date().toISOString();

      // CustomEvent never had a createdAt field to fall back to — the
      // `item.createdAt ?? migrationTimestamp` inside backfillUpdatedAt
      // resolves straight to migrationTimestamp for it, same function as
      // the three types that do have createdAt, no separate case needed.
      const events = await loadCustomEventsRaw();
      const migratedEvents = backfillUpdatedAt(events, migrationTimestamp);
      await saveCustomEvents(migratedEvents);

      const dumpItems = await loadBrainDumpItemsRaw();
      const migratedDump = backfillUpdatedAt(dumpItems, migrationTimestamp);
      await saveBrainDumpItems(migratedDump);

      const routines = await loadRoutinesRaw();
      const migratedRoutines = backfillUpdatedAt(routines, migrationTimestamp);
      await saveRoutines(migratedRoutines);

      const tasks = await loadTasksRaw();
      const migratedTasks = backfillUpdatedAt(tasks, migrationTimestamp);
      await saveTasks(migratedTasks);

      // Project/CustomCategory had no timestamps at all — both fields
      // backfilled together.
      const projects = await loadProjectsRaw();
      const migratedProjects = backfillCreatedAndUpdatedAt(projects, migrationTimestamp);
      await saveProjects(migratedProjects);

      const categories = await loadCustomCategoriesRaw();
      const migratedCategories = backfillCreatedAndUpdatedAt(categories, migrationTimestamp);
      await saveCustomCategories(migratedCategories);

      await kv.setItem(KEYS.SCHEMA_MIGRATED_V2, 'true');
      // Counts only, never titles/content — for one-time confirmation via
      // device console that this ran and touched the expected rows.
      console.log(
        `[migrateToSyncableSchema] done — events:${migratedEvents.length} dump:${migratedDump.length} ` +
          `routines:${migratedRoutines.length} tasks:${migratedTasks.length} projects:${migratedProjects.length} ` +
          `categories:${migratedCategories.length}`,
      );
    } catch {
      // noop — if this fails, it retries next launch since the flag is
      // only set on success, and every write above is independently safe
      // to redo (backfill-if-missing is idempotent).
    }
  });
}
