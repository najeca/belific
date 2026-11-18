# Plan: step by step add, the Today Now card and hours strip, Plan my day (PLAN_phone_stepflow)

Written 2026-11-18 on `v2-redesign` at 3.58.0 (after the full regression of 4261c73, all green). Plan only: no app
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

## 2. Today on the phone

### Now card

A white card (radius 16, slab, an 8 px accent band; label colours are not in this brief) at the top of Today, in place
of the "Now / Next" lines:

- **Something now:** "Now · 19:00 to 20:00" (13/800 accentText), the title (24/800), **"25 min left"**, a short
  divider, then **"Next: Dinner at 20:30, in 55 min"** (title in textPrimary). A big **Done** (the row's `tick`, the same
  Undo bar).
- **Nothing now, something later:** "Next · 20:30", the title, "in 1 h 20 min"; no Done (chosen here: Start now from
  parity plan B is left out, it was not asked for; question 4).
- **Nothing left today:** "Nothing else today". **Nothing at all:** "A free day", quietly.
- "in <duration>" is the time until the next item starts, in the app's `formatMinutes` words.
- A quick reminder can be Now's next item ("Next: Ring the pharmacy at 14:00, in 10 min"); it is never "now" (it has
  no length).
- **Updates every minute:** the existing 60 s timer, plus an `AppState` listener so coming back from the background
  redraws at once (a timer does not run while the app sleeps). The times come from `buildToday`; a small pure
  `lib/nowCard.ts` gives the words (tested: now with time left, next only, the "in" text across the hour, midnight,
  a reminder as next, a multi time task).

### Hours strip

Under the Now card, one thin bar of today's planned hours **per label**, each part in its label's colour
(`labelColor(...).edge`, the same helper as the desktop), with a one line legend under it ("💪 Health 1h 30m · 💷
Money 45m · No label 2h").

- Counted: today's tasks still to do and done (chosen here: the day's plan, so ticking does not shrink it; question
  5), with the same minutes as `totalsOf` (a shift counted once, breaks not counted).
- **Zero minute reminders never count** (`isQuickReminder` is skipped, as `totalsOf` does). Tasks with no length count
  0 (chosen here; the desktop's totals do the same).
- **Lists are not coloured and not in the strip.** Tasks with no label are one neutral grey part, "No label".
- With no planned minutes the strip is not drawn.
- Pure `lib/labelHours.ts` + `labelHours.test.ts` (reminders skipped, a shift counted once, a deleted label falls to No
  label, order by most hours).

### Priority mark hidden

The ❗ mark is no longer drawn on any phone row or block (`today.tsx`, `tasks.tsx`, `calendar/DayView.tsx`,
`calendar/PhoneBlock.tsx`). The stored value and the desktop are untouched; a task set as top priority on the desktop
keeps it. Chosen here: the details' "Top priority" switch also goes from the phone (question 7), and Anytime's
"top priority first" order stays (it is shared with the desktop, `todayView.ts`).

**Tests:** real touch check `phone-p26` at 390 x 844 with a fixed clock: each Now card state, the minute update, Done
and Undo, the strip's parts and colours, a reminder not counted, no ❗ anywhere on Today, Tasks and Calendar, light
and dark. phone-p6 (it reads the old "Now / Next" lines, the planned line or the ❗) is updated on purpose.

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

## Phases

| # | Phase | Effort | Model |
|---|---|---|---|
| 1 | Step by step add flow (section 1) | L (2 days) | Opus for the flow rules, Sonnet for the screens |
| 2 | Today: Now card, hours strip, priority mark hidden (section 2) | M (1 to 1.5 days) | Sonnet |
| 3 | Plan my day on the phone (section 3) | L (2 days) | Opus |

Each phase: a version bump (`app.json` only, 3.59.0, 3.60.0, 3.61.0), CHANGELOG, `docs/build-progress.md`, one commit
for the app and a separate commit for any check changed on purpose.

**Gates for each phase:** `npx tsc --noEmit`; mobile `npm test`; `npx expo export --platform ios` to a folder outside
the repo and `npm run check:ios-markers -- <folder>`; the security scan (Git Bash); the new and the touched phone
touch checks at 390 x 844 (BELIFIC_TEST_DISPLAY=2, BELIFIC_QUIET=1), and the desktop checks that read shared code
(desktop `npm test`, cp6) to show **the desktop did not change**. The full regression once after phase 3.

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
