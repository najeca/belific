---
name: testing
description: Run before every EAS build and after every device install. Confirms all Belific features work correctly on device.
---

# Testing

## Instructions

### Step 1 — Confirm app is installed on device
```bash
cd mobile/
npx expo run:ios --device 00008150-000438D40A92401C --configuration Release
```
Or open the installed build directly on Jethro's iPhone (`00008150-000438D40A92401C`).

### Step 2 — Work through checklist

**WebView**
- [ ] App launches without crash
- [ ] WebView loads `https://najeca.github.io/belific/` correctly
- [ ] Schedule displays for today
- [ ] Pomodoro timer starts and runs

**Notifications**
- [ ] Permission prompt appears on first launch
- [ ] Custom Reminder can be created with a time and message
- [ ] Custom Reminder fires at the correct time
- [ ] Weekly Summary is scheduled (Sunday 6 PM)
- [ ] Streak at Risk is scheduled (daily 8 PM)

**Navigation**
- [ ] Tab bar visible at bottom
- [ ] Safe area insets correct (no content under status bar or home indicator)
- [ ] Tab switching works without crash

**Release build health**
- [ ] No Metro connection prompt (confirms Release config)
- [ ] No crash on background/foreground cycle

### Step 3 — Report result

If all pass: **TESTING PASSED**
If any fail: **TESTING FAILED** — list exact failures

### Step 4 — Update audit
Update `docs/current-state-audit.md` with test results and date.
