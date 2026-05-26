# Belific — Architecture
> Last updated: May 2026

## What Belific Is
A warm, focused productivity app for managing daily schedules with a Pomodoro timer.
Web app is complete and live. iOS native wrapper is being added.

---

## Structure

```
belific/
  index.html          — web app entry point
  css/                — styles
  js/                 — app logic
    app.js
    data.js           — schedule data (WEEKLY_SCHEDULE source of truth)
    schedule.js
    timer.js
    notifications.js
    storage.js
    ui.js
  assets/             — images and icons
  sw.js               — service worker (PWA)
  mobile/             — Expo iOS wrapper
    index.js          — polyfill entry point
    babel.config.js
    app.json
    package.json
    lib/
      notifications.ts
    app/
      _layout.tsx
      (tabs)/
        _layout.tsx
        index.tsx         — WebView tab
        reminders.tsx     — custom reminders
  docs/               — Obsidian vault (this folder)
  .claude/skills/     — Claude Code skills
```

---

## Web Stack

| | |
|--|--|
| Language | Pure HTML, CSS, vanilla JavaScript |
| Framework | None — no npm, no build step |
| PWA | Service worker (`sw.js`) + `manifest.json` |
| Deployment | GitHub Pages |
| URL | https://najeca.github.io/belific/ |

> [!NOTE] Never touch the web app
> It is complete, live, and the single source of UI truth.
> The iOS app is a WebView wrapper only.

---

## iOS Stack

| | |
|--|--|
| Framework | Expo SDK 54 |
| React Native | 0.81.5 |
| Router | expo-router ~6.0.23 |
| Notifications | expo-notifications (local only) |
| Font loading | expo-font (manually linked — autolinking skips it) |
| Build | EAS Build |
| Bundle ID | `com.belific.app` |
| Apple Team | `9PG7ANYKDV` |
| Device UDID | `00008150-000438D40A92401C` (Jethro's iPhone) |
| Min iOS | 16.4 (required by expo-font 56.x) |

---

## Non-Negotiable Decisions

1. **Never rewrite the web app** — WebView wrapper only  
   (web app is complete and live; rewrite = weeks of work for zero user benefit)
2. **Web URL is always** `https://najeca.github.io/belific/`  
   (single source of truth for all UI logic)
3. **Local notifications only** — no server needed  
   (expo-notifications scheduled on-device; no backend exists)
4. **Polyfill order in `mobile/index.js`:**  
   `react-native-get-random-values` → `process` → `Buffer` → `expo-router/entry`
5. **Bottom tab bar only** — never hamburger menu  
   (iOS HIG compliance)
6. **`babel.config.js` must exist in `mobile/`**  
   (without it Metro bundle crashes on launch)
7. **`useSafeAreaInsets()`** — never hardcoded `paddingTop`
8. **Touch targets minimum 44×44pt** (iOS HIG)

---

## Notification Types

| Type | Schedule | Logic |
|------|----------|-------|
| Custom Reminder | User-defined time + message | Stored in OS notification store |
| Weekly Summary | Every Sunday at 6 PM | Recurring local notification |
| Streak at Risk | Every day at 8 PM | Fires unconditionally (web activity unreadable) |

---

## Key Build Facts (learned 2026-05-26)

| Issue | Fix |
|-------|-----|
| `expo-font` autolinking silently skipped | Manual `pod 'ExpoFont'` line in Podfile + `"expo-font"` in `app.json` plugins |
| `fmt` / Clang 16 `consteval` error | `base.h` gsub patch in `post_install` (with `chmod`) — build flag alone overridden by header |
| iOS deployment target 15.1 too low | Set 16.4 in Podfile fallback, `app.json`, and `xcodeproj` (4 occurrences) |
| `--udid` flag unknown | Use `--device <UDID>` in this Expo CLI version |
| Debug build crashes (no Metro) | Always `--configuration Release` for device installs |

Full details: `docs/IOS_BUILD_NOTES.md`

---

## Security

- No Supabase — no auth, no database for v1
- No API keys anywhere in mobile code
- No hardcoded credentials

---

## Related Notes
- [[current-state-audit]]
- [[UBIQUITOUS_LANGUAGE]]
- [[IOS_BUILD_NOTES]]
