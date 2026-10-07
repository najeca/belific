# Decision 018 — iOS build gate while developing on Windows

**Date:** 2026-10-05
**Status:** Confirmed on 2026-10-07 (confirmed by Jethro)
**Note:** , pending Jethro's answer on the Mac Mini.

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** Every commit that touches `mobile/` must pass, on Windows:
1. `npx tsc --noEmit`
2. `node --test mobile/lib/**/*.test.ts`
3. `npx expo export --platform ios --output-dir %TEMP%/ios-check`, a JavaScript bundle check that catches web only imports leaking into native [unverified that it runs cleanly on Windows; check it once]

The checks are run by hand before each commit; no online checker (GitHub Actions workflow) is planned. The manual checks and the iOS marker script below are the gate. A real device Release build happens in batches, before any TestFlight or EAS build, on the Mac Mini if it is kept. "Done" for shared code means gates 1 to 3 pass. "Shipped to iOS" means a device test as well.

**Marker script (checkpoint 11, 2.17.0).** Gate 3 is now `cd mobile && npm run check:ios-markers -- <export folder>`, run on a fresh `npx expo export --platform ios --output-dir <temp folder outside the repo>`. `mobile/scripts/ios-markers.js` reads the Hermes bundle and fails (exit 1) on any desktop only marker (the auth, Settings, Labels, Progress and routine conversion names and strings, and `seriesStreak`), and exits 2 when the folder or bundle is missing. One name is allowed on purpose: `copyRoutineCompletions`, an inert helper in the shared `storage.ts` that the phone never calls; because Hermes de-duplicates strings, that name is checked in source with `git grep` and may appear only in `storage.ts`, `routineConvertActions.ts`, the script and tests. **`seriesStreak` is a marker only until the iOS catch-up release reuses the streak code; whoever ships the phone feature must remove that marker from the list deliberately.**

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
