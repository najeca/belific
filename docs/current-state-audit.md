# Current State Audit — Belific
> **HISTORICAL, 2026-07-30. Superseded by `docs/CURRENT_TRUTH.md`.** This page predates Supabase accounts and sync, the 2.1.0 navigation, and the desktop work. It is kept for the record only. Do not rely on it for current state.
> Last updated: 2026-07-30 (v2 restructuring, Phase 4)

---

## Status Overview

| Layer | Status | Notes |
|-------|--------|-------|
| Legacy web app (PWA) | ✅ Complete and live | https://najeca.github.io/belific/ — separate artifact, no longer used by mobile |
| Mobile app (Expo) | ✅ Fully native | No WebView — own UI, own data model, own AsyncStorage persistence |
| v2 restructuring | 🔄 In progress | Phase 1–4 complete (theme, task-setting UX, Brain Dump, psychology-rule audit); see below |
| Local notifications | ✅ Working, scoped down | Custom reminders + user-created event start notifications only |
| EAS Build | ❌ Not configured | Local `expo run:ios`/simulator builds working; EAS profiles not set up |
| App Store | ❌ Not started | — |

---

## Mobile App — v2 Restructuring (this session)

The single-screen WebView-wrapper mobile app documented in earlier
sessions was replaced (pre-v2) by a fully native tabbed app
(Today/Calendar/Focus/Settings). This session's v2 restructuring adds
a 5th tab and reworks the visual identity and task-capture flow:

### Phase 1 — Sage/cream theme
- `lib/theme.ts` rewritten from a dark theme to the sage/cream Quiet
  Function palette (`#5C7A6B` accent / `#F0EEE8` background), with a
  verified `accent`/`accentText` split so sage-as-text always clears
  WCAG AA (raw accent fails at 4.07:1; `accentText` passes at 5.97:1)
- `CATEGORIES`/`DAY_TYPES` colors in `data.ts` repicked for the light
  background (old hues were invisible or too pure-semantic)
- Shadows removed app-wide (hairline borders only), ALL-CAPS labels
  converted to sentence case, event lists restructured from
  individually-rounded cards to flat hairline-divided rows

### Phase 2 — Task-setting speed
- `EventForm` (`app/components/AddEventModal.tsx`) reworked for
  progressive disclosure: title is the only visible/required field;
  date/time/category/notes collapse behind "More options"
  (auto-expanded when editing)
- Category switched from a free-typed field to a tap-to-select chip
  grid; icon is now always derived from category
- Real smart defaults: start = next quarter hour, duration = 30 min
  (previously a 1-minute validation floor, not an actual default)

### Phase 3 — Brain Dump (Inbox tab)
- New `BrainDumpItem` type (own shape, not an optional-fields
  `CustomEvent` — see `lib/types.ts` for why) with its own AsyncStorage
  key and CRUD in `lib/storage.ts`
- New Inbox tab: pinned capture input, flat hairline list (newest
  first), tap-to-act sheet (Schedule promotes via `EventForm`'s
  `initialTitle`, or Delete)
- `shouldShowStarterRoutine` now also checks for Brain Dump items

### Phase 4 — Psychology-rule audit
- Removed the weekly summary notification entirely (was
  engagement-bait with no real feature behind it)
- `scheduleEventNotifications` now only fires for user-created
  (`isCustom`) events — template/starter-routine events never
  generate a notification
- `docs/CLAUDE.md` rewritten — it previously described a WebView
  architecture and a "streak at risk" notification, neither of which
  exist in this codebase (this file had drifted badly; see the
  Known Documentation Drift section below)

Remaining planned phase:
- Phase 5 (Nunito/Hahmlet fonts) — deliberately deferred; see
  `.claude/skills/design-identity/SKILL.md` Status section

---

## Documentation Drift — Resolved

`docs/architecture.md` and `docs/UBIQUITOUS_LANGUAGE.md` also
described the pre-v2 WebView-wrapper architecture and
"Block"/"Streak"/"Weekly Summary" terminology; both were rewritten in
a follow-up pass (same session) to match the actual mobile codebase.
All four docs (`CLAUDE.md`, this file, `architecture.md`,
`UBIQUITOUS_LANGUAGE.md`) are now consistent with the v2 native
architecture.

---

## Security Issues

None known. No Supabase, no API keys, no auth.

---

## Key File Locations

| File | Purpose |
|------|---------|
| `mobile/index.js` | Entry point with polyfills |
| `mobile/app/_layout.tsx` | Root layout + notification permission request |
| `mobile/lib/theme.ts` | Sage/cream color tokens |
| `mobile/lib/data.ts` | CATEGORIES/DAY_TYPES, schedule helpers, `createCustomEvent`/`createBrainDumpItem` |
| `mobile/lib/storage.ts` | AsyncStorage persistence — custom events, Brain Dump, timer settings |
| `mobile/lib/notifications.ts` | Notification scheduling logic (local only) |
| `mobile/app/components/AddEventModal.tsx` | `EventForm` — shared event create/edit form |
| `mobile/app/(tabs)/inbox.tsx` | Brain Dump capture + promote/delete |
| `mobile/babel.config.js` | Must exist — Metro crashes without it |
| `mobile/app.json` | Expo config (plugins, deployment target) |
| `mobile/ios/Podfile` | CocoaPods config with fmt + ExpoFont patches |
| `docs/IOS_BUILD_NOTES.md` | Full iOS build error reference |
| `.claude/skills/design-identity/SKILL.md` | Palette + locked-in psychology rules |

---

## How to Start a Claude Code Session

```bash
cd ~/Developer/belific
claude
```

Opening message:
> Read docs/current-state-audit.md, docs/architecture.md,
> docs/UBIQUITOUS_LANGUAGE.md, and docs/CLAUDE.md, then summarise.
