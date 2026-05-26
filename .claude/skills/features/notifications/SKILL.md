---
name: notifications
description: Implement or debug Belific local notifications. Covers all three notification types (Custom Reminder, Weekly Summary, Streak at Risk) using expo-notifications. Use when notification scheduling, permissions, or triggers need to be changed.
---

# Notifications

## Three Notification Types

| Type | File | Schedule | Logic |
|------|------|----------|-------|
| Custom Reminder | `mobile/lib/notifications.ts` | User-defined time + message | `scheduleNotificationAsync` with `CalendarTriggerInput` |
| Weekly Summary | `mobile/lib/notifications.ts` | Every Sunday at 18:00 | `WeeklyTriggerInput` — weekday: 1, hour: 18, minute: 0 |
| Streak at Risk | `mobile/lib/notifications.ts` | Every day at 20:00 | `DailyTriggerInput` — hour: 20, minute: 0 |

## Critical Invariants

- **Always request permissions on first launch** — call `requestPermissionsAsync()` in `_layout.tsx` before scheduling any notification
- **Streak at Risk fires unconditionally** — the web app's activity data is not accessible from native code (Decision [[002-local-notifications-only]])
- **Never use push notifications** — all scheduling is local only (Decision [[002-local-notifications-only]])
- **NotificationBehavior API:** use `shouldShowBanner` + `shouldShowList` — NOT the deprecated `shouldShowAlert`

## Permission Request Pattern
```typescript
import * as Notifications from 'expo-notifications';

async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}
```

## Weekly Summary Schedule
```typescript
await Notifications.scheduleNotificationAsync({
  content: { title: 'Weekly Summary', body: 'Here is your week overview.' },
  trigger: { weekday: 1, hour: 18, minute: 0, repeats: true },
});
```

## Streak at Risk Schedule
```typescript
await Notifications.scheduleNotificationAsync({
  content: { title: 'Streak at Risk', body: "Don't break your streak today!" },
  trigger: { hour: 20, minute: 0, repeats: true },
});
```

## Debugging
- Check scheduled notifications: `Notifications.getAllScheduledNotificationsAsync()`
- Cancel all: `Notifications.cancelAllScheduledNotificationsAsync()`
- Test immediately: use a 5-second trigger, then restore the real schedule
