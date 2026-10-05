# Decision 017 — Notification strategy on desktop

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation
**Note:** Decision 002 (local only) still holds.

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** The Electron main process owns scheduling. The renderer sends the next 48 hours of notifiable items over IPC whenever data changes. The main process keeps timers and fires `new Notification()`. Notifiable items: CustomEvent starts (as on iOS) and placed tasks at `startTime` (both user set commitments). One toggle each. The app keeps running in the tray when the window is closed, if Jethro agrees, so timers survive. Start with Windows is an opt-in toggle, off by default. Call `app.setAppUserModelId` so toasts appear [unverified: dev mode toast behaviour].

**Dropped:** the "weekly summary email" toggle in the desktop Settings spec. It contradicts the removal of the weekly summary, and no email infrastructure exists. "Routine check-ins" becomes the quiet badge from addendum 3, not a notification.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
