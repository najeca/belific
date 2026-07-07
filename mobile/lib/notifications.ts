import * as Notifications from 'expo-notifications';
import type { ScheduleEvent } from './types';

const WEEKLY_SUMMARY_ID = 'belific-weekly-summary';
const EVENT_NOTIFICATION_PREFIX = 'belific-event-';

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return status === 'granted';
}

export async function scheduleRecurring(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_SUMMARY_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_SUMMARY_ID,
    content: {
      title: 'Weekly Summary',
      body: "Here's how your week went — tap to review your schedule.",
      sound: 'notification.wav',
      data: { type: 'weekly-summary' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: 18,
      minute: 0,
    },
  });
}

export async function scheduleCustomReminder(
  date: Date,
  title: string,
  body: string,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'notification.wav',
      data: { type: 'custom', scheduledDate: date.toISOString() },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
    },
  });
}

export async function scheduleEventNotifications(
  dayEntries: Array<{ events: ScheduleEvent[]; date: Date }>,
): Promise<void> {
  await cancelEventNotifications();
  const now = new Date();
  for (const { events, date } of dayEntries) {
    for (const event of events) {
      const [hours, minutes] = event.start.split(':').map(Number);
      const triggerDate = new Date(date);
      triggerDate.setHours(hours, minutes, 0, 0);
      if (triggerDate <= now) continue;
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `${EVENT_NOTIFICATION_PREFIX}${date.toDateString()}-${event.id}`,
          content: {
            title: event.title,
            body: `${event.icon} Starting now`,
            sound: 'notification.wav',
            data: { type: 'event', eventId: event.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
          },
        });
      } catch {
        // Skip individual notification failures silently
      }
    }
  }
}

export async function cancelEventNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(EVENT_NOTIFICATION_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export async function scheduleTestNotification(): Promise<string> {
  const triggerDate = new Date(Date.now() + 60_000);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Test Notification',
      body: 'Belific notifications are working',
      sound: 'notification.wav',
      data: { type: 'test' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });
}

export async function cancelNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function getAllCustomReminders(): Promise<Notifications.NotificationRequest[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter((n) => n.content.data?.type === 'custom');
}
