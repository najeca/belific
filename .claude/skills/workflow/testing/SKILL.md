---
name: testing
description: Run before every EAS build and after every device install. Confirms all Landis features work correctly and catches regressions before App Store submission.
---

## Instructions

### Step 1 — Pre-test check
Run pre-test-check.sh to confirm Metro is running and device is connected.

```bash
bash .claude/skills/workflow/testing/scripts/pre-test-check.sh
```

### Step 2 — Work through checklist
Work through checklist.md top to bottom.
Mark each item pass or fail.
Stop and fix any fail before continuing.

### Step 3 — Edge case checks
Run edge case checks from edge-cases.md manually on device.

### Step 4 — Report result
If all pass, report: **TESTING PASSED**
If any fail, report: **TESTING FAILED** with exact list of failures.

### Step 5 — Update audit
Update docs/current-state-audit.md with test results and date.
