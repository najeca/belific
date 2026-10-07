# Decision 025 — One profile icon, Settings and Labels as pages

**Date:** 2026-10-07
**Status:** Proposed — awaiting Jethro's confirmation

Source: Jethro's instruction for checkpoint 9 (app 2.15.0). Refines `docs/DESKTOP_HOME_NAV_SPEC.md` ("Top bar", "The three real pages") and builds on decisions 012 (account), 017 and 020 (notifications), 021 (small popovers, not modals) and 016 (labels).

---

**Decision.** The desktop has **one place for the account: a profile icon in a slim top strip**, always visible, signed in or not. It opens the shared small Popover (never a modal). **Settings and Labels are pages inside the app**, each a view with a Back button, not overlays. The old account line at the bottom of the Brain Dump pane and the Settings modal are removed.

**Rules.**
- **The icon.** A neutral person glyph when signed out, the user's initial on the accent colour when signed in. It sits at the top right of a 48px strip above the three panes, so it never covers a pane header, a card or the Timebox.
- **Signed out menu.** "Local only, not signed in", one line "Sign in to keep your tasks on all your devices", a Sign in with Apple button that starts the existing flow (decision 012, unchanged), and a Settings row (so Settings is reachable without an account).
- **Signed in menu.** The account (email or "Apple account"), the sync line, "Last synced" in plain words, any sync error in plain words, Sync now, Settings, Sign out.
- **Settings page.** Account (sign in or out, Delete account with its existing inline confirm; if the server function is unavailable a plain message says the account was not deleted), Sync (status, last synced, last error, Sync now), Planning (My day starts at), Notifications (the three notification toggles, the daily reminder time, close to tray, start with Windows), Data (open backups folder, export), Labels (opens the Labels page), About (version, privacy policy, issue tracker, and the Chromium and Electron licences file only when it ships in the app folder). Every setting keeps its behaviour and storage; only its place moved. Reached from the popover and from File, Settings (Ctrl+,).
- **Labels page.** Every label with its colour swatch, name and the number of open tasks using it. Rename inline, change colour from the eight colour palette (a small popover), delete with an inline confirm and the existing move or clear rule (tasks move to a same-named label, otherwise lose the label), add from the suggestions or by typing. Duplicate names are refused as everywhere else. No reordering.
- **The panes stay mounted while a page shows**, hidden (`display: none`) and marked `inert`, so the week, the filter and drag state survive. Nothing in them takes focus, input or keys; the Timebox event editor's Escape handler is gated on the home view; and the notification payload (sent from the home component) keeps updating, so reminders are not lost while Settings or Labels is open.
- **Kept exactly as they were:** AccountChoiceModal (a required decision, so it stays a modal), the pre sign in backup and the revoke handling.
- **Keyboard route for cards** (same checkpoint): a card is in the tab order, Enter on the card itself expands or collapses it, Escape collapses it, with a focus ring in the accent colour (`:focus-visible`). Keys from any field or inner button never reach the card (`isEditableTarget` plus "only the card itself"), so the 2.12.1 space key fix stays fixed; Space is not handled.

**Not built here.** Import of data (needs its own checkpoint: a backup first, validation, tests). Code signing and auto update.

**Why.** The account was spread over a footer line and a modal that covered the board; a single always visible icon is the usual place and removes both. Settings and Labels hold many controls and a modal made them cramped; a page gives them room and keeps the small popover rule of decision 021 for everything quick.

## Related Notes
- [[docs/decisions/012-account-and-identity-strategy]]
- [[docs/decisions/016-labels]]
- [[docs/decisions/021-edit-on-the-card]]
- [[docs/DESKTOP_HOME_NAV_SPEC]]
