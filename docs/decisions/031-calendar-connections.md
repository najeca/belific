# Decision 031 - Calendar connections: iPhone calendars, the outbound feed, imported subscriptions

**Date:** 2026-10-17
**Status:** Proposed. Jethro decided the scope (build plan section 7 steps 1 to 3; step 4, two way Google and Microsoft sync, is out), the feed's content (timed tasks only, title with emoji, a tick for done, no notes, 30 days back and 365 ahead), the function name `belific-calendar-feed`, the one grant in 003, that nothing is written to the phone calendar, and that imported events stay local. The rest are choices made while building (`docs/build-progress.md`, phase 8). Confirm after the feed is deployed and the iPhone part has run on TestFlight.

Source: the phase 8 brief and Jethro's answers of 2026-10-17. Builds on decisions 002 (local only notifications), 013 (sync), 023 (series) and 030 (user_settings rows for things that follow the person).

---

**iPhone calendars (read only).** The Calendar tab reads the phone's own calendar database through `expo-calendar` (15.0.8, the SDK 54 version), which already holds every iCloud, Google and Outlook account on the phone, so no server and no OAuth. Asked only when the person presses "Show my calendars", with the reason; denied shows a plain explanation and Open Settings. Events are read for the month on screen, in memory only: never stored, synced, uploaded or written back. Only the two calendar usage strings are in `Info.plist` (no Reminders, no write only access; the package's config plugin is not used because it adds Reminders strings). Writing a task to the phone calendar is not built. Needs a new TestFlight build (native module).

**Outbound feed.** A read only iCalendar feed of the person's timed tasks, served by the Edge Function `belific-calendar-feed` at `/functions/v1/belific-calendar-feed?t=<token>`. The token is 32 random bytes, base64url, stored as the `user_settings` row `calendar.feed_token` (synced, so both devices show the same link; left out of the data export). A new link replaces the value; Turn off writes a tombstone; the function reads the row live, so the old link stops as soon as the change reaches the server (the app syncs at once and says whether it has). The function uses the service role key for exactly two reads (the token's owner, then that owner's tasks, 12 columns), writes nothing, takes the user id only from the lookup, answers every failure with one fixed sentence, logs the status only, rate limits per token and per caller (in memory, best effort), sends no CORS headers and is deployed with JWT verification off. Times are floating (tasks store a local `HH:mm` with no zone). Repeating series are expanded with the app's own series code (projected days from the server's today, UTC). The function cannot import `mobile/lib`, so the eight pure files it needs are copied byte for byte into its `vendor/` folder; a test fails if they drift. Grant: `003_calendar_feed_grants.sql` (`select on belific.user_settings to service_role`; the other privileges were already there).

**Imported subscriptions (Windows).** ICS or webcal links, read only, up to 10, local to the computer (kv), never synced, never exported. Added only if the first fetch works. The main process fetches (https on 443, no credentials in the link, every resolved address public and checked at connect time, at most 3 redirects each checked, 15 seconds, 5 MB also after gzip, must start with `BEGIN:VCALENDAR`); the page never fetches outside sites. Logs hold the host and a reason code, never the link (often a secret itself). The parser is written here (no new library): repeats, exceptions, cancelled and moved instances, IANA, Windows and VTIMEZONE zones, counted in the event's wall clock. Drawn read only in the Calendar (dashed outline, 📅): all day and 24 hours or more in the all day row, shorter events on the grid cut at midnight. Refreshed every 30 minutes while visible (10 after a failure), when the window becomes visible and on demand; a failure keeps the last events and says why.

**Not built.** Two way sync with Google or Microsoft (section 7 step 4). Writing tasks to the phone calendar. Imported subscriptions on the iPhone (the phone has its own calendars). Syncing subscriptions between computers.

## Related Notes
- [[docs/decisions/013-sync-model]]
- [[docs/decisions/023-repeating-tasks-as-series]]
- [[docs/decisions/030-trash-export-power-features-and-safe-reset]]
- [[docs/CALENDAR_FEED_DEPLOY]]
- [[docs/belific-build-plan]]
