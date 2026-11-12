-- Belific migration 005: Repeat until, and Parts (PLAN_repeat_end_and_parts).
--
-- *** NOT APPLIED. Apply only after Jethro's review, through the Supabase migration tool.
-- Never `supabase db push`. ***
--
-- Additive only: two nullable columns on belific.tasks. No default, no NOT NULL, no CHECK,
-- no foreign key, no backfill, nothing rewritten or dropped, nothing outside the belific schema.
-- Existing rows get NULL, which the app reads as "no end" and "not a part".

begin;

alter table belific.tasks
  add column repeat_until date,   -- the last day a repeating task happens ('YYYY-MM-DD'); NULL = no end
  add column parent_id text;      -- the id of the task this one is a part of (a repeating parent: its root id); NULL = not a part

commit;

-- MANUAL ROLLBACK (never applied automatically; only with a backup and Jethro's go). DESTRUCTIVE:
-- every end date and every part link is lost (parts become ordinary tasks). Clients keep working:
-- the probe sees the columns missing and keeps the values on each device.
-- begin;
-- alter table belific.tasks drop column if exists parent_id, drop column if exists repeat_until;
-- commit;
