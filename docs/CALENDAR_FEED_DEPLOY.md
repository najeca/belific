# Calendar feed: deploy steps and test checklist

The outbound calendar feed (build plan phase 8, step 2, app 2.25.0). **Only Jethro deploys.** Claude wrote and tested it locally and deployed nothing.

- Function: `belific-calendar-feed` (name approved by Jethro on 2026-10-17 and checked free on the shared project `vlogfwnmaqorhialcqbr`).
- Code: `mobile/supabase/functions/belific-calendar-feed/` (`index.ts` wiring, `core.ts` rules, `vendor/` byte for byte copies of seven `mobile/lib` files plus `icsFeed.ts`; `node scripts/vendor-feed.js` refreshes them and a test fails if they drift).
- Grant: `mobile/supabase/belific_schema/003_calendar_feed_grants.sql` (one line: `grant select on table belific.user_settings to service_role`), rollback beside it.
- Link the apps show: `https://vlogfwnmaqorhialcqbr.supabase.co/functions/v1/belific-calendar-feed?t=<43 character token>`.

## What it reads and what it never does

1. `belific.user_settings`: `user_id` of the one live row (`deleted_at is null`) whose `key` is `calendar.feed_token` and whose `value` is the token.
2. `belific.tasks` of that `user_id` only: `id, title, emoji, due_date, start_time, duration_minutes, completed, recurrence, recurrence_days, recurrence_month_day, updated_at, deleted_at`.

It writes nothing. The user id comes only from step 1, never from the request. Every failure is a fixed sentence (`Not found`, `Too many requests`, `Method not allowed`, `The feed is unavailable. Try again later.`). Its log lines hold the HTTP status only. Responses are `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, no CORS headers. Rate limits: 30 requests per token per 10 minutes; 20 malformed or unknown tokens per caller address per 10 minutes, after which that caller gets 429 with no database read. The counts live in the function instance's memory (best effort; an instance restart forgets them).

The feed holds timed tasks only (a Day and a start time), 30 days back to 365 days ahead, the title with the task's emoji in front and `✓ ` in front when done. No notes, labels, priority, steps or time spent. Times are floating (no zone), so 09:00 shows as 09:00 in the subscriber's calendar.

## Deploy steps (in this order)

1. **Check the grants first** (SQL editor of the shared project):
   ```sql
   select has_schema_privilege('service_role', 'belific', 'usage')               as schema_usage,
          has_table_privilege('service_role', 'belific.tasks', 'select')         as tasks_select,
          has_table_privilege('service_role', 'belific.user_settings', 'select') as settings_select;
   ```
   Expected now: `true, true, false`.
2. **Review and apply `003_calendar_feed_grants.sql`** to the shared project the same way as 002 (the Supabase migration tool, or paste it in the SQL editor). **Never `supabase db push`.** Run the query in step 1 again: `true, true, true`. Record it in `mobile/supabase/belific_schema/README.md`.
3. **Deploy with JWT verification off** (calendar apps send no login; the token is the only credential). From `mobile/`:
   ```bash
   npx supabase functions deploy belific-calendar-feed --project-ref vlogfwnmaqorhialcqbr --no-verify-jwt
   ```
   `mobile/supabase/config.toml` also says `verify_jwt = false` for this function only, so a deploy without the flag still gets it right; pass the flag anyway. Deploy only this function: never `functions deploy` with no name (that would also deploy `delete-account`, which must not be deployed yet).
4. In the dashboard, Edge Functions, `belific-calendar-feed`: check "Verify JWT" shows **off**. Nothing else to configure: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform. Do not add secrets.

Rollback: delete the function in the dashboard (Edge Functions, `belific-calendar-feed`, Delete), then, if wanted, apply `003_calendar_feed_grants_rollback.sql`. The apps keep working; the Settings link simply stops answering.

## Test checklist after deploying

Use the Windows app 2.25.0, signed in.

1. Settings, Calendars, **Create feed link**. It should say **Active.** within a few seconds (it syncs at once). If it says "becomes active once it has synced", press Sync now.
2. **Copy link** and open it in a browser. Expect a download or text starting `BEGIN:VCALENDAR` with your timed tasks (title and emoji only, done ones with ✓). Tasks with a Day but no time are not there. Notes are not there.
3. **Wrong token:** change one character of the token in the address. Expect `Not found` (404), nothing else.
4. **No token:** remove `?t=...`. Expect `Not found`.
5. **Method:** `curl -X POST "<link>"` gives `Method not allowed` (405). `curl -I "<link>"` gives 200 with `content-type: text/calendar; charset=utf-8`, `cache-control: private, no-store, max-age=0` and no `access-control-allow-origin`.
6. **Subscribe:** Google Calendar (Other calendars, +, From URL), Apple Calendar on a Mac (File, New Calendar Subscription) and Outlook (Add calendar, Subscribe from web). Google can take several hours for the first fetch and refreshes on its own schedule; Apple lets you pick every 5 minutes.
7. Check a task at 09:00 shows at 09:00, one that runs past midnight ends the next morning, a repeating timed task shows on its coming days, and a skipped day is missing.
8. **Make a new link** in Settings. Open the OLD link in the browser: `Not found` at once (after the sync). The new link works. Subscribed calendars on the old link stop updating (they keep their last copy until you remove the subscription; that is how calendar apps behave).
9. **Turn off feed**: the link gives `Not found`.
10. **Another user:** if a second account exists, its link shows only its own tasks; a second account with no timed tasks gets an empty calendar (valid, no events).
11. **Rate limit:** `for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" "<link>"; done` ends in `429`s (the instance may have been recycled, in which case you see more 200s; that is the accepted limit).
12. **Logs:** Edge Functions, `belific-calendar-feed`, Logs: lines read `[belific-calendar-feed] 200` (or 404, 429). No token, no user id. Note the platform's own request log may show the URL with the token; Regenerate is the remedy if a link ever leaks.
13. **Export:** Settings, Data, My data (JSON): search the file for `feed_token` — it must not be there.

## Tested here before handing over (2026-10-17, nothing deployed)

- `node --test lib/calendarFeedFunction.test.ts` (17): right token, wrong token, malformed tokens with no database read, regenerated token (old 404 at once, new 200), turned off, a user with no tasks (valid empty calendar), isolation (the user id only from the lookup, `user_id` in the query ignored, a token that is another setting's value is refused), both rate limits, database errors and exceptions (503, nothing leaked), HEAD and other methods, junk rows, the wiring checked as text (two reads only, no writes, logs status only), the vendor copies, `config.toml`, 003 and its rollback.
- `node --test lib/icsFeed.test.ts` (10): content, window, title, floating times, clock change day, series, empty calendar, folding, round trip through the importer, five time zones.
- **The real `index.ts` under Deno 2.5.6** (not a project dependency; run from a temp folder) against a fake PostgREST: `DENO=<deno> node scripts/feed-local-test.js`, 18 checks over real HTTP, all passed, and `deno check` of `index.ts` is clean.
