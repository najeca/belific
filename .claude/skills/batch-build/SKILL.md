---
name: batch-build
description: Use to build several planned phases in one session, in order, with targeted tests, a commit per step, and one report at the end for the user to beta test.
---

# Batch build

Goal: build the requested phases in one session without stopping for approval between steps, so the user can test the result once at the end.

## Read first

The plan file (docs/PLAN.md or the repo's equivalent), the progress file (docs/build-progress.md or equivalent), the project rules in CLAUDE.md, and the changelog rule. If any of these is missing, say so and ask once.

## Process

1. Confirm which phases are in scope. Build in plan order: shared logic first, then the main UI, then secondary platforms.
2. Stop and ask only before something that rewrites existing user data, changes a database schema, deploys, spends money, or cannot be undone. State exactly what it does and whether it can be reversed, then wait. Decide everything else yourself, note the decision, and continue.
3. Follow the test-policy skill: targeted tests while building, the full set once at the end.
4. Commit each phase on its own. Put the version bump and changelog entry in the same commit, following the repo's rule. Do not push unless the user says so. Never use destructive git commands.
5. After each phase, update the progress file with what changed, the choices you made on your own, and what to check by hand.
6. Before moving on, compare your work with the plan and any reference screenshots. Fix differences, and list the ones that are deliberate.
7. At the end give one short report: what was built, screenshots for any interface work, the hand test checklist, every choice made on your own, and anything not done or not verified.

## Rules

- Do not start phases that were not requested.
- Never print or commit secrets.
- If a needed tool is missing, say so plainly instead of working around it quietly.
- When the user reports problems after testing, treat it as a fix batch: reproduce each problem, fix it, add a test that would have caught it, and report.
