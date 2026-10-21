-- Belific migration 004 (Part B, 2026-10-20, and Part C, 2026-10-21): the split
-- switch and the reminder list of a task (Part B), and the extra times and the
-- ticked times of a task (Part C).
--
-- *** NOT APPLIED. DO NOT RUN. ***
-- Written for Jethro's review. It is applied only by Jethro, after a backup
-- and his explicit go, through the Supabase migration tool or the SQL editor of
-- the shared project, AFTER 001, 002 and 003. Never `supabase db push`.
--
-- Additive only: four nullable columns on belific.tasks. No default, no NOT NULL,
-- no CHECK, no backfill, nothing rewritten, nothing outside the belific schema.
-- Existing rows get NULL, which the app reads as "no cut", "no reminder list
-- set" (the older reminder_minutes and the Settings default then apply), "one
-- time" and "no time ticked".
--
-- Clients from before this migration (the iPhone 2.18.1 and every build up to
-- it, and desktops before Part B) never send the new columns: an upsert only
-- changes the columns it names, so values written by a newer desktop are not
-- erased by them. They ignore the columns when they read. Clients from after it
-- probe for both columns and do not send either until both exist
-- (syncServer.ts probe, Caps.partB); until then the values stay on the device
-- and are queued for upload when the probe first sees the columns.
--
-- Part C's two columns (extra_times, times_done) are probed on their own
-- (Caps.partC), so Part B's and Part C's sync switch on independently. A client
-- from before Part C never names them, so they are not erased by it; it shows a
-- task with extra times once, at its earliest time (start_time), and ticking the
-- task there completes every time.
--
-- After applying (Jethro's checks): all four columns exist on belific.tasks; the
-- number of rows with NULL in each equals the number of tasks; row counts of
-- every table are unchanged; row level security and grants are unchanged.
--
-- Same conventions as 001 and 002: the client sanitises, so the server has no
-- CHECK constraint that could fail a whole batch on one bad value.

begin;

alter table belific.tasks
  add column cuts_below boolean,   -- true = this task cuts the tasks it overlaps (a break); NULL or false = off
  add column reminders jsonb,      -- an array of whole minutes before the start (0 = at the start), at most 5; NULL = not set
  add column extra_times jsonb,    -- an array of 'HH:mm', the other times of the day this task happens (same length), at most 6; NULL = one time
  add column times_done jsonb;     -- an array of 'HH:mm', the times ticked on this row's day; NULL = none (completed true still means every time)

commit;

-- ---------------------------------------------------------------------------
-- MANUAL ROLLBACK (never applied automatically; copy it out and run it only
-- with a backup and Jethro's go). DESTRUCTIVE: it drops all four columns and every
-- value in them (which tasks cut, every reminder list, every extra time and every
-- ticked time). Clients keep working afterwards: the probe sees the columns
-- missing and stops sending them, and the values stay on each device.
--
-- begin;
-- alter table belific.tasks
--   drop column if exists times_done,
--   drop column if exists extra_times,
--   drop column if exists reminders,
--   drop column if exists cuts_below;
-- commit;
-- ---------------------------------------------------------------------------
