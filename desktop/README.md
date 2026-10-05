# Belific desktop (Windows)

Electron shell around the Expo web export (decisions 009, 010 and 011). The web export is an internal build step: it is served from `mobile/dist` through an `app://` protocol, never hosted and never opened in a browser.

Install once with `npm install` in this folder, then:

```
npm run desktop
npm run desktop:dev
```

`npm run desktop` exports the Expo app for web and launches Electron on the export. `npm run desktop:dev` loads the Expo dev server on `http://localhost:8081` (start it from `mobile/` first) and uses a separate `-dev` data folder, so development never touches real data.

Your data lives in the app's user data folder under `data/`, with a daily copy in `backups/` (the newest 14 are kept). The File menu has "Export data…" and "Open backups folder".
