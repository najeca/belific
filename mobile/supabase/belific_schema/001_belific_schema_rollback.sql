-- MANUAL rollback for 001_belific_schema.sql. Never applied automatically.
-- DESTRUCTIVE: drops the belific schema and EVERY Belific row in it. Take a
-- backup first. It touches nothing outside the belific schema (not public,
-- not auth: the auth users, which Landis and Proload share, are untouched).
--
-- Also remove "belific" from Data API > Exposed schemas in the dashboard.

begin;
drop schema if exists belific cascade;
commit;
