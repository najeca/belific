# CLAUDE.md — AI Agent Instructions for Belific

## Who reads this
Claude Code, Cursor, any AI agent working on this repo.
Read this before touching any file.

## What Belific is
A warm, focused productivity iOS app for managing daily
schedules with a Pomodoro timer. Currently a complete PWA
web app. Adding an iOS native wrapper with push notifications.

## Web stack (complete — do not rewrite)
- Pure HTML, CSS, JavaScript — no framework
- PWA with service worker (sw.js)
- Deployed at https://najeca.github.io/belific/
- Files: index.html, css/styles.css, js/, assets/, sw.js

## iOS stack
- Expo SDK 54, React Native 0.81.5
- expo-router ~6.0.23
- WebView wrapping the live web app URL
- expo-notifications for local notifications
- expo-font (manually linked — autolinking skips it)
- EAS Build (bundle ID: com.belific.app)
- Min iOS: 16.4

## Non-negotiable architecture decisions
1. Do not rewrite the web app — wrap it in WebView
   (web app is complete and live; duplication = drift)
2. Web app URL is always https://najeca.github.io/belific/
   (lowercase — GitHub Pages is case-sensitive)
3. Notifications are local only — no server needed
   (expo-notifications scheduled on-device)
4. Polyfill order in mobile/index.js:
   react-native-get-random-values → process → Buffer → expo-router/entry
5. Bottom tab bar only — never hamburger menu
   (iOS HIG compliance)
6. babel.config.js must exist in mobile/
   (without it Metro bundle crashes on launch)
7. useSafeAreaInsets() — never hardcoded paddingTop
8. Touch targets minimum 44×44pt

## Do not touch without explicit instruction
- index.html, css/, js/, sw.js — web app is live and complete
- manifest.json — PWA config, do not break PWA behaviour

## Three notification types
1. Custom reminders — user sets time and message
2. Weekly summary — fires every Sunday at 6 PM
3. Streak at risk — fires daily at 8 PM unconditionally

## Quality gates before every commit
Run `bash .claude/skills/workflow/security-review/scripts/security-scan.sh`
- Zero as any in TypeScript
- Zero hardcoded credentials
- Zero console.log of sensitive values
- useSafeAreaInsets() — never hardcoded paddingTop
- Touch targets minimum 44×44pt
- docs/current-state-audit.md updated

## Toyota Yaris philosophy
Simplest solution always. No abstractions beyond what the task requires.
If three similar lines exist, that is fine. Do not extract prematurely.

## Domain language
See docs/UBIQUITOUS_LANGUAGE.md for full glossary.
Belific — always capitalised exactly this way
Pomodoro — the focus-timer technique
Schedule — the user's daily plan
Reminder — a user-defined notification
Weekly Summary — the Sunday 6 PM digest notification
Streak at Risk — the daily 8 PM nudge notification

## Session protocol
Opening message every session:
Read docs/current-state-audit.md, docs/architecture.md,
docs/UBIQUITOUS_LANGUAGE.md, and docs/CLAUDE.md then summarise.

Closing message every session:
Run /workflow/session-close

## Claude Code Skills

| Skill | Flag | Purpose |
|-------|------|---------|
| `workflow/ios-build` | — | Full iOS build sequence with all Podfile patches |
| `workflow/session-close` | `user_invocable: false` | End-of-session housekeeping |
| `workflow/security-review` | `disable_model_invocation: true` | Quality gates before commit |
| `workflow/testing` | — | Device testing checklist |
| `features/notifications` | — | Local notification types and scheduling |
| `features/webview` | — | WebView URL and configuration |
