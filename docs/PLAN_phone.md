# Belific iPhone catch-up plan (PLAN_phone)

Written 2026-10-22 on Opus. Plan only: no app code, no build, no EAS, no database change in this step.
The layout and behaviour below are Jethro's decisions and are final; this plan only says how to build them safely.
Where this plan makes a choice of its own it says so ("chosen here"); anything that is a guess says "guess".

**Status (2026-10-22): P1 to P12 built, 2.49.0 to 3.0.0; see `docs/build-progress.md`. The hand steps for the release are in `docs/PHONE_RELEASE_3.0.0.md`.**

## Phases at a glance

| # | Phase | Size | Model | Needs a new EAS build to try on a phone |
|---|---|---|---|---|
| P1 | Phone theme foundation: tokens, fonts, status bar, phone UI kit | M | Sonnet | yes (fonts, see P1) |
| P2 | Touch kit: tap, press and hold, swipe rows, haptics, reduced motion, touch real check harness | M | Opus | yes (expo-haptics) |
| P3 | Navigation shell: Today, Calendar, Tasks tabs, round + on every screen, avatar to Settings | M | Sonnet | no (JS only) |
| P4 | Today | L | Sonnet | no |
| P5 | Tasks: list switcher, Brain Dump, lists, Repeating chip, quick add, swipe rows | L | Sonnet | no |
| P6 | Task details part 1: priority, date, time, duration, label, list, notes, subtasks | M | Sonnet | no |
| P7 | Task details part 2: repeat, extra times, reminders (with phone notifications) | L | Opus | no (expo-notifications is already in) |
| P8 | Calendar Day: touch timeline, red now line, tap an empty slot to quick add | L | Opus | no |
| P9 | Calendar Week and Month, sideways swipe between periods | M | Sonnet | no |
| P10 | Press and hold then drag a block in Day view | M | Opus | no |
| P11 | Polish: Theme setting on, dark audit, remove phoneColors and the old screens, accessibility | M | Sonnet | no |
| P12 | Release prep: hand checklist, TestFlight build (Jethro runs EAS) | S | Opus (review) | yes, this is the build |

One native change is needed in total (expo-haptics, plus font files embedded): plan for **one** EAS build after P2 to try the touch feel on a real iPhone, and one release build at P12. Every other phase is JavaScript only, but note: **this app has no expo-updates**, so nothing reaches a phone without an EAS build. Between builds, phases are checked in the iOS export, unit tests and the web export (section 7).

---

## 1. Problem and aim

**Problem.** The iPhone app is the older half of Belific: four tabs (Today, Brain Dump, Quests, Calendar), the old cream palette, the system font, no dark theme, a month grid only, and no way to set a time, duration, label colour, list, repeat, reminder, subtask or extra time on a task. The desktop has all of these. The same person uses both, so the phone feels like a different, weaker app and cannot be used to plan a day.

**Aim.** One Belific: the phone uses the desktop's look (tokens, Inter and Newsreader, light and dark) and the desktop's rules (series, subtasks, times, lists, priority, labels, reminders), rebuilt for touch with a three tab layout (Today, Calendar, Tasks), without losing any phone data and without breaking the desktop or sync.

**Existing solutions (ideas only, nothing copied).** Things 3 and Todoist (swipe to complete or schedule, a Today list with an Anytime group), Structured and Fantastical (touch day timeline, tap a slot to add, drag a block). Belific differs by sharing every rule with its own desktop app and by the no guilt rules (decisions 007 and 027: never a zero streak, never a warning). No code, icons, text or assets are taken from any of them.

**Audience.** One person (Jethro) first, on one iPhone, then TestFlight testers. Needs: fast capture, a calm Today, readable in sunlight and at night, VoiceOver labels, 44 pt touch targets, reduced motion respected.

**Non goals.** Split (the "breaks cut tasks" switch) as an editable setting on the phone; vibrant colours; the task timer and Pomodoro; templates; Daily Planning and Shutdown flows; analytics and progress pages; calendar subscriptions (ICS); resizing a block by its edge; Android. All stay desktop only for now (section 2).

---

## 2. Desktop only modules: move to shared or keep off

The iOS marker gate (`mobile/scripts/ios-markers.js`) fails the build if a listed name is in the phone bundle. **Every removal below is deliberate, happens in the phase named, and is written in that commit message and the changelog.** Nothing is removed "to make the gate pass".

### Moves to shared (marker removed)

| Marker(s) | Phase | Why | What removing it risks |
|---|---|---|---|
| `seriesStreak`, `Show streaks` | P5 | The Repeating chip shows current and best streak small, the same numbers as the desktop | A streak shown wrongly on the phone would break the no guilt rules (decisions 007, 027). Mitigation: reuse `seriesStreak.ts` unchanged and the same `streakText` wording; never show zero. `Show streaks` enters the bundle with `STREAK_TEXT`. The desktop switch is "only on this computer" (not synced), so the phone gets its own per device "Show streaks" row in Settings (default on, chosen here). |
| `Add another time` | P7 | Extra times are one of the required detail fields | The phone could write `extraTimes`/`timesDone` badly. Mitigation: only through `times.ts` (`addTimeFields`, `moveTimeFields`, `removeTimeFields`), which already refuses overlaps and limits to 6. |
| `effectiveReminders`, `setDefaultReminders`, `Reminders for a timed task` | P7 | Reminders are a required field, and the phone must actually notify | Two devices signed in to one account will both notify for the same task (the desktop already notifies). Decision 3 ("Remind me on this device") limits this. Also the phone's notification count limit (64 pending on iOS); mitigation in P7. |
| `planCuts`, `refusalNote` | P8 | The Day timeline must draw a break the same way the desktop does, or the two apps disagree about what a day looks like | Only drawing moves. The Split switch text (`Splits the tasks it overlaps...`, `Smallest piece when a break splits a task`) stays a marker, so the setting cannot leak. Risk: a cut drawn wrongly on a small screen; `blockLayout.ts` tiers and the p24 style check apply. |
| `multiDropPatch` | P10 | Dragging one time of a task with several times must move only that time, as on the desktop | Low: pure function, already tested (`timeBlocks.test.ts`). |
| `Match system` | P1 (wording only) and P11 (setting shown) | The Theme setting (Light, Dark, Match system) is required on the phone | None for data: the theme is a per device setting, never synced. `installTheme` and `setThemeMode` stay markers: they are the desktop's DOM functions; the phone gets its own store with other names. |

### Stays off the phone (marker kept)

| Marker(s) | Reason |
|---|---|
| `listenForAuthCallbacks`, `startAppleSignIn`, `SignInPage`, `signOutDesktop`, `deleteAccountDesktop`, `answerAccountChoice`, `restoreAccountChoice`, `handleAuthCallback` | Desktop sign in; the phone has its own (`phoneAuthCore.ts`, `phoneGoogleAuth.ts`) |
| `SettingsPage`, `LabelsPage`, `ProgressPage` | Desktop screens; the phone gets its own Settings, and label editing lives in the label picker |
| `RoutineConvertRow`, `routine-convert`, `Convert routines from your iPhone` | The desktop's convert button. The phone keeps its own `RoutineConvertSection` (Settings, Data), which uses the shared `routineConvert.ts` |
| `parseIcs`, `expandCalendar`, `addSubscription`, `Calendars shown in Belific` | ICS subscriptions are desktop only; the phone reads the iPhone's own calendars (`deviceCalendar.ts`) |
| `searchEmoji`, `Search emoji for` | Chosen here: the phone uses the iOS emoji keyboard plus `firstEmoji` (smaller bundle, native feel) |
| `Splits the tasks it overlaps...`, `Smallest piece when a break splits a task` | Split stays a desktop setting (non goal); `cutsBelow` is kept untouched when the phone edits |
| `Turn on Start with Windows` | Windows only |
| `vibrantColor`, `Vibrant task colours` | A desktop look setting; not asked for on the phone |
| `startFromChoices`, `StartFromRows`, `Could not start the timer` | The timer is a non goal |
| `resizeRefusal` | No edge resize on the phone (non goal) |
| `installTheme`, `setThemeMode` | Desktop DOM theme functions (see above) |

### Desktop only by comment, not by marker

- **`lib/labels.ts`** (label colours on first read, rename, delete): **moves to shared in P6**. It already imports only storage and pure rules. Change the header comment that says "Desktop only"; no marker to remove. Risk: it fills a missing `colorKey` on first read and queues those rows for sync; that is the same silent fill the desktop does, so both devices converge on the same colours. P6 adds a test that the fill is idempotent.
- **`components/desktop/*`** stays desktop only (mouse, hover, keyboard, DOM). The phone gets `components/phone/*`.

---

## 3. Reuse versus rebuild

**Shared rules, reused unchanged (pure, already tested):** `series.ts`, `seriesActions.ts`, `recurrence.ts`, `repeat.ts`, `seriesStreak.ts`, `quests.ts`, `questActions.ts`, `subtasks.ts`, `times.ts`, `lists.ts`, `taskCommands.ts`, `mustDo.ts`, `labelColors.ts`, `labelRules.ts`, `labels.ts`, `duration.ts`, `timebox.ts`, `timeboxTasks.ts`, `blockLayout.ts`, `cuts.ts` (drawing), `drag.ts` (`multiDropPatch`, `nudgeBlock`), `reminder.ts`, `taskActions.ts`, `taskCopy.ts`, `thoughts.ts`, `dumpConvert.ts`, `kanban.ts`, `lateTasks.ts`, `rollover.ts`, `emoji.ts`, `tokens.ts`, `themeMode.ts`, `externalEvents.ts`, `deviceCalendar.ts`.

**One new pure module (chosen here):** `lib/todayView.ts`: today's tasks in time order, the Anytime group, Now and Next, Done today, and the legacy routine rows (section 5). Tested with `node --test` like the others.

**Rebuilt for touch (new files in `components/phone/`, `app/`):**
- Shell: tab bar, round + button, avatar header, Settings page.
- Today: list, expand in place, quick menu, Undo bar, Done today row.
- Tasks: list switcher, quick add row, swipe rows, Repeating view.
- Task details: a full screen sheet with the same fields as `TaskDetailPanel` (not the panel itself, which is mouse and keyboard).
- Calendar: Day timeline (block view built on the same `blockPlan` tiers as `TimeBlock`), Week strip, Month grid, quick add sheet.
- Phone UI kit: Pill, LabelDot, RoundCheck, OutlinedButton, IconHeading, Sheet, the phone's own popover replacement (an action sheet style menu).

**Retired at P11:** `app/(tabs)/inbox.tsx`, `quests.tsx`, the old `today.tsx` and `calendar.tsx`, `app/tasks.tsx`, `app/components/TaskForm.tsx`. `AddEventModal.tsx` and `RoutineForm.tsx` stay while custom events and routines exist (decision 4: custom events stay).

---

## 4. Native pieces

| Piece | Installed? | Needed for | New EAS build? |
|---|---|---|---|
| react-native-gesture-handler 2.28 | yes | tap, long press, swipe rows, pan for drag and paging | no |
| expo-notifications 0.32 | yes, with plugin | per task reminders (P7) | no |
| expo-font 14 | yes, with plugin | Inter, Newsreader, Roboto Mono | **the font files must be embedded** (see below) |
| expo-haptics | **no** | the small tick when press and hold starts, and swipe thresholds | **yes**: add in P2 with `npx expo install expo-haptics` |
| react-native-reanimated | **no** | not needed (chosen here) | n/a |
| expo-system-ui / Appearance | Appearance is in React Native | Match system, status bar | no |

**Fonts.** The desktop's font files are `.woff2` (`mobile/assets/fonts`). **iOS cannot load woff2.** The phone needs `.ttf` (or `.otf`) files of the same families and the same versions (Inter, Newsreader, Roboto Mono, all OFL or Apache, licences already beside the files). Add them beside the woff2 files and load them with `useFonts` in the root layout (JavaScript assets, so they do not need the native plugin config; but no build reaches a phone without EAS anyway). Desktop keeps using woff2. P1 adds a test that every family the phone names has a ttf file and a licence beside it.

**No Reanimated (chosen here).** `app.json` has `newArchEnabled: false`. Expo SDK 54 pairs with Reanimated 4, which needs the New Architecture. Turning the New Architecture on changes every native module at once (Apple and Google sign in, notifications, calendar, datetimepicker) and is its own risky step. Gesture handler 2.28 works on the old architecture with callbacks on the JavaScript thread, and React Native's own `Animated` with the native driver is enough for swipe rows, the Undo bar and paging. If drag in P10 feels too slow on a real phone, the New Architecture move becomes its own plan (decision 5).

---

## 5. Data and sync

**The phone only writes columns it knows.** Every write goes through `lib/storage.ts` and the sync engine, which builds the server row with `taskToRemote(task, caps)`: a column is only sent when the server probe says it exists (`taskPipeline`, `taskExtras`, `planner`, `partB`, `partC`). Upserts send only those columns, so a column the phone does not send is never cleared on the server.

**Fields are kept when the phone edits a task.** Every edit is `updateTask({ ...task, ...changes })` (the old `TaskForm` already does this), so `cutsBelow`, `reminders`, `extraTimes`, `timesDone`, `subtasks`, `listKey`, `emoji`, `actualMinutes` and `timerStartedAt` travel unchanged. Rules for the new screens:
- Never build a task object from scratch for an edit; always spread the stored task.
- Use the shared edit helpers (`times.ts`, `subtasks.ts`, `reminderPatch`, `mustDoPatch`, `seriesActions.patchSeries`) so the phone writes exactly what the desktop writes.
- P6 adds a test: a task with every Part B and C field, edited through each phone save path, comes out with those fields untouched.

**What Caps.partB and Caps.partC mean for the phone.** Migration 004 is applied to the shared project (CURRENT_TRUTH, 2026-10-21), so the probe should read both as true and the phone sends and pulls `cuts_below`, `reminders`, `extra_times`, `times_done`. If a probe ever reads false (an old project, a failed probe), the engine keeps those local fields on pull and never sends them (`preserveFieldsFor`), so nothing is lost; the phone simply does not sync them until the probe passes. The phone UI should not hide the fields in that case (the data is local and correct). Note: the comment in `syncCore.ts` still says "NOT APPLIED"; fix the comment in P7 (comment only).

**Older phone builds.** The TestFlight build 2.18.1 and the App Store build do not know Part B or C. When they edit a task they do not send those columns, so the server keeps them. They also do not store them locally, which is harmless for the same reason. They will not show extra times or reminders. No data is lost.

**Routines on Today until the iOS catch-up (required by Jethro).**
- Do **not** press "Convert routines from your iPhone" (desktop) or the phone's Convert in Settings before the new phone build is installed. Until then the old build would hide a converted routine and show nothing in its place.
- Until conversion, Today shows each live routine as an untimed row in the Anytime group, with a small repeat icon and its time of day (Morning, Afternoon, Evening) as the group order inside Anytime. Ticking writes a `routine_completions` row for today, exactly as today, so streak history is unchanged. Press and hold shows Edit (the existing routine form) and Delete; Duplicate and Move to list are not offered for a routine.
- After conversion, the routine is a daily series `rt_<id>`, its row is tombstoned, and Today shows the series' occurrence as a normal repeating task. `todayView.ts` never shows both: a routine whose series `rt_<id>` exists is skipped. Test this in P4.
- The Repeating chip (P5) shows unconverted routines too, read only with a "Convert in Settings to give it a streak and Skip" note. Chosen here so the chip is never missing a daily habit.

**Custom events.** The phone's own "custom events" (the old Full schedule) are a separate table with their own notifications. They are not tasks. Decision 4: they stay, as grey read only blocks in Day view and rows in Today.

**No schema change, no migration, no backup.** Nothing in this plan changes the database.

---

## 6. Phase details (done criteria)

Each phase: one Sonnet or Opus batch step, its own targeted tests, typecheck, iOS export plus marker gate, security scan, version bump and changelog entry, one commit. Phone screens are checked in the web export at phone width (section 7).

**P1 Phone theme foundation (M, Sonnet).**
- `components/phone/theme.tsx`: a `useTheme()` hook returning the light or dark token set from `tokens.ts`, the mode from `themeMode.ts`, the system setting from `Appearance`, stored per device in `kv` (never synced).
- Fonts: ttf files added, loaded in `app/_layout.tsx` with a splash hold until loaded; Newsreader only for the app name and big titles.
- Status bar follows the theme.
- Phone UI kit in `components/phone/ui.tsx` (radius scale, 1px outlines, pills, label dots, Ionicons line icons, 44 pt targets).
- **phoneColors migration, safely:** `Colors` on the phone keeps returning `phoneColors` for the old screens until P11, so nothing old changes colour mid-plan. New screens never import `Colors`; they read `useTheme()`. At P11, when no screen imports `Colors` on the phone, `phoneColors` is deleted and `Colors` on native returns the light tokens (only shared non-screen code still reads it). A test fails if a file in `components/phone/` imports `lib/theme`.
- Marker: `Match system` wording only reaches the bundle in P11 when the setting is shown; keep the marker until then.
- Done: the export builds, marker gate green, fonts render in the web export at 390 px, contrast test (4.5:1) on every phone kit text style in both themes.

**P2 Touch kit (M, Opus).**
- `components/phone/touch.tsx`, built only on gesture handler primitives:
  - `PressableRow`: `Gesture.Tap()` with `maxDistance(10)` and `maxDuration(250)`, raced (`Gesture.Exclusive`) against `Gesture.LongPress().minDuration(400)`; both use `simultaneousWithExternalGesture` of the parent scroll view, so a scroll never selects anything.
  - Haptic: `Haptics.selectionAsync()` when press and hold starts.
  - `SwipeRow`: gesture handler's `Swipeable` (already used on Brain Dump) with right and left actions, thresholds with a light haptic.
  - Reduced motion: `AccessibilityInfo.isReduceMotionEnabled()` turns slides into fades and skips the swipe overshoot.
- `npx expo install expo-haptics` (**new native module: needs an EAS build**; web export: haptics are a no-op).
- The touch real check harness (section 7).
- Done: unit tests for the pure thresholds; the real check proves a 20 px drag on a row does not open it, a 450 ms hold opens the menu, a short tap opens it.

**P3 Navigation shell (M, Sonnet).**
- `app/(tabs)/_layout.tsx`: Today, Calendar, Tasks.
- The round + on every screen (Today: adds for today; Calendar: for the shown day; Tasks: into the chosen list).
- The avatar top right opens Settings (the existing Settings content restyled with the kit; Theme row hidden until P11).
- **Interim, so nothing is lost before P4 and P5:** the Tasks tab shows a three way switch to the existing Brain Dump, Tasks list and Quests screens. P4 and P5 replace it.
- Done: every old function reachable; deep link `belific://` and Google sign in callback still work (`+native-intent.ts`); the export and marker gate are green.

**P4 Today (L, Sonnet).**
- `lib/todayView.ts` plus tests: time order, the Anytime group, Now and Next from timed tasks and today's custom events (decision 4), repeating occurrences projected for today (`series.projectOccurrences`), routines (section 5), Done today.
- Screen:
  - Tick: the row leaves with an Undo bar for about 5 seconds; Undo restores it (`setTaskCompleted` both ways).
  - "Done today, N" at the bottom expands the done ones.
  - Tap: expand in place (notes, subtasks with ticks, label dot, list, time) with Edit.
  - Press and hold: Edit, Duplicate, Move to list, Delete.
- Done: unit tests for every rule, including a converted routine never doubled and a repeating task ticked only for today; real check of tick, Undo, expand and menu.

**P5 Tasks (L, Sonnet).**
- List switcher at the top: Brain Dump, each list, and the **Repeating** chip.
- Quick add row; every task in the chosen list including ones with no date (`lists.tasksInList`, `thoughts.splitThoughts` for Brain Dump).
- Swipe right: done. Swipe left: Delete or Tomorrow.
- New list, rename, emoji (`taskCommands.createList`, `editList`).
- Repeating: `quests.ts` and `questActions.ts` (tick, Skip, Today), streaks small via `seriesStreak` (markers `seriesStreak` and `Show streaks` removed here), hidden when the phone's own per device "Show streaks" setting is off.
- Old Brain Dump items convert on first edit (`dumpConvert.ts`), as today.
- Done: unit tests where logic is new; real check of the switcher, swipes and Repeating.

**P6 Task details part 1 (M, Sonnet).**
- Full screen sheet: title and emoji, priority (red exclamation mark, `mustDo.ts`), date (iOS date picker), time, duration (`duration.ts` presets), label (picker with colour dots, new label, `labels.ts` moved to shared), list, notes, subtasks (add, rename, tick, delete, `subtasks.ts`).
- Delete with confirmation (the phone may use `Alert.alert`; the rule 9 ban is for desktop paths only).
- Done: the "fields kept" test (section 5); label colour fill idempotence test; real check of each field.

**P7 Task details part 2 (L, Opus).**
- Repeat (`repeat.ts`, series edit rules: this one or all, as on the desktop).
- Extra times (`times.ts`, marker `Add another time` removed).
- Reminders (`reminder.ts`, markers removed): schedule local notifications with expo-notifications on save, on sync pull, on app start, and on tick (cancel).
  - Keys as the desktop scheduler: `task#HH:mm`.
  - Only the next 14 days (chosen here) to stay under the 64 pending notification limit.
  - "Remind me on this device" (decision 3) turns this device's task reminders off; the desktop gets the same setting.
- Fix the "NOT APPLIED" comment in `syncCore.ts`.
- Done: unit tests for the phone scheduling plan (pure function: which notifications for which tasks, limit, keys); a real iPhone hand test (notifications cannot be proven in the web export).

**P8 Calendar Day (L, Opus).**
- Day timeline with `timebox.ts` layout, `blockLayout.ts` tiers (the 2.47.0 rules: no text over text), `cuts.ts` drawing (markers `planCuts` and `refusalNote` removed), all-day row, the iPhone calendar events read only, red now line.
- Tap an empty slot: quick add sheet with the time filled in; Cancel is one tap.
- Tap a block: details. Day, Week and Month switch at the top (Week and Month placeholders until P9).
- Done: the p24 style overlap check run on the phone Day view at 390 px for 15 to 90 minute blocks in light and dark; real check of tap to add and Cancel.

**P9 Calendar Week and Month (M, Sonnet).**
- Week: seven columns, short titles only, a tap opens that day. Month: a grid with dots or counts, a tap opens that day. Neither ever creates a task.
- Sideways swipe moves to the next or previous day, week or month: a horizontal `Gesture.Pan` with `activeOffsetX` so vertical scrolling wins when the finger moves up or down.
- Done: real check that a vertical scroll never pages, a sideways swipe pages once, a tap in Week or Month never creates a task.

**P10 Drag a block (M, Opus).**
- Press and hold 400 ms (haptic), then pan; snaps to 15 minutes (decision 6; the desktop uses 30).
- Writes through `drag.ts` (`multiDropPatch` for a task with several times, marker removed; `patchSeries` for a projected occurrence); never onto a past day.
- Auto scroll near the top and bottom edges.
- Done: unit tests reuse `drag.test.ts` style; real check of a hold-and-drag in the web export; hand test on a phone.

**P11 Polish (M, Sonnet).**
- Theme setting shown (Light, Dark, Match system; marker `Match system` removed).
- Dark audit of every phone screen (the p23 style contrast and radius audit at 390 px).
- Delete `phoneColors` and the retired screens (section 3); VoiceOver labels; Dynamic Type at the largest size does not overlap (the blockLayout tiers again).
- Done: every gate; the full real regression (desktop and phone checks).

**P12 Release prep (S, Opus review).**
- Version 3.0.0 (decision 1), build number, the hand checklist (section 8).
- Jethro runs `eas build` and submits to TestFlight. **The agent never runs EAS** (paid, outward facing).

---

## 7. Test plan

- **Unit tests (node --test):** every new pure module (`todayView.ts`, the reminder scheduling plan, swipe thresholds, period paging dates, the quick add time from a tap position, snap for drag), plus the "fields kept on edit" test and the routine never doubled test. Existing shared tests keep running for every phase.
- **iOS export plus marker gate, every phase:** `npx expo export --platform ios --output-dir <temp>` then `npm run check:ios-markers -- <temp>`. Each marker removal is its own line in the commit and the changelog.
- **Phone UI real checks without a device (new, P2):** the web export draws the phone layout below 640 px (`useIsDesktop`). A new runner `desktop/test/real/phone-common.js` opens the same Electron app at **390 x 844** and sends real touch events through the Chrome DevTools Protocol (`webContents.debugger`, `Input.dispatchTouchEvent`: touchStart, touchMove in small steps with real timing, touchEnd). Gesture handler's web build listens to pointer events from these, so:
  - Tap: start and end at one point within 150 ms.
  - Scroll must not select: start, move 30 px vertically over 200 ms, end; assert nothing opened.
  - Press and hold: start, wait 450 ms, end; assert the menu.
  - Swipe row: start, move 120 px sideways over 250 ms; assert the action and the stored change.
  - Drag a block: hold 450 ms, then move; assert the new start time in the data file.
  - Same isolated data folder rules as the desktop checks; screenshots in light and dark.
- **What the web export cannot prove (hand test on a real iPhone):** native gesture feel and conflicts with the iOS back swipe and tab bar, haptics, notifications arriving (P7), fonts embedded in the build, Dynamic Type, VoiceOver, safe areas on a notched phone, the iPhone calendar permission, Apple and Google sign in, Match system following Control Centre, reduced motion.
- **Simulator (if Jethro has a Mac, guess: he does not; the repo builds on EAS only):** everything except haptics and notification delivery.

---

## 8. Risks

| Risk | Likely | Bad | Reduce it |
|---|---|---|---|
| The live App Store build (**2.18.1**, decision 2) uses the **old** Supabase project. Users on it never see the shared project's data | certain | medium | Nothing in this plan touches the old project. The catch-up release is the move; the project guard already handles first launch (CURRENT_TRUTH). Linking Apple and Google logins must come before any public release (decided 2026-10-15). |
| The new build moves the phone from the old project to the shared one (CURRENT_TRUTH: the move was never run on a device) | likely | medium | P12 hand checklist starts with sign in on the shared project and a first sync before any phone writes. |
| Pressing Convert routines before the new phone build is installed hides routines on the old build | possible | medium | Section 5; P12 checklist says when to press it. |
| A phone edit drops a Part B or C field | low | high | Spread rule plus the P6 test; the server keeps unsent columns anyway. |
| Two devices notify twice for one reminder | likely | low | Decision 3: "Remind me on this device" on each device. |
| Gesture conflicts: a swipe or scroll selects a row, or the sideways swipe fights the iOS back gesture | medium | medium | Tap with max distance and duration, `activeOffsetX` on paging, the touch real checks, a real phone hand test after P2. |
| Drag too slow without Reanimated (old architecture) | medium | low | Try on a phone after P2's build; if poor, a separate New Architecture plan. |
| woff2 fonts not loadable on iOS | certain | low | ttf files of the same version (P1). |
| Version numbers: `app.json` is shared by desktop and phone; build number is set by hand ("1") | certain | low | Decision 1: 3.0.0 at P12; P12 raises the build number. |
| Notification limit (64 pending on iOS) | low | low | Schedule a rolling 14 day window (P7). |
| Bundle size grows with shared modules | low | low | Marker gate plus checking the export size per phase (note it in the changelog). |

Nothing in this plan is irreversible. Irreversible actions stay with Jethro: the EAS build and TestFlight submit (P12), pressing Convert routines, any App Store release.

---

## 9. Hand test checklist on a real iPhone (end of P12)

1. Install over 2.18.1 (or fresh); sign in with Google and with Apple; first sync; desktop tasks appear with labels, lists, times.
2. Today: tick, Undo, Done today, expand, press and hold menu; a routine row ticks as before.
3. Tasks: switch lists, Repeating chip (tick, Skip, Today, streak small), swipe right done, swipe left Tomorrow and Delete; scrolling never opens a row.
4. Details: every field; edit a task with extra times on the desktop then on the phone; check both still match.
5. Reminders: a task 3 minutes ahead with "at the start"; lock the phone; it arrives; tick before and it does not.
6. Calendar: Day tap an empty slot, Cancel, add; Week and Month taps never create; swipe sideways; hold and drag a block.
7. Theme: Light, Dark, Match system with Control Centre; status bar; fonts.
8. Reduced motion on; VoiceOver on Today and Tasks; largest text size.
9. Only then, if wanted: Convert routines (phone Settings, Data) and see them on Today as repeating tasks.

---

## 10. Decisions (Jethro, 2026-10-22, final)

1. **Phone version:** 3.0.0, set in P12 (not before). Phases P1 to P11 keep the shared numbering (2.49.0 upwards).
2. **The live App Store version is 2.18.1** (it replaces the 2.1.0 and 1.0.1 notes in this plan). It still uses the old Supabase project.
3. **Reminders:** one per device setting, "Remind me on this device", on by default on the phone and on the desktop. Off = this device schedules no task reminders (the other device still does).
4. **Old custom events stay:** grey read only blocks in Day view and rows in Today (Now and Next included).
5. **New Architecture stays off.** A migration is planned only if drag feels slow on a real phone.
6. **Drag snap on the phone: 15 minutes.**
7. Layout and behaviour as in this plan: Today, Calendar, Tasks tabs; Repeating chip inside Tasks; Today in time order with the Anytime group, Undo on tick, expand in place; Calendar Day, Week, Month with swipe, tap an empty slot in Day to quick add, hold then drag to move; Tasks with the list switcher and the full task details; tap only counts if the finger barely moves, hold about 400 ms with a haptic.

Build rules for the batch: no database change, migration, backup, EAS run or push; nothing is pressed or built for "Convert routines"; one commit and version bump per phase; `docs/build-progress.md` updated after every phase; at the end of P5, P9 and P12 the security scan, the full real Electron regression and the touch runner at 390 x 844.
