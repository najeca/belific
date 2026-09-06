# Navigation Restructure + Timebox View — Implementation Spec

Verified against the real repo (2026-09-02): `app/(tabs)/_layout.tsx` is a
plain 5-tab `expo-router` `<Tabs>` config (today, inbox, calendar, focus,
settings). `focus.tsx` and its Pomodoro state (`TimerSettings`/`TimerStore`
in `lib/types.ts` / `lib/store.ts`, `loadTimerSettings`/`saveTimerSettings`
in `lib/storage.ts`) are referenced only by `focus.tsx` itself and by
`settings.tsx`'s Pomodoro config section — **not** part of the 7 synced
types, so this whole removal has no Supabase/sync-layer involvement. That
means this can be built and shipped **independently of P1 (Phase D
verification)** — good candidate for right now, while Supabase is paused.

Three changes, sequenced as separate commits/version bumps per rule 2 —
don't land as one giant diff even though they're related:

---

## 1. Remove Focus/Pomodoro entirely

- Delete `app/(tabs)/focus.tsx`.
- Remove `TimerSettings`, `TimerStore` from `lib/types.ts`.
- Remove `loadTimerSettings`/`saveTimerSettings` from `lib/storage.ts`.
- Remove the Pomodoro store logic from `lib/store.ts` (delete the file if
  nothing else uses the `TimerStore` pattern, otherwise strip just the
  timer-related exports).
- Remove the Pomodoro config section from `settings.tsx` (the
  `SettingKey = keyof TimerSettings` block and whatever UI renders it).
- **Leave the old AsyncStorage key alone** — don't write a migration to
  purge it. It's a few bytes of orphaned local data for existing installs,
  not worth the risk of a migration bug for something this low-stakes.

## 2. Move Settings off the tab bar

- Remove the `settings` `Tabs.Screen` entry from `app/(tabs)/_layout.tsx`.
- Relocate `settings.tsx` out of the `(tabs)` route group into the parent
  stack (e.g. `app/settings.tsx`), presented as a pushed/modal screen via
  `expo-router` rather than a tab.
- Add a small gear icon (Ionicons `settings-outline`, matching the icon
  already used for the old Settings tab) to Today's header —
  `router.push('/settings')` on tap. Today is the natural anchor screen for
  this since it's already the first/default tab.
- No functional loss: Account (Sign in with Apple / Sign Out / Delete
  Account), Clear All Data, About all move with the screen unchanged, only
  how you get there changes.

## 3. New Timebox tab (replaces Focus's slot)

**Relationship to the existing Calendar tab:** Timebox is not a
replacement for Calendar — Calendar's month grid + day-detail list stays
exactly as it is, for month-level browsing and jumping to arbitrary dates.
Timebox is a different lens on the same `CustomEvent` data: an hourly grid
for one day at a time, defaulting to today, with prev/next-day paging (the
"M 19 ◀ ▶" pattern from the Akiflow/Sunsama/Ellie screenshots). No new data
model — it reads the same events Calendar already reads.

### Phase 1 (MVP — ship this first)
- `app/(tabs)/timebox.tsx`: hourly grid (e.g. 6am–11pm, scrollable) for the
  selected day. Events render as positioned blocks (top offset + height
  from start/end time), using each event's existing category color —
  same visual system already established, no new color logic.
- Prev/next day navigation + a "jump to today" affordance.
- Tapping a block opens the existing `AddEventModal` in edit mode — reuse
  the same single-modal mode-swap pattern already used elsewhere, don't
  fork it.
- Read-only layout otherwise: no drag-to-reposition yet (see Phase 2).
  This ships the actual most-requested thing (visualizing the day as time
  blocks) without taking on gesture-handling risk in the first pass.

### Phase 2 (once Phase 1 is verified on-device)
- Drag-to-reposition: long-press + drag a block to a new time slot,
  updates that event's `start`/`end` on drop (same fields Calendar's edit
  form already writes to — no new fields). Use
  `react-native-gesture-handler` (already a dependency, see
  `IOS_BUILD_NOTES.md` #8) rather than introducing a second gesture
  library.
- A day's total scheduled hours (sum of that day's event durations),
  shown at the top of the Timebox view — the "8 tasks, 7 hours" pattern
  from Ellie. Small, derived, no storage change.

### Tab bar icon
Ionicons `time-outline` (distinct from Calendar's `calendar-outline` and
the old Focus's `timer-outline`, which is being freed up).

---

## Version/changelog (rule 2 — separate bumps, don't combine)

1. Focus removal + Settings-to-icon (items 1–2 above) — one commit, one
   version bump (patch or minor — this removes a feature and changes
   navigation structure, so minor is more honest than patch: `2.1.0`).
2. Timebox Phase 1 — its own commit, `2.2.0` (new feature, minor).
3. Timebox Phase 2 (drag-to-reposition) — its own commit, `2.3.0`.

Each gets a full build gate (rule 6) before moving to the next — Focus
removal in particular should get a real on-device check that nothing else
silently depended on `TimerStore`/`TimerSettings` before Phase 1 starts.
