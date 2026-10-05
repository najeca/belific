# CLAUDE.md — AI Agent Instructions for Belific

## Who reads this
Claude Code, Cursor, any AI agent working on this repo.
Read this before touching any file.

## What Belific is
A calm, focused productivity app for managing daily schedules and
tasks, with a Pomodoro timer and a quick-capture inbox. The mobile
app (`mobile/`) is a **fully native** Expo/React Native app — it does
not wrap or load any web page. A separate legacy PWA web app still
lives at the repo root (`index.html`, `css/`, `js/`, `sw.js`,
deployed at https://najeca.github.io/belific/); it is a distinct,
older artifact and shares no code or data with `mobile/`.

> [!WARNING] This file previously described the mobile app as a
> WebView wrapper around the web app (decision 001). That was true
> when this file was first written but is **no longer accurate** —
> the mobile app was rewritten as a native tabbed app and has its own
> UI, its own data model (`mobile/lib/types.ts`, `data.ts`,
> `storage.ts`), and its own AsyncStorage-backed persistence. Decision
> 001 is superseded; do not use it to justify reintroducing
> `react-native-webview` or a WebView-based screen.

## Mobile stack
- Expo SDK 54, React Native 0.81.5
- expo-router ~6.0.23, 5 tabs: Today, Inbox, Calendar, Focus, Settings
- No WebView, no `react-native-webview` dependency
- expo-notifications for local notifications only (see Notifications
  below) — expo-font manually linked (autolinking skips it, see
  `docs/IOS_BUILD_NOTES.md`)
- EAS Build — iOS bundle ID `com.najeca.belific`; Android package is
  still `com.belific.app` (these were never reconciled — flag this to
  Jethro if it becomes relevant, don't silently "fix" it)
- Min iOS: 16.4

## Non-negotiable architecture decisions
1. Mobile app is fully native — do not reintroduce a WebView (decision
   001 is superseded; see the design-identity skill and
   `mobile/lib/` for the current architecture)
2. Notifications are local only — no server needed
   (expo-notifications scheduled on-device); see [[002-local-notifications-only]]
3. No auth, no database, no Supabase — see [[003-no-supabase]].
   Covers custom events, timer settings, and Brain Dump items alike;
   all AsyncStorage, all on-device.
4. Import/polyfill order in mobile/index.js:
   react-native-gesture-handler → react-native-get-random-values →
   process → Buffer → expo-router/entry
   (gesture-handler must be the very first import per its own setup
   requirement, ahead of the rest of the polyfill chain)
5. Bottom tab bar only — never hamburger menu (iOS HIG compliance)
6. babel.config.js must exist in mobile/ (without it Metro bundle crashes on launch)
7. useSafeAreaInsets() — never hardcoded paddingTop
8. Touch targets minimum 44×44pt

## Design identity
Sage/cream "Quiet Function" theme — see
`.claude/skills/design-identity/SKILL.md` before any UI, theme, or
color work. It also carries the locked-in product-psychology rules
(no streak-guilt, notifications tied only to real commitments, smart
defaults never fabricated, progressive disclosure on task capture).
Read it before touching any screen.

## Do not touch without explicit instruction
- Repo-root `index.html`, `css/`, `js/`, `sw.js`, `manifest.json` —
  the legacy web PWA; unrelated to `mobile/`, out of scope unless
  explicitly asked

## Notifications — current, real behavior
Two types only, both local:
1. **Custom reminders** — user sets time and message (`scheduleCustomReminder`)
2. **Event start notifications** — fires when a *user-created* custom
   event begins; template/starter-routine events never fire one
   (`scheduleEventNotifications` filters on `event.isCustom`)

There is no weekly summary and no "streak at risk" notification —
both were removed (weekly summary was engagement-bait with no real
feature behind it; streak-at-risk never actually existed in code
despite being documented here previously). Do not re-add either
without discussing the psychology-rules implications first.

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
See docs/UBIQUITOUS_LANGUAGE.md for the full glossary — rewritten to
match the current mobile codebase (Custom Event / Template Event /
Category / Brain Dump, no streak concept anywhere). Belific — always
capitalised exactly this way.

## Session protocol
Opening message every session:
Read docs/current-state-audit.md, docs/architecture.md,
docs/UBIQUITOUS_LANGUAGE.md, and docs/CLAUDE.md, then summarise.

Closing message every session:
Run /workflow/session-close

## Claude Code Skills

| Skill | Flag | Purpose |
|-------|------|---------|
| `design-identity` | — | Sage/cream palette + locked-in product-psychology rules — read before any UI work |
| `workflow/ios-build` | — | Full iOS build sequence with all Podfile patches |
| `workflow/session-close` | `user_invocable: false` | End-of-session housekeeping |
| `workflow/security-review` | `disable_model_invocation: true` | Quality gates before commit |
| `workflow/testing` | — | Device testing checklist |
| `features/notifications` | — | Local notification types and scheduling |

`features/webview` is **stale** — it documents a `react-native-webview`
integration that no longer exists in this codebase (`react-native-webview`
isn't even a dependency). Do not follow it; flag it to Jethro rather
than acting on it.


## Desktop app vs. marketing website (do not conflate)

Two separate, unrelated things share the word "web" in this project:

- **The Windows desktop app** ships as an installable `.exe`: the shared
  Expo/React Native codebase exported with `expo export --platform web`,
  then wrapped in Electron or Tauri (decision 009). The web export is an
  internal build step, never the shipped artifact. It is never opened in
  a browser by an end user and never has a public URL.
- **The marketing website** is a separate static site (see the
  `belific-landing` design canvas) whose job is to advertise the app and
  link to downloads. It shares no code with the app and is not built from
  the Expo web export.

If a task is ambiguous about which of these it means, ask before building
either one.
