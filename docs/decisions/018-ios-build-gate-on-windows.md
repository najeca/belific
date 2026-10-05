# Decision 018 — iOS build gate while developing on Windows

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation
**Note:** , pending Jethro's answer on the Mac Mini.

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** Every commit that touches `mobile/` must pass, on Windows:
1. `npx tsc --noEmit`
2. `node --test mobile/lib/**/*.test.ts`
3. `npx expo export --platform ios --output-dir %TEMP%/ios-check`, a JavaScript bundle check that catches web only imports leaking into native [unverified that it runs cleanly on Windows; check it once]

A GitHub Actions workflow runs the same three checks on push. It is free for public repositories. A real device Release build happens in batches, before any TestFlight or EAS build, on the Mac Mini if it is kept. "Done" for shared code means gates 1 to 3 pass. "Shipped to iOS" means a device test as well.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
