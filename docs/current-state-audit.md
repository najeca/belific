# Current State Audit — Belific
> Last updated: 2026-05-22

## Status

| Layer | Status | Notes |
|-------|--------|-------|
| Web app (PWA) | Complete and live | https://najeca.github.io/Belific/ |
| iOS app (Expo) | Not started | Expo project not yet initialised |
| Push notifications | Not implemented | expo-notifications not yet wired up |

## Web app files
```
index.html
manifest.json
sw.js
css/styles.css
js/app.js
js/data.js
js/notifications.js
js/schedule.js
js/storage.js
js/timer.js
js/ui.js
assets/icon-192.png
assets/icon-512.png
```

## What works
- Full PWA schedule and Pomodoro timer UI
- Service worker for offline capability
- Installable on home screen via PWA manifest

## What does not exist yet
- Expo / React Native project folder
- WebView wrapper loading https://najeca.github.io/Belific/
- expo-notifications integration
- Custom reminder scheduling
- Weekly summary notification (Sunday 6 PM)
- Streak at risk notification (daily 8 PM)
- EAS build configuration

## Next steps
1. Initialise Expo app inside repo (e.g. `mobile/`)
2. Configure WebView to load the live Belific URL
3. Install and configure expo-notifications
4. Wire up three notification types:
   - Custom reminders (user-defined time + message)
   - Weekly summary (Sunday 6 PM)
   - Streak at risk (daily 8 PM, conditional on no activity)
5. EAS build and test on physical iOS device

## Known constraints
- Web app must not be modified — it is the single source of UI truth
- Notifications are local only — no backend required
- Polyfill order in mobile index.js must follow Landis convention
