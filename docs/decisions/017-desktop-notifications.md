# Decision 017 — Notification strategy on desktop

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation
**Note:** Decision 002 (local only) still holds.

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** The Electron main process owns scheduling. The renderer sends the next 48 hours of notifiable items over IPC whenever data changes. The main process keeps timers and fires `new Notification()`. Notifiable items: CustomEvent starts (as on iOS) and placed tasks at `startTime` (both user set commitments). One toggle each. The app keeps running in the tray when the window is closed, if Jethro agrees, so timers survive. Start with Windows is an opt-in toggle, off by default. Call `app.setAppUserModelId` so toasts appear [unverified: dev mode toast behaviour].

**Dropped:** the "weekly summary email" toggle in the desktop Settings spec. It contradicts the removal of the weekly summary, and no email infrastructure exists. "Routine check-ins" becomes the quiet badge from addendum 3, not a notification.

## Built (2026-10-06, checkpoint 7, app 2.11.0). Status stays Proposed.

Code: `desktop/src/scheduler.js` (pure), `desktop/src/settings.js`, `desktop/main.js`, `mobile/lib/desktopNotify.ts` and `desktopNotifyCore.ts`. Tests: `scheduler.test.js`, `desktopNotifyCore.test.ts`, `test/real/cp7.js`.

As decided: main owns scheduling; the page sends the next 48 hours of items on every data change; CustomEvent starts and placed tasks at `startTime`; one toggle each; de-duplication, cancel on change; `app.setAppUserModelId('com.najeca.belific.desktop')`; clicking a toast shows and focuses the window; tray with Open and Quit; Start with Windows opt in, off by default (`setLoginItemSettings`, packaged app only, starts hidden in the tray).

Deviations and additions:
- **Lead time:** the iOS app has no per item lead time setting (`scheduleEventNotifications` fires at the start time), so the desktop fires at the start time too.
- **Daily reminder:** new, see decision 020.
- **Hidden window ticks:** the page only polls while visible (decision 013 item 5). With the window hidden in the tray, main sends a `notify:tick` every 120 s; the page then runs the normal sync and resends the payload, so events created on the phone still notify. No sync rule changed; it is one more trigger.
- **Sleep:** after the computer wakes, due timers fire if less than 5 minutes late (events and tasks) or 3 hours (daily reminder) and are dropped otherwise; nothing stale is shown.
- **Close to tray** is a setting (on by default). The first close shows one quiet notification explaining the tray. A real Quit exists in the tray menu and in File.
- **Settings:** the notification and window settings live in the main process store (`belific_desktop_settings`), validated on every write.
- **Time zone:** items are planned in the computer's local time. If the zone changes while the app runs, the next data send or tick (within 2 minutes) re-plans them.
- **Still unverified:** that a toast appears on this Windows version from the installed app (the checks capture the Notification call in the main process, not the screen); toasts from an unpackaged `npm run desktop` run may not show because Windows ties them to the installed shortcut's id; Start with Windows after a real reboot. The try-it steps are in the cp7 session note.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
