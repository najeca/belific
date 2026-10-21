# DESIGN_TARGET: the Ellie Planner look

Source: 19 screenshots of Ellie Planner (C:\Users\jethro\ellie-ref). Values marked (measured) came from browser inspector screenshots; the rest are read by eye and should be treated as close, not exact.

Goal: Belific, Landis and Proload share one design language (fonts, shapes, spacing, shading, "bubbly" feel). Only the accent colour changes per app.

## 1. Typography

- Body and UI: Inter (Ellie uses Inter with system fallbacks). Free. Belific already uses Inter, so nothing changes here.
- Wordmark and big titles: a warm serif. Ellie's "Ellie" wordmark is a transitional serif. This is the "writing style" Jethro likes: serif name, clean bold sans everywhere else.
- Weights: titles 700 white, labels 600 grey, values 500 white, hints 400 small grey.
- Sizes (by eye): day header 20px bold, card title 13px 600, meta 12px, hints 11px, hour labels 10px, modal title 20px 700, modal row labels 13px 600 grey.
- Free font candidates (see font-specimen.html):
  - Serif for names: Newsreader, Source Serif 4, Fraunces (softer, "bubblier"), Lora, Instrument Serif.
  - Sans alternatives to Inter if wanted: Plus Jakarta Sans, DM Sans, Geist, Nunito (rounder, bubblier).
- Recommendation: Option 1 "Ellie-true" = Inter + Newsreader. Option 2 "Bubblier" = Plus Jakarta Sans + Fraunces.

## 2. Shapes and the bubbly feel

- Everything is rounded, nothing sharp. Radii: cards and add-task rows about 10px, modals about 16px, popovers about 10px with 6px rounded hover rows, small pills about 6px, buttons about 8px, checkboxes round or softly squared, avatar a full circle.
- Flat surfaces with a thin 1px border (about #333) instead of heavy shadows. Depth comes from stepping the grey, not from drop shadows.
- Small soft pills everywhere: duration pill (0:30 / 0:15), count pill, Today badge, segmented Calendar/Tasks toggle.
- Generous padding: task card 11px 12px, 10px gap between cards, modal header 20px 35px 5px, modal body 0 35px 30px (measured).
- Thin dividers (1px, low contrast) between modal sections, never boxes inside boxes.
- Icons are small, thin line icons in grey that sit in front of every label.

## 3. Colour treatment

- Dark theme: page near black (about #121212), raised surfaces #282828 (measured on cards), popovers a touch lighter (#262626 to #2a2a2a), grid lines mid grey at low contrast, 1px borders about #333.
- Text: white for primary, #A7A7A7 for secondary (measured on date headers), darker grey for placeholders.
- Accent: one purple (about #8B5CF6) used for the selected day, Today badge in the timebox, primary buttons. Blue is used for the "Today" word and event blocks. Red is only the current time line.
- Done tasks: dark green filled checkbox with green tick, title dims to grey, duration pill dims.
- Labels: a row of colour dots plus a rainbow custom wheel and RGB picker. A label is a coloured dot plus name, not a filled chip.
- Gradient is used exactly once: the "Free Trial" text (blue to purple to pink). A small treat, easy to copy for a premium or status text.

## 4. Component anatomies

- Top bar: panel toggle icon, small outlined Today button, previous and next arrows, spacer, search icon, outlined Filter button, segmented Calendar/Tasks toggle (active segment filled), avatar circle, timebox toggle icon.
- Day column: header "Mon 19" (weekday bold white, date grey), small blue "Today" tag, grey "Focus" action on the right. Under it an "Add a task" row (circle-plus icon, grey text, duration pill on the right), then cards.
- Task card (about 265 x 69, measured): round checkbox, bold title, duration pill top right, second line with label dot and name, time in bold, repeat icon with 0/1.
- Task modal (about 597 wide, measured): title row with checkbox, 20px bold title, three-dot menu; property rows (Task date, Estimated time, Actual time, Label, Repeats), each icon plus grey bold label plus value, hints in small grey brackets "(Move this task to a List)", "(Start timer)"; divider; Notes; divider; Subtasks with checkbox rows and "+ Add subtask".
- Popovers: search field with magnifier, rows with icon, tick on the selected one, footer actions (New label, Edit labels, Remove label), hovered row gets a rounded lighter background.
- Date popover: shortcut rows (Today, Tomorrow, Next week) with an icon and the weekday or date right-aligned in grey; month grid; selected day is a filled purple rounded square; clock row at the bottom with time and a clear (x).
- List picker: list rows with emoji, "+ New list" at the bottom.
- Timebox: hour labels tiny and grey on the left, thin lines, red triangle and line for now, event blocks solid colour with small rounded corners (about 4px) and a mini checkbox.
- Settings modal: left nav, content on the right, Labels list with "Create label" button.

## 5. What makes it pop

1. Strong contrast between white bold titles and grey everything else, so the eye lands on what matters.
2. Soft raised grey blocks on near black, all with the same radius.
3. One bright accent used sparingly (purple selected state, blue event).
4. Tiny details that look finished: pills, icons in front of every label, tick on selected row, hint text in brackets.
5. Calm empty space. Few borders, no clutter.

Warning: Ellie's own mobile view is weak (screenshot 14: the "Free Trial" badge wraps into the Today button, the toolbar overlaps). Copy the look, not the responsive behaviour.

## 6. Gap analysis vs Belific (today)

| Area | Belific now | Ellie target |
|---|---|---|
| Theme | light cream and sage | dark with a single accent |
| Surfaces | cards with shadows | flat raised grey, 1px border |
| Radii | mixed | one scale: 6 / 8 / 10 / 16 |
| Titles | Inter | Inter bold white plus serif wordmark |
| Pills | few | duration, count, Today, segmented toggle |
| Labels | colour chips and blocks | dot plus name |
| Popovers | basic | search, tick, footer actions |
| Icons | mixed | one thin line icon set in grey |

## 7. Proposed token set (two options)

Shared shape tokens (both options):
- radius: xs 4, sm 6, md 8, lg 10, xl 16, full 999
- space: 4, 6, 8, 10, 12, 16, 20, 30, 35
- border: 1px solid var(--line)
- font-ui: Inter; font-display: serif of choice

Option A, Dark (Ellie-true):
- --bg #121212, --surface #282828, --surface-2 #2e2e2e, --line #333333, --text #FFFFFF, --text-2 #A7A7A7, --text-3 #6B6B6B
- --accent per app: Belific sage #8FB39A (brighter than today so it shows on dark), Landis indigo #8B5CF6, Proload orange #F97316
- --success #2E7D32 on #14301A, --now #E5484D

Option B, Light (keeps Belific cream and sage, Ellie shapes and fonts only):
- --bg #FAF7F0, --surface #FFFFFF, --surface-2 #F3EFE6, --line #E6E0D2, --text #1B1B1B, --text-2 #6B6B6B, --text-3 #A0A0A0
- same radii, pills, icon style, no shadows

Recommended: build Option A as the default and add Option B as a light theme with the same tokens (a setting). One token file serves both.

## 8. Rollout

1. Belific restyle (Sonnet batch): tokens first, then TopBar, day columns, task card, modal, popovers, timebox, settings.
2. Extract design tokens: tokens.json, tailwind-preset.js, tokens.css, README, docs/DESIGN_SYSTEM.md.
3. Relay to the Landis chat (accent indigo), then Proload (silver, black, orange).

## Open question for Jethro

Which Ellie qualities do you mean by "bubbly standout"? Dark theme, the rounded pills, or the bold white titles? And do you want dark as the default (Option A) or keep light (Option B)?
