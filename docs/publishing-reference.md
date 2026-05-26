# Belific — App Store Publishing Reference

---

## App Metadata

| Field | Value |
|-------|-------|
| App Name | Belific |
| Bundle ID | `com.belific.app` |
| Apple Team ID | `9PG7ANYKDV` |
| Category | Productivity |
| Min iOS | 16.4 |
| Device | iPhone only (`supportsTablet: false`) |

---

## EAS Build

```bash
cd mobile/
eas build --platform ios --profile production
```

Profiles defined in `mobile/eas.json`:
- `development` — local dev client
- `preview` — ad-hoc distribution (device install)
- `production` — App Store submission

---

## App Store Privacy Label

### Data Not Collected
Belific collects no user data. There is no account, no backend, no analytics.

**NSPrivacyCollectedDataTypes:** None

### Required Reason APIs
| API | Reason Code | Justification |
|-----|------------|---------------|
| `NSUserNotificationsUsageDescription` | Required for local notifications | User-scheduled reminders, weekly summary, streak nudge |

---

## App Store Description (Draft)

**Short description (30 chars):**
Daily schedule + Pomodoro timer

**Full description:**
Belific helps you follow your daily schedule with focus.
Build your week, stay on track with Pomodoro sessions,
and get gentle reminders when your streak is at risk.

No account. No tracking. No cloud. Everything stays on your device.

**Keywords:**
schedule, pomodoro, timer, productivity, focus, daily planner, reminder, routine

---

## Pre-Submission Checklist

- [ ] EAS production build passes with zero errors
- [ ] App launches on physical device (Release config)
- [ ] WebView loads `https://najeca.github.io/belific/` correctly
- [ ] Notification permission prompt appears on first launch
- [ ] Weekly Summary fires at correct time in simulator
- [ ] Streak at Risk fires at correct time in simulator
- [ ] Custom Reminder creates and fires correctly
- [ ] App icon correct (1024×1024, no alpha)
- [ ] Screenshots prepared (6.7" and 6.1" sizes)
- [ ] Privacy policy URL live (required by App Store)
- [ ] `ITSAppUsesNonExemptEncryption: false` in `app.json` ✅

---

## Related Notes
- [[architecture]]
- [[current-state-audit]]
