# Belific — Architecture
> Last updated: 2026-07-30 (v2 restructuring, Phase 4 doc pass)

## What Belific Is
A calm, focused productivity app for managing daily schedules and
tasks, with a Pomodoro timer and a quick-capture inbox (Brain Dump).

> [!WARNING] This file previously described the mobile app as a
> WebView wrapper around the web app. That has not been true since a
> pre-v2 rewrite replaced it with a fully native tabbed app — see
> `docs/decisions/001-webview-not-rewrite.md`, which is superseded.
> The legacy web PWA at the repo root is a separate, complete, older
> artifact; it shares no code or data with `mobile/`.

---

## Structure

```
belific/
  index.html          — legacy web app entry point (unrelated to mobile/)
  css/                — legacy web app styles
  js/                 — legacy web app logic
  assets/             — legacy web app images/icons
  sw.js               — legacy web app service worker (PWA)
  mobile/             — fully native Expo app (no WebView)
    index.js          — polyfill entry point
    babel.config.js
    app.json
    package.json
    lib/
      types.ts         — CustomEvent, BrainDumpItem, ScheduleEvent, etc.
      data.ts          — CATEGORIES/DAY_TYPES, schedule helpers, createCustomEvent/createBrainDumpItem
      storage.ts       — AsyncStorage persistence (custom events, Brain Dump, timer settings)
      notifications.ts — local notification scheduling
      theme.ts         — sage/cream color tokens
      store.ts         — Pomodoro timer state (zustand)
      devSeed.ts / ownerSeed.ts — dev/owner data seeding helpers
    app/
      _layout.tsx
      index.tsx
      (tabs)/
        _layout.tsx
        today.tsx        — schedule for today, NOW/NEXT cards, quick add
        calendar.tsx      — month grid + day-detail sheet
        inbox.tsx         — Brain Dump quick capture
        focus.tsx         — Pomodoro timer
        settings.tsx
      components/
        AddEventModal.tsx — EventForm (shared create/edit form) + modal wrapper
  docs/               — Obsidian vault (this folder)
  .claude/skills/     — Claude Code skills
```

---

## Legacy Web App

| | |
|--|--|
| Language | Pure HTML, CSS, vanilla JavaScript |
| Framework | None — no npm, no build step |
| PWA | Service worker (`sw.js`) + `manifest.json` |
| Deployment | GitHub Pages |
| URL | https://najeca.github.io/belific/ |

This is a separate, older artifact. The mobile app does not load,
wrap, or depend on it in any way — do not conflate the two when
reasoning about the mobile codebase.

---

## Mobile Stack

| | |
|--|--|
| Framework | Expo SDK 54 |
| React Native | 0.81.5 |
| Router | expo-router ~6.0.23 |
| Notifications | expo-notifications (local only) |
| Font loading | expo-font (manually linked — autolinking skips it) |
| Build | EAS Build (not yet configured — see current-state-audit.md) |
| Bundle ID (iOS) | `com.najeca.belific` |
| Bundle ID (Android) | `com.belific.app` — never reconciled with the iOS ID, flag rather than silently "fix" |
| Apple Team | `9PG7ANYKDV` |
| Device UDID | `00008150-000438D40A92401C` (Jethro's iPhone) |
| Min iOS | 16.4 (required by expo-font 56.x) |

No `react-native-webview` dependency exists in `package.json`.

---

## Non-Negotiable Decisions

1. **Mobile app is fully native — never reintroduce a WebView**
   (decision 001 is superseded; the mobile app has its own UI, data
   model, and persistence layer)
2. **Local notifications only** — no server needed
   (expo-notifications scheduled on-device; no backend exists)
3. **No Supabase, no auth, no database** — covers custom events,
   Brain Dump items, and timer settings alike; all on-device AsyncStorage
4. **Import/polyfill order in `mobile/index.js`:**
   `react-native-gesture-handler` → `react-native-get-random-values` →
   `process` → `Buffer` → `expo-router/entry` — gesture-handler must be
   the very first import per its own setup requirement
5. **Bottom tab bar only** — never hamburger menu
   (iOS HIG compliance)
6. **`babel.config.js` must exist in `mobile/`**
   (without it Metro bundle crashes on launch)
7. **`useSafeAreaInsets()`** — never hardcoded `paddingTop`
8. **Touch targets minimum 44×44pt** (iOS HIG)

---

## Design Identity

Sage/cream "Quiet Function" palette (`#5C7A6B` accent / `#F0EEE8`
background), plus locked-in product-psychology rules (no streak-guilt,
notifications tied only to real user commitments, progressive
disclosure on task capture). See
`.claude/skills/design-identity/SKILL.md` before any UI/theme work.

---

## Notification Types

| Type | Schedule | Logic |
|------|----------|-------|
| Custom Reminder | User-defined time + message | `scheduleCustomReminder`, stored in OS notification store |
| Event start | When a user-created event begins | `scheduleEventNotifications`, filtered to `event.isCustom` — template/starter events never fire one |

There is no weekly summary and no "streak at risk" notification.
Both were removed during the v2 restructuring's psychology-rule audit
(weekly summary was engagement-bait with no real feature behind it;
streak-at-risk never actually existed in code despite being
documented in earlier versions of this file).

---

## Key Build Facts (learned 2026-05-26)

| Issue | Fix |
|-------|-----|
| `expo-font` autolinking silently skipped | Manual `pod 'ExpoFont'` line in Podfile + `"expo-font"` in `app.json` plugins |
| `fmt` / Clang 16 `consteval` error | `base.h` gsub patch in `post_install` (with `chmod`) — build flag alone overridden by header |
| iOS deployment target 15.1 too low | Set 16.4 in Podfile fallback, `app.json`, and `xcodeproj` (4 occurrences) |
| `--udid` flag unknown | Use `--device <UDID or simulator UDID>` in this Expo CLI version |
| Debug build crashes (no Metro) | Always `--configuration Release` for standalone device installs (simulator builds can stay Debug since Metro runs on the same machine) |

Full details: `docs/IOS_BUILD_NOTES.md`

---

## Security

- No Supabase — no auth, no database
- No API keys anywhere in mobile code
- No hardcoded credentials

---

## Related Notes
- [[current-state-audit]]
- [[UBIQUITOUS_LANGUAGE]]
- [[IOS_BUILD_NOTES]]
