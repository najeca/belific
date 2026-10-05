import { kv } from './kv';
import { backfillUpdatedAt, backfillCreatedAndUpdatedAt } from './migrations';
import type {
  BrainDumpItem,
  CustomCategory,
  CustomEvent,
  Project,
  Routine,
  RoutineCompletion,
  Task,
} from './types';

// Fire-and-forget push to Supabase after a local write — dynamic
// import breaks what would otherwise be a circular static import
// (sync.ts imports the raw loaders/savers from this file). Never
// awaited by callers; a signed-out user (the default) or offline
// device just no-ops inside sync.ts itself.
function pushLater(run: (sync: typeof import('./sync')) => void): void {
  import('./sync').then(run).catch(() => {});
}

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

const COMPLETION_RETENTION_DAYS = 90;
// How long a tombstoned (soft-deleted) row is kept around before being
// pruned for real — long enough that a device which hasn't synced in a
// while still gets a chance to see the delete before the row vanishes
// from the source of truth entirely.
const TOMBSTONE_RETENTION_DAYS = 90;

function dateKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
): { visible: T[]; forStorage: T[]; changed: boolean } {
  const cutoff = isoDaysAgo(TOMBSTONE_RETENTION_DAYS);
  const forStorage = items.filter((i) => !i.deletedAt || i.deletedAt >= cutoff);
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
  const { visible, forStorage, changed } = pruneAndHideTombstones(all);
  if (changed) await saveCustomEvents(forStorage);
  return visible;
}

export async function saveCustomEvents(events: CustomEvent[]): Promise<void> {
  try {
    await kv.setItem(KEYS.CUSTOM_EVENTS, JSON.stringify(events));
  } catch {
    // noop
  }
}

export async function addCustomEvent(event: CustomEvent): Promise<void> {
  const existing = await loadCustomEventsRaw();
  const stamped = { ...event, updatedAt: new Date().toISOString() };
  await saveCustomEvents([...existing, stamped]);
  pushLater((sync) => sync.pushCustomEvent(stamped));
}

// Bulk variant for materialized recurring series — one load/save round
// trip instead of one per occurrence.
export async function addCustomEvents(events: CustomEvent[]): Promise<void> {
  const existing = await loadCustomEventsRaw();
  const now = new Date().toISOString();
  const stamped = events.map((e) => ({ ...e, updatedAt: now }));
  await saveCustomEvents([...existing, ...stamped]);
  pushLater((sync) => stamped.forEach((e) => sync.pushCustomEvent(e)));
}

// Removes one occurrence plus every other row sharing its seriesId with
// a date on or after it — "this and all future occurrences". Tombstoned
// (deletedAt set), not removed outright — see CustomEvent.deletedAt.
export async function deleteCustomEventSeriesFrom(seriesId: string, fromDate: string): Promise<void> {
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
  pushLater((sync) => affected.forEach((e) => sync.pushCustomEvent(e)));
}

// Tombstoned, not removed outright — see CustomEvent.deletedAt.
export async function deleteCustomEvent(id: string): Promise<void> {
  const existing = await loadCustomEventsRaw();
  const now = new Date().toISOString();
  let tombstoned: CustomEvent | undefined;
  const merged = existing.map((e) => {
    if (e.id !== id) return e;
    tombstoned = { ...e, deletedAt: now, updatedAt: now };
    return tombstoned;
  });
  await saveCustomEvents(merged);
  if (tombstoned) pushLater((sync) => sync.pushCustomEvent(tombstoned!));
}

export async function updateCustomEvent(updated: CustomEvent): Promise<void> {
  const existing = await loadCustomEventsRaw();
  const stamped = { ...updated, updatedAt: new Date().toISOString() };
  await saveCustomEvents(existing.map((e) => (e.id === updated.id ? stamped : e)));
  pushLater((sync) => sync.pushCustomEvent(stamped));
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
  const { visible, forStorage, changed } = pruneAndHideTombstones(all);
  if (changed) await saveBrainDumpItems(forStorage);
  return visible;
}

export async function saveBrainDumpItems(items: BrainDumpItem[]): Promise<void> {
  try {
    await kv.setItem(KEYS.BRAIN_DUMP, JSON.stringify(items));
  } catch {
    // noop
  }
}

export async function addBrainDumpItem(item: BrainDumpItem): Promise<void> {
  const existing = await loadBrainDumpItemsRaw();
  const stamped = { ...item, updatedAt: new Date().toISOString() };
  await saveBrainDumpItems([...existing, stamped]);
  pushLater((sync) => sync.pushBrainDumpItem(stamped));
}

export async function updateBrainDumpItem(updated: BrainDumpItem): Promise<void> {
  const existing = await loadBrainDumpItemsRaw();
  const stamped = { ...updated, updatedAt: new Date().toISOString() };
  await saveBrainDumpItems(existing.map((i) => (i.id === updated.id ? stamped : i)));
  pushLater((sync) => sync.pushBrainDumpItem(stamped));
}

// Tombstoned, not removed outright — see BrainDumpItem.deletedAt.
export async function deleteBrainDumpItem(id: string): Promise<void> {
  const existing = await loadBrainDumpItemsRaw();
  const now = new Date().toISOString();
  let tombstoned: BrainDumpItem | undefined;
  const merged = existing.map((i) => {
    if (i.id !== id) return i;
    tombstoned = { ...i, deletedAt: now, updatedAt: now };
    return tombstoned;
  });
  await saveBrainDumpItems(merged);
  if (tombstoned) pushLater((sync) => sync.pushBrainDumpItem(tombstoned!));
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

export async function addCustomCategory(category: CustomCategory): Promise<void> {
  const existing = await loadCustomCategoriesRaw();
  const stamped = { ...category, updatedAt: new Date().toISOString() };
  await saveCustomCategories([...existing, stamped]);
  pushLater((sync) => sync.pushCustomCategory(stamped));
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
  const { visible, forStorage, changed } = pruneAndHideTombstones(all);
  if (changed) await saveRoutines(forStorage);
  return visible;
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  try {
    await kv.setItem(KEYS.ROUTINES, JSON.stringify(routines));
  } catch {
    // noop
  }
}

export async function addRoutine(routine: Routine): Promise<void> {
  const existing = await loadRoutinesRaw();
  const stamped = { ...routine, updatedAt: new Date().toISOString() };
  await saveRoutines([...existing, stamped]);
  pushLater((sync) => sync.pushRoutine(stamped));
}

export async function updateRoutine(updated: Routine): Promise<void> {
  const existing = await loadRoutinesRaw();
  const stamped = { ...updated, updatedAt: new Date().toISOString() };
  await saveRoutines(existing.map((r) => (r.id === updated.id ? stamped : r)));
  pushLater((sync) => sync.pushRoutine(stamped));
}

// Tombstoned, not removed outright — see Routine.deletedAt.
export async function deleteRoutine(id: string): Promise<void> {
  const existing = await loadRoutinesRaw();
  const now = new Date().toISOString();
  let tombstoned: Routine | undefined;
  const merged = existing.map((r) => {
    if (r.id !== id) return r;
    tombstoned = { ...r, deletedAt: now, updatedAt: now };
    return tombstoned;
  });
  await saveRoutines(merged);
  if (tombstoned) pushLater((sync) => sync.pushRoutine(tombstoned!));
  // A deleted routine's completion history is meaningless on its own
  // (nothing displays it — no streak/history view exists), so it's
  // cleaned up here rather than left as orphaned rows. Completions are
  // never tombstoned (see the section comment below) — a real removal
  // here is correct, not an inconsistency. Remote deletes are pushed
  // per-row below, same as deleteRoutineCompletion does individually.
  const completions = await loadRoutineCompletions();
  const toRemove = completions.filter((c) => c.routineId === id);
  await saveRoutineCompletions(completions.filter((c) => c.routineId !== id));
  pushLater((sync) => toRemove.forEach((c) => sync.pushRoutineCompletionDelete(c.routineId, c.date)));
}

// --- Routine completions ---
// Reversible by design: toggling a routine off for today deletes its
// completion row rather than marking it some other way — there is no
// state where "un-completing" isn't a real, working operation.

export async function loadRoutineCompletions(): Promise<RoutineCompletion[]> {
  try {
    const data = await kv.getItem(KEYS.ROUTINE_COMPLETIONS);
    const all = data ? (JSON.parse(data) as RoutineCompletion[]) : [];
    // Prune-on-load: nothing in the app ever reads completions older than
    // this (no streaks, no history view, by design), so there's no reason
    // to let this grow forever. Only re-saves when something was actually
    // pruned.
    const cutoff = dateKeyDaysAgo(COMPLETION_RETENTION_DAYS);
    const pruned = all.filter((c) => c.date >= cutoff);
    if (pruned.length !== all.length) {
      await saveRoutineCompletions(pruned);
    }
    return pruned;
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

export async function addRoutineCompletion(routineId: string, date: string): Promise<void> {
  const existing = await loadRoutineCompletions();
  const completedAt = new Date().toISOString();
  await saveRoutineCompletions([...existing, { routineId, date, completedAt }]);
  pushLater((sync) => sync.pushRoutineCompletionAdd(routineId, date, completedAt));
}

export async function deleteRoutineCompletion(routineId: string, date: string): Promise<void> {
  const existing = await loadRoutineCompletions();
  await saveRoutineCompletions(
    existing.filter((c) => !(c.routineId === routineId && c.date === date)),
  );
  pushLater((sync) => sync.pushRoutineCompletionDelete(routineId, date));
}

// --- Tasks ---

export async function loadTasksRaw(): Promise<Task[]> {
  try {
    const data = await kv.getItem(KEYS.TASKS);
    return data ? (JSON.parse(data) as Task[]) : [];
  } catch {
    return [];
  }
}

export async function loadTasks(): Promise<Task[]> {
  const all = await loadTasksRaw();
  const { visible, forStorage, changed } = pruneAndHideTombstones(all);
  if (changed) await saveTasks(forStorage);
  return visible;
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  try {
    await kv.setItem(KEYS.TASKS, JSON.stringify(tasks));
  } catch {
    // noop
  }
}

export async function addTask(task: Task): Promise<void> {
  const existing = await loadTasksRaw();
  const stamped = { ...task, updatedAt: new Date().toISOString() };
  await saveTasks([...existing, stamped]);
  pushLater((sync) => sync.pushTask(stamped));
}

export async function updateTask(updated: Task): Promise<void> {
  const existing = await loadTasksRaw();
  const stamped = { ...updated, updatedAt: new Date().toISOString() };
  await saveTasks(existing.map((t) => (t.id === updated.id ? stamped : t)));
  pushLater((sync) => sync.pushTask(stamped));
}

// Tombstoned, not removed outright — see Task.deletedAt.
export async function deleteTask(id: string): Promise<void> {
  const existing = await loadTasksRaw();
  const now = new Date().toISOString();
  let tombstoned: Task | undefined;
  const merged = existing.map((t) => {
    if (t.id !== id) return t;
    tombstoned = { ...t, deletedAt: now, updatedAt: now };
    return tombstoned;
  });
  await saveTasks(merged);
  if (tombstoned) pushLater((sync) => sync.pushTask(tombstoned!));
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

// No delete path exists for Project yet — see loadCustomCategories'
// identical situation above.
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

export async function addProject(project: Project): Promise<void> {
  const existing = await loadProjectsRaw();
  const stamped = { ...project, updatedAt: new Date().toISOString() };
  await saveProjects([...existing, stamped]);
  pushLater((sync) => sync.pushProject(stamped));
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
export async function migrateToSyncableSchema(): Promise<void> {
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
}
