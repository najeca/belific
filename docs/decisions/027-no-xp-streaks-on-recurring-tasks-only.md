# Decision 027 - No XP, levels or multiplier; streaks on recurring tasks only

**Date:** 2026-10-16
**Status:** Decided by Jethro (build plan, `docs/belific-build-plan.md` section 0, decision 4).

Source: Jethro's decisions on the Step 0 report and the Phase 1 review (2026-10-16).

---

**Decision.**
- **There is no XP, no level and no streak multiplier.** Nothing earns points, nothing levels up, and there is no `1 + 0.01 x streak` factor. No XP or level tables, no ledger, no totals across tasks.
- **Streaks exist only for recurring tasks** (repeating series, decision 023), and are shown on the Quests screen (build plan phase 4). A one off task has no streak.
- **A miss never shames** (the spirit of decision 007). A quest shows its current streak and its best streak, and nothing else about the run: no broken streak message, no red state, no warning, no "at risk" notification, no count of misses. A day not done ends the run silently. A planned skip does not break it.
- Streaks stay derived from what is stored (occurrences, skip tombstones and, for a converted routine, its old completions), never stored as counters (`mobile/lib/seriesStreak.ts`).

**Supersedes.**
- **Decision 014 (XP and level model): superseded in full.** It was Deferred and never built.
- **Decision 008 (louder gamification visual language): the XP parts are superseded** (XP bars, level badges, streak multiplier tags, reward pops, and the `xpGold` accent reserved for them). With no XP and no levels nothing is left for a louder accent to mark, so streaks render in the core sage and cream palette.
- **Decision 007 stands** (honest, no guilt wording), and is what this decision follows.

**Why.** Belific is a calm planner. Points and levels reward volume rather than the work, and a multiplier turns a missed day into a loss. Current and best streak on a recurring task gives the useful signal (am I keeping this up) without either.

**Consequences.**
- Migration 002 adds no gamification table, and none is planned.
- The Progress page (2.17.0) and the streak lines stay as they are until the Quests screen replaces or absorbs them in phase 4.

## Related Notes
- [[docs/decisions/007-honest-routine-gamification]]
- [[docs/decisions/008-louder-gamification-visual-override]]
- [[docs/decisions/014-xp-and-level-model]]
- [[docs/decisions/023-repeating-tasks-as-series]]
- [[docs/belific-build-plan]]
