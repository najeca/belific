# Decision 033 - The Ellie Planner restyle (2.39.0 to 2.46.0)

**Date:** 2026-10-21
**Status:** Accepted by Jethro (the DECISIONS in `docs/DESIGN_TARGET.md` and the request of 2026-10-21). Look and feel only; no behaviour, schema or backup change.

Source: `docs/DESIGN_TARGET.md` (a study of 19 Ellie Planner screenshots kept outside the repo; shapes, spacing and structure only, nothing copied). The rulebook is `docs/DESIGN_SYSTEM.md`; the tokens are exported to `design-tokens/` for Landis and Proload.

- **Fonts:** Inter for the interface, Newsreader for the Belific name and the big page titles, Roboto Mono for times. Bundled files, so the desktop works offline.
- **Themes:** light (cream and sage) is the default; dark is a per computer setting in Settings, Appearance (Light, Dark, Match system). One token set (`mobile/lib/tokens.ts`) serves both; on the desktop `Colors.x` is a CSS variable, so a change of theme repaints at once. Option B (light) and Option A (dark) of the study, with a brighter sage on dark.
- **Shapes:** Ellie's: flat raised surfaces with a 1px outline instead of shadows (shadows only on popovers, modals and the drag ghost), pills, a dot and a name for a label, round checkboxes, thin line icons, one radius scale (4, 6, 8, 10, 16, round).
- **Accent per app:** Belific stays sage, Landis indigo, Proload orange.
- **The iPhone is unchanged.** `Colors` keeps the palette the phone shipped with off the web; the phone takes the tokens in its own catch-up release.
- **Label colours** come from the label on both themes: the pastel tint on light, the colour mixed into the dark surface on dark (every colour tested for readable text). Vibrant task colours (white text, 6:1) are the same on both.
- **Not copied:** Ellie's dark colours as the default, its gradient "Free Trial" text, its weak narrow layout, and the mini checkbox on an event block (Belific has no tick on a block on purpose, 2.37.0).
- **Added:** the date popover (Today, Tomorrow, Next week, a month grid) was written in 2.26 but unreachable; it opens from a small chevron beside the date in the task details.
