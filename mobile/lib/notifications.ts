import * as Notifications from 'expo-notifications';

const WEEKLY_SUMMARY_ID = 'belific-weekly-summary';
const STREAK_AT_RISK_ID = 'belific-streak-at-risk';

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleRecurring(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_SUMMARY_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(STREAK_AT_RISK_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_SUMMARY_ID,
    content: {
      title: 'Weekly Summary',
      body: "Here's how your week went — tap to review your schedule.",
      data: { type: 'weekly-summary' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // Sunday = 1 in iOS calendar convention
      hour: 18,
      minute: 0,
    },
  });

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_AT_RISK_ID,
    content: {
      title: 'Streak at Risk',
      body: "You haven't logged any activity today. Keep your streak alive!",
      data: { type: 'streak-at-risk' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
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
      data: { type: 'custom', scheduledDate: date.toISOString() },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
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
