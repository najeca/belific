# Plan: the phone catches up with the desktop (PLAN_phone_parity)

Written 2026-11-13 on `v2-redesign` at 3.53.2. Plan only: no app change, no build, no account or database change.
Items A to C are Jethro's requests of 2026-11-13. Where this plan makes a choice of its own it says "chosen here".

## A. First launch: sign in first, so real data never looks lost

**The problem.** A fresh install opens straight on Today with an empty local store and no word about accounts
(`app/index.tsx` redirects to `/(tabs)/today`; sign in lives only in Settings). A person who has tasks under an
account sees an empty app and reads it as "my data is gone".

**What to build.**
- A full screen **"Sign in to see your tasks"** shown on first launch and whenever the phone is signed out:
  **Continue with Google**, **Continue with Apple**, **Continue with email**, and below them a small text button
  **"Use without an account"**. One short line under the heading: "Your tasks are kept with your account. Sign in to
  see them on this phone."
- "Use without an account" goes to Today and remembers the choice on this phone (a local key, never synced), so the
  screen does not come back on every launch. It comes back after a sign out (chosen here: signing out is the moment
  someone may want another account) and from Settings, Account, Sign in.
- Keep the **"Not signed in"** sync line under the screen title (3.53.2, `components/phone/chrome.tsx`), so a person who
  chose no account still sees it on every tab.
- While the first sync after sign in runs, Today shows "Getting your tasks…" instead of the empty state, so an empty
  screen never shows before the pull finishes.
- **Email is new work.** There is no email sign in today (`lib/authCore.ts`: "There is no Use email here on purpose").
  Use a Supabase **email one time code** (type the 6 digit code in the app), not a magic link: no deep link round
  trip, and nothing to add to the shared project's redirect list. The shared project's email template and mail
  settings are also Landis's and Proload's: read them before changing anything, and change nothing without Jethro.
  Supabase's built in mailer is limited and meant for testing; a custom SMTP sender is needed before App Store release.
  Same screen and code path on the desktop's Sign in page later (not in this item).

**Signing in with Apple when the data is under Google.** Supabase gives each sign in method its own user unless the
emails match and it links them; Apple's "Hide my email" relay address never matches, so Apple then opens a new, empty
account. What to do:
1. **Now (no linking yet):** after a sign in, if the account has **no Belific rows at all** after the first pull, show
   one plain sheet: "This account has no tasks yet. If you used Google (or email) before, your tasks are there."
   Buttons: **Sign out and try another way** (signs out locally, back to the sign in screen) and **Start fresh with
   this account**. Nothing local is uploaded into the new account until the person chooses (the same hold the desktop
   uses for an account switch, `belific_account_choice_pending`, `lib/accountSwitch.ts`).
2. **Later (release plan item E):** "Add a sign in method" in Settings while signed in (Supabase `linkIdentity`), so
   Apple can be added to the Google account and both open the same tasks. Needs the manual linking switch (release
   plan section 1 step 10). Until then, Settings, Account shows which method this account uses ("Signed in with
   Google as …"), so the person can tell the two apart.

**Done when:** a fresh install shows the sign in screen; each of the three methods reaches Today with the account's
tasks; "Use without an account" reaches Today and is not asked again until a sign out; an empty account after sign in
shows the sheet above; the "Not signed in" line is still there; real check at 390 x 844 with the fake server.

## B. Today: the Motorways Now card and slab cards

**The source.** `docs/design/motorways/A-phone-today.dc.html` and `B-phone-today.dc.html` (values in `SPEC.md`,
"Phone"). Build **B** (it is the one with slabs); A is the same without them.
- **Now card:** white, radius 16, an 8 px accent band across the top, padding 16/18. "Now · 19:00 to 20:00" 13/800
  `accentText`; the title 24/800, letter spacing -0.4; "Next: **Dinner** at 20:30" 14 `textSecondary` with the title
  in `textPrimary`; a short 70 x 4 divider in `border`; a big centred **Done** button (accent fill, onAccent text
  20/800, padding 10/26, at least 44 pt tall). Slab 7 px.
- **Planned** and **Anytime:** section labels 14/800 `textSecondary` (not upper case), each section one white slab card
  (radius 12, slab 6 px), rows at least 44 pt, padding 12/16, a round 22 px tick, title 16/700, duration 14/800 on the
  right, a done row ticked in accent with the title struck through in `textSecondary`.
- The header keeps "Today", the date and the sync line; the mock's "3 of 5 done" is left out (chosen here: it was left
  out on purpose before, see below, and nothing in this request asks for it).

**When nothing is planned right now.** The card never says "Nothing planned". It shows what is next instead: "Next ·
20:30" over the next task's title, with "in 1 h 20 min" as the second line, and **Start now** in place of Done
(chosen here: moves its start to now, one undo). With nothing left today it reads "Nothing else today" with **Add a
task** (the round + action). With nothing at all it says "A free day" quietly.

**Reminders in the same place.** A quick reminder (a timed task with 0 minutes, 3.48 F6) and a reminder that has gone
off are shown in the Now card when they are the current or next item: "Reminder · 14:00" over its text, with **Done**.
No second card (chosen here: one place to look, as asked).

**How it fits the Today list built now.** `app/(tabs)/today.tsx` already works out Now and Next (`lib/todayView.ts`
`buildToday`, the "Now … / Next …" lines at line ~391) and groups Planned and Anytime. Keep `buildToday` as the one
source; the change is the drawing: the Now and Next lines become the card, and the two groups move into slab cards.
Everything in a row stays as built: the tick with Undo, press and hold menu, swipe, shifts with their inside rows
(S5), parts (R6), events from the iPhone calendar. The Done button calls the same `tick` as the row, with the same
Undo bar. The current task's row stays in Planned as well (ticked state stays in step).
This reverses the earlier Motorways decision for the phone ("no Now card, no X of Y done, the list stays as built",
override 4, and "slab 0 on the phone", `docs/design/motorways/BUILD_PLAN.md` phase 4): Jethro asked for the Now card
and slabs on 2026-11-13, so that note is out of date for Today.

**Slabs without the New Architecture.** The app runs the old architecture (`newArchEnabled: false` in `app.json`).
React Native's `boxShadow` style, the obvious way to draw an offset slab, only works on the New Architecture, so do
not use it. Draw the slab the way the mock does: a plain `View` placed absolutely behind the card, offset 6 or 7 px
right and down, same radius, `border` colour, `pointerEvents="none"`, inside a wrapper with a matching right and
bottom margin so it never changes the card's measured width or catches a touch. That works the same on the old
architecture, the New Architecture and the web harness. Slabs are off in dark mode (no dark slab colour is designed;
the BUILD_PLAN rule `slabOffset` 0 in dark). Do **not** switch on the New Architecture for this: it is a native change
that touches every library and needs its own build and full test round.

**Done when:** the card shows the current item, the next item when nothing is current, and a reminder when it is the
item; Done ticks with Undo; Planned and Anytime are slab cards; everything rows did before still works; real checks at
390 x 844 for each card state, light and dark; the old Today real checks pass or are updated only where the look
changed.

## C. Colour: label colours on phone cards and rows, as on the desktop

**What the desktop does** (`components/desktop/TaskCard.tsx`, `lib/labelColors.ts`, `lib/tokens.ts`):
- a labelled card is filled with the label's **tint** (`labelTint` / `tint`, the soft colour);
- a **band** of the label's strong colour (`edge`) across the top, `band.card` tall (6 px), from 3.32.0;
- a soft **outline** of the label colour (20 % over the surface);
- no label: the plain card colour, no band;
- the tints are light on purpose: `textPrimary` and `textSecondary` stay readable (AA, tested in
  `labelColors.test.ts`), custom hex labels included.

**What the phone shows today:** only a small label dot in the details sheet; rows and blocks are plain.

**What to copy, per place (chosen here):**
- **Today rows** (inside the slab cards from B): the row is filled with the label's tint and carries a 4 px band of
  the `edge` colour down its **left** side (a top band on every row of a list would read as stripes). A done row keeps
  its tint at lower strength, title struck through as now.
- **The Now card:** keeps the 8 px **accent** band from the mock when the task has no label; a labelled task uses its
  label's `edge` for the band and its tint for the card body.
- **Tasks list rows:** the same as Today rows.
- **Calendar blocks** (Day, Week): the tint fill and the edge as the block's existing 3 px left edge (`PhoneBlock`
  already has one; it takes the label colour); Month keeps a dot per task.
- **Not copied:** the desktop's outline (too fine at phone size, and it doubles the band) and the hover states.
- Use the same `labelColor` / tint helpers as the desktop, never new colour values, so a label is the same colour on
  both. Dark mode uses the dark tint the desktop already uses.

**Done when:** a labelled task is coloured the same on Today, Tasks and the Calendar as on the desktop; unlabelled
tasks stay plain; text contrast passes for every palette colour and a custom colour (extend the existing contrast
test); real checks at 390 x 844 read the fill and band colour.

---

# Items 1 to 10: feedback from TestFlight 3.53.1 (2026-11-13)

Goal: the phone feels like the same app as the desktop, simple but complete, for a beginner and for someone over 50.
Rules for every item: plain words, text at least 14 px, touch targets at least 44 pt, no red anywhere (see item 10:
the delete rows and the now line are red today).

## What the phone does today (read 2026-11-13, at 3.53.2)

| Screen | Today | Missing against the desktop |
|---|---|---|
| Today (`app/(tabs)/today.tsx`) | Today only, in time order, Anytime below; "Now / Next" lines; tick with Undo; press and hold menu; also shows the starter sample events (Morning routine, Work block, Evening wind down) and old style routines | Plan my day, Wrap up, Earlier (missed tasks), label colour, the Now card (item B) |
| Tasks (`app/(tabs)/tasks.tsx`) | Chips at the top: Brain Dump, each list, Repeating; the chosen list's tasks; swipe right done, left Tomorrow or Delete; hold a list chip to edit it | Lists and labels overview with counts, labels at all, new label, tasks grouped by list, Search, Trash, Templates |
| Details (`components/phone/TaskDetails.tsx`) | A full page sheet: date, time, length, repeat, repeat until, times a day, reminders, label, list, notes, steps, Parts | Close to complete; the wording ("Parts"); the reminders picker misbehaves (item 5) |
| Quick add (`components/phone/QuickAdd.tsx`) | A title and Add; everything else later in the details | The desktop's quick add phrases (3.49 F7, "tomorrow 9am 30m"); setting everything at once (item 1) |
| Long press menu (`components/phone/menu.tsx`) | A bottom sheet of rows: Edit, Add inside, Duplicate, Move to list, Brain Dump, Skip this day, Delete | A view of the task itself; Skip explained; Done and Move as clear actions (item 3) |
| Lists and labels (`ListSheet.tsx`, the label row in details) | New list and edit list from the Tasks chips; a new label only from inside a task's details; a label shows as a small dot | The desktop's Labels page, label colours on cards (item C), presets (item 6) |

## 1. The + button opens the full task card

**Today:** + opens a small sheet with only a title; the rest is set later by opening the task.

**Build:** + opens the same full card as the details (`TaskDetails`), empty, with the title field focused and the
place already filled in (today, the chosen list, the tapped time on the Calendar). Every row is there from the start:
title, list, label, day, time and length, repeat, repeat until, reminders, smaller tasks. The task is saved once it
has a title (this already works: `TaskDetails` keeps a new task in memory until it has a title, 3.23.0). **Done** at
the top closes the card; **Cancel** throws the unsaved task away.
The desktop's quick add phrases (`lib/quickParse.ts`) also run on the title as it is typed: "Dentist tomorrow 3pm 30m"
fills day, time and length, shown as chips under the title so nothing happens unseen.

```
+---------------------------------+
| Cancel        New task     Done |
|---------------------------------|
| [ Dentist tomorrow 3pm 30m    ] |
|   (Tomorrow) (3:00pm) (30 min)  |
|---------------------------------|
| List        Personal          > |
| Label       o Health          > |
|---------------------------------|
| Day         Tomorrow          > |
| Time        3:00pm, 30 min    > |
| Repeat      Never             > |
| Reminders   At the start      > |
|---------------------------------|
| Smaller tasks                   |
| + Add a smaller task            |
| Notes                           |
+---------------------------------+
```

## 2. Tasks tab: lists and labels like the desktop's left pane

**Today:** a row of chips and one list's tasks; no overview, no labels.

**Build:** the tab opens on an overview; one tap opens a list or a label.

```
Tasks                         (J)
Synced just now
+---------------------------------+
| Brain Dump                  4 > |
| Repeating                   6 > |
+---------------------------------+
Lists
+---------------------------------+
| Home                        7 > |
| Work                       12 > |
| Shopping                    3 > |
| + New list                      |
+---------------------------------+
Labels
+---------------------------------+
| o Health                    5 > |
| o Money                     2 > |
| + New label                     |
+---------------------------------+
| Search                        > |
| Trash                         > |
+---------------------------------+
```

- Counts are open tasks (done ones not counted), the same rule as the desktop's left pane (`lib/lists.ts`).
- A list opens its tasks (the screen built now, with a Back arrow in place of the chips). A label opens every task
  with that label, **grouped by list**, the list's name as a small heading over each group.
- **+ New list** opens `ListSheet` as now. **+ New label** opens a new phone label sheet (name, emoji, colour from the
  same palette as `LabelColorPicker`). Press and hold a list or a label to edit or delete it.
- Search and Trash are two plain rows at the bottom (the desktop has both; the phone has neither).

## 3. Press and hold: a centred card

**Today:** a bottom sheet of rows; the task itself is not shown and Skip is not explained.

**Build:** the screen dims and a card in the middle shows the task larger: its title (20/700), day and time, length,
list, and label with its colour. Under it, large buttons (at least 44 pt, two to a row): **Done**, **Edit**, **Skip
today** (repeating tasks only), **Move**, **Delete**, and **More** for the rest (Duplicate, Add inside, Brain Dump).

```
        +-------------------------+
        |  o Health               |
        |  Swim                   |
        |  Today, 7:00 to 8:00am  |
        |  Repeats every Monday   |
        |-------------------------|
        |  [  Done  ] [  Edit  ]  |
        |  [Skip today] [ Move ]  |
        |  Skip today: not today. |
        |  It still repeats next  |
        |  Monday.                |
        |  [ Delete ] [  More  ]  |
        |         Cancel          |
        +-------------------------+
```

- **Skip today** has one line under it: "Not today. It still repeats next time." (naming the next day when it is
  known, `lib/series.ts`). It uses the existing `skipDay`.
- **Move** opens "Move to": Tomorrow, Next week, Pick a day, a list.
- **Delete** in quiet ink, not red. A repeating task then asks "Only today, or every day?" on the same card.
- A tap on the dim area closes it; with reduced motion it is a plain fade (as `menu.tsx` does now).

## 4. Plan my day, Wrap up and Plan week on the phone

**Today:** none of the three. The desktop has them (`PlanButton.tsx`, `PlanMyDay.tsx`, `WrapUp.tsx`, `PlanWeek.tsx`;
the rules are shared in `lib/planDay.ts` and `lib/wrapUp.ts`).

**Build:** a visible **Plan** button in the Today header beside the avatar, using the desktop's rule for which one it
offers (Plan my day in the morning, Wrap up from the afternoon), with the other two one tap away. Each is one
scrolling screen that reuses the shared rules, never its own copy.
- **Plan my day (worth building):** "On today" with a tick to keep or untick to leave each task; then "From your
  lists" and "Earlier" to add with one tap; one line with the day's total against the free time; Done at the bottom.
- **Wrap up (worth building):** each of today's tasks with a tick. An unticked one gets three buttons: **Tomorrow**,
  **Back to its list**, **Let go** (to Trash, as decided for the desktop). Smaller tasks: only the ones left go to
  tomorrow, as on the desktop.
- **Plan week (a smaller version):** the seven days as rows with each day's total; a tap on a day opens that day's
  Plan my day. Not built on the phone: dragging between day columns (no room at 390 pt).
- **Not worth building on the phone:** Analytics (reading charts is a desktop task) and the Timebox inside Plan my
  day; a time is set from the task card instead.

```
Plan my day                 Done
Friday 13 November
On today            3h of 7h free
+---------------------------------+
| (v) Swim             7:00  1:00 |
| (v) Write report           2:00 |
| ( ) Call Mum                    |  <- unticked: left for another day
+---------------------------------+
From your lists
+---------------------------------+
| (+) Buy stamps        Shopping  |
| (+) Book dentist      Home      |
+---------------------------------+
```

## 5. Reminders bug (the first phase)

**Seen:** choosing "At start time" or "One day before" makes the reminders picker go wrong.

**Cause, from reading the code (confirm on the iPhone first):**
1. **The chips toggle against the hidden default.** A task on Default already counts as "at the start"
   (`DEFAULT_REMINDERS = [0]` in `lib/reminder.ts`). In `components/phone/RemindersEditor.tsx`, when nothing is set
   yet, a lead chip toggles `effectiveReminders(task, DEFAULT_REMINDERS)`, so:
   - tapping **At start time** on a Default task *removes* the start time: the list becomes empty and the picker jumps
     to **None**;
   - tapping **1 day before** *adds* to the hidden start time: two chips light up, "At start time" included, which the
     person never chose.
2. **The Reminders row overflows on the iPhone.** The row's value (`rowValue` in `TaskDetails.tsx`) has no
   `flexShrink` and no line limit. "At start time, 1 day before, pick a day and a time to get reminders" is wider than
   the row, and on iOS such a text pushes out past the edge instead of wrapping. The web harness wraps it anyway, so
   the real checks never saw it.

**Fix:**
- A lead chip on a Default task starts from an **empty** list, so the first tap gives exactly that one reminder.
- Plain chip words: "At the start", "5 minutes before" ... "1 day before"; "Default" reads "Default (at the start)".
- The row value gets `flexShrink: 1` and at most two lines; the "pick a day and a time" hint shows under the chips only.
- A unit test for the toggle (`reminder.test.ts`) and a phone real check that taps each chip from Default and reads
  which chips are on; then a hand check on the iPhone (the overflow only shows there).
- The desktop's Reminder menu shares the toggle: check it in the same phase and fix both at once if it has the same
  first tap problem.

## 6. Presets: three example lists and three example labels

Shown as greyed suggestions when a person has none, and offered at the top of "New list" and "New label", on phone and
desktop. One tap creates it; name, emoji and colour can be changed after. Nothing is created without a tap.

| List | Emoji | | Label | Emoji | Colour |
|---|---|---|---|---|---|
| Home | 🏠 | | Health | 💪 | Green |
| Work | 💼 | | Money | 💷 | Yellow |
| Shopping | 🛒 | | Family | 👪 | Blue |

Suggested because they cover most people's first week and do not overlap: a list says *where* a task belongs, a label
says *what kind* it is. Lists get no colour (as now); label colours come from the existing palette (`LABEL_COLORS`),
chosen far apart.

## 7. Wording: "Parts" becomes "Smaller tasks"

Recommended on phone and desktop. The words live in `lib/parts.ts` (shared), so one change covers both:
- heading **Smaller tasks** (was Parts); button **Add a smaller task** (was Add part);
- a one line hint under the heading: "Break a big task into steps you can tick off one at a time.";
- "Turn into parts" becomes **Turn steps into smaller tasks**; "2 of 5 done" stays;
- "Checklist" (a shift's to dos) stays: it means something else.
The real checks that read these words are updated in the same commit.

## 8. The rest of the Motorways look on the phone

Builds on item B, from `docs/design/motorways/SPEC.md` and `BUILD_PLAN.md` phase 4, tokens unchanged (`lib/tokens.ts`):
- an 8 px accent band on top of every sheet and card (the task card, the centred hold card, the Plan screens,
  Settings sections);
- Inter 800 for heavy titles (36/800 page title, 24/800 Now title), Newsreader kept where it is now. Inter 800 must be
  added to `phoneFonts.native.ts` and mapped in `type.ts`, or the iPhone falls back to the system font (BUILD_PLAN
  risk 4), and it needs a new build;
- one white slab card per section on Tasks and Settings (the same slab helper as item B; off in dark mode);
- square cornered buttons (radius 10) and the filled accent selected tab, as on the desktop.

## 9. The Calendar day grid draws shifts and blocks side by side

**Yes, fix it.** Side by side halves the width of every block inside a shift (a shift with three blocks inside draws
four thin columns), and it tells a different story from Today and the desktop, where a shift is a shell and what is
inside sits in it at real size (Shifts S2). Draw the shift as a wide pale shell with its inside blocks on top, full
width, as `ShiftBody` does on the desktop; blocks that overlap outside a shift stay side by side. The rules already
exist (`lib/shifts.ts`); this is drawing, touch and the hold to drag of P10. Effort M, Opus.

## 10. Anything else that makes the phone feel unlike the desktop

- **Sample events that look real.** Today shows the starter events from `lib/data.ts` (Morning routine, Work block,
  Lunch break, Gym, Evening wind down...) while the starter switch is on. The desktop does not show them, and next to
  a person's own evening routine they read as **two evening routines**. Recommend: drop them from Today and use the
  presets (item 6) as the way in.
- **Two kinds of routine.** Old style routines still show on Today next to repeating tasks. Settings already offers to
  turn them into repeating tasks (`RoutineConvertSection`); offer it once on Today, plainly.
- **Red.** Delete rows use the danger colour (`danger: true` in the menus, Settings' Delete Account icon) and the Day
  view's now line is red (the `now` token). Make delete quiet ink with a clear word, and the now line accent or ink.
- **Desktop only today:** quick add phrases, Search, Trash, Templates (items 1 and 2 bring the first three).
- **Undo:** every action from the centred card (item 3) and from Wrap up gets the same Undo bar as a tick.

## Phases (items A to C and 1 to 10)

| # | Phase | Items | Effort | Model |
|---|---|---|---|---|
| 1 | Reminders picker fix (phone, and the shared toggle on the desktop) | 5 | S (half a day) | Sonnet |
| 2 | First launch: sign in screen, email code, the empty account sheet | A | L (2 to 3 days) | Opus |
| 3 | Wording and presets | 7, 6 | S (1 day) | Sonnet |
| 4 | + opens the full task card, quick add phrases | 1 | M (1 day) | Sonnet |
| 5 | Centred press and hold card | 3 | M (1 day) | Sonnet |
| 6 | Tasks tab overview, labels, new label, Search and Trash rows | 2 | M to L (1.5 days) | Sonnet |
| 7 | Today: Now card, slab cards, label colours on every tab | B, C | L (2 days) | Opus for the Now card rules, Sonnet for the drawing |
| 8 | The rest of the look, no red, sample events off | 8, 10 | M (1 day) | Sonnet |
| 9 | Plan my day, Wrap up, Plan week | 4 | L (2 to 3 days) | Opus |
| 10 | Calendar day grid: shifts as shells | 9 | M (1 day) | Opus |

Each phase: a version bump, CHANGELOG, `docs/build-progress.md`, real checks at 390 x 844. One TestFlight build every
two or three phases (the app has no expo-updates, so nothing reaches the iPhone without a build); phase 8 needs one
for Inter 800.

## Risks

- **Everything here is checked in the web harness, not on an iPhone.** Item 5's overflow is exactly the kind of fault
  the harness hides. Each TestFlight build gets the hand test below before the next phase starts.
- **Email sign in touches the shared Supabase project** (Landis and Proload share its mail settings and templates).
  Nothing changes there without Jethro.
- **The full card on +** makes adding a task a bigger moment: the title must stay focused and Done reachable with the
  keyboard up, or adding gets slower, not faster.
- **The wording change** touches many real checks that read "Parts": one commit, every check updated.
- **Sample events off** changes what an existing phone shows on Today; someone who used them as a timetable loses them
  (question 1).
- **Inter 800 on iOS** needs the font file in the build; without it the phone falls back silently.

## What to test on a real iPhone (each TestFlight build)

1. Reminders: from Default, tap At the start, then 1 day before, then each other chip; the row stays on screen.
2. First launch after delete and reinstall: the sign in screen; Google, Apple and email; Use without an account.
3. Apple when the tasks are under Google: the "no tasks yet" sheet; Sign out and try another way.
4. +: type "Dentist tomorrow 3pm 30m", check the chips, set a reminder and a smaller task before Done.
5. Press and hold: the centred card, Skip today on a repeating task, Move, Delete (not red), Undo.
6. Tasks tab: counts match the desktop for the same account; a new list and a new label; a label grouped by list.
7. Today through a day: a task now, nothing now, a reminder, nothing left; Done and Undo.
8. Larger Text (iPhone Settings, Accessibility, two steps up) on every new screen: nothing cut off or overlapping.
9. Dark mode on every new screen; VoiceOver reads each new button.
10. Calendar Day: a shift with blocks inside reads as one shell.

## Questions (with recommended defaults)

1. **Remove the starter sample events (Morning routine, Work block, Evening wind down) from Today on the phone?**
   *Default:* yes; the presets (item 6) are the way in for a new person.
2. **Are Home, Work, Shopping and Health, Money, Family the right six presets?** *Default:* yes, as written.
3. **Plan button on Today only, or on every tab?** *Default:* Today only (that is where planning starts).
4. **Email sign in by a 6 digit code rather than a link?** *Default:* yes, a code (no deep link, nothing added to the
   shared project's redirect list).
5. **"Smaller tasks" on the desktop too, in the same phase?** *Default:* yes, one shared wording change.

## Decisions (Jethro, 2026-11-13, final)

1. **Sample events come off Today** (the starter events from `lib/data.ts`).
2. **Presets:** lists Home, Work, Shopping; labels Health, Money, Family (as in item 6).
3. **The Plan button is on Today only.**
4. **Email sign in is dropped for now:** Google and Apple only. Changing the shared Supabase email template would
   affect Landis and Proload. Item A's email parts (the third button, the code entry, the custom SMTP sender) are out of
   scope until this is decided again.
5. **"Smaller tasks" replaces "Parts" on desktop and phone at the same time** (one shared wording change, phase 3).
