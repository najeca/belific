# Decision 010 — Desktop shell is Electron

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** The Windows app is Electron loading the static `expo export --platform web` output through a privileged custom protocol (`app://belific/`), never `file://` and never a public URL. electron-builder produces an unsigned NSIS installer. No auto update until the installer is signed.

**Reason.** Everything stays in JavaScript (main process storage, notifications, tray, deep links), and Jethro's stack is JavaScript. Tauri's smaller installer does not matter for one user, and its main process work would be in Rust. The custom protocol gives a stable origin and an index.html fallback for expo-router.

**Rules.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. A preload exposes only a named allow list (`kv`, `backup`, `app.version`, later `notify` and `auth`). The window has `minWidth: 1024`. Use a single instance lock. Block `will-navigate` and new windows, and open https links in the system browser. Set a CSP through protocol response headers, with `connect-src` limited to the Belific Supabase host. Dev mode loads the Expo dev server **with a separate userData directory** (N7).

**Not in scope.** Code signing, auto update, macOS builds.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
