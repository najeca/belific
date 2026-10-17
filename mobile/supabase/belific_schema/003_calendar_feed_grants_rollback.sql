-- MANUAL rollback for 003_calendar_feed_grants.sql. Never applied
-- automatically; apply to the shared project (vlogfwnmaqorhialcqbr) only on
-- Jethro's go.
--
-- Revokes the one grant 003 added: service_role can no longer SELECT from
-- belific.user_settings. No data is touched and nothing else changes. The
-- calendar feed (belific-calendar-feed) then answers "unavailable" for every
-- link; the apps keep working.
--
-- Only run this if service_role did NOT have this privilege before 003 (the
-- check in 003 showed settings_select = false on 2026-10-17). If some other app
-- on the shared project had granted it earlier, revoking it would break that app.

begin;

revoke select on table belific.user_settings from service_role;

commit;
