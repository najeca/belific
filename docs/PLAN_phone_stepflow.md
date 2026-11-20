# Plan: step by step add, the Today Now card and hours strip, Plan my day (PLAN_phone_stepflow)

Written 2026-11-18 on `v2-redesign` at 3.58.0; **updated 2026-11-19 at 3.59.1 (Part B): section 2 is the Today redesign, section 4 the Tasks tab redesign (it replaces parity phase 6), section 5 the later phases; plan only, waiting for confirmation** (after the full regression of 4261c73, all green). Plan only: no app
change. **Phone only: nothing the desktop draws or does changes.** Where this plan makes a choice of its own it says
"chosen here"; the questions at the end ask Jethro to confirm those.

This brief **replaces phases 4 and 7 of `PLAN_phone_parity.md`**:
- Phase 4 (+ opens the full task card, built in 3.56.0) is replaced by the step by step flow below.
- Phase 7 (items B and C: Now card, slab cards, label colours on every tab) is replaced by section 2 below. Slab cards
  for Planned and Anytime and label colours on rows are **not** in this brief (question 6).
- Plan my day (part of parity phase 9) becomes its own phase here. Wrap up and Plan week stay in parity phase 9.

No new data fields, no database change, no sync change, no EAS build, no push.

## What exists today (read at 3.58.0)

- **+** on Today, Tasks and Calendar calls `newTaskTarget` (`components/phone/newTask.ts`) and opens the whole
  `TaskDetails` card as a draft; a tap on an empty Calendar slot does the same with the time filled in. The draft is
  stored once it has a title (3.23.0); Cancel throws it away. Quick add phrases ("tomorrow 3pm 30m") show as chips (3.56.0).
- **Saving** goes through `TaskDetails`' `write` with the shared patches (`lib/detailsPatches.ts`: `titlePatch`,
  `datePatch`, `timePatch`, `durationPatch`, `listPatch`, `labelPatch`, `notesPatch`) and `lib/taskCommands.ts`.
- **Quick reminder**: a timed task with `durationMinutes: 0` (`lib/quickReminder.ts`, F6). It counts in no total
  (`taskTotals.totalsOf` already skips it).
- **Reminders** (the lead times): `task.reminders`, edited by `RemindersEditor.tsx` with the 3.54.0 first tap rule.
- **Smaller tasks**: `lib/parts.ts` and `components/phone/PartRows.tsx`.
- **Today** (`app/(tabs)/today.tsx`): `buildToday` (`lib/todayView.ts`) gives `now` and `next`; two text lines "Now …"
  / "Next …" and a planned total line; a 60 s timer while the tab has focus.
- **Priority**: `MUST_DO_MARK` (❗, red on iOS) is drawn on phone rows in `today.tsx`, `tasks.tsx`,
  `calendar/DayView.tsx` and `calendar/PhoneBlock.tsx`. `TaskDetails` has a "Top priority" switch.
- **Plan my day** on the desktop: `components/desktop/PlanMyDay.tsx` and `PlanButton.tsx`; the rules are shared in
  `lib/planDay.ts`, `lib/wrapUp.ts` and the writes in `lib/wrapActions.ts` (each answer saves at once and has its own
  Undo, D1). The phone has none of it.
- **Design**: the brief names `docs/04-design-system`; there is no such file. The calm style lives in
  `docs/DESIGN_SYSTEM.md`, `.claude/skills/design-identity` and `docs/design/motorways/SPEC.md` (Phone). This plan
  follows those.
- **Slab**: RN `boxShadow` needs the New Architecture (`newArchEnabled: false`), so the offset shape is a plain `View`
  placed absolutely behind the card, offset 6 to 7 px right and down, same radius, `border` colour,
  `pointerEvents="none"`, inside a wrapper with matching right and bottom margin; off in dark mode (parity plan B).
  Built once as a small phone helper and used by the new cards here.

## 1. Step by step add flow (opened by +)

A full screen flow, one question per screen, in the calm style (36/800 question, plain words, 44 pt targets, no red).

| # | Screen | Answers | Writes (through the existing patches) |
|---|---|---|---|
| 1 | **What's on your mind?** | a big multi line text box, **Next** | Next **stores the task at once**: title only, Anytime, no Day (chosen place below) |
| 2 | **When do you want it done by?** | **Today**, **Tomorrow**, **Pick a date** (month grid, `MonthGrid.tsx`) | `datePatch` |
| 3 | **What time?** | a time picker (`TimeField`), length chips (15m, 30m, 1h, 2h, as the details), and **Just a reminder** (no length) | `timePatch`, `durationPatch`; Just a reminder writes `durationMinutes: 0` (a quick reminder, F6) |
| 4 | **Which list or label?** | the lists (Brain Dump first), then the labels with their colour dot; the three presets each way when there are none (3.55.0 rules) | `listPatch`, `labelPatch` |
| 5 | **Anything else to add?** | Notes, then **Add a smaller task** (the `PartRows` rules), **Done** | `notesPatch`, parts as now |

- Every screen after 1 has **Skip** (leave as it is, go on), **Back** (the screen before; its answer stays saved and
  can be changed) and small **progress dots** (5, the current one filled, VoiceOver "Step 2 of 5").
- **Each answer updates the already saved task** with the same `write` path as the details card, so sync, the
  reminder scheduler and Undo behave as for any edit. No draft is kept after screen 1.
- **Closing at any point keeps the task as it is** (a ✕ top left on every screen, and the iOS swipe down). Closing on
  screen 1 with an empty box stores nothing; with text in the box it stores it (chosen here: typing then closing
  should not lose words).
- Screen 3 only shows after a Day is set; with Skip or no Day on screen 2 it is skipped (a time needs a Day,
  `timePatch` rules). Screen 3's reminder: a timed task gets the person's default reminders as now; **Just a
  reminder** is the quick reminder. Chosen here: no lead time chips in the flow (they stay in the details), so the
  screen keeps one decision.
- **Where the + was pressed** (chosen here): Screen 1 always stores with no Day (as the brief says). Pressed on the
  Tasks tab inside a list, the list is filled in at screen 1 and screen 4 shows it chosen. Pressed on Today, screen 2
  has **Today** chosen as the suggestion but nothing is written until tapped (question 1).
- **Quick add phrases** (3.56.0, "tomorrow 3pm 30m"): still parsed on screen 1 and shown as chips under the box;
  Next writes them with the title and the flow skips the screens they answered (chosen here: nothing is lost from
  3.56.0; question 2).
- **No priority anywhere** in the flow.
- **A tap on an empty Calendar slot** keeps opening the whole card with the time filled in (chosen here: a time is
  already chosen there, and the steps would ask it again; question 3). Only the round + opens the flow.
- The whole card (`TaskDetails`) stays for Edit, as now.

```
+---------------------------------+     +---------------------------------+
| ✕                               |     | ✕                     o ● o o o |
|                                 |     |                                 |
| What's on your mind?            |     | When do you want it done by?    |
| +-----------------------------+ |     |                                 |
| | Call the dentist            | |     | [          Today           ]    |
| |                             | |     | [         Tomorrow         ]    |
| +-----------------------------+ |     | [       Pick a date        ]    |
|                                 |     |                                 |
|                    [  Next  ]   |     | Back                      Skip  |
+---------------------------------+     +---------------------------------+
```

**Tests:** a pure `lib/stepFlow.ts` (which screens follow from what is set: no Day skips screen 3, phrase chips skip
their screens, the dots) with `stepFlow.test.ts`; real touch check `phone-p25` at 390 x 844: + on each tab, each
screen, Skip, Back, close at each step keeps the task, Just a reminder stores 0 minutes, a smaller task added, the
stored row after each answer. Older checks that tap + and expect the card (phone-p17 and phone-p22) are updated on
purpose in the same commit.

## 2. Today redesign (replaces the old phase 2; written 2026-11-19 at 3.59.1)

The old section 2 (a Now card over the old list, a thin hours bar) is replaced by this. Inspired by a vertical
timeline planner, **drawn with our own shapes, colours and tokens** (`lib/tokens.ts`, the label palette in
`lib/labelColors.ts`, Inter and Newsreader, the slab helper below); nothing is copied from any other app.

**Today is the home** (the first tab, as now). From top to bottom:

```
Today                                   (JC)
Thursday 19 November
[ Earlier 2 ]                        [ Plan ]
+------------------------------------------+
|| NOW · 14:00 to 15:00        ( Health )  |   label colour edge on the left, a pill on the right
|| Gym                                     |   with the label's name, or "Free time"
|| 25 min left                             |
|| ---------                               |
|| Next: Call Mum at 15:30, in 55 min      |
+------------------------------------------+
Hours today   [====green====|==blue==|..grey..]
💪 Health 1h 30m · 💷 Money 45m · No label 2h

 09:00  |  ( 💼 )  Stand up                      ( )
        |          09:00 · 15m
 10:00  |  (    )  Deep work block               ( )   bubble height shows the length
        |  ( 💼 )  10:00 · 2h
        |    · Smaller task: Draft             ( )   smaller tasks nest inside their block
        |
        |   (gap: Lunch, free time)                   a cut break is a gap on the line
 14:00 ●--- Now                                       the Now marker on the line
        |  ( 💪 )  Gym                           ( )
        ...
Anytime
+--------------------------------------+
| Buy stamps          💼 Work        ( ) |  separate slab cards, a visible gap
+--------------------------------------+
+--------------------------------------+
| Read chapter 3      🧠 Brain Dump  ( ) |
+--------------------------------------+
```

### Now card (pinned at the top)
- **Something now:** "Now · 14:00 to 15:00", the title, **"25 min left"**, a short divider, **"Next: Call Mum at
  15:30, in 55 min"**. A **label colour edge** (the label's `edge` colour, 6 px, on the left) and a **pill** at the
  top right with the label's name (its emoji too), or **"Free time"** when the item now is a free time block
  (`cutsBelow`) or nothing is planned now. A big **Done** for the task now (the usual tick, the Undo bar).
- **Nothing now, something later:** "Free time" pill, "Next: Call Mum at 15:30, in 1 h 20 min".
- **Nothing left today:** "Nothing else today". **Nothing at all:** "A free day", quietly.
- "in <duration>" is the time until the next item starts, in `formatMinutes` words. A quick reminder (0 minutes) can be
  Next ("Next: Ring the pharmacy at 14:00, in 10 min"); it is never Now.
- **Updates every minute** (the existing 60 s timer while Today has focus) **and when the app comes back from the
  background** (an `AppState` "active" listener redraws at once; a timer does not run while the phone sleeps).
- Pure `lib/nowCard.ts` gives the words (tested: now with time left, next only, "in" across the hour and midnight, a
  reminder as next, a multi time task, free time now).

### The timeline (today's timed items)
- A **thin vertical line** (2 px, `border` colour) joins one **bubble per item**. The bubble is a rounded shape in the
  item's **label colour** (its `tint` as the fill, `edge` as the ring; no label: the neutral grey) with the **list's
  emoji** in it (Brain Dump's 🧠 when none).
- **Bubble height shows the length**: a fixed scale (chosen here: 1 px per minute, at least 44 pt, at most 160 pt, so a
  5 minute item still has a full touch target and an 8 hour shift does not fill the screen). A quick reminder is a small
  round bubble (44 pt).
- Beside the bubble: the title (16/600), and **the time small under it** ("10:00 · 2h", Roboto Mono 13).
- A **tick circle on the right in the label colour** (the ring in `edge`, filled when done). Ticking keeps the row
  (struck through, as the timeline is the day's plan) with the Undo bar.
- A **Now marker on the line**: a dot and a short rule at the current minute, drawn between the items it falls between
  (inside a bubble when an item is running). It moves with the minute update.
- **Cut breaks are gaps**: a free time block is not a bubble; the line shows a gap with its name in small grey text
  ("Lunch, free time"), as the Calendar day grid already draws breaks (`lib/cuts.ts`, `lib/phoneDay.ts`).
- **Smaller tasks nest inside their block**: under the block's bubble, indented, each with its own small tick (the
  `PartRows` rules), the same for a shift's inside rows (`ShiftRows`).
- Events (the person's own and the starter ones) are drawn as plain grey bubbles with no tick, as now.
- A tap opens the row's card (`TaskDetails`); press and hold opens the centred `HoldCard`, as now.

### Anytime (untimed tasks for today)
- Each untimed task for today is its **own slab card** (the offset shape workaround, below) with a visible gap (10 pt),
  never joined into one card: title, the list name small, the label colour (an edge and a dot), the tick on the right.
- **Long press, then drag, reorders them**; the order is the **do first order** and Now card's "Next" never uses it
  (Next is timed only). A tap still opens the card; a long press still opens the HoldCard if the finger does not move
  (the same split the Calendar's block drag uses, `lib/phoneDrag.ts`: hold, then move).
- **Does this need a new column? Answer: not if we choose so.** A task has no order field (`Task` in `lib/types.ts`
  has none; the synced `tasks` columns have none). Two ways:
  - **(a) No database change (recommended):** one `user_settings` row per day, key `today.order.YYYY-MM-DD`, value the
    ordered task ids (JSON, at most a few hundred bytes). It syncs like every setting, needs no schema change, and old
    rows can be deleted after 14 days. A task not in the list goes after the ordered ones, by the current rule (top
    priority first, then oldest first). The desktop does not read it.
  - **(b) A new column** `tasks.day_order` (a number): cleaner per task, but it is a database change (a migration, the
    sync mapping, the desktop schema check) and it would be one more field a phone and the desktop edit at once.
  **No database change is applied without your go.**

### Hours strip (per label, for today)
- One thin bar under the Now card, one part per label in its colour, longest first, and a one line legend under it.
- Counted: **today's tasks done and planned both** (the day's plan does not shrink as you tick), with the minutes of
  `taskTotals.totalsOf` (a shift counted once; breaks never counted). **Zero minute reminders never count**
  (`isQuickReminder` is skipped). A task with no length counts 0. Tasks with no label are one grey "No label" part.
- **"Count in daily hours" switch per label**: in the label's own sheet (B2 adds one; until then a row in Settings,
  "Daily hours", a switch per label). Stored as `user_settings` rows `hours.count.<labelKey>` = `off` (no database
  change). **Sleep and Break are off by default**: a label named Sleep or Break (trimmed, any case) counts off until it
  is switched on. A label switched off is not in the strip or its total; its tasks still show on the timeline.
- No planned minutes: the strip is not drawn. Pure `lib/labelHours.ts` + test (reminders skipped, a shift counted once,
  a deleted label falls to No label, Sleep and Break off by default, a switched off label left out).

### The Calendar tab and the old Today list
- **The Calendar tab stays for planning other days**: its day view (with the drag), the week and the month, as now.
- **The old Today list goes**: the "Now / Next" text lines, the "Planned" card and the joined Anytime card are replaced
  by the Now card, the timeline and the Anytime slabs. "Done today" stays as the folded row at the bottom (ticked
  untimed tasks; ticked timed items stay on the timeline, struck through). Routines that are still routines show as
  Anytime slabs with their tick, as now. The Earlier pill (3.59.1) stays in the header row, beside the Plan button
  (phase 3).

### The red priority mark, hidden on every phone screen
The ❗ (`MUST_DO_MARK`) is no longer drawn on any phone screen: `today.tsx`, `tasks.tsx`, `calendar/DayView.tsx`,
`calendar/PhoneBlock.tsx` and `TaskDetails.tsx`. **The card's "Top priority" switch also goes in this phase**: decision 7
of 2026-11-18 took it off the phone, but it was never built (the card still shows it at 3.59.1). The stored value, the
desktop and the shared sort rules are untouched.

### Slab cards (shared helper)
RN `boxShadow` needs the New Architecture (`newArchEnabled: false` in `app.json`), so the slab is a plain `View` drawn
absolutely behind the card, offset 6 px right and 6 px down, same radius, `border` colour, `pointerEvents="none"`,
inside a wrapper with 6 px right and bottom margin; off in dark mode (a darker shape on a dark page reads as a smudge).
One small phone helper, `components/phone/Slab.tsx`, used by Anytime here and by the Tasks rows in section 4.

**Tests:** pure `nowCard.test.ts`, `labelHours.test.ts`, `anytimeOrder.test.ts` (the stored order, new tasks after,
deleted ids dropped); real check `phone-p27` at 390 x 844 with a fixed clock: each Now card state, the minute update,
the timeline order and bubble heights, the Now marker, a cut break as a gap, nested smaller tasks, the Anytime drag
order stored and kept after a reload, the strip parts and colours, Sleep off by default, a reminder not counted, no ❗
anywhere, light and dark. phone-p6 (it reads the old Now / Next lines) is changed on purpose.

## 3. Plan my day on the phone (its own phase)

A full screen flow, **one task at a time**: the task (title, list, label, its length) and **"When will you do this?"**
with **Today**, **Tomorrow**, **A time** (today, with the time picker) and **Not today**.

- **Which tasks, in order** (the shared rules in `lib/planDay.ts`, chosen here): today's tasks with no time first, then
  the Earlier tasks (`wrapUp.earlierItems`), then the tasks with no Day from Brain Dump and each list (`addRows`).
  Timed tasks already on today are not asked about. A progress line "3 of 9".
- **What each answer does** (the existing writes in `lib/wrapActions.ts`, never a phone copy):
  - Today: a Day of today (an Earlier or list task moves here; a today task stays).
  - Tomorrow: moves it to tomorrow.
  - A time: today at that time (length kept, the default when none).
  - Not today: the desktop's untick, a one off task goes back to its list (Day and time cleared), a repeating day is
    skipped (the usual skip tombstone); a list task is left as it is.
- **Save as you go:** each answer saves at once and the next task shows. **Undo** puts the last answer back (the
  Undo bar, per answer); the summary at the end lists each answer with its own **Undo** (the desktop's per row Undo,
  D1). Closing keeps what was answered. **Done** only closes.
- One line at the top: the day's planned total against the free time (`planDay.plannedText`).
- **The Plan button:** in the Today header beside the avatar, on Today only (parity decision 3), always shown (the
  Power features switches are desktop only, `components/desktop/featureStore.ts`). The desktop's rule picks Wrap up from 14:00 (`planFlowAt`); Wrap up and Plan week are
  not on the phone yet, so the phone button always opens **Plan my day** until parity phase 9 adds them (chosen here;
  question 8).

**Tests:** pure `lib/planQueue.ts` (the order, nothing asked twice, a repeating task's day) with a test; real touch
check `phone-p27` at 390 x 844: each answer and the stored row, Undo of the last answer, per row Undo in the summary,
close half way keeps answers, Not today on a repeating task skips only that day.

## 4. Tasks tab redesign (replaces PLAN_phone_parity phase 6)

```
Tasks                                   (JC)
[ Earlier 2 ]
Lists                                 + New list
 🧠 Brain Dump 4   💼 Work 7   🔁 Routines 2   ...      (chips with counts, as now)
Labels                               + New label
 ● Health 5   ● Money 2   ...                          (chips with a colour dot and counts)
[ Search ]                                [ Trash ]

+------------------------------------+
|| Buy stamps                    ( ) |    each task its own slab card, a 10 pt gap
|| 💼 Work · ● Errands               |    title, the list name small, label colour edge and dot
+------------------------------------+
+------------------------------------+
|| Renew passport                ( ) |
|| 🧠 Brain Dump                     |
+------------------------------------+
```

- **Slab rows:** every task is its **own separate card with a visible gap**, never joined (the `Slab` helper above).
  Each card: the title, the **list name small** (with its emoji), and the **label colour** (a 4 px edge on the left
  and a dot before the label's name). The swipes (Done, Tomorrow, Delete), the tap and the press and hold stay as now.
- **Repeating tasks grouped by how often**, with clear headers: **Daily, Weekly, Every 2 weeks, Monthly** (and, only
  when there are some, Every few weeks, Every year, Other repeats: the existing `QUEST_SECTIONS` in `lib/quests.ts`).
  Each group **collapses and expands** (a chevron on the header, 44 pt) and **remembers its state** on this phone (a
  `kv` key `belific_phone_repeat_folds`, never synced). **"Repeating" is never used alone as a label**: the chip
  becomes "🔁 Repeats" (chosen here; question B2.1). Each row says its pattern in words
  ("Every day", "Every Monday and Wednesday", "Every 2 weeks on Friday", "Monthly on the 3rd") with a new pure
  `repeatWords()` (the existing `repeatLine` gives "Mon, Wed" style short forms; the words version is new and tested).
- **Repeat until on the row:** "Until 17 Dec" after the pattern ("Every day · Until 17 Dec"), so a temporary task is
  clear at a glance.
- **Top of the tab:** the lists and the labels, each with its count (open tasks, the `lib/lists.ts` rule, without the
  Earlier ones as of 3.59.1), **+ New list** (the `ListSheet`), **+ New label** (a new phone label sheet: name, emoji,
  colour, using the colour row 3.59.1 added to the add flow; it also holds the "Count in daily hours" switch from
  section 2), **Search** (a full screen search over titles and notes with the shared `lib/taskSearch.ts`) and **Trash**
  (deleted tasks of the last 30 days with Restore, the shared Trash rules; Let go from Earlier lands here). A label
  chip opens every task with that label, grouped by list.
- **"Every year": it exists.** `lib/repeat.ts` has `annual` ("Every year", since 2.21.0), `lib/recurrence.ts` projects
  it (29 Feb falls on 28 Feb in other years) and the phone's `RepeatEditor` already offers it after the "every device
  is updated" tick (`ANNUAL_WARNING`). Nothing to build; the Tasks tab only needs its group header ("Every year") when
  such a task exists. (If you meant something else, for example a birthday style yearly date without the warning, that
  is a wording change only: drop the tick once every device runs 2.21 or later, which they now all do.)

**Tests:** pure `repeatWords.test.ts` (every rule and day set, until, a rule this version does not know); real check
`phone-p28`: slab cards with gaps and colours, the groups and their fold kept after a reload, the words, "Until 17 Dec",
counts, + New label, Search, Trash with Restore, light and dark. phone-p5, p9, p22 (they read the joined rows and the
"Repeating" chip) are changed on purpose.

## 5. Later phases (listed only, not started)

| # | Phase | Effort | Notes |
|---|---|---|---|
| L1 | **Home screen and lock screen widgets: Now and Next** | L (3 to 4 days, plus a TestFlight round) | Needs a native WidgetKit extension and an App Group to share the Now and Next text. **SDK 54:** Expo's own `expo-widgets` arrived (alpha) with **SDK 55**; there is no SDK 54 version. Two ways: (a) upgrade to SDK 55 or later first (its own phase, M to L, every native module rechecked), then `expo-widgets`; (b) stay on SDK 54 with Evan Bacon's `@bacons/apple-targets` config plugin and a small SwiftUI widget (it states SDK 53+; to be proven in a test build). Either way a new build, Xcode work and a hand test; no server. Recommended: (a) when the SDK upgrade is due anyway. |
| L2 | **Weekly hours statistics** | M (1.5 days) | One screen from the Profile sheet: the last 7 days, planned and done minutes per label (the `labelHours` rules of section 2, the same switches), a bar per day and a week total. No streaks, no loss wording, nothing red. Pure `weekHours.ts` + test. |

No Apple Watch app.

## Phases (updated 2026-11-19)

| # | Phase | Effort | Model |
|---|---|---|---|
| 1 | Step by step add flow (section 1) | done, 3.59.0 (fix pack 3.59.1) | |
| 2 | **Today redesign**: Now card, timeline, Anytime slabs and order, hours strip with the per label switch, no ❗ (section 2) | done, 3.60.0 | |
| 3 | Plan my day on the phone (section 3, unchanged) | L (2 days) | Opus |
| 4 | **Tasks tab redesign**: slab rows, repeat groups and words, Until, the top (lists, labels, Search, Trash) (section 4) | L (2.5 days) | Sonnet, Opus for `repeatWords` |
| L1 | Widgets (section 5) | L | later, not started |
| L2 | Weekly hours (section 5) | M | later, not started |

Order chosen here: 2, then 4 (both are the daily look), then 3. Each phase: a version bump, CHANGELOG,
`docs/build-progress.md`, an app commit and a separate commit for checks changed on purpose; the gates as before.

## Risks

- **The desktop shares `lib/`.** Every new rule goes in a new pure file used only by the phone; no shared file changes
  its behaviour. The iOS marker gate checks the other way round.
- **Screen 1 stores with no Day**, so a task added from Today is not on Today until screen 2 is answered. Someone who
  closes at once finds it in Brain Dump (question 1).
- **The keyboard over screen 1:** Next must stay above the keyboard (`KeyboardAvoidingView`); the harness does not show
  this: hand test.
- **The minute update while asleep:** the AppState redraw is the fix; only a real iPhone shows it.
- **Hiding the ❗ and the switch** means a phone only person cannot set top priority any more; it stays visible and
  settable on the desktop.
- Everything is checked in the web harness, not on an iPhone: the hand test list below goes with the next TestFlight
  build (which needs Jethro's "ready for EAS build").

## What to test on a real iPhone

1. +, type, Next, close at once: the task is in Brain Dump. Then the full flow with each Skip and Back.
2. Screen 1 with the keyboard up: Next reachable; Larger Text two steps up on each screen.
3. Just a reminder: it notifies at its time and is not in the hours strip.
4. Today across a task's end: the card moves on within a minute, also after locking and unlocking the phone.
5. Plan my day with a repeating task: Not today skips only today; Undo puts it back.
6. Dark mode and VoiceOver on every new screen (the dots read "Step 2 of 5").

## Questions (with recommended defaults)

1. **+ on Today stores with no Day until "Today" is tapped?** The brief says Anytime, no date. *Default:* yes, as the
   brief says; Today is the suggested answer on screen 2. (The alternative: + on Today stores with today's Day.)
2. **Keep the quick add phrases (3.56.0) on screen 1, skipping the screens they answer?** *Default:* yes.
3. **A tap on an empty Calendar slot keeps the whole card?** *Default:* yes; only the + opens the steps.
4. **Now card with nothing now: no Start now button?** *Default:* no button (not asked for).
5. **The hours strip counts done tasks too (the day's plan), and shows a grey "No label" part?** *Default:* yes to both.
6. **Slab cards for Planned and Anytime and label colours on rows (parity B and C) are dropped for now?** *Default:*
   dropped from this brief; they can come back as a later phase.
7. **Hide the "Top priority" switch in the phone's details too, not only the mark?** *Default:* yes (no priority on the
   phone at all); the desktop keeps it.
8. **The phone Plan button always opens Plan my day until Wrap up and Plan week reach the phone?** *Default:* yes.

## Decisions (Jethro, 2026-11-18, final)

All eight defaults are confirmed as written. Notes:
1. Screen 1's Next stores with no Day; screen 2 suggests Today. **The Tasks tab must show these clearly under Brain
   Dump**, so a closed flow never looks like a lost task.
5. The hours strip counts done tasks as well, so the hours do not shrink as things are ticked off.
7. The Top priority switch goes from the phone's details. Tasks that already have a priority keep it stored and synced;
   the desktop is unaffected.
6. Slab cards and label colours on rows stay in `PLAN_phone_parity.md` for later.

## Questions for Part B (with recommended defaults)

- **B1.1 Anytime order:** store it in one `user_settings` row per day (no database change)? *Default:* yes, option (a).
- **B1.2 Bubble scale:** 1 pt per minute, 44 pt at least, 160 pt at most? *Default:* yes.
- **B1.3 Ticked timed items stay on the timeline, struck through** (the day's plan), and only untimed ones fold into
  Done today? *Default:* yes.
- **B1.4 "Count in daily hours"** lives in Settings until the label sheet of phase 4 exists, then moves there?
  *Default:* yes. Sleep and Break are matched by name only.
- **B2.1 The Repeating chip's new name:** "🔁 Repeats", or "How often"? *Default:* "Repeats" (short, and a group header
  under it always says how often).
- **B2.2 Folded groups** remembered per phone only (not synced)? *Default:* yes.
- **B3 Widgets:** wait for the SDK 55+ upgrade (`expo-widgets`) rather than a separate Swift target on SDK 54?
  *Default:* yes.

## Decisions for Part B

**Jethro, 2026-11-20: all defaults confirmed as written.**
- B1.1 The Anytime order is one `user_settings` row per day; no database change.
- B1.2 Bubble height 1 pt per minute, at least 44, at most 160.
- B1.3 Ticked timed items stay on the timeline, struck through.
- B1.4 "Count in daily hours" switches live in Settings for now; Sleep and Break are matched by name as defaults the person can change.
- B2.1 The Repeating chip is renamed "Repeats".
- B2.2 Folded repeat groups are remembered per phone only.
- B3 Widgets wait for an SDK 55+ upgrade, which is its own later project.
- The Top priority switch leaves the phone's card as part of the Today phase.

**Built:** the Today redesign (phase 2) as 3.60.0, 2026-11-20. The Tasks tab redesign (phase 4) is not started.

**Built:** the Tasks tab redesign (phase 4) as 3.61.0, 2026-11-20.
**Built:** Plan my day on the phone (phase 3) as 3.62.0, 2026-11-20.
