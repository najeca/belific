# Decision 007 — Honest Routine Gamification (streaks, vacation mode, open-app check-in)

**Date:** 2026-09-02
**Status:** Decided — supersedes the unapproved gamification drafts

---

## Decision

Belific's Routines gain three connected features: a per-routine streak count,
a vacation/away mode that pauses streak math without breaking it, and an
optional modal shown on app open surfacing what's due. All three are built
under rule 3 (no dark patterns) with no exceptions — this decision does
**not** override that rule, it demonstrates gamification that never needed to.

This replaces `docs/GAMIFICATION_RESEARCH_DRAFT.md` and
`docs/GAMIFICATION_IMPLEMENTATION_PLAN_DRAFT.md` (2026-08-21), which proposed
literally reversing the no-streak-guilt rule (loss-framing copy, a revived
"Streak at Risk" notification). That proposal is rejected, not adopted. Some
of that draft's research is still useful background (loss aversion is real,
which is exactly why this decision avoids leaning on it) — kept as reference
in `docs/archive/`, not as a spec anyone should build from.

## Reason

Jethro wants Routines to feel more like a game — inspired by streak/progress
mechanics in mobile games and in habit apps like the ones referenced in the
rejected draft (Duolingo, Habitica) — while keeping the product's actual
locked promise: no streak-guilt, no fabricated urgency, no punitive framing,
everything reversible. Those aren't in tension. A streak count, a way to
pause it honestly, and a plain status check-in on open all satisfy "feels
like progress" without needing loss-framing to work.

## What's in scope

- Per-routine streak count (consecutive days completed), derived from
  existing `RoutineCompletion` data — no new sync table for the count itself.
- Vacation/away mode: a global date-range toggle that pauses streak
  accounting for all routines, with a per-routine override for routines that
  should keep running even while away (e.g. "take meds").
- An optional modal, shown on app open, surfacing today's routine status
  (done / not yet) for the current and earlier time-of-day buckets. Default
  on, one Settings toggle to turn off. Shown at most once per calendar day.
- Quiet milestone acknowledgment (7/30/100 days etc.) — a small, one-time,
  non-modal confirmation, not a celebration overlay.

## What's explicitly NOT in scope (rejected, not just deferred)

- Any loss-framing copy ("you lost your streak," "your streak is about to
  die," anything with those words or that tone).
- Any streak-risk countdown or urgency-manufacturing notification.
- Variable/random rewards of any kind (XP or otherwise) — if XP is ever
  added later, it must be deterministic and fully explained to the user, per
  the rejected draft's own (correct) point about avoiding gacha-style
  mechanics.
- Hard reset-to-zero-with-shame on a missed day. A broken streak is silent —
  the count just reflects the new consecutive run starting from the next
  completion, exactly like every other "missed" state already in this app
  (see design-identity's "missed routines/tasks roll over silently").
- XP/leveling system — not requested this round; noted as a possible future
  extension in the backlog, not built now.

## Visual language note (flag, not yet resolved)

Jethro's stated inspiration (Mobile Legends and similar) trends toward
bright, high-saturation gamified UI — flame icons, XP bars, level-up
moments. That's in real tension with the locked "Quiet Function" identity
(calm, understated, no shadows, muted palette, "not bright or high-
saturation" is written into `design-identity/SKILL.md` explicitly).
`docs/ROUTINE_GAMIFICATION_SPEC.md` resolves this by keeping the mechanics
(streak counts, milestones, honest status) while rendering them in the
existing sage/cream visual language rather than adopting game-UI styling
wholesale. If Jethro wants the visual style itself to shift toward something
louder, that's a design-identity change and should be made explicitly, not
picked up by inference from a couple of mobile game screenshots.

## Related Notes
- [[design-identity]]
- [[docs/ROUTINE_GAMIFICATION_SPEC]]
- Supersedes: `docs/GAMIFICATION_RESEARCH_DRAFT.md`,
  `docs/GAMIFICATION_IMPLEMENTATION_PLAN_DRAFT.md` (moved to
  `docs/archive/`, kept for reference only)
