---
name: design-identity
description: Belific design identity — palette, contrast constraints, and locked-in design principles. Read this before any UI, theme, or color work on Belific.
---

# Belific Design Identity

> This file extends the global "Quiet Function" design identity skill (spacing scale, radii, elevation/motion, Nunito/Hahmlet typography, nav pattern all inherited from there). This file contains ONLY Belific-specific palette details, contrast constraints, and locked-in product design principles (psychology rules) not covered globally.

## Color Palette
Implemented in `mobile/lib/theme.ts` (v2 restructuring, Phase 1). All hexes below are final, not placeholders.
- Primary accent (sage green): #5C7A6B — fills/icons/spinners only, see contrast note below
- Accent text (darkened sage, for text/label use): #44604F — verified 5.97:1 on background
- Background (soft cream/off-white): #F0EEE8
- Card/surface (lighter than background): #FAF9F5
- On-accent (text/icons drawn on top of accent fills): #FFFFFF — verified 4.72:1 on accent
- Text primary (near-black, warm): #26251F — verified 13.24:1 on background
- Text secondary/meta (muted grey): #6E6C64 — verified 4.53:1 on background
- Border/hairline (for dividers, not shadows): #E4E0D5
- Danger (muted, not pure semantic red): #A8402F — verified 5.26:1 on background

CONFIRMED CONTRAST FINDING:
#5C7A6B on #F0EEE8 measures 4.07:1 — fails WCAG AA (4.5:1) for body text, confirming the prediction below. It is fine for sage-colored buttons/fills with white text on top (4.72:1, passes), and fine as a background/accent fill with dark text on top. It must never be used as text color directly on background or surface — use accentText (#44604F, 5.97:1) instead anywhere the sage color sits behind readable text (labels, values, links, tab bar active state). This same accent/accentText split was needed for the Focus screen's phase colors (`app/(tabs)/focus.tsx` — PHASE_COLORS for fills, PHASE_TEXT_COLORS for text) since the same problem applies to the break-phase green.

CATEGORIES and DAY_TYPES colors (`mobile/lib/data.ts`) are a separate, larger palette used for event bars/icons (decorative fill, not text) and day-type status pill text respectively — day-type colors are darkened to clear AA same as accentText, category colors only need to be visually distinct (>=2.5:1) since they're never text.

Reference: a clean card-based UI with sage green primary action buttons, cream background, subtle rounded corners, matched badge/tag elements in muted sage tint. Calm, understated, trustworthy - not bright or "eco-lifestyle" green, not high-saturation.

## Design Principles (from psychology research, locked in)
- No streak-guilt or loss-framing anywhere in the UI. Missed routines/tasks roll over silently, no red warnings, no "you broke your streak" language.
- Notifications tied only to real user-set commitments, never engagement-bait ("check your progress").
- Task capture requires only a title. All other fields (date, time, project, priority) are optional, deferred, and shown via progressive disclosure.
- Smart defaults where genuinely true (e.g., default date to today) - never fabricate false progress or false urgency.
- If any gamification exists, it must be reversible/pausable (Todoist Karma vacation-mode pattern), never mandatory.
- Empty states and error states are required for every new screen (Routines, Projects, Brain Dump) - follow the pattern already shipped on Today ("No events scheduled / Tap + to add your first event"), not a blank view.
- Accessibility: every interactive element needs an accessibilityLabel and appropriate accessibilityRole, matching the pass already done in v1.

## Typography — deliberately deferred
The global "Quiet Function" skill specifies Nunito (body) / Hahmlet (headlines). Belific v2's Phase 1–4 restructuring deliberately did NOT bundle these fonts — deferred as its own phase, because `expo-font` is the most build-fragile dependency in this project (see `docs/IOS_BUILD_NOTES.md` issues 4 and 5: autolinking silently skips it, needs a manual pod line, needs a deployment-target bump). Bundling two more font families should be verified with a local Release build in isolation before stacking anything else on top of it. Belific currently uses system fonts everywhere. Do not assume Nunito/Hahmlet are wired up — check `app.json`'s `plugins` and actual `fontFamily` usage in styles before relying on this.

## Status
This is a living reference. Update this file directly when palette or principles change - do not let color decisions drift across sessions without updating this file.
