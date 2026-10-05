# Decision 008 — Louder Gamification Visual Language (overrides 007's visual-language flag)

**Date:** 2026-09-28
**Status:** Decided — confirmed directly by Jethro in session

---

## Decision

The gamification visual-language restraint *flagged* (not decided) in
decision 007 is overridden. Streaks, XP, and levelling may now render in a
distinct, brighter accent — separate from the core "Quiet Function"
sage/cream palette — instead of being folded entirely into the muted
palette. This is a scoped override: it changes only how gamification
elements are rendered. Every other rule in decision 007 stands unchanged.

## Reason

007's own visual-language note said the Mobile-Legends-style inspiration
was "in real tension" with the locked palette, and that going louder
"should be made explicitly, not picked up by inference." Asked directly
in session on 2026-09-28, Jethro confirmed: override it, go louder.

## What's in scope

- A new accent, separate from `accent`/`accentText`, reserved for
  gamification UI only: XP bars, level badges, streak-multiplier tags,
  completion reward pops. Proposed: `xpGold` #D6A94A (fills/icons),
  `xpGoldText` #7C5E1A (text — check contrast against `background` before
  shipping, same as every other color in `design-identity/SKILL.md`).
- Bolder visual weight for these specific elements (larger badges, filled
  bars, a visible reward moment on completion) where the plain palette
  would otherwise read as too quiet to feel like a reward.
- A deterministic streak multiplier on XP (e.g. +1% per consecutive day,
  shown as the actual number, e.g. `×1.12`) — stays fully transparent per
  007, not a random/variable reward.

## What's still explicitly NOT in scope (007's other rules stand, unchanged)

- No loss-framing, streak-risk countdowns, or "broken streak" shame.
- No shadows, anywhere — still a hard rule from `design-identity/SKILL.md`,
  not touched by this override.
- No randomized/variable rewards (loot-box style) — XP stays a transparent
  formula, never a surprise.
- No partial-progress meter on routines (`ROUTINE_GAMIFICATION_SPEC.md`
  §0) — a routine is complete or it isn't; this override doesn't reopen
  that.
- Everything else in the app (task rows, lists, nav, Settings, Brain Dump,
  Calendar) stays exactly in the locked sage/cream palette — this is
  scoped to gamification UI only, not a general brightness increase.

## Related Notes
- [[design-identity]]
- [[docs/decisions/007-honest-routine-gamification]] — resolves 007's open
  visual-language flag; every other rule in 007 remains fully in force
- [[docs/ROUTINE_GAMIFICATION_SPEC]]
