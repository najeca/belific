# CLAUDE.md — AI Agent Instructions for Belific

## Who reads this
Claude Code, Cursor, any AI agent working on this repo.
Read this before touching any file.

## What Belific is
A calm, focused productivity app: quick-capture Brain Dump, Tasks, a
planning view and an hourly Timebox, plus routines. One Expo/React
Native codebase (`mobile/`) ships as a **fully native iOS app** and,
in progress, a Windows desktop app (Electron wrapping the web
export, see the last section). The iOS app does not wrap or load any
web page. Current state lives in `docs/CURRENT_TRUTH.md`. A separate legacy PWA web app still
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
- expo-router ~6.0.23, 3 tabs: Today, Brain Dump (`inbox.tsx`), Calendar.
  Settings and Tasks are pushed screens (Focus/Pomodoro was removed in 2.1.0)
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
   (expo-notifications scheduled on-device on iOS; the Electron main
   process schedules them on desktop, decision 017); see
   [[002-local-notifications-only]]
3. Optional accounts: Sign in with Apple plus Supabase sync, see
   [[006-optional-accounts-reverses-003]] (003 is partly superseded).
   Local-only use stays fully supported; a signed-out user never
   touches the network.
4. Import/polyfill order in mobile/index.js:
   react-native-gesture-handler → react-native-get-random-values →
   process → Buffer → expo-router/entry
   (gesture-handler must be the very first import per its own setup
   requirement, ahead of the rest of the polyfill chain)
5. On mobile: bottom tab bar only — never hamburger menu (iOS HIG compliance)
6. babel.config.js must exist in mobile/ (without it Metro bundle crashes on launch)
7. useSafeAreaInsets() — never hardcoded paddingTop
8. Touch targets minimum 44×44pt (mobile)
9. Desktop rules (react-native-web): never `Alert.alert` (a no-op on web)
   or `@react-native-community/datetimepicker` (renders nothing on web)
   on a desktop path; use inline confirmations and web date/time inputs.
   No app data in `localStorage`; desktop data goes through
   `mobile/lib/kv.ts` (decision 011).
10. This repository is PUBLIC. Never commit `docs/seed-data/`, `.env`,
    personal schedules or device identifiers.

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
- docs/CURRENT_TRUTH.md updated

## Toyota Yaris philosophy
Simplest solution always. No abstractions beyond what the task requires.
If three similar lines exist, that is fine. Do not extract prematurely.

## Domain language
See docs/UBIQUITOUS_LANGUAGE.md for the full glossary — rewritten to
match the current mobile codebase (Custom Event / Template Event /
Category / Brain Dump / Task / Routine). Belific — always
capitalised exactly this way.

## Session protocol
Opening message every session:
Read docs/CURRENT_TRUTH.md, docs/UBIQUITOUS_LANGUAGE.md and
docs/CLAUDE.md, then summarise. (architecture.md and
current-state-audit.md are historical, July 2026.)

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
  then wrapped in Electron (decisions 009 and 010). The web export is an
  internal build step, never the shipped artifact. It is never opened in
  a browser by an end user and never has a public URL.
- **The marketing website** is a separate static site (see the
  `belific-landing` design canvas) whose job is to advertise the app and
  link to downloads. It shares no code with the app and is not built from
  the Expo web export.

If a task is ambiguous about which of these it means, ask before building
either one.
