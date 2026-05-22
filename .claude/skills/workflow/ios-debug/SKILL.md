---
name: ios-debug
description: Debug a Landis iOS launch crash or EAS build failure. Checks the five documented root causes before reading logs.
---

# iOS Debug

## Instructions

1. Run `bash .claude/skills/workflow/ios-debug/scripts/check-known-issues.sh` — fix any failure before reading logs.
2. If all checks pass, retrieve the latest EAS build log:
   `cd apps/mobile && eas build:list --limit 1` then `eas build:view <id>`.
3. Search the log against `.claude/skills/workflow/ios-debug/reference/known-errors.md`.
4. If the error matches a known issue, apply the documented fix exactly.
5. If the error is new, read `apps/mobile/index.js` (polyfill order) and `apps/mobile/lib/supabase.ts` (lazy init).
6. After any fix, invoke `/eas-build` for a new build.

## Critical Invariants

- `react-native-get-random-values` must be line 1 of `apps/mobile/index.js`.
- `createClient()` must never be called at module scope — only via `getSupabase()`.
- `disableHierarchicalLookup` in `metro.config.js` must be `false`.
- `apps/mobile/babel.config.js` must exist with `babel-preset-expo`.
