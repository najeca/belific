import { create } from 'zustand';
import type { TimerSettings, TimerStore } from './types';
import { loadTimerSettings, saveTimerSettings } from './storage';

const DEFAULT_SETTINGS: TimerSettings = {
  focusDuration: 25,
  breakDuration: 5,
  longBreakDuration: 15,
  sessionsUntilLongBreak: 4,
};

interface InternalTimerStore extends TimerStore {
  _hydrated: boolean;
  hydrate: () => Promise<void>;
}

export const useTimerStore = create<InternalTimerStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  _hydrated: false,
  hydrate: async () => {
    if (get()._hydrated) return;
    const saved = await loadTimerSettings();
    if (saved) {
      set({ ...saved, _hydrated: true });
    } else {
      set({ _hydrated: true });
    }
  },
  update: (patch: Partial<TimerSettings>) => {
    set(patch);
    const current: TimerSettings = {
      focusDuration: get().focusDuration,
      breakDuration: get().breakDuration,
      longBreakDuration: get().longBreakDuration,
      sessionsUntilLongBreak: get().sessionsUntilLongBreak,
    };
    saveTimerSettings({ ...current, ...patch });
  },
}));
