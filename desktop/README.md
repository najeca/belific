# Belific desktop (Windows)

Electron shell around the Expo web export (decisions 009, 010 and 011). The web export is an internal build step: it is served from `mobile/dist` through an `app://` protocol, never hosted and never opened in a browser.

Install once with `npm install` in this folder, then:

```
npm run desktop
npm run desktop:dev
```

`npm run desktop` exports the Expo app for web and launches Electron on the export. `npm run desktop:dev` loads the Expo dev server on `http://localhost:8081` (start it from `mobile/` first) and uses a separate `-dev` data folder, so development never touches real data.

Your data lives in the app's user data folder under `data/`, with a daily copy in `backups/` (the newest 14 are kept). The File menu has "Export data…" and "Open backups folder".

## Sign in, notifications and the tray (versions 2.10.0 and 2.11.0)

- **Sign in with Apple** needs a one time setup on Apple's and Supabase's dashboards: see `docs/APPLE_SIGNIN_SETUP.md`. The app works fully signed out.
- Click the account line at the bottom of the left pane to open Settings: Account, Sync, Notifications, Window and Data.
- **Notifications** come from the main process, so they still arrive with the window closed. Event starts and tasks placed on the Timebox notify at their start time. An optional daily reminder (default 09:00, on) sends one grouped notification such as "3 tasks planned for today" for tasks with a Day but no time; it does not fire when there are none.
- **Close to tray** (on by default): closing the window keeps Belific running in the system tray. Right click the tray icon for Open Belific and Quit Belific; File, Quit also really quits. **Start with Windows** is off by default and only works in the installed app.

## Build the Windows installer

Unsigned, per user, no admin rights needed, no auto update.

```
cd desktop
npm install
npm run dist
```

`npm run dist` exports the web app, then runs electron-builder (NSIS). The output is in `desktop/dist` (git ignored, never commit it):

- `Belific-Setup-<version>.exe`, the installer (about 110 MB, it contains Electron). The version comes from `mobile/app.json`.
- `win-unpacked/Belific.exe`, the same app unpacked, for a quick try without installing. `npm run dist -- --dir` builds only this.

Needs internet the first time (electron-builder downloads its tools) and a Windows PC.

## Install

1. Double click `Belific-Setup-<version>.exe`. It installs for your user only (no administrator prompt) into `%LOCALAPPDATA%\Programs\Belific`, adds a Start menu entry and a desktop shortcut, and starts Belific.
2. **Windows SmartScreen** will say "Windows protected your PC" because the installer is not signed (signing costs money and is not set up). Click **More info**, then **Run anyway**. This is expected for this unsigned app; only run an installer you built yourself or got from Jethro. If the file came from a download, you can also right click it, open Properties, tick **Unblock** and press OK first.
3. Installing over an older version keeps your data.

## Where your data lives

`%APPDATA%\belific-desktop` (paste that into the Start menu's Run box):

- `data\` your tasks, events and settings (one file per kind; the sign in session is encrypted)
- `backups\` a copy of `data` once a day (newest 14) plus `…-pre-signin` (taken once, before your first sign in; kept)
- `logs\main.log` a small log with no personal content

The installed app and `npm run desktop` use the same folder. `npm run desktop:dev` uses `belific-desktop-dev`.

## Uninstall

Settings, Apps, Installed apps, Belific, Uninstall (or the Start menu entry's Uninstall). **Uninstalling does not delete `%APPDATA%\belific-desktop`**, so your data and backups stay. Delete that folder yourself only if you want everything gone (File, Export data first if unsure). Uninstalling also removes the Start with Windows entry.

## Checks

```
npm test                         pure tests (node --test)
npm run test:real:cp6            the real app, sign in paths, isolated data folder
npm run test:real:cp7            the real app, toasts and tray (takes about 2 minutes)
npm run test:real:cp7:installer  the same, plus build the installer and launch the unpacked app
```

The real checks use a throwaway data folder under the temp directory and assert it is not the real one. They never call the real Supabase project and never sign in.
