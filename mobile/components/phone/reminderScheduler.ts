import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { kv } from '../../lib/kv';
import { loadTasksRaw } from '../../lib/storage';
import { planTaskReminders, TASK_REMINDER_PREFIX } from '../../lib/phoneReminders';
import { subscribeSyncStatus } from '../../lib/sync';
import { PHONE_PREFS } from './prefs';

// The iPhone's task reminders (PLAN_phone P7, decision 3): local notifications planned by
// lib/phoneReminders.ts (the desktop's rules and keys) for the next 14 days, only while this phone's
// "Remind me on this device" switch is on. Planned again at launch, when the app comes to the front,
// after a sync and after every change made on the phone (refreshTaskReminders). Each run replaces the
// phone's task reminders as a whole; the event notifications (lib/notifications.ts) are left alone and
// counted, so the total stays under iOS's 64 pending notifications per app. The web export does
// nothing here: on the desktop the Electron main process reminds (decision 017).
const IOS_LIMIT = 64;
const SPARE = 4;

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> = Promise.resolve();

export async function remindersOn(): Promise<boolean> {
  const v = await kv.getItem(PHONE_PREFS.remindTasks.key).catch(() => null);
  return v === '0' ? false : v === '1' ? true : PHONE_PREFS.remindTasks.fallback;
}

async function run(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const mine = scheduled.filter((n) => n.identifier.startsWith(TASK_REMINDER_PREFIX));
  for (const n of mine) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  if (!(await remindersOn())) return;
  const others = scheduled.length - mine.length;
  const plan = planTaskReminders({ tasks: await loadTasksRaw(), now: Date.now(), limit: IOS_LIMIT - SPARE - others });
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.key,
      content: { title: r.title, body: r.body, sound: 'notification.wav' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.at) },
    });
  }
}

// Debounced: a burst of edits plans once.
export function refreshTaskReminders(): void {
  if (Platform.OS === 'web') return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    running = running.then(run).catch(() => {});
  }, 600);
}

// Started once by the root layout: at launch, on coming to the front, after each sync.
export function startTaskReminders(): () => void {
  if (Platform.OS === 'web') return () => {};
  refreshTaskReminders();
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') refreshTaskReminders();
  });
  let last = '';
  const stopSync = subscribeSyncStatus((st) => {
    const key = `${st.state}|${st.lastSuccessAt ?? ''}`;
    if (key !== last && st.state === 'idle') refreshTaskReminders();
    last = key;
  });
  return () => {
    app.remove();
    stopSync();
  };
}
