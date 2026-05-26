# Decision 002 — Local Notifications Only

**Date:** May 2026  
**Status:** Decided — do not change

---

## Decision
All notifications are local, scheduled on-device by `expo-notifications`.
No push notification server, no APNs backend, no Supabase.

## Reason
Belific has no backend. All three notification types (Custom Reminder, Weekly Summary,
Streak at Risk) can be fully implemented with `scheduleNotificationAsync`.
Zero infrastructure cost. Zero server maintenance.

## Consequences
- Notifications only fire if the app has been opened at least once on the device
- Streak at Risk fires unconditionally at 8 PM (web app activity is unreadable without modifying the web JS — Decision [[001-webview-not-rewrite]] forbids that)
- No silent push, no badge updates from server

## Do Not Change Unless
Notifications need to fire on a device that has never opened the app,
or cross-device sync of reminders is required.

---

## Related Notes
- [[architecture]]
- [[003-no-supabase]]
