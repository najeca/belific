---
name: security-review
description: Run the Landis security quality gates. Use before any commit or push. Checks hardcoded credentials, sensitive console.log, TypeScript as any, and staged .env files.
disable_model_invocation: true
---

# Security Review

## Instructions

1. Run `bash .claude/skills/workflow/security-review/scripts/security-scan.sh`.
2. For every FAIL line, classify it:
   - **New finding** (introduced this session): fix it before proceeding — never bypass.
   - **Acknowledged finding** (already documented in `docs/current-state-audit.md` under Security Issues): report it but do not block the session. Confirm the finding matches the documented one exactly — if it has grown or changed, treat it as new.
3. Verify `.env.local` was never committed: `git log --all -- apps/web/.env.local`.
4. If the session touched any Supabase tables, verify RLS via `/supabase-migration`.
5. Report a clear verdict: **PASS**, **PASS (acknowledged findings only)**, or **FAIL (new findings — do not commit)**.

## Quality Gates (automated in security-scan.sh)

- Zero hardcoded credentials in tracked files
- Zero sensitive `console.log` statements
- Zero TypeScript `as any`
- `eas.json` free of credentials
- No `.env*` files staged for commit
