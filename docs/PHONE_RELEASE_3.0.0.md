# Belific 3.0.0 for iPhone: what Jethro does by hand

Release preparation for the iPhone catch-up (`docs/PLAN_phone.md`, P1 to P12). **Nothing here has been run.** No EAS build, no submit, no App Store Connect, no database change. Every step below is yours.

`mobile/app.json`: version **3.0.0**, `ios.buildNumber` **"1"** (a new version string starts at 1; check it is unused in App Store Connect first, as in `docs/BELIFIC_EAS_TESTFLIGHT.md` section 3).

## 0. Before you build

1. **The device-test rule.** `TESTING_PROTOCOL.md` says a second EAS build needs a local Release build on the iPhone first; the one-time waiver in `docs/BELIFIC_EAS_TESTFLIGHT.md` covered only the first TestFlight build. Decide whether 3.0.0 goes to TestFlight under a new waiver (TestFlight internal only), or waits for a Mac Release test. I could not decide this for you.
2. **This build has native changes:** `expo-haptics` (P2), the fonts as `.ttf` assets (P1) and `userInterfaceStyle: "automatic"` (P11, for Match system). They only reach the phone through a new EAS build. There is no `expo-updates`, so every JavaScript change also needs a build.
3. **Variables:** `eas env:list --environment production` in `mobile/` must show the **shared** project's URL (`https://vlogfwnmaqorhialcqbr.supabase.co`) and its publishable key (`docs/BELIFIC_EAS_TESTFLIGHT.md` section 4). Without them the app crashes at launch.
4. **Safety copy of the phone:** an encrypted iPhone backup from a computer (Finder or iTunes). The phone app has no export of its own, and the live App Store build (2.18.1) still uses the **old** Supabase project, so the first launch of 3.0.0 moves you to the shared project (the project guard runs; your old phone data stays on the phone and in the old project).
5. **Do not press "Convert routines"** (desktop or phone) yet. See section 3.

## 1. Build and upload

In `mobile/`, after you say "ready for EAS build":

```
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Then in App Store Connect: wait for processing, add the build to the **internal** TestFlight group, install it on the iPhone. Do not send it for App Store review (the account deletion and privacy page decisions in `docs/CURRENT_TRUTH.md` are still open).

## 2. TestFlight hand test (what to tap, swipe and hold, and what should happen)

Work through it once in Light and once in Dark (Settings, On this iPhone, Theme).

**Launch and account**
1. The app opens on **Today**. The bottom bar has three tabs: Today, Calendar, Tasks. The font is Inter (not the system font); the big titles are Newsreader (a serif).
2. Tap the **round avatar** top right: Settings opens. Sign in with Google (and, on another day, with Apple). After the first sync your desktop's tasks, lists and labels appear.

**Today**
3. Today shows only today's tasks: timed ones under **Planned** in time order, the rest under **Anytime**; a small **Now** and **Next** line under the date.
4. **Tap a round tick:** the row leaves; a dark bar says "Done: ..." with **Undo** for about five seconds. Tap Undo: it comes back. Tick it again and wait: **Done today, 1** appears at the bottom; tap it to see the ticked task.
5. **Tap a row:** it opens in place (notes, steps you can tick, label, list, time) with **Edit**.
6. **Press and hold a row** (about half a second): a small tick of the phone, then a menu: Edit, Duplicate, Move to list, Delete (a repeating task: Skip this day, Delete repeating task). Lifting your finger does not choose anything.
7. **Scroll the list fast:** no row opens and nothing gets ticked.
8. Your two routines (not converted) show at the top of Anytime and tick as before.

**Tasks**
9. The chips at the top: Brain Dump, your lists, **Repeating**, New list. Swipe the chips sideways.
10. **Swipe a row to the right:** it is done (with Undo). **Swipe a row to the left:** Tomorrow and Delete (a repeating task: Skip).
11. **Press and hold a list chip:** its name and emoji, Save, Cancel, Delete list.
12. **Repeating:** each repeating task with "Due today" and a small streak; tick, Skip, Today. Settings, On this iPhone, **Show streaks** off hides the streaks.

**Task details** (tap a task in Tasks, or Edit)
13. Change the title and emoji, top priority (red !), date (Today, Tomorrow, the month grid), time (the iPhone's time picker), length, label (a new label gets a colour), list, notes, steps.
14. Repeat: Weekly, tick Mon and Wed, read the line under it, **Apply**. Times a day: **Add another time**. Reminders: tap "10 minutes before".
15. Edit the same task on the desktop, then on the phone: nothing the phone does not show is lost (extra times, Split, reminders).

**Reminders**
16. Give a task a time 3 minutes ahead with the default reminder, lock the phone: a notification arrives at that time. Tick a second one before its time: it does not arrive.
17. Settings, On this iPhone, **Remind me on this device** off: no more task reminders on this phone (the computer keeps its own switch, now called the same).

**Calendar**
18. **Day:** a red line at the current time; your blocks; a short block never shows text over text. **Tap an empty part** of the timeline: the quick add says "... at 4:15pm" (the quarter hour you tapped); **Cancel** closes it in one tap; Add puts the task there.
19. **Swipe sideways** on Day, Week and Month: one day, week or month at a time. **Scroll up and down** on Day: it scrolls, it never turns the page.
20. **Week:** seven columns with short titles. **Month:** dots and counts. **Tap a day** in either: it opens in Day view. It never creates a task.
21. **Press and hold a block, then drag it** up or down: it lifts (a small tick), shows the new time, and moves in 15 minute steps; a message says "Moved to ..." with Undo. Drag near the bottom edge: the timeline scrolls. **If the drag feels slow or jumpy, write it down: that is decision 5's trigger for a New Architecture plan.**

**Accessibility**
22. Settings, Accessibility, **Reduce Motion** on: sheets fade instead of sliding, and a lifted block does not grow.
23. **VoiceOver** on Today and Tasks: every row reads its title; the actions rotor offers Done, Tomorrow, Delete on a Tasks row and "15 minutes earlier/later" on a Calendar block.
24. The largest **Text Size**: rows grow; calendar blocks grow only a little (capped), so their text still fits.

## 3. When "Convert routines" is safe

Only after **3.0.0 is installed on the iPhone** and the hand test above passed. Then press Convert once, on the phone (Settings, Data) or on the desktop (Settings). Each routine becomes a daily repeating task with its history kept; on Today it then shows once, as the repeating task, with a streak, Skip and Today. Before 3.0.0 is on the phone, the old build would hide a converted routine and show nothing in its place.

## 4. If something is wrong

Delete the TestFlight build and reinstall **2.18.1** from the App Store (deleting the app removes its local data: the backup from step 0.4 has it). The shared project keeps what 3.0.0 synced; nothing is copied back to the old project (`docs/BELIFIC_EAS_TESTFLIGHT.md` section 6).

## 5. What could not be checked without a real iPhone

Native gesture feel and its conflicts with the iOS back swipe and the tab bar, haptics, notifications arriving, the fonts embedded in the build, Dynamic Type, VoiceOver, safe areas, the iPhone calendar permission, Apple and Google sign in, Match system following Control Centre, Reduce Motion, and the drag's smoothness without Reanimated. Everything else was checked in the web export at 390 x 844 with real touch events (`desktop/test/real/phone-*.js`).
