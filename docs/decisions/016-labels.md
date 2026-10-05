# Decision 016 — Labels

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** A Label is a Project plus a colour. The table stays `projects` and the type stays `Project` in code. "Label" is the UI word, and the glossary records the mapping. A task has **one** label, and the nav spec wording about "other labels" is removed. New `projects.color` text holds a **palette key**, not a hex value: six keys defined once in `mobile/lib/theme.ts` as `LABEL_SWATCHES`. Delete is a tombstone. Tasks keep the dangling `projectKey`, and every reader treats an unknown key as "no label". A placed task's Timebox block uses its label colour, or a neutral border when it has none. Events keep category colours. Custom Categories remain event only and are not merged with Labels.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
