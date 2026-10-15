# Belific: EAS build for TestFlight (2.18.1, shared Supabase project)

Belific specific. The Landis `eas-build` skill under `.claude/skills/workflow/eas-build/` and `docs/publishing-reference.md` are **stale for this app** (they say so at the top now); use this file.

**Scope.** One build of 2.18.1 for **TestFlight internal testing only**. It is never submitted for App Store review. Nothing here has been run: no EAS command, no Apple or Expo contact, no live Supabase contact was made while writing it. Every command below is Jethro's to run, and each `eas build` / `eas submit` still needs Jethro's "ready for EAS build" (`TESTING_PROTOCOL.md` section 2). EAS iOS builds are limited to 15 a month.

## 1. The waiver (one time, recorded 2026-10-15)

The rule "local Release build on the iPhone, Jethro tests, Jethro is happy, only then EAS" (`TESTING_PROTOCOL.md` sections 1, 3 and 5; decision 018's device test) is **waived once, for a TestFlight only build of 2.18.1**. Why: this Windows PC cannot build for iOS (`expo run:ios` needs a Mac) and no Mac is confirmed. The conditions:

- TestFlight **internal** testers only (Jethro). Never submitted for App Store review, never made public.
- Jethro still has to say "ready for EAS build" for the build and again for the submit.
- The first device test of the new sync stack, the project guard, the `belific` schema client and the phone's Google sign in is this TestFlight install. A failure there is expected information, not a regression of a tested build.
- The waiver covers **this build only**. A second build, any App Store review submission and any public release need the normal device Release test first (on a Mac, or another route agreed by Jethro).

## 2. What is in the repo (all uncommitted until Jethro reviews)

| File | Setting | Checked how |
|---|---|---|
| `mobile/eas.json` | `build.production.environment = "production"`: the build reads the **production** EAS environment variables. Nothing else was added (no remote versioning, no auto increment). | `mobile/lib/easConfig.test.ts`; the file validates against the installed eas-cli 18.8.1 schema (offline, `@expo/eas-json`: spelling only) |
| `mobile/app.json` | `version` 2.18.1, `ios.buildNumber` "1", bundle `com.najeca.belific`, scheme `belific` | `easConfig.test.ts` |
| not in the repo | the project URL and the publishable key | they live in EAS only |

The URL and the key are **never** written to `eas.json`, `app.json`, a doc or a chat. `mobile/.env` is gitignored and EAS does not upload it, so without the two variables below the app **crashes at launch** (`mobile/lib/supabase.ts` throws when either is missing), and with old values left in EAS it would silently talk to the old project.

## 3. Build numbers (kept simple, decided 2026-10-15)

`eas.json` has **no** `appVersionSource` and **no** `autoIncrement`. The build number is the one in `mobile/app.json` (`expo.ios.buildNumber`, now "1") and **it is raised by hand there** if a rebuild is needed (a TestFlight build number must be unique within a version, so "1", then "2", and so on).

- **Before the first upload, check in App Store Connect that version 2.18.1 build 1 is unused** (nobody has uploaded it before). **Unverified**: I cannot see App Store Connect. If it is used, raise `buildNumber` first.
- A new version string (2.18.2, 2.19.0) starts again at "1".
- Raise it in a normal commit (and a changelog line if the version changes), then build again. Each build counts against the 15 a month.

## 4. Variables (Jethro, on this PC, in `mobile/`)

1. `eas whoami` shows the owner `jetmakes`.
2. `eas env:list --environment production`. If `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` exist, they very likely hold the **old** project: update them, do not add duplicates.
3. Set (or update) both, plaintext visibility is acceptable: `EXPO_PUBLIC_` values are compiled into the app anyway, and the key is the publishable one meant to be public. Type the key yourself; it is in `mobile/.env`. Run `eas env:create --help` / `eas env:update --help` for the exact flags first: the spelling here is **unverified**.
   - `EXPO_PUBLIC_SUPABASE_URL` = `https://vlogfwnmaqorhialcqbr.supabase.co`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = the new publishable key (starts `sb_publishable_`)
   - EAS may refuse the `secret` visibility for `EXPO_PUBLIC_` names (**unverified**); plaintext or sensitive is right for these two.
4. `eas env:list --environment production` again and read the URL back: it must be the new host. Do not paste the key anywhere.
5. Values are compiled in at build time, so changing them later needs a new build.

## 5. Order of work

1. Decisions are made (phone: Google added, Apple stays, linking before public release; phone sign out local scope; the waiver above).
2. Review and commit the working tree (Jethro). Gates before the commit: `cd mobile && npx tsc --noEmit && npm test`, `cd desktop && npm test`, `npx expo export --platform ios --output-dir <folder outside the repo>` then `npm run check:ios-markers -- <folder>`, the security scan, and `npm run test:real:cp6` and `cp12` in `desktop/`.
3. Dashboard work in the shared project, appended and never overwritten (`docs/CURRENT_TRUTH.md`, "Shared with Landis and Proload"): Apple Client IDs gets `com.najeca.belific`; the Google provider is already working for the desktop and the phone uses the same client and callback; `belific://auth-callback` is already in the redirect list (the desktop uses it).
4. Variables (section 4).
5. **Safety copy of the phone first.** The iPhone app has no export or backup. Make a fresh **encrypted device backup** from a computer (Finder or iTunes, "Encrypt local backup"): it includes Belific's local data. This is the only copy of the data that was never synced.
6. "ready for EAS build" from Jethro, then in `mobile/`: `eas build --platform ios --profile production`.
7. Upload to TestFlight: `eas submit --platform ios --profile production` (the CLI will ask for the App Store Connect app and Apple sign in; there is no `submit` block in `eas.json`), or download the `.ipa` and use Transporter.
8. In App Store Connect: wait for processing, answer export compliance if asked (`ITSAppUsesNonExemptEncryption` is already false), add the build to an **internal** group, install from TestFlight on the iPhone. **Do not** add it to an external group and **do not** submit it for review.
9. First launch checks (nothing is written in the repo about their results): the app opens; Settings, Account shows **Sign in with Apple** and **Sign in with Google**; Sign in with Google opens Safari, you choose the Google account, Safari offers to open Belific, the app returns to Settings and shows the account; the dashboard shows the same user as the desktop; the phone's rows appear in the `belific` tables; the desktop shows the phone's data after its next sync; Sign Out on the phone does **not** sign the desktop out. The phone shows no sync status yet: look at the dashboard.
10. Keep the old project until the phone's data is confirmed in the new one.

## 6. Rollback

The old project keeps everything 2.1.0 synced up to the switch, and the new build never writes to it. To go back:

1. Delete the TestFlight build from the phone and install **Belific 2.1.0 from the App Store**. iOS will not install an older build over a newer one, so deleting the app is required, and **deleting removes the phone's local data**. That is why the encrypted device backup (section 5, step 5) comes first.
2. Sign in with Apple in 2.1.0: it pulls what the old project holds.
3. What is lost by rolling back: anything created or changed on the TestFlight build. It stays in the new project under the user it used (and in the backup); nothing copies it back to the old project.
4. Rolling back does not touch the shared project, Landis or Proload. If the phone's upload put unwanted rows in `belific`, remove them in the dashboard with a backup first (they are the signed-in user's rows only).

## 7. Not covered, still open

- App Store review: blocked on the delete-account decision and on the privacy page and terms (`privacy.html` and `terms.html` say Google is Windows only; they must say the iPhone too before anyone other than Jethro can install it). See `docs/CURRENT_TRUTH.md`, Still pending.
- Linking the Apple and Google logins for one person ("Add a sign in method", needs the manual linking switch in Supabase): before public release, not in this build.
- A visible sync status on the phone: on the iOS catch-up list.
