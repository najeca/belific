import { useCallback, useEffect, useState } from 'react';
import { kv } from '../../lib/kv';

// Settings that belong to this phone only (PLAN_phone): stored in kv here, never synced. A boolean is
// stored as "1" or "0"; anything else reads as the default.
export const PHONE_PREFS = {
  // Streaks on the Repeating chip (the desktop's own switch is "only on this computer").
  showStreaks: { key: 'belific_phone_show_streaks', fallback: true },
  // Task reminders on this phone (decision 3: one switch per device, on by default on both).
  remindTasks: { key: 'belific_phone_remind_tasks', fallback: true },
} as const;

const listeners = new Map<string, Set<(v: boolean) => void>>();

export function usePhonePref(name: keyof typeof PHONE_PREFS): [boolean, (v: boolean) => void] {
  const { key, fallback } = PHONE_PREFS[name];
  const [value, setValue] = useState<boolean>(fallback);
  useEffect(() => {
    let live = true;
    kv.getItem(key)
      .then((v) => live && setValue(v === '1' ? true : v === '0' ? false : fallback))
      .catch(() => {});
    const set = listeners.get(key) ?? new Set();
    set.add(setValue);
    listeners.set(key, set);
    return () => {
      live = false;
      set.delete(setValue);
    };
  }, [key, fallback]);
  const update = useCallback(
    (v: boolean) => {
      for (const l of listeners.get(key) ?? []) l(v);
      kv.setItem(key, v ? '1' : '0').catch(() => {});
    },
    [key],
  );
  return [value, update];
}
