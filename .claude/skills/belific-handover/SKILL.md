---
name: belific-handover
description: Use at the end of every batch, or on request, to regenerate docs/PROJECT_HANDOVER.md from the real repo state and commit that one file locally.
---

# Belific handover

Goal: one file, docs/PROJECT_HANDOVER.md, that the user can paste into the Belific chat so a fresh conversation knows where the project stands.

## Gather facts first (read, do not remember)

- Version and date: `mobile/app.json` (`expo.version`), today's date from the session.
- This round: the versions added to docs/CHANGELOG.md since the last commit of docs/PROJECT_HANDOVER.md (`git log -1 --format=%H -- docs/PROJECT_HANDOVER.md`, then `git log` and the CHANGELOG headings after it).
- What the apps do: docs/CURRENT_TRUTH.md and the newest CHANGELOG entries.
- Decisions and reasons: docs/build-progress.md, the PLAN_* docs (their Decisions sections), and this session's own choices.
- Migrations: `mobile/supabase/belific_schema/README.md` and docs/CURRENT_TRUTH.md. Say "applied" only where those say so, and say it is as recorded by the user, not checked live.
- Open items and flaky checks: docs/build-progress.md (latest regression notes), docs/CURRENT_TRUTH.md "Still pending", and the plan docs.
- Test counts: run them now or copy the numbers from this session's gate output, and say which. Typecheck, mobile `npm test`, desktop `npm test`, the iOS marker gate, the security scan, the real check totals.

## Write docs/PROJECT_HANDOVER.md with these sections, in this order

1. Version and date
2. What the app does today (desktop, then phone), in plain language
3. What changed this round (one line per version)
4. Decisions made and their reasons
5. Database migrations and whether each is applied
6. Open items, in order
7. Known flaky checks
8. What the user must hand test or decide

## Rules

- Facts only, from the repo files and this session. If a fact cannot be found, write "not recorded" instead of guessing.
- No secrets, keys, tokens, passwords or user ids. No email addresses. No project refs.
- Plain language. Do not use dashes as punctuation (no em dashes, no en dashes, no spaced hyphens). Use full stops, commas, colons and brackets. Hyphens inside words are fine.
- Short lines, no long paragraphs.
- Run `grep -nE "—|–| - " docs/PROJECT_HANDOVER.md` and fix any hit before committing.

## Commit

Commit that file only, locally: `git add docs/PROJECT_HANDOVER.md` then `git commit` with a short message and the attribution line the session gives. Never push. Never stage anything else.

## Final report

End the final report with this exact line:

Paste docs/PROJECT_HANDOVER.md into the Belific chat.
