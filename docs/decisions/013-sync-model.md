# Decision 013 — Sync model

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation
**Note:** Applies to iOS and desktop (it is shared code).

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

1. **Outbox.** Replace fire and forget `pushRow` with a persisted outbox (one kv key). Every local mutation appends `{table, op, key, row}`. The outbox drains in order, retries on the next trigger, and checks `error` on every response (V7e). Batch upserts in groups of up to 500 rows (fixes V7f).
2. **Write lock.** One async mutex around every storage read, modify, write and around the merge step of a sync. The merge re-reads local state inside the lock (fixes V7b).
3. **Pull.** Add a server side column `server_updated_at timestamptz not null default now()`, maintained by a trigger on insert and update. Pull with `.gt('server_updated_at', cursor).order('server_updated_at').range()` in pages of 1000, and store the cursor per table only after the page has been saved. Pulling by the server clock means client clock skew cannot skip rows. Conflict resolution stays last write wins on the client `updatedAt`, compared with `Date.parse` (V7d). If a device's clock is more than 5 minutes from the server `Date` header, show it in the sync status.
4. **Routine completions** keep hard deletes, because 2.1.0 clients read them. The fix for V7a: store `lastFullSyncAt`. A completion that exists locally but not remotely, with `completedAt` before `lastFullSyncAt`, was deleted elsewhere, so drop it locally instead of uploading it. Pending deletes go through the outbox.
5. **Triggers.** App start, sign in, the `visibilitychange` foreground event, the Electron window `focus` event (sent over IPC), and every 120 seconds while the window is visible. No Realtime for now: polling is simpler, and one user does not need second level latency.
6. **Visibility.** A sync status object `{lastSuccessAt, lastError, pending}`. On desktop it is shown as one quiet line in the Profile dropdown, and in red only when the last error is less than 24 hours old. On iOS it is shown in Settings. This replaces `NEXT_PLAN.md` P1.2's "silent is correct". Silent is right for transient failures but wrong for a daily driver that has stopped syncing.
7. **Accepted limits** (write them down): row level last write wins with no field merge, and tombstones kept on the server forever.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
