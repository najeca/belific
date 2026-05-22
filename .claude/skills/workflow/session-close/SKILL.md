---
name: session-close
description: End-of-session housekeeping. Updates docs, runs security scan, and writes session log. Called by the user at the end of every session via the closing message.
user_invocable: false
---

# Session Close

## Instructions

1. Run `bash .claude/skills/workflow/session-close/scripts/session-summary.sh` — review output.
2. Update `docs/current-state-audit.md`:
   - Move any items completed this session from Pending → Complete.
   - Add any new pending items or security findings discovered this session.
   - Update the Status Overview table.
3. If `docs/issues.md` exists, mark resolved issues closed and add any new ones found. Skip this step silently if the file does not exist.
4. Run the security scan directly (do not use `/security-review` — it has `disable_model_invocation: true`):
   ```
   bash .claude/skills/workflow/security-review/scripts/security-scan.sh
   ```
   Apply the security-review skill verdict rules:
   - New findings → fix before committing.
   - Acknowledged findings already in `docs/current-state-audit.md` → report but do not block.
5. If uncommitted changes exist, list them for the user grouped as:
   - **This session's changes** — files modified or created during the session (stage these).
   - **Pre-existing unstaged changes** — files modified or deleted before this session started (do NOT stage these without explicit user instruction; list them separately).
   Only stage this session's changes. Never `git add -A` or `git add .`.
6. Ask the user whether to commit the staged changes.
7. Write `docs/sessions/YYYY-MM-DD.md` (today's date) using this structure:
   ```
   # Session YYYY-MM-DD
   ## Changes Made
   ## Pending Next Session
   ## Decisions
   ```
8. Confirm to the user: "Session closed. Opening message for next session is in docs/claude-code-standard.md."
