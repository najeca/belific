# Belific: Mini Motorways restyle (design spec)

Status: **design approved for reference, version not yet chosen (A, B or a mix).** Do not build until Jethro picks. This is a visual pass only: no feature, data, sync or navigation changes beyond what is written here.

Source mockups (exact values, one file per screen) are in `docs/design/motorways/`. They are Claude Design canvas files (`.dc.html`): read them as HTML with inline styles; they will not open as a normal web page. Live canvas (Jethro's account): https://claude.ai/artifact/3T3tzNeFPuudoqHW6kfqhC

| File | Screen |
|---|---|
| `A-desktop-board.dc.html` | Desktop week board, version A |
| `A-task-details.dc.html` | Desktop task details, version A |
| `A-phone-today.dc.html` | iPhone Today, version A |
| `B-desktop-board.dc.html` | Desktop week board, version B |
| `B-task-details.dc.html` | Desktop task details, version B |
| `B-phone-today.dc.html` | iPhone Today, version B |

## The rule

- **Ellie Planner decides the layout.** Same three desktop panes (Brain Dump, week board, Timebox), same features, same drag and drop, same phone tabs (Today, Calendar, Tasks) and quick add.
- **Mini Motorways decides the look only.** No game mechanics.
- **Colours and fonts do not change.** Use the existing tokens in `mobile/lib/tokens.ts`. Motorways' own grey and teal palette is not used.

## A versus B

| | A | B |
|---|---|---|
| Depth | Completely flat | Flat offset "slab" (solid colour, no blur) behind panes, cards and windows |
| Desktop navigation | Existing top bar: Tasks/Calendar toggle, Quests, Filter, Only today | Black ribbon: Tasks, Calendar, Quests, Analytics as dark square tabs on the left edge of the board; top bar keeps Today, Filter, avatar |
| Phone tab bar | Selected tab filled sage, others plain | Selected tab white with a 2px outline, others dark squares |

## Colours used (all existing tokens)

| Use | Token | Light value |
|---|---|---|
| Page | `background` | `#FAF7F0` |
| Pane, card, window | `surface` | `#FFFFFF` |
| Quiet fill (Brain Dump rows, notes, pills, chips) | `surfaceRaised` | `#F3EFE6` |
| Card outline, divider, slab | `border` | `#E6E0D2` |
| Dashed add row, window slab | `borderStrong` | `#D3CCBB` |
| Text, checkbox ring, dark tabs, avatar | `textPrimary` | `#1B1B1B` |
| Secondary text | `textSecondary` | `#6B6B6B` |
| Bands, primary button, done tick | `accent` | `#5C7A6B` |
| Accent as text | `accentText` | `#44604F` |
| Secondary button | `hostPill` / `onHostPill` | `#E6EEE8` / `#3B5646` |
| Now line | `now` | `#E5484D` |

Desktop page background also carries a faint grid: 1px lines `#F1ECE0` every 96px (new token needed, e.g. `gridLine`). Dark mode is not designed yet.

## Measurements

### Page and panes (desktop)
- Page padding 28px; gap between panes 30px.
- Pane widths: Brain Dump 260px, Timebox 330px, board fills the rest.
- Pane: radius 16px, `surface`, a sage band 8px tall across the top, inner padding 20px.
- B only: pane slab offset 7px right and 7px down, `border` colour, same radius.

### Type (Inter)
- Pane titles ("Brain dump", "Timebox"): 26px, weight 800, letter spacing -0.5px.
- Month title: 30px / 800 / -0.6px.
- Phone page title ("Today"): 36px / 800 / -0.8px.
- Day heading: 22px / 800, date number in the same size at 500, `textSecondary`.
- Section label ("Planned", "Anytime"): 14px / 800, `textSecondary`.
- Card title: 15px / 700 desktop, 16px / 700 phone.
- Meta lines: 13px, `textSecondary`; numbers inside sentences bold in `textPrimary`.
- Durations: 13px / 800 desktop, 14px / 800 phone, H:MM format.

### Divider
- Short and centred: 60 to 80px wide, 4px tall, `border` colour. Replaces full width hairlines under titles and between sections.

### Buttons
- Square corners (radius 0).
- Primary: `accent` fill, white text, 16px / 700, padding 9px 16 to 18px.
- Secondary: `hostPill` fill, `onHostPill` text, same size.
- Big action (phone "Done"): 20px / 800, padding 10px 26px.
- Segmented toggles (Tasks/Calendar, Task/Break): two square buttons side by side, selected one primary, the other secondary.
- Avatar: 44px circle, `textPrimary` fill, initial 17px / 700 in `background` colour.
- Close button: 44px circle, `textPrimary` fill, white X.
- Yes/No (e.g. Important): 40px circles, chosen = `textPrimary` fill with white icon, other = 3px `borderStrong` ring with grey icon.

### Task card
- Radius 12px, `surface`, 2px outline in `border` (or the label's light tint).
- Label colour shown as a 6px band across the top (no left stripe).
- Padding 12px 14px (10px 14px 12px under a band).
- Checkbox: 20px circle, 2.5px `textPrimary` ring. Done: `accent` fill with a white tick, title struck through in `textSecondary`.
- Second line indented 30px: label dot 9px, label name, time in bold.
- Gap between cards 14px.
- B only: card slab offset 5px, `border` (or the label tint).

### Add a task row
- 2px dashed `borderStrong`, radius 10px, padding 10px 12px, 14px `textSecondary`, the day total in bold on the right.

### Brain Dump pane
- Input: 46px tall, 2px solid `textPrimary`, square corners, plus icon.
- Rows: `surfaceRaised`, radius 10px, padding 12px 14px, 18px ring checkbox, 15px / 600 title, gap 10px.
- Count line under the title: "**4** waiting, no day yet".

### Timebox
- Hour labels 12px / 700 `textSecondary`, one hour = 46px between labels in the mock (keep the existing hour height in code).
- Blocks radius 8px. A task block is `accent` with white text; a break block is the label tint with dark text and white pill chips for tasks inside.
- Now line 3px `now`, with a 13px dot at the left.
- B only: block slab offset 5px.

### Task details window
- Width about 640px, radius 16px, sage band 8px, padding 26px 34px.
- Title row: 26px checkbox ring (3px), title 30px / 800, close button on the right.
- Rows: min height 52px; label column 130px at 15px / 700 `textSecondary`; value 16px / 700.
- Length: tap to pick chips (0:15, 0:30, 1:00, 2:00), square, 14px / 700, padding 7px 12px; chosen = primary.
- Notes: `surfaceRaised`, radius 10px, padding 14px 16px.
- B only: window slab offset 10px, `borderStrong`.

### Phone
- Screen padding 20 to 22px sides.
- Now card: radius 16px, 8px band, padding 16px 18px, "Now · time" 13px / 800 `accentText`, title 24px / 800.
- Lists: one white block per section, radius 12px, rows at least 44px tall, padding 12px 16px.
- Tab bar: three square tabs (radius 10px) and the round quick add (60px, `accent`, white plus) on the right.
- B only: Now card slab 7px, list slabs 6px.

### Black ribbon (B only)
- Column on the left edge of the board pane, starting 70px down, gap 10px.
- Selected tab 60 x 60px, `surface`, radius 10px on the left corners only, touching the pane so it reads as one piece.
- Other tabs 54 x 54px, `textPrimary` fill, icons in `background` colour, same corner shape.
- Icons only: needs a tooltip and an accessible label on each.

## Left out on purpose
Leaderboards, rankings, best scores, locked modes, Game Over screens, countdown or overflow rings. They break Belific's psychology rules.

## Contrast checks
- White on `accent` `#5C7A6B` about 4.9:1: fine for 16px bold buttons.
- `textSecondary` on `background` about 5:1: fine.
- `onHostPill` on `hostPill`: passes 4.5:1.

## Still to design
Settings, Calendar view, dark mode, phone Brain Dump and Tasks, motion (completion ripple, pop in, Reduce motion setting).
