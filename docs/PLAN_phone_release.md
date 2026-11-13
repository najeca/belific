# Plan: Belific on the iPhone, TestFlight first, then App Store review

Written 2026-11-13 on `v2-redesign` at 3.53.1. Planning only: no app change, no build, no account or database change was made while writing it. The only outside contact was two read only commands (`eas whoami`, `eas build:list`).

## Where the iPhone app stands today

1. **It has been built many times.** EAS shows finished store builds of 1.0.0, 1.0.1 (build 5), **2.18.1 build 1 (20 Oct 2026)** and **2.27.1 build 1 (21 Oct 2026)**. An older version is live on the App Store: `docs/CURRENT_TRUTH.md` says 2.1.0, `docs/PHONE_RELEASE_3.0.0.md` says 2.18.1 (question 1). Neither doc records whether 2.18.1 or 2.27.1 reached TestFlight, or what the hand test found.
2. **Nothing since 2.27.1 has been built.** 3.0.0 (the phone catch-up), Shifts S5, Repeat until and Parts R6 and everything up to **3.53.1** exist only in code, checked in the web export at phone size.
3. **Config today:** `mobile/app.json` version **3.53.1**, `ios.buildNumber` **"1"** (raised by hand, no auto increment), bundle **`com.najeca.belific`**, scheme `belific`, iPhone only (`supportsTablet: false`), iOS 16.4 and up, `usesAppleSignIn`, `ITSAppUsesNonExemptEncryption: false`. `mobile/eas.json`: one `production` profile (store, Release, reads the `production` EAS environment), an empty `submit.production`. EAS project `90588798-…`, owner `jetmakes`.
4. **Tools on this Windows PC:** `eas-cli` 18.8.1 installed globally and signed in as `jetmakes` (25.2.0 is out), Node 26, git. No Mac, no Xcode, no simulator and no Transporter (Transporter is Mac only), so builds run in the EAS cloud and uploads go through `eas submit`.
5. **Done from the checklist:** the Apple Developer membership is paid (team `9PG7ANYKDV`, Individual), the explicit App ID has Push and Sign in with Apple, the App Store Connect record exists (the app is live), the EAS project and production profile exist, the phone has Apple and Google sign in, sign out is local, the calendar permission texts are in, the 3.0.0 hand test is written (`docs/PHONE_RELEASE_3.0.0.md` section 2), and the `privacy.html` and `terms.html` pages exist and are on `main`.
6. **Still open:** the device-test waiver for any build after the first; the production EAS variables (check they point at the shared project); the `delete-account` function is **not deployed** to the shared project, so the phone's Delete Account fails today; the privacy page and terms are out of date; no Apple token revocation; no account linking; no sync status on the phone.

---

## 1. What you do yourself, outside the code (in order)

Most of the paid setup is already done. Costs are for the UK in 2026; check the current price on the page itself.

| # | Step | Cost | Usual time |
|---|---|---|---|
| 1 | **Check the Apple Developer membership is still active** (developer.apple.com/account, Membership). Renew if needed. | £79 a year (already paid; renews yearly) | 5 minutes; a renewal is live within an hour |
| 2 | **Accept any new agreements** in App Store Connect (Business, Agreements) and on developer.apple.com. A pending agreement silently blocks uploads and TestFlight. | Free | 5 minutes |
| 3 | **Upgrade eas-cli and check your login:** `npm install -g eas-cli`, then `eas whoami` (should say `jetmakes`). | Free | 5 minutes |
| 4 | **Check the EAS variables** (`docs/BELIFIC_EAS_TESTFLIGHT.md` section 4): `eas env:list --environment production` in `mobile/` must show the shared project's URL and the `sb_publishable_` key. | Free | 10 minutes |
| 5 | **EAS plan.** The free plan gives about 15 iOS builds a month in a slower queue; that is enough here. The Starter plan (about $19 a month) only buys speed. | Free (or ~$19 a month) | Nothing to do |
| 6 | **Signing certificates and profile.** EAS makes and stores them on the first build if you let it sign in to Apple ("Do you want to log in to your Apple account?" yes). They already exist from the 2.x builds, so EAS should reuse them. | Free | Done inside the build, a few minutes |
| 7 | **Make an encrypted iPhone backup** from a computer (Finder or iTunes, "Encrypt local backup"). The phone app has no export, and the first launch of a new build moves you to the shared project. | Free | 15 to 30 minutes |
| 8 | **Supabase, shared project (appended, never overwritten):** Apple provider has `com.najeca.belific` in its Client IDs; `belific://auth-callback` is in the redirect list. Both were planned on 2026-10-15; confirm they are there. | Free | 10 minutes |
| 9 | **For App Store review only, later:** a **Sign in with Apple key** (Certificates, IDs and Profiles, Keys, new key with Sign in with Apple, download the `.p8` once). Its Key ID, your Team ID and the `.p8` go into the shared project as Edge Function secrets so deleting an account can revoke Apple's token (section 3, item C). Then deploy `delete-account` (and `belific-calendar-feed`). | Free | 20 minutes |
| 10 | **For App Store review only, later:** turn on **manual linking** in Supabase (Authentication, Sign In / Providers, "Allow manual linking"), only when the linking phase is built. It changes nothing for Landis or Proload unless they call it. | Free | 2 minutes |
| 11 | **For App Store review only, later:** a **contact email** for the privacy page, terms and the support URL (question 4). | Free | 10 minutes |

Apple sign in itself needs no new setup: the explicit App ID already carries the capability.

## 2. The first iPhone build from this Windows PC

**Route: EAS Build in the cloud, then `eas submit`.** There is no other route from Windows without a Mac.

**Version and build number.** Build what `mobile/app.json` says at the time: today **3.53.1**, build **"1"**. A new version string starts again at 1. It is higher than anything Apple has seen (2.27.1), so it is accepted. If a rebuild of the same version is needed, raise `ios.buildNumber` to "2" in a normal commit first (Apple refuses a repeated number within a version). I suggest freezing the version for the TestFlight round: fixes found on the phone bump the patch number as usual (3.53.2 build 1), so nothing gets confusing.

**Before the build** (checks, in `mobile/`, in the gates the repo already uses):

```
npx tsc --noEmit
npm test
npx expo export --platform ios --output-dir <a folder outside the repo>
npm run check:ios-markers -- <that folder>
```

and the security scan from `docs/CLAUDE.md`. Commit, so the build uses committed code (EAS uploads the working tree, but a clean tree avoids surprises).

**The build and upload** (only after you say "ready for EAS build"):

```
cd mobile
eas build --platform ios --profile production
```

- The first time, it asks to sign in to your Apple account: say yes, so it can reuse or make the distribution certificate and the App Store profile.
- It takes about 15 to 30 minutes in the queue and 15 to 25 minutes to build. The link it prints shows the log.
- Read the build log's "Xcode version" line. Since April 2026 Apple only accepts uploads built with the iOS 26 SDK (Xcode 26). Expo SDK 54 supports it; if the log shows an older Xcode, the upload in the next step is refused, and the fix is `"image": "latest"` under `build.production.ios` in `eas.json` (a code step, not now).

```
eas submit --platform ios --profile production --latest
```

- It asks for the App Store Connect app (choose Belific) and signs in to Apple. It may offer to make an App Store Connect API key: accept, so later submits need no password.
- To skip the question next time, the app's numeric App Store Connect ID can go into `submit.production.ascAppId` in `eas.json` (a later code step).

**Install through TestFlight:**

1. App Store Connect, Belific, TestFlight. The build appears as "Processing" for 5 to 30 minutes.
2. If it asks about encryption: the answer is already in the build (`ITSAppUsesNonExemptEncryption: false`), so usually no question.
3. Add the build to an **internal** group (create one called "Me" with your Apple ID if none exists). Internal testing needs no Apple review.
4. On the iPhone, install the **TestFlight** app from the App Store, sign in with the same Apple ID, accept the invite, tap Install. The TestFlight build replaces the App Store build (same bundle id).
5. If something goes badly wrong: `docs/PHONE_RELEASE_3.0.0.md` section 4 (delete the app, reinstall the App Store version, restore from the backup).

## 3. In app blockers before App Store submission

"Apple" means App Review would very likely reject without it. "Ours" means a promise in our own docs, not an Apple rule.

| | Item | What exists | What is missing | Effort | Model |
|---|---|---|---|---|---|
| A | **Privacy page and terms** (Apple 5.1.1(i): a privacy link in the listing and inside the app) | `privacy.html` and `terms.html` (8 Oct 2026), on `main`, served from GitHub Pages. They cover Apple sign in, Supabase in Ireland, local reminders, deletion. | They say Google sign in is Windows only; nothing on the iPhone reading its calendars (read only, on the device), the feed link, or Windows fetching calendar links; contact is a GitHub issues link, not an email; no line saying anyone can email to have data deleted or exported; the deletion wording must match item B. **No Privacy or Terms row in the phone's Settings.** | 0.5 day | Sonnet (the wording decision in B comes first) |
| B | **Delete account** (Apple 5.1.1(v): an account made in the app must be deletable in the app) | Settings, Delete Account with a confirm; the `delete-account` function deletes the caller's rows in all 9 tables with the caller's own key. | The function is **not deployed** to the shared project. It **does not delete the login** (shared with Landis and Proload), but the phone's alert and the privacy page say the account is deleted. A decision and matching wording (question 3). | 1 day plus your deploy | **Opus** (shared login, security, Apple rule) |
| C | **Apple token revocation** (Apple: deleting an account made with Sign in with Apple must revoke its token) | Nothing for Apple. (`revokePending.ts` is the desktop's Supabase sign out retry, not Apple.) | At Delete Account: ask Apple sign in once more for a fresh authorisation code, send it to `delete-account`, which swaps it for a token with Apple and calls Apple's revoke endpoint, using the key from section 1 step 9. Only for people who signed in with Apple. | 1 day, built with B | **Opus** |
| D | **Google sign in leaves the app** (Apple 4.0: being sent to Safari to sign in is a common rejection) | `phoneGoogleAuth.ts` opens Safari with `Linking.openURL`, then Safari hands back to `belific://`. | An in app sign in sheet (`ASWebAuthenticationSession`, through `expo-web-browser` `openAuthSessionAsync`). New native module, so it needs a build; the PKCE flow and callback stay. | 0.5 day | **Opus** (sign in code) |
| E | **Account linking** (ours, decided 2026-10-15: before public release) | Apple and Google on the phone land on two different users unless the emails match the way Supabase links them. | "Add a sign in method" in Settings (Supabase `linkIdentity`), shown only while signed in; your manual linking switch (section 1 step 10); the ACCOUNT_LINKING_TEST.md doc gives the checks. | 1 day | **Opus** |
| F | **Visible sync status on the phone** (ours) | The desktop shows it (`lib/syncText.ts`, Profile menu and Settings). The phone shows nothing. | One quiet line under the account in Settings ("Synced 2 minutes ago", "Waiting for the internet", "Could not sync, will try again"), reusing `syncText.ts`. | 0.5 day | Sonnet |
| G | **Notification permission timing and wording** (Apple guideline and HIG: ask in context; not a hard rule) | `app/_layout.tsx:109` asks for notifications **at the very first launch**, before the person has done anything. iOS shows only its own text for this prompt (there is no wording key in Info.plist). | Ask the first time a reminder is set (or Remind me on this device is turned on), after a one line Belific note saying why ("So reminders can reach you at the time you set"). The calendar texts are already good. | 0.5 day | Sonnet |
| H | **Privacy manifest** (Apple: required reason APIs, warning ITMS-91053 on upload) | Expo's own modules ship their manifests. | An app level `ios.privacyManifests` in `app.json` for UserDefaults (AsyncStorage) and file timestamps. Native, needs a build. Check the 3.53.1 upload email first: if it has no ITMS-91053 warning, skip. | 1 to 2 hours | Sonnet |
| I | **Review notes and sign in for the reviewer** | The app works fully without an account. | Review notes saying so, and how sign in and sync work; no demo account needed. Text only, in App Store Connect. | 15 minutes | You (Sonnet can draft) |
| J | **The device-test rule** (ours, `TESTING_PROTOCOL.md`) | A one time waiver for the first TestFlight build. 2.27.1 was later built too. | A standing rule for this Windows only setup (question 2). | Doc only | Sonnet |

Not blockers: Sign in with Apple is offered next to Google (Apple 4.8, met); the encryption answer is in the build; the app is iPhone only, so no iPad screenshots.

## 4. Real iPhone checklist after the first build

Run `docs/PHONE_RELEASE_3.0.0.md` section 2 first (launch, Today, Tasks, details, reminders, Calendar, accessibility, Light and Dark). Then these, which came after 3.0.0 or matter most for release. Write down what fails; each failure becomes a fix with a patch bump.

**Sign in and the move to the shared project**
1. First launch: the app opens signed out (the project guard), local data is still there.
2. Sign in with Apple: the Apple sheet, back in Settings with the account shown.
3. Sign out (local only: the desktop stays signed in), then Sign in with Google: the browser, choose the account, back in Belific, account shown. Note whether it left the app for Safari (item D).
4. Supabase dashboard: the same user as the desktop for Google; the phone's rows in the `belific` tables.

**Sync with the desktop**
5. Make a task on the phone, wait or pull: it shows on the desktop. Edit it on the desktop: the change shows on the phone after its next sync (on return to the app, or within about two minutes).
6. Tick on one, the other shows it ticked. Delete on one, it leaves the other.
7. Airplane mode: make two tasks, turn it off: both reach the desktop.
8. Edit something on the phone the phone does not show (extra times, reminders set on the desktop): nothing is lost.

**Notifications**
9. When the permission question appears, and what it says. Allow.
10. A task 3 minutes ahead with a reminder, phone locked: it arrives with the Belific sound. Tick another before its time: it does not arrive.
11. Remind me on this device off: nothing arrives.
12. Deny the permission in iOS Settings: the app still works and says reminders are off.

**Shifts (S5)**
13. A shift from the desktop: on Today it shows its summary, its bar and its inside rows; tick an inside row in place.
14. Add inside (the same form as the desktop); Free time; Make it a normal block.
15. Today's total counts a shift once, not once per inside row.
16. A repeating shift: This day only on its first day stays on that day; All days adds to each day's checklist (3.53.1).

**Parts (R6)**
17. A task with Parts: the parts rows on Today and in the Tasks list, ticks in place, the progress bar; parts never appear as separate blocks on the Calendar.
18. Add a part on the phone: it shows under its parent on the desktop.
19. A repeating parent with parts: today's ticks reset on the next day.

**Repeat until**
20. Set Repeat until in the details: the series stops after that date on the phone and the desktop.
21. Change it on the desktop: the phone follows.

**Plan screens that are desktop only**
22. Plan my day, Plan week, Wrap up, Analytics, Trash and Quests are desktop only. Use them on the desktop, then open the phone: the tasks they moved or made show on the right days; nothing on the phone breaks or shows an empty space; no "open on the computer" dead end.

**Device only things**
23. Haptics on press and hold; the iOS back swipe and the tab bar do not fight the row swipes.
24. Fonts are Inter and Newsreader; Dynamic Type at the largest size; VoiceOver reads rows; Reduce Motion.
25. Calendar permission: the question, your iPhone calendars shown read only, nothing changed in the Apple Calendar app.
26. Delete Account (only on a test account, after B and C are built and deployed).

## 5. App Store listing needs

| Need | What to do | Notes |
|---|---|---|
| **Screenshots, 6.9 inch** | 3 to 10 images at **1320 x 2868** portrait (1290 x 2796 is also accepted for the 6.9 inch slot). Apple scales them down for smaller iPhones, so this one set is enough. No iPad set (`supportsTablet: false`). | Best from a real iPhone 16 Pro Max or 17 Pro Max class phone. Without one, see question 5. Suggested set: Today, a task's details with Parts, Calendar day, a Shift on Today, Repeating, Settings with sync. |
| **Description** | Name "Belific" (30 characters), subtitle (30), promotional text (170, can change without review), description (up to 4000), keywords (100, comma separated). | Plain and calm, no claims of AI or streak pressure. Sonnet can draft from `docs/DESIGN_VISION.md`. |
| **Privacy answers** (App Privacy) | Data **linked to you**, used for **App Functionality** only, **not tracking**: Contact info (email address; name with Google), User content (tasks, notes, lists), Identifiers (user ID). Nothing for location, health, diagnostics or usage data. The iPhone calendar is read on the device and never sent, so it is **not** collected. | Must match the new privacy page (item A). |
| **Age rating** | Answer "None" to every content question; no unrestricted web access; no user to user content. Result: **4+**. | The 2025 questionnaire also asks about in app controls and medical claims: none. |
| **Support URL** | Required. A simple support page or a mailto page on the same GitHub Pages site (for example `najeca.github.io/belific/support.html`), with the contact email. | Needs question 4. |
| **Privacy policy URL** | Required: the `privacy.html` address on GitHub Pages. | |
| **Copyright, category** | "2026 Nathan Jethro Caspillo"; category Productivity. | |
| **Review notes** | Item I. | |

## 6. Phases

| # | Phase | What | Effort | Model | Waits on you? |
|---|---|---|---|---|---|
| 0 | **Your setup** | Section 1 steps 1 to 8; answer the questions below. | 1 hour | You | Everything after waits on this |
| 1 | **TestFlight build of 3.53.1** | Gates, then (after "ready for EAS build") `eas build` and `eas submit`; you install and run section 4. Code side: only the device-test rule note (J) and, if the log needs it, the Xcode image line. | Half a day (mostly waiting) | Sonnet for the notes | Yes: the waiver answer, "ready for EAS build", the install and the hand test |
| 2 | **Fixes from the phone** | Whatever section 4 finds, one patch bump each, then a new TestFlight build. | Unknown, budget 1 to 2 days | Sonnet for ports and small fixes, Opus for sync or sign in bugs | Your list from phase 1 |
| 3 | **Account and sign in** | B delete account, C Apple revocation, D in app Google sheet, E linking. One plan, Opus reads `docs/sessions/2026-10-15-project-move.md` first. | 3 to 4 days | **Opus** | Question 3; then step 9 (the Apple key and secrets, the deploy) and step 10 (the linking switch) before it can be tried |
| 4 | **Polish for review** | A privacy and terms (after B's wording), Settings rows for Privacy and Terms, F sync status, G notification timing, H privacy manifest if needed, a support page. | 1.5 to 2 days | Sonnet | Question 4 (the email); you copy the pages to `main` |
| 5 | **Submit for review** | Final TestFlight build with phases 3 and 4, the full section 4 run, the listing (section 5), screenshots, review notes, then Submit for Review. Review usually takes 1 to 3 days. | 1 day plus review | Sonnet drafts the listing text; you submit | Yes: screenshots, privacy answers, the submit button |

Phases 3 and 4 can be built while phase 1's build is in TestFlight, but nothing in them reaches the phone until the next build.

## Questions (with my recommended defaults)

1. **Which version is live on the App Store today, 2.1.0 or 2.18.1, and did 2.18.1 or 2.27.1 ever reach TestFlight on your phone?** The docs disagree. *Default:* treat the live one as unknown, check App Store Connect (App Store tab, and TestFlight builds) before the first build, and I will correct `docs/CURRENT_TRUTH.md` in phase 1.
2. **Can TestFlight internal stand in for the local Mac Release test from now on?** *Default: yes,* as a standing rule for this Windows only setup: every build goes to TestFlight internal first, and nothing is submitted for review until the section 4 hand test passes on that exact build.
3. **What does Delete Account do, given the login is shared with Landis and Proload?** *Default:* delete all Belific data, revoke the Apple token, and delete the login itself only when it has no Landis or Proload data; otherwise say plainly, in the alert and on the privacy page, "Your Belific data is deleted. Your sign in stays because you also use it for Landis or Proload." This meets Apple's rule for Belific's own account and does not break the other apps.
4. **Which contact email for the privacy page, terms and support URL?** *Default:* a new address just for Belific (for example a `belific@` alias), not your personal email, since the repo and pages are public.
5. **Screenshots: a real large iPhone, or rendered?** *Default:* take them on a real 6.9 inch class iPhone (yours, or borrowed) from the TestFlight build. Only if none is available: render them from the phone harness at 440 x 956 at 3x (1320 x 2868), and check they match the real app closely, since Apple rejects screenshots that do not show the app as it is.

## Answers recorded 2026-11-13 (Phase 1 preflight)

1. **Live on the App Store: 2.18.1 (Ready for Distribution).** 2.27.1 build 1 sits in TestFlight and has never been installed on the phone; it expires 65 days after upload. `docs/CURRENT_TRUTH.md` (which says 2.1.0) is out of date.
2. **Standing rule:** TestFlight on Jethro's own iPhone replaces the local Mac test. Nothing goes for App Store review until the section 4 hand test passes on that exact build.
3. **Delete Account:** deletes Belific data, revokes the Apple token, and deletes the login only if Landis and Proload have no data on it; otherwise it says so plainly (wording in the default of question 3).
4. **Contact email:** a new Belific only address, to be given later. Until then the privacy page, terms and support page keep their placeholder.
5. **Screenshots:** from a real 6.9 inch iPhone if one is available, otherwise rendered from the PC (440 x 956 at 3x) as the fallback.

### Preflight results (3.53.1, build "1")

- Gates green: typecheck, 1207 unit tests, iOS export plus marker check (49 markers, 0 hits), security scan.
- `mobile/eas.json`: added `cli.appVersionSource: "local"` (the CLI warned it was unset; "local" was already the default, so behaviour is unchanged and `ios.buildNumber` in `app.json` is the one used).
- EAS plan: Free, 15 iOS builds a month, 0 used this cycle (resets 1 Dec). iOS concurrency 1.
- eas-cli on this PC is 27.9.0 (latest), signed in as `jetmakes`.
