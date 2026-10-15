# Session 2026-10-15: move Belific to the shared Supabase project (code and docs only)

Target: project `vlogfwnmaqorhialcqbr`, schema `belific`. Old project: `uucycebkpgwbktdytxvr` (named here once, as history). **Not committed, not pushed, nothing staged.** No database, dashboard, Apple, Google or Supabase contact; nothing deployed; no real sign in; Landis and Proload files untouched. The app version is unchanged (2.18.0); a release needs its own bump.

## 1. Old address removal

- Already changed before this session: `mobile/.env` (not read into any output, not staged), `mobile/lib/supabase.ts`, `desktop/main.js` (host constant and CSP both come from `SUPABASE_HOST`), `desktop/src/externalLinks.js`, the desktop tests.
- Fixed this session: `docs/APPLE_SIGNIN_SETUP.md`, `docs/GOOGLE_SIGNIN_SETUP.md`, `docs/CURRENT_TRUTH.md` (new callback URL and project), and three stale rules that said "never touch the Landis project (`vlogfwnmaqorhialcqbr`)", which would now forbid the app's own project: `docs/CURRENT_TRUTH.md` (Hazards), `docs/NEXT_PLAN.md`, `docs/OPUS_PLAN_REVIEW_BRIEF.md` line 14.
- **Left on purpose (history of the old project), listed:** `docs/archive/NEXT_PLAN_2026-09-02.md` (2 hits), `docs/decisions/006-optional-accounts-reverses-003.md` (1), `docs/OPUS_PLAN_REVIEW.md` (3: the old CSP snippet, "PAUSED" status), `docs/OPUS_PLAN_REVIEW_BRIEF.md` line 177 (project description at the time), `docs/sessions/2026-10-06-cp6.md` (1), and this note. No other file in the repo has the old ref (git grep and a search of supabase, scripts, desktop, mobile config).
- **Rebuilt:** web export (`npm run dist` runs `expo export --platform web` into `mobile/dist`), Windows installer output (`desktop/dist`, unsigned local build, `Belific-Setup-2.18.0.exe`, plus `win-unpacked`), and an iOS export to a folder outside the repo.
- **Proof (search of the file bytes for the old ref and for `<ref>.supabase.co`):**

| Output | Files searched | Old ref | Old host | New ref (control) |
|---|---|---|---|---|
| web export `mobile/dist` | 40 | 0 | 0 | 1 (the JS bundle) |
| unpacked app `desktop/dist/win-unpacked` | 113 | 0 | 0 | 2 (`app.asar`, `resources/web` bundle) |
| iOS export (Hermes `.hbc`) | 44 | 0 | 0 | 1 (the `.hbc`) |

  **Could not search:** the `.exe` installer itself (NSIS compresses it). It is built from the unpacked app that was searched. `desktop/dist` yml files: 0 hits. The iOS marker gate also passed on that export (16 markers, 0 hits).

## 2. delete-account (code changed, NOT deployed)

`mobile/supabase/functions/delete-account/index.ts` plus the new `core.ts`:

- Deletes **only the caller's rows in the `belific` schema**: `custom_events`, `brain_dump_items`, `routines`, `routine_completions`, `tasks`, `projects`, `custom_categories` (7 tables, in that order). Every query is `client.schema('belific').from(t).delete().eq('user_id', id)`.
- The user id comes from `auth.getUser()` on the caller's JWT. The request body, query and other headers are never read.
- It **does not delete the auth user** (no `auth.admin`, no `deleteUser`).
- It now uses the **caller's own JWT client, not the service role key**: row level security (`user_id = auth.uid()`) is a second wall, so a bug could only reach the caller's rows. The function no longer reads `SUPABASE_SERVICE_ROLE_KEY`. (I changed one assertion in `securityScan.test.ts` that required the function to read it; it now requires that it does not.) This needs the grants and policies in the schema file; without them the delete fails with a 500.
- Kept: no user id in any log line, no raw error text in a response, CORS only `app://belific`. The two response sentences are unchanged on purpose (`authCore.test.ts` pins `The account could not be deleted`).
- Tests: `mobile/lib/deleteAccountCore.test.ts` (user id source, table list equals the schema file and the sync tables, schema on every query, no auth user delete, no service role, logging and CORS).

### Everywhere the app, privacy page and terms say the account is deleted (wording NOT changed)

| Where | Current text |
|---|---|
| `mobile/app/settings.tsx:118-119, 134, 141, 313-317` (iPhone) | Alert "Delete Account": "This permanently deletes your account and every synced item on the server. Data on this device is not affected. This cannot be undone." Button "Delete Account". Error "Could not delete your account. Please try again." |
| `mobile/components/desktop/SettingsPage.tsx:81, 85, 118-130` (Windows) | Button "Delete account". Confirm: "This deletes your Belific account and the data synced to it, on every device. Data stored on this computer is kept." Result: "Account deleted. Your data on this computer was kept." Failure: "... Your account has not been deleted ..." |
| `mobile/lib/desktopAuth.ts:289`, function `FAILED` | "The account could not be deleted. Please try again." |
| `privacy.html:73` | "It is removed completely when you delete your account." |
| `privacy.html:90` | "... choose Delete Account ... This removes your synced data and your Belific account from the server. The data already on the device is not removed." |
| `terms.html:55-56` | "You can delete your account and its synced data in the app ... Deleting your account does not remove the data stored on your devices." |
| docs | `docs/APPLE_SIGNIN_SETUP.md`, `docs/GOOGLE_SIGNIN_SETUP.md` (updated), App Store privacy answers (not in the repo; check them) |

With the new function, "account" is wrong everywhere above: the sign in survives, only Belific's data goes.

### Proposed wording

**Delete Belific data** (what the function now does):
- Button: "Delete my Belific data".
- Confirm: "This deletes everything Belific has saved for you on the server: tasks, notes, events, labels, routines and their history. It is removed on all your devices the next time they sync. Your sign in stays, and data stored on this device is kept. This cannot be undone."
- Result: "Your Belific data was deleted from the server. Data on this computer was kept."
- Failure: "Your Belific data could not be deleted. Please try again."
- Privacy page: "You can delete the data Belific has stored for you on the server in the app (Settings, Delete my Belific data). The sign in itself (your Apple or Google account with the service that hosts Belific) is not removed by this."
- Terms: same idea; drop "delete your account".

**Delete account** (only if the sign in is really removed, see the open decision):
- "This deletes your Belific data and your sign in. Your sign in is shared with other apps by the same developer, so they lose it too." The exact text depends on the option chosen below.

### OPEN DECISION for Jethro: Apple account deletion (guideline 5.1.1(v))

Apple expects an app with account creation to offer deleting that **account**, not only its data, and (for Sign in with Apple) to revoke the Apple tokens (plan in `docs/sessions/2026-10-08-cp12.md`, item 8; not built). On the shared project the auth user is shared with Landis and Proload, so deleting it would also delete their data (their tables cascade on `user_id`) and sign the person out of those apps. Options:

1. **Delete Belific data only** (what the code does now). Simplest and safe for the other apps, but the user still has an account, so it probably does **not** meet 5.1.1(v) as written. Needs honest wording (above) and an App Review answer.
2. **Delete the shared account** (auth user plus every app's data). Meets the rule, but destroys data in the other apps from inside Belific. Needs a shared account deletion that every app agrees on, and the Apple token revocation. Wording must name the other apps.
3. **Belific data plus detach Belific from the account**, leaving the auth user while the person has no data in any app, and delete it only then. Needs a cross app check that Belific cannot do from its own schema.
4. **Belific keeps its own users**: stay on a separate project (undoing this move).

I recommend deciding this before the delete function is deployed or the wording changes, and not shipping the iPhone build with the move until it is decided (the live iPhone 2.1.0 still talks to the old project and its own delete function, which is unchanged there).

## 3. Docs

- `docs/CURRENT_TRUTH.md`: new backend facts, the section "Shared with Landis and Proload" (provider settings, redirect URLs, email templates, SMTP, password rules, the Apple Client IDs field that must keep every app's IDs, the single Apple secret that may conflict with another app's Services ID: **unverified**, Google client, function names, quotas), what Jethro must change for the new callback, and how a device switches project.
- The two sign in guides start with a banner pointing at that section and say, in the Client IDs, secret, redirect and test steps, what changes on a shared project.
- `docs/NEW_PROJECT_SYNC_TEST.md`: the manual checklist, including cleanup of the throwaway user.

## 4. Project switch safety

### Investigation (read in code, then tested)

- **Session:** supabase-js stores it under `sb-<project ref>-auth-token`, so a client for the new project cannot see the old project's session. Proved in `projectGuard.test.ts` with two real clients. The old blob stays in storage unread; removing it would mean naming the old ref in the code, so it is left (inert, and the next sign out/in overwrites nothing of it).
- **Pending sign in:** same keying for the PKCE verifier; the desktop main process keeps the live attempt in memory and `auth.cancel()` ends it.
- **Not namespaced, and these did carry over:** the sync cursors, caps and seen completions (`belific_sync_*`), the outbox and enabled flag, `belific_last_user_id`, the pending account choice, and a stored revoke-pending record holding the old project's tokens.
- **What would have gone wrong:** (a) a stale cursor makes the first pull on the new project incremental, and local rows are only queued for upload in a full pull (`mergeRows` mode `full`), so **local data would never have reached the new project**; (b) the old outbox would be pushed under the new account's user id; (c) a leftover pending choice would show a dialog for a user that does not exist there; (d) the old last user id would be compared with the new one (different, so the account question would still appear, but only by luck).

### Fix (small, implemented with tests)

`mobile/lib/projectGuard.ts` (pure) wired in `sync.ts` as `ensureCurrentProject()`, called before any sign in starts, before a callback is exchanged, at account choice restore, and at the top of `runFullSync` and `onSignedIn`. A fingerprint `host/schema` is stored in `belific_sync_project`. If it differs, **or is missing while sync state exists** (every install made before this, all from the old project): end any pending sign in, sign out locally, drop the revoke-pending record, turn sync off and empty the outbox, remove caps, seen completions, all cursors and the pending choice, set the last user id to the `deleted` marker, then write the fingerprint. Local data is kept. The next pull is full (so every local row is queued for upload), and the existing account choice flow handles the rest: on the desktop, with local data, the person chooses upload or start empty (backup first). A fresh install only writes the fingerprint. If emptying the outbox fails, the fingerprint is not written and the guard runs again next time.

Not covered, by design: the iPhone has no account choice prompt, so its first sign in on the new project uploads its local data to whatever account signs in. The old project's data (about 1,800 events, per CURRENT_TRUTH) is **not** copied anywhere; only what is on each device re-uploads.

## 5. Database files (written, NOT applied)

No `belific` schema migrations existed: all five files in `mobile/supabase/migrations/` target `public` of the old project. New, in `mobile/supabase/belific_schema/`: `001_belific_schema.sql`, `001_belific_schema_rollback.sql`, `README.md`. They are outside `migrations/` on purpose so `supabase db push` cannot pick them up (and the old files must never be run on the shared project). Contents: 7 tables with every column the sync sends (subtasks, reminder_minutes, notes, task pipeline columns, color_key, deleted_at tombstones, `server_updated_at`), the trigger function in `belific` (not `public`), the `(user_id, server_updated_at)` indexes, row level security and the owner policy on every table, `usage` on the schema and table privileges to `authenticated` only, nothing to `anon` or `public`, nothing to `service_role`. `belificSchemaSql.test.ts` checks it statically (no `public.` reference, no drops, grants, RLS, every column the mappers send). **I could not run the SQL** (no database), so it is unproven against Postgres: syntax errors are possible. Applying it needs a backup and Jethro's go, then `belific` under Exposed schemas.

## 6. Testing

- `schemaProfile.test.ts`: the real `syncServer.ts` on a real supabase-js client with a fake fetch that, like PostgREST, answers 406 `PGRST106` unless reads carry `Accept-Profile: belific` and writes carry `Content-Profile: belific`; asserts every request (probe, pull, incremental pull, upsert, delete, all 7 tables) carries it, plus a control that a client without the schema is refused. The server adapter moved from `sync.ts` into `syncServer.ts` (same code, takes the client) so it can be tested.
- `syncEngine.test.ts`: the in-process FakeServer now refuses any adapter without the belific profile (and one new test for that).
- `docs/NEW_PROJECT_SYNC_TEST.md` for the real run.
- Nothing was tested against the real project.

## Gates

See the end of this note (filled in after the runs).

## Unverified / could not verify

- The SQL file has never run on Postgres. PostgREST behaviour (`PGRST106`, the profile headers) is from supabase-js and PostgREST docs and from the fake, not from the real project.
- Whether `belific` can be exposed and whether the shared project's roles/default privileges match what the file assumes (it sets its own).
- Apple: how one provider secret works with another app's Services ID; which IDs are in the shared Client IDs field today.
- Whether another function called `delete-account` exists in the shared project.
- Whether Apple accepts "delete Belific data" for 5.1.1(v) in a shared account (open decision above).
- The installer `.exe` itself could not be searched (compressed).

## Gate results (2026-10-15)

- `tsc --noEmit` (mobile): clean.
- `node --test` mobile: 432 pass, 0 fail (includes the new projectGuard, schemaProfile, deleteAccountCore and belificSchemaSql tests and the changed securityScan test). Desktop: 84 pass, 0 fail.
- iOS marker script on a fresh iOS export: OK, 16 markers, 0 hits.
- Security scan: passed (no credentials, no sensitive log lines, no `as any`, no staged .env).
- Real app checks (fake Supabase only): cp6, cp7, cp8b, cp8c, cp8d, cp8e, cp8f, cp8g, cp9, cp10, cp11, cp12 all exit 0. **cp8h is flaky**: 6 runs, 3 passed (52 checks, 0 fail) and 3 failed, each time at a different place (a repeating card's overflow menu or a drag hover not opening: "no element for [data-popover] ..."), which points to timing in the harness, not to the move. I did not run cp8h on the commit before this work, so "flaky before too" is unconfirmed. Nothing in this change touches drag, popovers or the Timebox.
- `docs/OPUS_PLAN_REVIEW_BRIEF.md` is gitignored: edited on disk, not in the diff.

## 7. Phone move to the shared project: findings and plan (2026-10-15, findings only, no code changed)

Status when written (per Jethro, not checked by me): the `belific` schema is **applied live** (7 tables, owner only row level security, `belific` exposed). Google sign in works on the rebuilt Windows app and landed on Jethro's existing Landis account, so Belific and Landis share one login. The desktop uploaded 36 tasks, 10 projects and 2 brain dump items. Desktop Apple sign in fails with "Invalid client id or web redirect url" (suspected, **unverified**: the Services ID lacks the new domain and return URL, or the shared Apple secret belongs to another app; parked). The old project still holds about 1,800 events plus a few tasks, routines and brain dump items of the Apple user from the iPhone; iPhone 2.1.0 still uses it. **Keep the old project until the iPhone has moved.** (The user id is not written here: the repository is public.)

Also found while investigating the Windows sign in (answered in chat, recorded here): the app that was launched first was the installed copy from 8 Oct (`%LOCALAPPDATA%\Programs\belific-desktop`), which still pointed at the old project. The rebuild had to be installed.

### 7.1 Phone build (app.json, eas.json, rules)

| Item | Value | Where |
|---|---|---|
| Bundle id (iOS) | `com.najeca.belific` (Android package `com.belific.app`, never reconciled, leave it) | `mobile/app.json` |
| URL scheme | `belific` | `mobile/app.json` |
| Version / build number | `2.18.0` / `"1"` (the App Store build is 2.1.0; the repo tag `v1.0-appstore` is 1.0.0) | `mobile/app.json` |
| Deployment target | 16.4; `usesAppleSignIn: true`; `ITSAppUsesNonExemptEncryption: false` | `mobile/app.json` |
| Build profiles | one: `production` (iOS, Release, distribution `store`, not simulator). No `preview`, no `development`, no `env`, no `autoIncrement`, no `appVersionSource`, no `submit` section. eas.json last changed 2026-07-07. | `mobile/eas.json` |
| EAS project | `90588798-2a74-4eba-91b6-b7127c3bc3dd`, owner `jetmakes` | `mobile/app.json` |
| eas-cli on this PC | 18.8.1 | `eas --version` |

**How `EXPO_PUBLIC_` values reach a build.** `mobile/lib/supabase.ts` reads `process.env.EXPO_PUBLIC_SUPABASE_URL` and `..._ANON_KEY`, which Metro inlines at bundle time, and **throws at import if either is missing** (so the app would crash at launch). `mobile/.env` is gitignored (`.gitignore`: `.env`, `mobile/.env`), and EAS Build's upload follows `.gitignore`, so **a cloud EAS build does not see `mobile/.env`**. eas.json has no `env`. So the values must come from EAS environment variables on Expo's servers. **Unverified and important:** whether such variables already exist for this project (the 2.1.0 build needed them somehow) and what they hold; they may hold the **old** project's URL and key, in which case the new build would silently talk to the old project. There is no `.easignore`. The key is the new `sb_publishable_` style key, which is designed to be public (it ends up in the app either way), so plaintext visibility is acceptable; it is still not to be pasted into chat or docs.

**Rules (all from Jethro):** `TESTING_PROTOCOL.md` section 2 and `docs/CURRENT_TRUTH.md` line 89: never run `eas build`, `eas submit` or `eas update` unless Jethro says "ready for EAS build" (or "run the EAS build"). EAS iOS builds are limited to 15 per month. Local USB Release build first (`npx expo run:ios --device <UDID> --configuration Release`), Jethro tests, Jethro says he is happy, only then EAS. Decision 018: gates (tsc, node --test, iOS export plus marker script) before a commit, and a real device Release build in batches before any TestFlight or EAS build.

**Things in the repo that are wrong for this and must not be followed blindly:**
- `.claude/skills/workflow/eas-build/` is the **Landis** skill (bundle `com.landis.app`, paths `apps/mobile`, `--local`, `EXPO_PUBLIC_API_URL`). Its scripts would not run here. Do not use it.
- `docs/publishing-reference.md` still says bundle `com.belific.app`, a WebView, a Pomodoro timer, and lists profiles `development` and `preview` that do not exist.
- `expo run:ios` cannot run on Windows. A device build needs a Mac (decision 018 mentions the Mac Mini "if it is kept"); an EAS cloud build is the only route from this PC. **Unverified:** whether a Mac is available.

**Exact commands, in order, for a TestFlight build against the new project** (every one of these is Jethro's; I have run none):
1. Go-ahead decisions first (section 7.6): Apple on the phone, and which accounts the phone should use.
2. `cd mobile`, check `eas whoami` shows owner `jetmakes`.
3. See what EAS already holds: `eas env:list --environment production`. If `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` exist, they probably hold the old project: **update** them (`eas env:update`), do not create duplicates.
4. Otherwise create them: `eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://vlogfwnmaqorhialcqbr.supabase.co --visibility plaintext` and the same for `EXPO_PUBLIC_SUPABASE_ANON_KEY` with the publishable key (type it in the terminal yourself; it is also in `mobile/.env`). Flag spelling is from eas-cli 18 documentation as I remember it: **unverified**, check `eas env:create --help`.
5. Tell the build to use that environment: add `"environment": "production"` to the `production` profile in `mobile/eas.json` (**a code/config change, not made; wait for review**). Without it EAS does not know which environment's variables to load for the profile.
6. Version: `app.json` is already 2.18.0 with build `1`. Version 2.18.0 has never been uploaded (unverified; check App Store Connect). If it has, raise `buildNumber` (or set `"appVersionSource": "remote"` and `"autoIncrement": true` in `eas.json`; the CLI's default for this is **unverified**, so check `eas build:version:get -p ios`). The App Store version must be higher than the live 2.1.0, which 2.18.0 is.
7. Gates on this PC: `cd mobile && npx tsc --noEmit && npm test`, `cd ../desktop && npm test`, `npx expo export --platform ios --output-dir <folder outside the repo> && npm run check:ios-markers -- <folder>`, and the security scan. (The marker list changes if Google is added to the phone, section 7.2.)
8. A device Release test before EAS: needs a Mac; otherwise this step is skipped and the TestFlight build is the first device test. Say so.
9. Jethro says "ready for EAS build". Then: `eas build --platform ios --profile production`.
10. Submit to TestFlight: `eas submit --platform ios --profile production` (needs the App Store Connect app id and Apple sign in; there is no `submit` block in eas.json, so the CLI will ask) or upload the build from the Expo page with Transporter.
11. In App Store Connect: wait for processing, answer the export compliance question if asked (already `false` in app.json), add the build to an internal TestFlight group, install on the iPhone.
12. Do **not** submit this build for App Store review before the open decisions in sections 2 and 7.5 are answered.

**Shared code changes since the 2.1.0 build that would reach the phone from `v2-redesign`.** I compared `4a6e7af` (the snapshot after the 2.1.0 commit `03f9618`) to HEAD: 97 files under `mobile/`, mostly `components/desktop/` (not in the iOS bundle: `app/index.tsx` imports `DesktopEntry`, which is an empty component on iOS) and desktop only libs. What reaches the phone:

| Change | Phone behaviour |
|---|---|
| **Sync rewrite** (`sync.ts`, `syncCore.ts`, `syncEngine.ts`, `syncServer.ts`, `outbox.ts`, `lock.ts`, `storage.ts` all writes go through a lock and an outbox) | **Changes.** 2.1.0 pushed one row per write fire and forget and reconciled on sign in and foreground. Now: a persisted outbox, paginated cursor pulls, tombstones win, a 120 second poll while active, a 1.5 second debounce after each write. Same tables. |
| **Project guard + belific schema** (`projectGuard.ts`, `dbSchema.ts`, `supabase.ts`) | **Changes.** All requests go to the `belific` schema of the new project. |
| `setTaskCompleted` in Today and Tasks (`app/(tabs)/today.tsx`, `app/tasks.tsx`, `taskActions.ts`) | **Changes.** Ticking a repeating task creates the next occurrence (series, decision 023). |
| New task fields: duration, start time, recurrence, subtasks, reminder minutes, priority pipeline (types, mappers) | Stored and synced; the phone UI does not show most of them. A desktop made repeating task appears on the phone as ordinary rows. |
| `app/_layout.tsx` | Foreground sync replaced by `startSyncLoop`; `requestPermissions` skipped only on web. |
| `kv.ts` | iOS still uses AsyncStorage unchanged; the session store is the same AsyncStorage. |
| `auth.ts` | Apple sign in unchanged except it first runs `ensureCurrentProject`; sign out and delete unchanged. |
| `package.json` | Adds `react-dom`, `react-native-web`, `@expo/metro-runtime` (web export only); no new native module, so no new pod. Expo SDK 54 / RN 0.81.5 unchanged. |
| `app.json` | version only (plus a `web` block). |
| Supabase Edge Function | not part of the app bundle. |

Unchanged on the phone: tabs, Brain Dump, Calendar, notifications (still local only), Settings layout, the Account section (still "Sign in with Apple" only).

**Unverified:** that the iOS Release build works on a device at all with all these changes (decision 018: gates 1 to 3 pass on Windows, "Shipped to iOS" needs a device test). The iPhone checklist in `docs/sessions/2026-10-06-cp5.md` has not been run.

### 7.2 Phone sign in: what exists, and the smallest safe way to add Google

**Today (iOS):** `mobile/app/settings.tsx` Account section shows one button, "Sign in with Apple" (native sheet, `expo-apple-authentication`), then `signInWithIdToken({ provider: 'apple' })` in `mobile/lib/auth.ts`. No Sign in page, no Google, no email. Signed in it shows "Signed in as <email or Apple ID>", **Sign Out** and **Delete Account**. `authCore.ts`'s header says explicitly that nothing on the phone imports it. The Sign in page (`SignInPage`) and all `startGoogleSignIn` code are desktop only and are **markers** in `mobile/scripts/ios-markers.js`, so they must not appear in the iOS bundle.

**Option A (recommended as smallest): system browser with PKCE and the existing `belific://auth-callback`, no new native module.**
- `app.json` already has `"scheme": "belific"`, so iOS will hand `belific://auth-callback?code=...&sb_flow_id=...` back to the app.
- Use the same flow as the desktop: `signInWithOAuth({ provider: 'google', options: oauthOptions('google') })` with `skipBrowserRedirect`, open `data.url` with `Linking.openURL` (expo-linking / react-native are already installed; **`expo-web-browser` is not installed**, and adding it is a native module and a new pod), listen with `Linking.addEventListener('url')`, then `exchangeCodeForSession(code, { flowId })`.
- Needs `flowType: 'pkce'` on iOS too (`supabase.ts` sets it only when `belificDesktop` exists). `signInWithIdToken` is not affected by flow type, but this changes the shared client's behaviour on the phone, so it needs its own test.
- **expo-router will try to route the incoming `belific://auth-callback` link to a screen** (`/auth-callback`) and show "unmatched route"; it must be handled (a route file or the router's `redirectSystemPath`). **Unverified** on a device.
- The desktop's safety checks (`authLink.js`: pending sign in started in this run, time window, single use, flow id match, three failures) live in the Electron main process; the phone has none of that. A small pure copy of the same gate would need to be written and tested for the phone.
- Apple guideline 4.8: offering Google next to Apple is fine because Sign in with Apple is already offered.
- Google Cloud: no new OAuth client is needed (same web client and the same Supabase callback). The system browser path is allowed by Google (embedded web views are not).
- Weakness: it leaves the app for Safari and back; on a cancelled sign in the person lands in Safari and must return by hand.

**Option B: native Google SDK (`@react-native-google-signin/google-signin`) + `signInWithIdToken({ provider: 'google' })`.** Nicer sheet, but: a new native module and pod (the Podfile patches in `docs/IOS_BUILD_NOTES.md` already make builds fragile), a new **iOS** OAuth client in Google Cloud (Jethro), the reversed client id URL scheme in `Info.plist`, the iOS client id in Supabase's Google provider "Authorized Client IDs", and nonce handling. More dashboard work and more native risk. Not the smallest.

**What from `authCore.ts` is reusable on the phone:** `SignInProvider`, `isSignInProvider`, `REDIRECT_TO`, `oauthOptions`, `accountLabel`, `FAILURE_TEXT`, `beginFailureText`'s sentences. All pure. **But** the file also exports `SIGN_IN_TEXT` including the string `'Continue with Google'`, which is an iOS marker, so importing the file would trip the gate. Either move the shared pure parts into a new file with no marker strings, or move `SIGN_IN_TEXT` out.

**What must stay out of the iOS bundle:** `desktopAuth.ts` (uses `belificDesktop.auth`, backups, the account choice), `SignInPage` and everything in `components/desktop/`, `SettingsPage`, `listenForAuthCallbacks`, `accountSwitch` UI wiring, the Electron-only `belificDesktop` bridge calls.

**Marker rules that would change** (`mobile/scripts/ios-markers.js`, `mobile/lib/iosMarkers.test.ts`, decision 018): remove `startGoogleSignIn` and `Continue with Google` from `MARKERS` **on purpose** (whoever ships it says so in the commit, same rule as `seriesStreak`); keep `SignInPage`, `listenForAuthCallbacks`, `startAppleSignIn` (desktop names) and add desktop only names that must still stay out, for example `belificDesktop.auth`, `answerAccountChoice`, `signOutDesktop`; give the phone's new functions names that do not collide (for example `signInWithGooglePhone`). `iosMarkers.test.ts` pins the current list in "the marker list includes ...", so it must change with it. `securityScan.test.ts` may also pin sign in code; check when it is built.

### 7.3 First launch of the new build with Jethro's existing local data

1. **Does the project guard run on the phone?** Yes. `ensureCurrentProject()` is in shared `sync.ts` and is called by `runFullSync()` (every launch, foreground and 120 second tick) and by `signInWithApple()`. Only `cancelPendingSignIn` is desktop specific (it uses `belificDesktop?.`).
2. **What it does on the 2.1.0 to new upgrade.** 2.1.0 never wrote a project fingerprint, an outbox, a sync cursor, the enabled flag, or a last user id (its keys were only the app data and the Supabase session). So at first launch `belific_sync_project` is missing and none of the state keys exist: the guard returns `first`, writes the fingerprint `vlogfwnmaqorhialcqbr.supabase.co/belific` and **does not** sign out or reset anything (nothing to reset).
3. **The session.** supabase-js keeps the session under a key derived from the project ref (`sb-<ref>-auth-token`) in AsyncStorage. The new client looks under the **new** ref, so the old Apple session is **not found**: the phone shows "Sign in with Apple" as if signed out. The old session blob stays in AsyncStorage, inert (it is a refresh token for the old project; remove it only after the old project is retired). **Unverified on a device** (proved only by the desktop project switch test in `projectGuard.test.ts`).
4. **A device that already ran newer dev builds** (Jethro's local USB Release builds against the old project) will have sync state keys. There the guard returns `switched`: local sign out, sync off, outbox emptied, cursors and caps removed, `belific_last_user_id` set to the `deleted` marker (the phone never reads it), fingerprint written. Local data untouched.
5. **Cursor / outbox / last user id on the phone.** Cursors: none, so the first pull is `full`. Outbox: empty and disabled until a sign in turns sync on. Last user id: not used on the phone.
6. **Sign in, then the first full pass** (`onSignedIn`: enable sync, `engine.sync()`): probe the schema (columns `server_updated_at`, `duration_minutes`, `color_key`, `subtasks`, `reminder_minutes`; the live schema file has them all), pull every table in full, merge under the storage lock, push the outbox.
7. **Account choice screen: there is none on the phone.** `accountSwitch.ts` is wired only in `desktopAuth.ts`. On the phone the first sign in always uploads. `accountChoiceHeld()` returns false on iOS.
8. **What a full first pass does (`mergeRows`, `mode: 'full'`)** for each table, per row key:
   - on the server but not on the phone: **added** to the phone (nothing local is lost);
   - on the phone but not on the server: **queued for upload**, tombstones included;
   - on both: a server tombstone wins; a pending local change wins; a local tombstone is pushed again; otherwise the **newer `updatedAt` wins** (local only if strictly newer; equal goes to the server copy); local only fields are kept when the server copy lacks them.
   So it is a **merge, not a replace**, and **nothing is discarded** except the loser of a same-id conflict (the older version, by timestamp). Same-id rows between the phone and the desktop only exist if both are the same user and the same ids: the phone's 1,800 events and the desktop's tasks have different ids.
   Routine completions: server ones are added; local ones the server lacks are uploaded (never seen before means "made while sync was off").
9. **"Upload" vs "start empty".** These are the **desktop** choices. Upload: backup, set last user id, release the hold, sync merges as above. Start empty: backup, **clear all local data** (`clearAllData`: the seven user data keys and the sync bookkeeping), set last user id, **reload**, then the launch sync downloads that account's rows. Start empty discards the local data from the app (kept only in the labelled backup folder). **The phone has neither choice and no backup**: no pre sign in backup exists on iOS (the desktop's `backupNow` is a main-process feature; `grep` finds no backup code in `auth.ts`, `settings.tsx` or `_layout.tsx`). The phone's data is only protected by being merged additively. A safety export before the first sign in is a possible small addition (not designed).
10. **Which server rows the phone sees depends on which user it signs in as.** Apple on the phone creates or finds an **Apple user**, which will be empty in the new project: all of the phone's data uploads, the desktop's Landis user data is not visible to it. Only if the phone ends up on the **same user** as the desktop (Google on the phone, or the Apple identity linked, section 7.4) does it download the desktop's 36 tasks, 10 projects and 2 brain dump items and merge them with its own.
11. **Initial upload of about 1,800 events.** `BATCH_SIZE` = 500 rows per request, per table, so about 4 requests for `custom_events` (more when rows differ in which columns they carry: `groupByColumns` sends one request per distinct column set so a missing column never nulls data; a few extra requests, not hundreds). Pull page size is 1,000 and the loop pages until an empty page, so a server cap lower than that cannot truncate it. Batches go in table order (events, dump, routines, tasks, projects, categories), then completions in batches of 500. After each accepted batch the sent entries are removed from the persisted outbox, so **progress survives a failure or a kill**. On any error the drain stops at that batch, records a failure, and backs off `5 s x 3^(n-1)` up to 15 minutes; the next trigger (120 second poll while active, foreground, or the next full sync, which forces a drain) retries from the first unsent batch. Failures are held in the engine status (`lastError`) but **the phone shows no sync status anywhere** (`grep` finds no sync UI in `settings.tsx`), so a failing upload is silent to the person. **Unverified:** the real request size limit and statement timeout of the shared project for a 500 row upsert with the `server_updated_at` trigger (500 rows of events is roughly a few hundred KB; I expect it to pass, but it has never been run); the live `belific` privileges for `authenticated` (Jethro applied the file; I did not see it).
12. **Label collisions (decision 016).** A label is a `projects` row keyed `project-<time in base 36>` (`TaskForm.tsx`, `labels.ts`). Keys are per device and time based, so the phone's "Work" and the desktop's "Work" have **different keys and sync as two separate rows**; there is no merge by name on sync (`mergeRows` works by key). Label names are unique only within one device (`labelRules.ts`). After the phone and desktop meet on one user, same name labels appear twice in the phone's picker and the desktop's Labels page. The desktop can resolve it: deleting one moves its tasks to the other same name label (`deleteLabel` / `deletedLabelTarget`, a tombstone, synced). The phone can only add labels, not rename or delete them. If the phone stays on a separate Apple user, there are no collisions at all.
13. **The 2 routines.** They sync as ordinary `routines` rows (and completions). **Nothing converts automatically**: conversion to repeating tasks (checkpoint 10) is only reachable through the desktop's Settings, Data "Convert" row (`RoutineConvertRow`, `routineConvertActions.ts`, both desktop only and iOS markers), behind a backup gate, and has an Undo. The phone's Today screen still shows routines as before. `docs/CURRENT_TRUTH.md` (Still pending) says to convert only when ready, ideally after the iOS catch up release.

### 7.4 Apple on the iPhone against the new project

- **What `signInWithIdToken({ provider: 'apple', token })` does.** The app asks Apple's native sheet for an identity token (audience = the app's bundle id `com.najeca.belific`), Supabase verifies it against Apple's keys and checks the audience against the Apple provider's **Client IDs**. If an identity with Apple's stable `sub` exists, it signs that user in; if not, it creates a user (or links, below). It does not use the Apple secret (that is for the browser flow). Needs the Apple provider **enabled** in the shared project and `com.najeca.belific` in its Client IDs.
- **New user or link by email.** Supabase's documented default is to link a new identity to an existing user only when the email is the same and verified, and to create a separate user otherwise [unverified in this project]. Apple's token carries a real email only if the person did not choose "Hide My Email"; otherwise it is a `...@privaterelay.appleid.com` address, which will not match the Google address, so Supabase would create a **second user** (separate Belific data). If the real email is shared and matches Jethro's Google/Landis email, automatic linking may attach the Apple identity to the existing Landis user. Which of these happens for Jethro's Apple ID is **unknown**: look at the existing Apple user in the old project and at the Apple option's email, in the dashboard. (Also see `docs/ACCOUNT_LINKING_TEST.md`.)
- **Can the Apple identity be linked to the existing Google user from the app?** auth-js 2.111 (installed) has `linkIdentity(credentials)` with an overload for an **id token** (`linkIdentityIdToken`) as well as OAuth. So the phone could, while signed in as the Google user, ask Apple's sheet for a token and call `linkIdentity({ provider: 'apple', token })`. That needs (a) a way to be signed in as the Google user on the phone first (Option A in 7.2), and (b) the dashboard setting **manual linking enabled** (Authentication, Sign In / Providers or Auth settings: "Allow manual linking"; exact label **unverified**). It is not built; decision 026 left "Add a sign in method" for 2.19.0.
- **Client IDs entry the phone needs.** `com.najeca.belific` (the bundle id). Desktop browser Apple sign in additionally needs `com.najeca.belific.signin` (Services ID). The field is one comma separated list for the whole project: **append, never overwrite**, keep every ID Landis and Proload use; read the field first and copy it whole. What the field holds now is **unverified**.
- **Options (not decided):**
  1. **Phone stays Apple only, as an Apple user.** Nothing new to build; the phone is a separate account from the desktop (Landis/Google). Phone data uploads to the Apple user; no cross device sync between phone and desktop. Simplest, but the two apps do not share data.
  2. **Add Google to the phone (Option A).** Phone and desktop land on the same Landis user; the phone's data merges with the desktop's. Needs code, a device test and the marker changes. The phone's Apple button can stay.
  3. **Add Google and let a signed in person link Apple** (`linkIdentity`) so either button reaches the same user. More code and the dashboard linking setting. This is the "Add a sign in method" feature.
  4. **Make the desktop's Apple sign in work** (parked) and use Apple everywhere. Depends on the Apple Services ID and secret; shares a single Apple secret with other apps (unverified).
  5. **Sign in the phone as the Apple user first, then later move that Apple identity** to the Google user. Not supported by a simple call (two users cannot be merged by the client); would need a manual data move. Not recommended.
- Related: **the phone's Sign Out is global** (`auth.ts`: `supabase.auth.signOut()` with no scope, the default), so on a user shared with the desktop (options 2 and 3) it would sign the desktop out too. The desktop uses `scope: 'local'` for exactly this reason (2.11.2). The phone's delete account also ends with a global sign out.

### 7.5 delete-account stays data only, not deployed: must be revisited before any public release

`mobile/supabase/functions/delete-account` deletes the caller's rows in the 7 `belific` tables and **does not delete the login**. That is deliberate while the login is shared with Landis and Proload. **Before any public App Store release (or any release that a person other than Jethro can use):** answer the Apple account deletion expectation (guideline 5.1.1(v): an app that supports account creation must let the person initiate deletion of the account from within the app; whether "delete Belific data" with the login kept meets it is **unverified**), then fix the user visible wording together. The four options are in section 2. Wording that currently over promises and must be fixed with it (not changed here): the phone's Delete Account alert ("permanently deletes your account and every synced item on the server"), the desktop's Settings, Account, Delete account text, `privacy.html` and `terms.html` where they say the account is deleted, and the App Store privacy answers. The 2.1.0 App Store build still calls the **old** project's function, which still deletes the auth user there. Also: the same Apple user in the old project is **not** shared with other apps, so deleting it there is still true for 2.1.0 users.

### 7.6 Exact ordered step list for Jethro

Nothing below has been done. Items marked (decision) need your answer before the next one.

1. (decision) Which accounts should the iPhone use: options 1 to 5 in 7.4. This decides whether any code is needed before TestFlight.
2. Do not delete or pause the old project. Take a backup of the old project's data first if you have not (the ~1,800 events live only there and on the phone): Supabase dashboard of the old project, Database, Backups, or `pg_dump`. This is the only copy besides the phone.
3. In the shared project dashboard, read (do not change yet) Authentication, Providers, Apple: write down what Client IDs holds, whether Apple is enabled, which Services ID the secret was made for.
4. Add `com.najeca.belific` to the Apple Client IDs, appended to the existing list (and `com.najeca.belific.signin` only if you continue with the desktop Apple fix).
5. If you chose a linking option: enable manual linking in Auth settings (label unverified).
6. Check that no other app already has a `delete-account` Edge Function in the shared project (do not deploy ours).
7. Check EAS env: `eas env:list --environment production`; update or create `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` with the new values (7.1 steps 3 and 4).
8. Review this note; then tell me which code changes to make (the `environment` line in `eas.json`, and for options 2 and 3 the phone Google sign in with marker changes and tests).
9. After the code is reviewed and committed by you: gates (7.1 step 7), then a Release build on a device if you have a Mac, otherwise accept that TestFlight is the first device test.
10. Say "ready for EAS build". Run `eas build --platform ios --profile production`, then `eas submit --platform ios --profile production` (or Transporter). Do not submit for App Store review.
11. Install from TestFlight. **Before the first sign in on the phone**, make your own safety copy of the phone's data (there is no in-app backup on iOS): the only copy of ~1,800 events outside the old project.
12. Sign in with the account you chose. Watch Authentication, Users (exactly one new or existing user, as expected) and the row counts in the `belific` tables (events about 1,800 for that user). Because the phone shows no sync status, check the dashboard to see that the upload finished; leaving the app open on the screen for several minutes helps (the poll is 120 seconds; backoff after an error can reach 15 minutes).
13. Check Landis and Proload still sign in and look unchanged.
14. Only when the phone has moved and you have checked the data: retire the old project (not before; 2.1.0 users, if any besides you, still use it).

### 7.7 Risks

1. **A cloud EAS build without the env values crashes at launch** (`supabase.ts` throws), and a build with **stale** EAS values talks to the old project silently. Check `eas env:list` first.
2. **Two users instead of one:** Apple on the phone probably makes a separate Apple user (relay address or no auto link), so the phone and desktop do not share data and the phone's Brain Dump/tasks will not match the desktop's.
3. **Shared login:** phone Sign Out is global; a delete or sign out on a shared user can end sessions of Landis and Proload (and desktop) as well. Landis tables are in `public` and are not touched by Belific code or by the delete function, but the auth user is shared.
4. **No phone backup and no account choice:** the first sign in uploads and merges automatically. It is additive (nothing local is removed), but a bad merge cannot be undone from the phone. Back up first (step 11).
5. **Silent sync failure on the phone:** no sync status UI; a failed upload (exposed schema, privileges, size) looks like nothing happened. Check the dashboard.
6. **Duplicate labels** once the phone and desktop share a user; the phone cannot clean them up.
7. **Untested on a device:** the whole new sync stack, the guard and the belific schema have never run on an iPhone; the first real device test is the TestFlight build if there is no Mac. The iPhone checklist in `docs/sessions/2026-10-06-cp5.md` is still open.
8. **App Store review:** a public release before the account deletion decision (7.5) risks rejection under 5.1.1(v) and the privacy page and terms would be inaccurate. Keep it in TestFlight.
9. **Old project is the only complete copy of the 1,800 events apart from the phone;** the 2.1.0 phone keeps writing there until it is replaced, so anything done on the old phone build after the TestFlight install is not in the new project.
10. **Stale repo guidance:** the `eas-build` skill is the Landis one; `docs/publishing-reference.md` is out of date; following either would build the wrong thing.
11. **Apple secret sharing and Client IDs** (unverified): editing the shared Apple provider can break Landis or Proload sign in. Append only.
12. **Browser callback on the phone (if Google is added):** `belific://auth-callback` is also parsed by expo-router as a route; untested.

### 7.8 Could not verify

The live state of the shared project (schema applied, privileges, exposed schema, Apple/Google provider settings, redirect URLs, whether a `delete-account` exists), EAS's stored environment variables and `appVersionSource`, whether 2.18.0 build 1 was uploaded before, a Mac for a device build, how Supabase links an Apple identity to the existing user in this project, the exact dashboard label for manual linking, `eas env` flag spellings, the request size and timeout behaviour of a 500 row upsert, and anything about the phone at runtime (all conclusions about the phone are from reading the code and the tests).
