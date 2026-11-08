# Mini Motorways restyle: build plan (phase 0)

Written 2026-11-08 from `SPEC.md`, the six mockups in this folder, `BUILD_PROMPT.md` (whose overrides win over both) and
the code at 3.29.1 (`b81f224`). Visual restyle only: no change to behaviour, data, sync, navigation, copy (except the
one string below), schema or tests' meaning. Landis and Proload are not touched (`design-tokens/` only gains entries).

## 0. Baseline

`docs/screens-motorways-baseline/` (not committed): 18 shots taken with the new recorder
`desktop/test/real/motorways-shots.js` (real Electron app, isolated data folder, fake Supabase, the page clock fixed at
Mon 9 Nov 2026 10:20 so every run draws the same day and now line).

| Desktop, light and dark (1440 x 900) | Phone, light and dark (390 x 844) |
|---|---|
| `desktop-week-board-*` (Tasks board, Brain Dump, Timebox) | `phone-today-*` |
| `desktop-day-view-break-*` (Calendar Day view, Lunch with 3 chips) | `phone-calendar-*` (Day view) |
| `desktop-task-details-*` (Write report: label, ! switch, notes) | `phone-tasks-*` |
| `desktop-settings-*` | `phone-details-*` (details sheet) |
| `desktop-popover-filter-*` (the Filter popover) | |

Run: `cd desktop; $env:BELIFIC_SHOTS='<folder>'; $env:MW_THEME='light'|'dark'; $env:MW_PHONE=''|'1'; npx electron test/real/motorways-shots.js`
(after `node scripts/build-web.js`). Each later phase saves the same set to `docs/screens-<version>/`.

## 1. Fonts

| Weight | Desktop (woff2, `desktopFonts.ts`) | Phone (ttf, `phoneFonts.native.ts`, `type.ts`) |
|---|---|---|
| Inter 400, 500, 600, 700 | bundled | bundled |
| **Inter 800** | **missing** | **missing** |
| Newsreader 500, 600, 700 | bundled | bundled |
| Roboto Mono 400, 500 | bundled | bundled |

The bundled Inter files are byte for byte `@fontsource/inter@5.1.0` latin (Inter 4.001, 231 code points, same hash).
Inter ExtraBold comes from the same package and version (`inter-latin-800-normal.woff2`, Inter 4.001, same subset, SIL
OFL 1.1, the licence already beside the files as `Inter-OFL.txt`). The `.ttf` is unpacked with fontTools exactly as the
others were (the same step reproduces the shipped `Inter-700.ttf` byte for byte).

- **Phase 1:** the two files are added to `mobile/assets/fonts/` (`Inter-800.woff2`, `Inter-800.ttf`), **not yet
  registered**: one existing glyph already asks for weight 800 (the done tick ✓ in `TaskCard.tsx:477`), and registering
  the real 800 would change it, so phase 1 would not be pixel identical. The weight token is added.
- **Phase 2:** registered on both (`desktopFonts.ts` INTER list, `phoneFonts.native.ts` 'Inter-800', `type.ts` Weight
  gets 800). Phone bundle grows by about 67 KB, desktop by about 24 KB.

## 2. Token additions (phase 1, `mobile/lib/tokens.ts`)

Kept out of `ColorTokens` unless they are colours, so `themeStore` does not set new CSS variables for shapes.

| Token | Value | Use |
|---|---|---|
| `radius.square` | `0` | buttons, tags, chips, segmented toggles (one line to change to 4) |
| `radius.card` | `12` | task cards (the spec's 12 px; not in the old scale) |
| `borderWidth` | `{ hair: 1, thick: 2, heavy: 3 }` | card outline, input, dashed add row (2); details checkbox ring (3) |
| `band` | `{ pane: 8, card: 6 }` | the coloured band across the top of panes, the details window, cards |
| `slab` | `{ offset: 7 }` + `slabOffset(kind, theme, phone)` | pane 7, window `offset + 3` = 10; 0 in dark, on the phone, or when `offset` is 0 |
| `divider` | `{ height: 4, short: 60, medium: 70, long: 80 }` | the short centred dividers |
| `fontWeight` | `{ regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' }` | heavy titles |
| `focusRing` | `{ width: 2, offset: 2, color: 'textPrimary' }` | every button, input, tab (`:focus-visible`) |
| `onAccent` | exists already: light `#FFFFFF`, dark `#121212` | see section 6 |
| `labelTint(color, surface, amount = 0.2)` | pure function | card outline: the label colour 20 % over the surface |

`labelTint` accepts any `#RRGGBB` (the 20 palette colours, the 12 legacy ones, a colour wheel hex, a Vibrant colour)
and any surface (light `#FFFFFF`, dark `#282828`), returns `#RRGGBB`, and is unit tested over all of them.
`design-tokens/` is regenerated with `mobile/scripts/export-tokens.mjs`, which learns the new groups (json, css
variables, Tailwind preset); never edited by hand.

## 3. What changes, screen by screen (phases 2 to 5)

### Phase 2, desktop shell (3.31.0)
- **Page and panes** (`DesktopHome.tsx`, `Sidebar.tsx`, `BrainDumpPane.tsx`, `KanbanPane.tsx`, `CalendarPane.tsx`
  header, `TimeboxPane.tsx`): pane radius 16 (`radius.xl`, unchanged value), no pane border, 8 px accent band on top,
  inner padding 20, slab 7 px in `border` colour (light only), page `background`. No decorative grid (override 8).
- **Titles:** pane titles 26/800/-0.5 ("Timebox", and the Brain Dump list title where it is the pane title);
  month title 30/800/-0.6; day headings 22/800 with the date at 500 `textSecondary`.
- **Short dividers** replace the full width hairlines under pane titles and between sections only. The Calendar hour
  grid lines, the day column separators and the all day row lines stay.
- **Top bar buttons** (Tasks/Calendar segmented, Today, Quests, Filter, Only today, Day/Week/Month segmented, the
  show/hide edge buttons, the profile avatar): square (`radius.square`), primary = accent fill + onAccent text 16/700,
  secondary = `hostPill` fill + `onHostPill` text; segmented = two square buttons side by side; avatar 44 px circle
  `textPrimary` fill, initial 17/700 in `background`. The top bar's layout, order and controls are unchanged (no ribbon).
- **Brain Dump pane:** input 46 px, 2 px `textPrimary` border, square, plus icon; rows `surfaceRaised`, radius 10,
  padding 12/14, 18 px ring checkbox, title 15/600, gap 10; the count line "**4** tasks, no day yet" (override 14).
- **Timebox pane header:** title 26/800, date line 13 px with the planned total bold in `textPrimary`.
- **Week board day headings** and the **dashed Add a task rows** (2 px dashed `borderStrong`, radius 10, padding 10/12,
  14 px `textSecondary`, the day total bold `textPrimary` on the right).

### Phase 3, cards and details (3.32.0)
- **Task cards** (`TaskCard.tsx`): radius 12, `surface` (or the label tint fill as today), 2 px outline in `border` or
  `labelTint`, the label as a 6 px band across the top replacing the 3 px left stripe (no label, no band), padding
  12/14 (10/14/12 under a band), checkbox 20 px with a 2.5 px `textPrimary` ring (done: accent fill, white tick, title
  struck in `textSecondary`), title 15/700, meta 13 px, second line indented 30, gap between cards 14.
- **Calendar and Timebox blocks** (`TimeBlock.tsx`, `CalendarPane.tsx`, `TimeboxPane.tsx`): radius 8, colour and text
  weight only; the block size tiers and their padding stay exactly; no band, no slab; break chips and +N unchanged.
- **Task details** (`TaskDetailPanel.tsx`): window radius 16, 8 px band, slab 10 px `borderStrong` (light only), padding
  26/34, title 30/800 with a 26 px 3 px ring checkbox, close button 44 px ink circle; rows min 52, label column 15/700
  `textSecondary`, values 16/700. **Every row stays** (override 3): date and extra times, Estimated time drop-down, Label
  with emoji, the "Shown first" switch with ❗, Repeats and its note, Task | Break with icons and help line (squared),
  Reminder, List, Notes (`surfaceRaised`, radius 10, padding 14/16), Steps, "Inside this break" with Move out, the ⋮ menu.
- **Popovers, menus, modals, toasts, Settings, Quests, Analytics, Daily Planning chrome:** the same rules (square
  buttons, heavy titles, short dividers, bands on modal windows, no slab except the details window).

### Phase 4, phone (3.33.0)
- Today, Calendar (Day, Week, Month), Tasks, quick add, details sheet, tab bar, hold menu: page title 36/800/-0.8,
  section labels 14/800 `textSecondary` (not uppercase), one white block per section radius 12, rows ≥ 44, card titles
  16/700, durations 14/800. No Now card, no "X of Y done", the list stays as built (override 4).
- Tab bar (override 5): three square tabs radius 10, the chosen one filled accent with onAccent icon and label, a
  visible text label under each icon, 44 pt targets; the round quick add stays as built.
- Slab 0 on the phone.

### Phase 5, polish (3.34.0)
Dark pass, Vibrant pass, the contrast script, focus rings, narrow windows, motion under 150 ms that follows the
system Reduce Motion (`prefers-reduced-motion` on desktop, `AccessibilityInfo.isReduceMotionEnabled` on the phone).

## 4. Mock versus app: every difference found

| # | Mock / spec | App today | Decision |
|---|---|---|---|
| 1 | B ribbon (left edge tabs) | Top bar | No ribbon (override 1) |
| 2 | Slabs on cards, lists, blocks (B) | none | Slabs only on the 3 desktop panes (7) and the details window (10), light only |
| 3 | Decorative 96 px page grid | none | Skipped (override 8); `gridLine` token not added |
| 4 | Count line "**4** waiting, no day yet" | none | "**4** tasks, no day yet" (override 14) |
| 5 | Durations `H:MM` ("1:30") | "1h 30m" on cards, "1:30" on day totals | Copy kept as built (override 14); only the type follows the mock |
| 6 | Card durations Inter 800 | Roboto Mono (`data-mono`) | Type follows the mock: Inter 800 on cards and phone rows; p9's "Roboto Mono" check is updated on purpose in phase 3 |
| 7 | Details "Length" chips 0:15/0:30/1:00/2:00 | Estimated time drop-down | Drop-down kept, restyled (override 3) |
| 8 | Details "Important" Yes/No circles | "Shown first" switch with ❗ | Switch kept (override 3) |
| 9 | Details rows Day, Length, Label, Important, Repeats, Type, List | also date with extra times, Remove date, Reminder, emoji, ⋮ menu | All kept, same row rules |
| 10 | Details "Steps **0 of 0**", "+ Add a step" | "Subtasks 0/0", "Add subtask" | Copy kept |
| 11 | Phone Now card with Done, "Next: …", "3 of 5 done" | "Now … / Next …" lines under the date, no counter | Kept as built; no Now card, no counter (override 4) |
| 12 | Phone tab bar: icons only, quick add inside the bar | tabs with labels, quick add floating above | Square tabs with labels (override 5); quick add stays where it is |
| 13 | Phone sections "Planned", "Anytime" at 14/800 | "PLANNED", "ANYTIME" 12/700 uppercase | Type follows the mock (no uppercase); copy is the same words |
| 14 | Brain Dump pane shows the Belific logo, title, count | logo row, list switcher "🧠 Brain Dump", fold button | List switcher kept and given the pane title type; logo stays |
| 15 | Week board shows 3 day columns | 3+ columns scrolling sideways, a ⋯ day menu each | Kept; headings restyled |
| 16 | Day heading with a filled square "Today" tag under it | outlined "Today" pill beside the date | Kept beside; restyled square, accent fill |
| 17 | Mock top bar: Tasks, Calendar, Quests, Filter, Only today, avatar; month row with arrows and Today | Today sits in the top row; Filter and Only today on the month row; Day/Week/Month segmented; show/hide pane edge buttons; month drop-down caret | Layout kept; every control squared and restyled (override 2) |
| 18 | Timebox has no own date navigation | date arrows, date drop-down, Today, hide button | Kept, restyled |
| 19 | Card meta: label dot, name, bold time | list emoji, label dot and name, time, steps ring, ❗, "During Lunch", "3 inside", ☕ Break, streak line, Moved from | All kept; the time bold `textPrimary` |
| 20 | Timebox task block accent fill with white text | label tint fill with dark text (Vibrant off) / vivid fill (Vibrant on) | Colours as built (label colours are content); radius 8 and weights from the mock |
| 21 | Now line 3 px with a 13 px dot | 1 to 2 px line with a small triangle | Phase 3: 3 px and a round 13 px dot in `now` |
| 22 | Spec: dark mode not designed | full dark theme | Override 12 values (section 6) |
| 23 | Hover states, tooltips, focus rings, drag previews, drop targets, toasts, undo bar, Settings, Quests, Analytics, Daily Planning, Search, Shortcut help, Labels, Trash, Sign in pages | not in any mock | Same rules applied, listed per phase in the report |

## 5. Geometry that depends on card height (phase 3 risk)

- Desktop drag and drop measures live (`DragProvider.tsx` reads `getBoundingClientRect` of cards and blocks at drag
  time); no constant card height was found in `mobile/components/desktop`. To check in phase 3: Day column drop
  positions, the drag preview size, the "drop inside" outline, `KanbanPane` scroll to today, and the real checks that
  drag cards (p2, p7, p9, p27, p42, cp8 family).
- Calendar and Timebox block heights come from minutes x hour height and are not touched.
- Phone: Day view blocks are minute based; Today rows are measured by layout. `PhoneBlock` keeps its 3 px left edge in
  phase 4 only if the blocks rule (override 6: colour, radius, weight only) says so: it does, so the edge stays.

## 6. Dark mode defaults (override 12) against today's dark tokens

| Role | Override 12 | Dark token today | Action |
|---|---|---|---|
| page | `#121212` | background `#121212` | same |
| surface | `#282828` | surface `#282828` | same |
| raised | `#2E2E2E` | surfaceRaised `#2E2E2E` | same |
| border | `#333333` | border `#333333` | same |
| text | white, `#A7A7A7` | same | same |
| accent | `#8FB39A` | same | same |
| onAccent | `#101010` (white on it is 2.31:1) | `#121212` (8.10:1) | already a token; value moved to `#101010` (8.23:1) in phase 5, the dark pass, so phase 1 stays pixel identical |
| ink elements | text colour | textPrimary is white | checkbox ring, avatar, close, tabs use `textPrimary`; their glyph uses `background` |
| now line | `#E5484D` | same | same |
| slabs | none | n/a | `slabOffset` returns 0 in dark |
| bands | brightened accent | accent `#8FB39A` | bands use `accent` |
| pane | not named | `#1A1A1A` | kept |

## 7. Accessibility figures (computed 2026-11-08)

White on sage `#5C7A6B` 4.72:1 (passes 4.5; the spec's "about 4.9" is high). `textSecondary` on `background` 4.98, on
`surfaceRaised` 4.64. `onHostPill` on `hostPill` 6.82. `accentText` on `background` 6.47. Ink `#1B1B1B` on white 17.2.
Dark: white on `#8FB39A` 2.31 (fails, hence onAccent), `#101010` on it 8.23, `#A7A7A7` on `#282828` 6.13. White on every
Vibrant label colour at least 6.05 (lowest: legacy Forest). Not 3:1, and not needed because text identifies the
control: card outline `border` 1.32, dashed add row `borderStrong` 1.60 (dark border 1.17). Phase 5 adds the script
that checks and prints all of these.

## 8. Risks

1. **Heavier weights truncate earlier** (card titles 700, headings 800): narrow windows and the 7 day week; checked in
   phase 5, and the real checks that read `numberOfLines` cuts.
2. **Card height change** (band 6 px, 2 px outline, padding): drag targets (section 5).
3. **Real checks that read styles**: p9 (Roboto Mono on the estimate), p23 (contrast reads), checks that look for
   the left stripe colour or a hairline; each one updated only where the look changed on purpose, listed.
4. **Inter 800 on iOS**: a custom font is picked by name; `type.ts` must map 800 to `Inter-800`, or the iPhone shows
   the system font for that text. Not testable here: no iPhone run.
5. **Square corners on react-native-web** are plain styles; no risk. Slabs are an extra absolutely placed view behind
   the pane; it must not catch the mouse (`pointerEvents: 'none'`) or change the pane's measured width.
6. **Dark onAccent change** (`#121212` to `#101010`) is near invisible; done in phase 5 with the dark pass.
7. **The flaky real checks** (cp8 family, p11, p42) fail when the window is covered; the regression is run with hands
   off and Belific closed, and a failure is rerun alone and on the previous commit before it is blamed on a phase.
8. **Phone not run on a device**: everything iPhone is checked only in the 390 x 844 web harness.
