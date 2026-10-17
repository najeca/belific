-- Belific migration 003 (build plan phase 8): let the calendar feed read the
-- feed token. WRITTEN, NOT APPLIED. It must be applied to the SHARED project
-- (vlogfwnmaqorhialcqbr, "belific landis proload") after Jethro has reviewed it,
-- the same way as 002 (the Supabase migration tool or the SQL editor), AFTER 001
-- and 002 (both live). Never with `supabase db push`.
--
-- What it does, and nothing else: one grant. service_role may SELECT from
-- belific.user_settings. No table, column, policy, function or other privilege
-- changes; nothing outside the belific schema; nothing for anon, authenticated
-- or public.
--
-- Why: the Edge Function belific-calendar-feed is opened by calendar apps,
-- which send no login, so it reads with the service role key. It looks up the
-- owner of a feed token in user_settings (key 'calendar.feed_token'), then
-- reads that owner's tasks. Jethro checked the live project on 2026-10-17:
-- service_role already has USAGE on the belific schema and SELECT on
-- belific.tasks, but NOT SELECT on belific.user_settings, so without this the
-- token lookup fails and the feed answers "unavailable". service_role bypasses
-- row level security, so the function itself filters on the token and then on
-- that one user_id (supabase/functions/belific-calendar-feed/core.ts).
--
-- Check before and after (SQL editor):
--   select has_schema_privilege('service_role', 'belific', 'usage')                 as schema_usage,
--          has_table_privilege('service_role', 'belific.tasks', 'select')           as tasks_select,
--          has_table_privilege('service_role', 'belific.user_settings', 'select')   as settings_select;
-- Before: true, true, false. After: true, true, true.
--
-- Rollback: 003_calendar_feed_grants_rollback.sql (revokes this one grant; the
-- feed then stops working, nothing else changes and no data is touched).

begin;

grant select on table belific.user_settings to service_role;

commit;
