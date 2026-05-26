---
name: security-review
description: Run Belific security quality gates. Use before any commit or push. Checks hardcoded credentials, sensitive console.log, TypeScript as any, and staged .env files.
disable_model_invocation: true
---

# Security Review

## Instructions

1. Run the security scan:
   ```bash
   bash .claude/skills/workflow/security-review/scripts/security-scan.sh
   ```

2. For every FAIL line, classify it:
   - **New finding** (introduced this session): fix it before proceeding.
   - **Acknowledged finding** (already in `docs/current-state-audit.md` under Security Issues): report but do not block.

3. Report a clear verdict: **PASS**, **PASS (acknowledged findings only)**, or **FAIL (new findings — do not commit)**.

## Quality Gates

- Zero hardcoded credentials in tracked files
- Zero sensitive `console.log` statements in mobile TypeScript
- Zero TypeScript `as any` in mobile code
- No `.env*` files staged for commit
