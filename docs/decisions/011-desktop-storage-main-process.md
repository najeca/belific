# Decision 011 — Desktop storage lives in the main process, with backups

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** A new `mobile/lib/kv.ts` exposes `getItem`, `setItem`, `removeItem` and `multiRemove`. When `globalThis.belificDesktop` exists it calls the preload IPC, and otherwise it calls AsyncStorage, so iOS behaviour is unchanged. `storage.ts`, `ownerSeed.ts`, `devSeed.ts` and the Supabase auth storage all go through it. The Electron main process stores one file per key in `userData/data/`, written atomically (write a temp file, then rename), with writes queued per key. Keys must match `^[A-Za-z0-9_.-]{1,128}$`.

**Safety.** On launch and every 24 hours, copy `data/` to `backups/YYYY-MM-DD/` and keep 14 of them. The File menu gets "Export data…" (one JSON file of all keys plus the app version) and "Open backups folder". Import comes in a later checkpoint, and until then restoring means copying a backup folder back while the app is closed.

**Also:** write failures stop being silent on desktop. The main process logs them to `userData/logs/`, and the renderer shows a persistent error line.

**Reason.** localStorage is origin bound, quota limited, and fails silently in this codebase. A file store survives origin changes, is inspectable, and can be backed up.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
