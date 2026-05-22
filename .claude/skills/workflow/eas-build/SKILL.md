---
name: eas-build
description: Trigger a local EAS build for the Landis iOS app. Use when a new preview or production IPA needs to be built. Runs pre-build quality gates first.
disable_model_invocation: true
---

# EAS Build

## Instructions

1. Run `bash .claude/skills/eas-build/scripts/pre-build-check.sh` — abort if any check fails.
2. Confirm the target profile with the user: `preview` or `production`.
3. Run `bash .claude/skills/eas-build/scripts/eas-build.sh <profile>`.
4. Paste the EAS build URL back to the user.
5. Update `docs/current-state-audit.md` — move "EAS build queued" to the appropriate status.

## Invariants

- Builds always run with `--local` — the IPA is produced on this machine, not on Expo's cloud queue.
- Never build with credentials in `eas.json` — they must be in EAS Secrets.
- `EXPO_PUBLIC_API_URL` must be present in the production profile before a production build.
- Bundle ID: `com.landis.app` | Apple Team: `9PG7ANYKDV`.
