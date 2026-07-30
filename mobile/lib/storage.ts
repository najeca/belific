import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  BrainDumpItem,
  CustomCategory,
  CustomEvent,
  Project,
  Routine,
  RoutineCompletion,
  Task,
  TimerSettings,
} from './types';

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
} as const;

const COMPLETION_RETENTION_DAYS = 90;

function dateKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function loadTimerSettings(): Promise<TimerSettings | null> {
  try {
    const data = await AsyncStorage.getItem(KEYS.TIMER_SETTINGS);
    return data ? (JSON.parse(data) as TimerSettings) : null;
  } catch {
    return null;
  }
}

export async function saveTimerSettings(settings: TimerSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.TIMER_SETTINGS, JSON.stringify(settings));
  } catch {
    // noop
  }
}

export async function loadCustomEvents(): Promise<CustomEvent[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.CUSTOM_EVENTS);
    return data ? (JSON.parse(data) as CustomEvent[]) : [];
  } catch {
    return [];
  }
}

export async function saveCustomEvents(events: CustomEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.CUSTOM_EVENTS, JSON.stringify(events));
  } catch {
    // noop
  }
}

export async function addCustomEvent(event: CustomEvent): Promise<void> {
  const existing = await loadCustomEvents();
  await saveCustomEvents([...existing, event]);
}

// Bulk variant for materialized recurring series — one load/save round
// trip instead of one per occurrence.
export async function addCustomEvents(events: CustomEvent[]): Promise<void> {
  const existing = await loadCustomEvents();
  await saveCustomEvents([...existing, ...events]);
}

// Removes one occurrence plus every other row sharing its seriesId with
// a date on or after it — "this and all future occurrences".
export async function deleteCustomEventSeriesFrom(seriesId: string, fromDate: string): Promise<void> {
  const existing = await loadCustomEvents();
  await saveCustomEvents(
    existing.filter((e) => !(e.seriesId === seriesId && e.date >= fromDate)),
  );
}

export async function deleteCustomEvent(id: string): Promise<void> {
  const existing = await loadCustomEvents();
  await saveCustomEvents(existing.filter((e) => e.id !== id));
}

export async function updateCustomEvent(updated: CustomEvent): Promise<void> {
  const existing = await loadCustomEvents();
  await saveCustomEvents(existing.map((e) => (e.id === updated.id ? updated : e)));
}

export async function loadCustomEventsForDate(dateKey: string): Promise<CustomEvent[]> {
  const all = await loadCustomEvents();
  return all.filter((e) => e.date === dateKey);
}

export async function loadNotificationsEnabled(): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(KEYS.NOTIFICATIONS_ENABLED);
    return data === null ? true : data === 'true';
  } catch {
    return true;
  }
}

export async function saveNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.NOTIFICATIONS_ENABLED, String(enabled));
  } catch {
    // noop
  }
}

export async function loadBrainDumpItems(): Promise<BrainDumpItem[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.BRAIN_DUMP);
    return data ? (JSON.parse(data) as BrainDumpItem[]) : [];
  } catch {
    return [];
  }
}

export async function saveBrainDumpItems(items: BrainDumpItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.BRAIN_DUMP, JSON.stringify(items));
  } catch {
    // noop
  }
}

export async function addBrainDumpItem(item: BrainDumpItem): Promise<void> {
  const existing = await loadBrainDumpItems();
  await saveBrainDumpItems([...existing, item]);
}

export async function deleteBrainDumpItem(id: string): Promise<void> {
  const existing = await loadBrainDumpItems();
  await saveBrainDumpItems(existing.filter((i) => i.id !== id));
}

export async function shouldShowStarterRoutine(): Promise<boolean> {
  try {
    const flag = await AsyncStorage.getItem(KEYS.FIRST_LAUNCH);
    const customData = await AsyncStorage.getItem(KEYS.CUSTOM_EVENTS);
    const dumpData = await AsyncStorage.getItem(KEYS.BRAIN_DUMP);
    const routinesData = await AsyncStorage.getItem(KEYS.ROUTINES);
    const tasksData = await AsyncStorage.getItem(KEYS.TASKS);
    const hasCustom = !!customData && (JSON.parse(customData) as CustomEvent[]).length > 0;
    const hasDump = !!dumpData && (JSON.parse(dumpData) as BrainDumpItem[]).length > 0;
    const hasRoutines = !!routinesData && (JSON.parse(routinesData) as Routine[]).length > 0;
    const hasTasks = !!tasksData && (JSON.parse(tasksData) as Task[]).length > 0;

    if (hasCustom || hasDump || hasRoutines || hasTasks) return false;

    if (flag === 'true') {
      // Past first launch, no custom events → show empty state
      return false;
    }

    // First launch with no custom events → show starter, set flag
    await AsyncStorage.setItem(KEYS.FIRST_LAUNCH, 'true');
    return true;
  } catch {
    return false;
  }
}

export async function loadCustomCategories(): Promise<CustomCategory[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.CUSTOM_CATEGORIES);
    return data ? (JSON.parse(data) as CustomCategory[]) : [];
  } catch {
    return [];
  }
}

export async function saveCustomCategories(categories: CustomCategory[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.CUSTOM_CATEGORIES, JSON.stringify(categories));
  } catch {
    // noop
  }
}

export async function addCustomCategory(category: CustomCategory): Promise<void> {
  const existing = await loadCustomCategories();
  await saveCustomCategories([...existing, category]);
}

// --- Routines ---

export async function loadRoutines(): Promise<Routine[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.ROUTINES);
    return data ? (JSON.parse(data) as Routine[]) : [];
  } catch {
    return [];
  }
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.ROUTINES, JSON.stringify(routines));
  } catch {
    // noop
  }
}

export async function addRoutine(routine: Routine): Promise<void> {
  const existing = await loadRoutines();
  await saveRoutines([...existing, routine]);
}

export async function updateRoutine(updated: Routine): Promise<void> {
  const existing = await loadRoutines();
  await saveRoutines(existing.map((r) => (r.id === updated.id ? updated : r)));
}

export async function deleteRoutine(id: string): Promise<void> {
  const existing = await loadRoutines();
  await saveRoutines(existing.filter((r) => r.id !== id));
  // A deleted routine's completion history is meaningless on its own
  // (nothing displays it — no streak/history view exists), so it's
  // cleaned up here rather than left as orphaned rows.
  const completions = await loadRoutineCompletions();
  await saveRoutineCompletions(completions.filter((c) => c.routineId !== id));
}

// --- Routine completions ---
// Reversible by design: toggling a routine off for today deletes its
// completion row rather than marking it some other way — there is no
// state where "un-completing" isn't a real, working operation.

export async function loadRoutineCompletions(): Promise<RoutineCompletion[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.ROUTINE_COMPLETIONS);
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
    await AsyncStorage.setItem(KEYS.ROUTINE_COMPLETIONS, JSON.stringify(completions));
  } catch {
    // noop
  }
}

export async function addRoutineCompletion(routineId: string, date: string): Promise<void> {
  const existing = await loadRoutineCompletions();
  await saveRoutineCompletions([
    ...existing,
    { routineId, date, completedAt: new Date().toISOString() },
  ]);
}

export async function deleteRoutineCompletion(routineId: string, date: string): Promise<void> {
  const existing = await loadRoutineCompletions();
  await saveRoutineCompletions(
    existing.filter((c) => !(c.routineId === routineId && c.date === date)),
  );
}

// --- Tasks ---

export async function loadTasks(): Promise<Task[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.TASKS);
    return data ? (JSON.parse(data) as Task[]) : [];
  } catch {
    return [];
  }
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.TASKS, JSON.stringify(tasks));
  } catch {
    // noop
  }
}

export async function addTask(task: Task): Promise<void> {
  const existing = await loadTasks();
  await saveTasks([...existing, task]);
}

export async function updateTask(updated: Task): Promise<void> {
  const existing = await loadTasks();
  await saveTasks(existing.map((t) => (t.id === updated.id ? updated : t)));
}

export async function deleteTask(id: string): Promise<void> {
  const existing = await loadTasks();
  await saveTasks(existing.filter((t) => t.id !== id));
}

// --- Projects ---
// Lightweight tag only — see the Project type comment in types.ts.

export async function loadProjects(): Promise<Project[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.PROJECTS);
    return data ? (JSON.parse(data) as Project[]) : [];
  } catch {
    return [];
  }
}

export async function saveProjects(projects: Project[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.PROJECTS, JSON.stringify(projects));
  } catch {
    // noop
  }
}

export async function addProject(project: Project): Promise<void> {
  const existing = await loadProjects();
  await saveProjects([...existing, project]);
}

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
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
    ]);
  } catch {
    // noop
  }
}
