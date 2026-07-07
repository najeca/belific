# Belific Testing & Deployment Protocol

## 1. LOCAL USB BUILD FIRST — ALWAYS

Every change must be tested locally before anything else:

```
npx expo run:ios --device 00008150-000438D40A92401C --configuration Release
```

This is free and unlimited. Use it for all development testing.

## 2. NEVER RUN EAS BUILD WITHOUT EXPLICIT APPROVAL

Do not run `eas build`, `eas submit`, or `eas update` under any circumstances
unless Jethro explicitly says:

> "ready for EAS build" or "run the EAS build"

EAS iOS builds are limited to 15 per month. Every unauthorised build is a
wasted resource.

## 3. THE GATE BETWEEN LOCAL AND EAS

```
Local build → Jethro tests on iPhone → Jethro says he is happy
→ only then suggest EAS build → wait for explicit approval before running it
```

## 4. EAS IS FOR DISTRIBUTION ONLY

EAS build is used only when Jethro is fully satisfied and wants to distribute
via TestFlight or App Store. It is never used for development testing.

## 5. PRE-BUILD CHECKLIST (local builds only)

Before every local build confirm:

- [ ] App launches without crashing
- [ ] All 4 tabs load correctly
- [ ] Notifications fire with sound
- [ ] No Metro server connection required
- [ ] Release configuration confirmed, not Debug
