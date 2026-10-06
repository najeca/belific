# Decision 016 — Labels

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** A Label is a Project plus a colour. The table stays `projects` and the type stays `Project` in code. "Label" is the UI word, and the glossary records the mapping. A task has **one** label, and the nav spec wording about "other labels" is removed. New `projects.color` text holds a **palette key**, not a hex value: six keys defined once in `mobile/lib/theme.ts` as `LABEL_SWATCHES`. Delete is a tombstone. Tasks keep the dangling `projectKey`, and every reader treats an unknown key as "no label". A placed task's Timebox block uses its label colour, or a neutral border when it has none. Events keep category colours. Custom Categories remain event only and are not merged with Labels.

**Note (2026-10-06, checkpoint 4.1).** `Project.colorKey` now exists **locally** on desktop: one of eight palette keys defined once in `mobile/lib/labelColors.ts` (`LABEL_COLORS`: sage, clay, sky, sand, plum, moss, rose, slate), replacing the six `LABEL_SWATCHES` sketched above. A new label takes the next unused key; older labels get one lazily on the desktop's first read, without changing `updatedAt`. Kanban cards and Timebox blocks with a label use its tint and a 4px edge; rows show a dot. It is **local only until checkpoint 5** adds the `projects.color` column: `projectToRemote` and `projectFromRemote` do not carry it, and a sync pull that replaces a local project with the server copy would drop it. **Checkpoint 5 must merge local only fields on pull** (and then map `color` both ways). The iPhone app never reads the field and only creates projects (`TaskForm`), so it is unaffected.

**Note (2026-10-06, checkpoint 4.3).** Label names are unique, compared trimmed and case insensitively (`lib/labelRules.ts`): creating an existing name selects it, renaming to another label's name is rejected. Ten suggestions live in `lib/labelSuggestions.ts`. Labels can now be renamed (`updateProject`, a real edit that stamps `updatedAt` and pushes) and deleted (`deleteProject`, a **tombstone**: `deletedAt` and `updatedAt` set and pushed through `pushProject`, whose mapper already carries `deleted_at`; never a hard delete). Before the tombstone is written, the label's tasks move to another live label with the same name if one exists (this is how two accidental duplicates are merged), otherwise their `projectKey` is cleared, each through `updateTask`. So no task is left pointing at a deleted label, although readers still treat an unknown key as "no label". `loadProjects` filters `deletedAt`, which hides deleted labels from the iPhone's Tasks filter and Task form picker. Only desktop code calls rename and delete.

**Note (2026-10-06, checkpoint 5).** `colorKey` now syncs, as `projects.color_key` (named `color_key`, not the `color` proposed above, so it is not confused with `custom_categories.color`, which holds a hex value). It reaches the server once migration `20261006120100_task_pipeline.sql` is applied; until then a pull keeps each device's local colour. A recolour is now a stamped, synced edit; the lazy colour fill still leaves `updatedAt` alone but is queued so the colour reaches other devices. Label deletion syncs as a tombstone through the same outbox, and the moved or cleared tasks sync as normal task edits (tested end to end against the fake server).

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
