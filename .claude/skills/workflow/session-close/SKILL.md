---
name: session-close
description: End-of-session housekeeping for Belific. Updates docs, runs security scan, writes session log. Called at the end of every session via the closing message.
user_invocable: false
---

# Session Close

## Instructions

1. Run the session summary script:
   ```bash
   bash .claude/skills/workflow/session-close/scripts/session-summary.sh
   ```

2. Update `docs/current-state-audit.md`:
   - Move completed items from Pending → Complete.
   - Add any new pending items discovered this session.
   - Update the Status Overview table.

3. Write `docs/sessions/YYYY-MM-DD.md` (today's date) using this structure:
   ```
   # Session YYYY-MM-DD

   ## Changes Made

   ## Pending Next Session

   ## Decisions
   ```
   If a session file already exists today, append a `b` suffix (e.g. `2026-05-26b.md`).

4. Run the security scan:
   ```bash
   bash .claude/skills/workflow/security-review/scripts/security-scan.sh
   ```
   - New findings → fix before committing.
   - Acknowledged findings already in `docs/current-state-audit.md` → report but do not block.

5. List uncommitted changes grouped as:
   - **This session's changes** — stage these
   - **Pre-existing unstaged changes** — list separately, do NOT stage without explicit instruction

6. Ask the user whether to commit staged changes.

7. Confirm: "Session closed. Opening message for next session is in `docs/claude-code-standard.md`."
