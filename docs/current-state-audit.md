# Current State Audit — Belific
> Last updated: 2026-05-26 (session 3)

---

## Status Overview

| Layer | Status | Notes |
|-------|--------|-------|
| Web app (PWA) | ✅ Complete and live | https://najeca.github.io/belific/ |
| iOS app (Expo) | ⚠️ In progress | Native build succeeds on device; notifications pending verification |
| Local notifications | ⚠️ Scaffolded | Code exists; not verified on device yet |
| EAS Build | ❌ Not configured | Local `expo run:ios` working; EAS profiles not set up |
| App Store | ❌ Not started | — |
| Docs / Obsidian vault | ✅ Complete | Matches Landis structure |

---

## Web App — Complete

Live at https://najeca.github.io/belific/

Files:
```
index.html
manifest.json
sw.js
css/styles.css
js/app.js
js/data.js        — WEEKLY_SCHEDULE source of truth (v1.3.0)
js/notifications.js
js/schedule.js
js/storage.js
js/timer.js
js/ui.js
assets/icon-192.png
assets/icon-512.png
```

What works:
- Full PWA schedule and Pomodoro timer UI
- Service worker for offline capability
- 14 categories with correct hex colours
- WEEKLY_SCHEDULE Mon–Sun with fallback logic
- Installable on home screen via PWA manifest

---

## iOS App — In Progress

### Session 3 — 2026-05-26 (this session)

Native build pipeline fully resolved:

- ✅ `react-dom` conflict fixed — uninstalled, `react@19.1.0` pinned
- ✅ `expo-modules-autolinking` missing — installed explicitly
- ✅ `expo-font` autolinking silently skipped — manual pod added to Podfile
- ✅ fmt / Clang 16 `consteval` error — `base.h` gsub patch + `chmod` applied in `post_install`
- ✅ iOS deployment target bumped to 16.4 (Podfile, app.json, xcodeproj)
- ✅ Release build compiled and installed on device (`00008150-000438D40A92401C`)
- ✅ Full build sequence documented in `docs/IOS_BUILD_NOTES.md`
- ✅ Podfile patch script created: `.claude/skills/workflow/ios-build/scripts/patch-podfile.sh`

### Session 2 — 2026-05-22b

- ✅ Web app schedule data updated (14 categories, WEEKLY_SCHEDULE from v5 HTML)
- ✅ WebView URL corrected: `Belific/` → `belific/` (lowercase — GitHub Pages case-sensitive)
- ✅ Package versions fixed for SDK 54
- ✅ NotificationBehavior API corrected: `shouldShowBanner` + `shouldShowList`
- ✅ Podfile fmt/Clang C++20 fix applied (earlier version)

---

## Pending

- ⬜ Verify WebView loads `https://najeca.github.io/belific/` correctly on device
- ⬜ Test notification permission prompt on launch
- ⬜ Verify Custom Reminder creates and fires correctly
- ⬜ Verify Weekly Summary scheduled for Sunday 6 PM
- ⬜ Verify Streak at Risk scheduled for daily 8 PM
- ⬜ Commit all mobile changes (package.json, Podfile, app.json, mobile source files)
- ⬜ Set up EAS build profiles in `mobile/eas.json`
- ⬜ Configure EAS production profile
- ⬜ App Store submission prep (see `docs/publishing-reference.md`)

---

## Docs / Obsidian Vault — Complete (2026-05-26)

Structure now matches Landis:

```
docs/
  CLAUDE.md                   — AI agent instructions
  architecture.md             — stack, structure, key decisions
  claude-code-standard.md     — operating standard (from Landis)
  current-state-audit.md      — this file
  cursor-audit.md             — Cursor code review log
  UBIQUITOUS_LANGUAGE.md      — domain glossary
  publishing-reference.md     — App Store publishing reference
  IOS_BUILD_NOTES.md          — iOS build issues and fixes
  sessions/
    2026-05-22.md
    2026-05-22b.md
    2026-05-26.md
  decisions/
    001-webview-not-rewrite.md
    002-local-notifications-only.md
    003-no-supabase.md
    004-ios-deployment-target-16-4.md
    005-expo-font-manual-pod.md

.claude/
  settings.local.json
  skills/
    workflow/
      ios-build/              — full build sequence + Podfile patches
      session-close/          — end-of-session housekeeping
      security-review/        — quality gates before commit
      testing/                — device testing checklist
    features/
      notifications/          — local notification types
      webview/                — WebView URL and config
```

---

## Security Issues

None known. No Supabase, no API keys, no auth for v1.

---

## Key File Locations

| File | Purpose |
|------|---------|
| `mobile/index.js` | Entry point with polyfills |
| `mobile/app/_layout.tsx` | Root layout + notification permission request |
| `mobile/lib/notifications.ts` | Notification scheduling logic |
| `mobile/babel.config.js` | Must exist — Metro crashes without it |
| `mobile/app.json` | Expo config (plugins, deployment target) |
| `mobile/ios/Podfile` | CocoaPods config with fmt + ExpoFont patches |
| `docs/IOS_BUILD_NOTES.md` | Full iOS build error reference |
| `.claude/skills/` | Claude Code skills |

---

## How to Start a Claude Code Session

```bash
cd ~/Developer/belific
claude
```

Opening message:
> Read docs/current-state-audit.md, docs/architecture.md, docs/UBIQUITOUS_LANGUAGE.md, and docs/CLAUDE.md then summarise.
