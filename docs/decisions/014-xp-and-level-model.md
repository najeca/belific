# Decision 014 — XP and level model

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation
**Note:** **Build only after the daily driver checkpoints.** The record exists now because it decides G2.

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

- **What earns XP:** a routine completion (the whole routine only, never a single step, consistent with decision 007's "done or not") and a task completion. Events never earn XP.
- **Routine base XP:** a routine has `xpBase`. For a routine with steps it defaults to the sum of per step values the user typed. This keeps the seed's numbers without rewarding partial progress.
- **Task XP:** 10 flat, or 20 for high priority. Optional duration scaling is deferred.
- **Multiplier:** per routine, `1 + 0.01 × streak`, **capped at ×1.50** (proposed default), and always shown as the number.
- **Storage:** an append only synced ledger `xp_events` with a **deterministic id** `routine:{routineId}:{date}` or `task:{taskId}:{completedAt date}`. Two devices awarding the same completion therefore upsert one row. Un-completing tombstones the row. The ledger stores `amount`, so a later formula change never rewrites history. Lifetime XP is the sum of live ledger rows. A reconcile pass on any new client creates missing rows for completions logged by 2.1.0 clients.
- **Levels:** XP to go from level n to n+1 is `500 × n`, so the cumulative total for level n is `250 × n × (n − 1)`. At about 2,000 XP a week, level 10 arrives in about 11 weeks and level 20 in about a year.
- **Retention:** completions are no longer pruned (G2). Streaks and longest streak are derived from completions. The XP history feed reads the ledger.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
