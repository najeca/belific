---
name: session-close
description: End-of-session housekeeping for Belific. Runs the security scan, then the belific-handover skill. Does not write session logs.
user_invocable: false
---

# Session Close

Status lives in `docs/PROJECT_HANDOVER.md`, written by the belific-handover skill. There are no session logs and no audit file to update.

## Instructions

1. Run the security scan:
   ```bash
   bash .claude/skills/workflow/security-review/scripts/security-scan.sh
   ```
   - New findings: fix before committing.
   - Accepted findings already listed in `docs/PROJECT_HANDOVER.md` or `docs/CURRENT_TRUTH.md`: report but do not block.

2. Run the belific-handover skill. It regenerates `docs/PROJECT_HANDOVER.md` and commits that file only.

3. List uncommitted changes grouped as:
   - This session's changes: stage these only on request.
   - Pre-existing unstaged changes: list separately, do NOT stage without explicit instruction.

4. Ask the user whether to commit anything else. Never push.

5. End with the line: Paste docs/PROJECT_HANDOVER.md into the Belific chat.
