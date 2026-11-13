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
