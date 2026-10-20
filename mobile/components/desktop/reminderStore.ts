import { useSyncExternalStore } from 'react';
import { DEFAULT_REMINDERS, normalizeReminders } from '../../lib/reminder';

// The default list of reminders for a timed task (Settings, Notifications), as a small
// module store so the details, the menu and the settings page follow one value. The
// value itself lives in the main process settings (`defaultReminders`, per computer,
// never synced): this is its renderer copy, read when the home screen opens and
// whenever it is changed here.
let defaults: number[] = [...DEFAULT_REMINDERS];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useDefaultReminders = (): number[] => useSyncExternalStore(subscribe, () => defaults, () => defaults);

function set(next: number[]) {
  if (JSON.stringify(next) === JSON.stringify(defaults)) return;
  defaults = next;
  emit();
}

export async function refreshDefaultReminders(): Promise<void> {
  try {
    const s = await globalThis.belificDesktop?.settings.get();
    if (s && Array.isArray(s.defaultReminders)) set(normalizeReminders(s.defaultReminders));
  } catch {
    // keep what is showing
  }
}

export async function setDefaultReminders(list: number[]): Promise<void> {
  const next = normalizeReminders(list);
  set(next);
  try {
    const saved = await globalThis.belificDesktop?.settings.set({ defaultReminders: next });
    if (saved && Array.isArray(saved.defaultReminders)) set(normalizeReminders(saved.defaultReminders));
  } catch {
    // the main process keeps the old list; the next refresh puts it back
  }
}
