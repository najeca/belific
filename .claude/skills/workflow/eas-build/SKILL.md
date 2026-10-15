---
name: eas-build
description: Trigger a local EAS build for the Landis iOS app. Use when a new preview or production IPA needs to be built. Runs pre-build quality gates first.
disable_model_invocation: true
---

> **STALE for Belific (marked 2026-10-15, kept, not deleted).** This is the **Landis** skill: bundle `com.landis.app`, paths under `apps/mobile`, `--local` builds, `EXPO_PUBLIC_API_URL`. Its scripts do not fit this repo (`mobile/`, bundle `com.najeca.belific`) and must not be run for Belific. Use `docs/BELIFIC_EAS_TESTFLIGHT.md`. Jethro's "ready for EAS build" rule still applies (`TESTING_PROTOCOL.md`).

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
