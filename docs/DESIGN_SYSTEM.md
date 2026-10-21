# Design system: the Quiet Function look, with Ellie Planner's shapes

One look for Belific, Landis and Proload (`docs/DESIGN_TARGET.md` is the study it comes from; this file is the
rulebook). Only the accent colour changes per app. Tokens are in `design-tokens/` (see its README); in Belific the
one source is `mobile/lib/tokens.ts` and the shared pieces are `mobile/components/desktop/ui.tsx`.

## Decisions (final)

- **Fonts:** Inter for the interface; Newsreader for the app name and big page titles only; Roboto Mono for times
  and timer figures. Bundled as local files, so the app works offline.
- **Themes:** light is the default (cream and sage). Dark is a user setting (Settings, Appearance, Theme: Light,
  Dark, Match system), kept per computer. One token set serves both; a component never holds a colour of its own.
- **Shapes:** take Ellie's: flat raised surfaces with a 1px outline, pills, a dot and a name for a label, the
  popover and modal style. Do not copy Ellie's dark colours as the default.
- **Accent:** per app. Belific is sage (a brighter sage on dark), Landis indigo, Proload orange.

## Tokens

| Group | Names | Notes |
|---|---|---|
| Colour | `background` the page, `pane` a column on it, `surface` a card or popover, `surface-raised` a quiet fill, `hover`, `border`, `border-strong` | Light (Option B): `#FAF7F0` `#FFFFFF` `#FFFFFF` `#F3EFE6`. Dark (Option A): `#121212` `#1A1A1A` `#282828` `#2E2E2E`. |
| Text | `text-primary`, `text-secondary`, `text-tertiary` | Tertiary is for placeholders only. |
| Accent | `accent` (fills, icons), `accent-text` (as text), `accent-soft` (selected, drop target), `on-accent` | Per app. |
| Status | `danger`, `success` and `success-bg` (a done tick), `now` (the current time line, the only red) | |
| Chips | `chip`, `chip-strong`, `check-fill`, `track-line`, `plain-block`, `break-tint`, `on-label` | For cards that carry a label colour. |
| Shadows | `shadow-sm`, `shadow-md`, `shadow-lg` | Only on popovers, modals and the drag ghost. Cards and blocks are flat. |
| Radius | `xs` 4 (event blocks), `sm` 6 (pills, tags, popover rows), `md` 8 (buttons), `lg` 10 (cards, add rows, popovers), `xl` 16 (panes, modals), `full` | Nothing between these. |
| Space | 4, 6, 8, 10, 12, 16, 20, 30, 35 | Card padding 11 x 12, 10 between cards; modal header 20 35 5, body 0 35 30. |
| Type | Day header 20 bold, card title 13 to 14 / 600, meta 12, hint 11, hour label 10, modal title 20 / 700, modal row label 13 / 600 grey | |

## Components

- **Top bar:** panel toggle, small outlined Today, previous and next, search, outlined Filter, the segmented
  Calendar / Tasks toggle (the active segment filled with the accent), the avatar.
- **Outlined small button:** 1px `border-strong`, `surface` fill, 8px corners, `hover` fill on hover, 13px / 600.
- **Segmented toggle:** a `surface-raised` track with a 1px outline, 10px corners, 8px segments.
- **Pills:** 20px high, 6px corners, `surface-raised` (or `accent-soft` for the Today tag), 11.5px / 600. The duration,
  a count, a tag. A count that is a number in a circle is `full`.
- **Round checkbox:** an 18px ring (22 in a modal); done is `success` on `success-bg` with a tick.
- **Icons:** one style: thin line icons (Ionicons `-outline`), small, grey, in front of every label. Emoji are only
  ever the person's own (a list, a label, a task).
- **Day column:** a bold weekday, the date grey, a small Today pill; under it an Add a task row (a line icon, grey
  text, the day's total as a pill); then cards.
- **Task card:** `surface` or the label's tint, 1px `border`, 10px corners, padding 11 x 12; a round checkbox, a bold
  title, the duration pill; a second line with the label as a dot and its name; done dims the title and the pill.
  Hover changes only the outline's colour.
- **Task modal:** about 600 wide, 16px corners, title row (tick, 20px title, the menu, close), property rows (icon,
  grey bold label, value; hints in grey brackets), thin dividers, Notes, Subtasks.
- **Popovers:** 10px corners, 1px outline, a search field with a magnifier, rows inset with 6px corners and a lighter
  hover, a tick on the chosen row, footer actions after a divider. The date popover: Today, Tomorrow, Next week, a month
  grid with the chosen day a filled rounded square.
- **Calendar and Timebox:** tiny grey hour labels, thin lines, a thin red line with a red triangle for now, event
  blocks with 4px corners.

## Label colours on both themes

A label's colour comes from the label, never from the theme. On light a card or block is the label's pastel tint with
its strong colour as the left edge. On dark it is the label colour mixed into the dark surface, as strong as it can be
while the secondary text stays 4.5:1 (`darkTint` in `labelColors.ts`; every colour is tested). "Vibrant task colours"
(saturated blocks with white text at 6:1) is the same on both themes.

## Rules

1. Colours only from tokens. No hex or `rgba(` in a component (the colour wheel and the label palette are data).
2. Radii only from the scale. Raised surfaces are flat with a 1px outline; depth comes from stepping the grey.
3. Every pair of text and background is 4.5:1 or more; a graphic 3:1. `p23.js` checks every screen in both themes.
4. A new screen is added to `desktop/test/real/p23.js` so it is looked at in light and dark.
5. Copy the look, not Ellie's responsive behaviour (its narrow layout overlaps).

## Using it in Landis and Proload

Load `design-tokens/tokens.css`, set `data-accent="landis"` or `"proload"` on `<html>`, read colours from `--ds-*`
(or the Tailwind preset) and follow the components above. Landis is indigo (`#6D4AE0` light, `#8B5CF6` dark),
Proload orange (`#E8620C` light, `#F97316` dark; near black text on the fill).
