import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CustomEvent, TimerSettings } from './types';

const KEYS = {
  CUSTOM_EVENTS: 'belific_custom_events',
  TIMER_SETTINGS: 'belific_pomodoro',
  NOTIFICATIONS_ENABLED: 'belific_notifications_enabled',
  FIRST_LAUNCH: 'belific_first_launch',
} as const;

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

export async function shouldShowStarterRoutine(): Promise<boolean> {
  try {
    const flag = await AsyncStorage.getItem(KEYS.FIRST_LAUNCH);
    const customData = await AsyncStorage.getItem(KEYS.CUSTOM_EVENTS);
    const hasCustom = !!customData && (JSON.parse(customData) as CustomEvent[]).length > 0;

    if (hasCustom) return false;

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

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      KEYS.CUSTOM_EVENTS,
      KEYS.TIMER_SETTINGS,
      KEYS.FIRST_LAUNCH,
      KEYS.NOTIFICATIONS_ENABLED,
    ]);
  } catch {
    // noop
  }
}
