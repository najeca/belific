# Belific: next plan

**The active build plan is `docs/OPUS_PLAN_REVIEW.md`, section 5** (checkpoints 0 to 8, ordered for a working Windows desktop daily driver first). Current state is in `docs/CURRENT_TRUTH.md`.

The earlier plan (P0 to P3, 2026-09-02) is kept for the record at `docs/archive/NEXT_PLAN_2026-09-02.md`. It is historical: P-NAV (Focus removal, Settings move) shipped in 2.1.0, and its backlog notes about the multi day kanban, a web version and XP are superseded by decisions 009 and 014 to 015.

## Constraints that apply to every task (non-negotiable, from Jethro)

1. Local USB/simulator builds only. **Never run `eas build`/`eas submit`/`eas update`** unless Jethro has explicitly said "ready for EAS build" in this session.
2. Every meaningful change bumps `mobile/app.json`'s `expo.version` and gets a dated entry in `docs/CHANGELOG.md`, in the same commit as the change.
3. No dark patterns: no streak-guilt, no fabricated urgency, no engagement-bait notifications, no fake progress. Any gamification must be honest and reversible (decision 007; visuals per decision 008).
4. Verify against actual code and a real build/device test, not memory, not "should work."
5. Never touch the Landis project or its Supabase instance (ref `vlogfwnmaqorhialcqbr`). Belific's Supabase project is a different ref (`uucycebkpgwbktdytxvr`) in the same org. Double-check before any Supabase MCP/CLI call.
6. Build gate before calling shared code done (decision 018, proposed): `npx tsc --noEmit`, the `node --test` suite, and an iOS JS bundle export, all runnable on Windows. A real device Release build is still required before anything is called shipped to iOS (batched, on the Mac Mini if kept, or via a TestFlight/EAS build Jethro explicitly approves).

## Outstanding from the old plan (still real)

- Supabase project health and the three on-device sync scenarios (old P1.1): folded into checkpoint 5.
- Privacy policy rewrite (old P2.1): pending Jethro's review. `privacy.html` still says no data leaves the device, which is inaccurate since accounts shipped.
- App Store Connect "App Privacy" answers (old P2.2): manual, Jethro's task, keep consistent with the policy.
