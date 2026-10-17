// belific-calendar-feed (build plan phase 8, step 2): the read only calendar
// feed of one user's timed tasks, at a secret link that Google, Apple and
// Outlook subscribe to. The rules are in core.ts; this is only the wiring.
//
// DEPLOY WITH JWT VERIFICATION OFF (`--no-verify-jwt`, also set in
// supabase/config.toml): calendar apps send no login, the token in the link is
// the only credential. Only Jethro deploys. Steps: docs/CALENDAR_FEED_DEPLOY.md.
//
// The service role key is used for exactly two reads (core.ts header): the
// owner of the token, then that owner's task rows. It is never logged, never
// returned, and nothing is written. It is needed because the caller has no JWT
// and anon has no access to the belific schema. service_role needs SELECT on
// belific.user_settings, which 003_calendar_feed_grants.sql adds (select on
// belific.tasks and schema usage it already has, per Jethro's check).
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected into every Edge
// Function's environment by the platform; nothing to configure.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  BELIFIC_SCHEMA,
  FEED_TOKEN_KEY,
  MAX_PAGES,
  PAGE_SIZE,
  RateLimiter,
  TASK_COLUMNS,
  TOKEN_LIMIT,
  UNKNOWN_LIMIT,
  handleFeed,
  type FeedDb,
  type TaskRow,
} from './core.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Module level: the counts live as long as this instance (best effort, see core.ts).
const tokenLimiter = new RateLimiter(TOKEN_LIMIT.max, TOKEN_LIMIT.windowMs);
const unknownLimiter = new RateLimiter(UNKNOWN_LIMIT.max, UNKNOWN_LIMIT.windowMs);

function makeDb(): FeedDb | null {
  if (!supabaseUrl || !serviceKey) return null;
  const client = createClient(supabaseUrl, serviceKey, {
    db: { schema: BELIFIC_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async ownerOfToken(token) {
      const { data, error } = await client
        .from('user_settings')
        .select('user_id')
        .eq('key', FEED_TOKEN_KEY)
        .eq('value', token)
        .is('deleted_at', null)
        .limit(2);
      if (error) return 'error';
      // Exactly one owner, or none (two would be a 256 bit collision: refuse).
      if (!data || data.length !== 1) return null;
      const id = (data[0] as { user_id?: unknown }).user_id;
      return typeof id === 'string' && id ? id : null;
    },
    async tasksOf(userId) {
      const rows: TaskRow[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await client
          .from('tasks')
          .select(TASK_COLUMNS.join(','))
          .eq('user_id', userId)
          .order('id')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) return 'error';
        const list = (data ?? []) as TaskRow[];
        rows.push(...list);
        if (list.length < PAGE_SIZE) break;
      }
      return rows;
    },
  };
}

const db = makeDb();

Deno.serve(async (req: Request) => {
  if (!db) {
    console.error('[belific-calendar-feed] environment incomplete');
    return new Response('The feed is unavailable. Try again later.\n', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  try {
    const res = await handleFeed(req, { db, tokenLimiter, unknownLimiter, now: () => new Date() });
    // Only the status is logged: never the link, the token or a user id.
    console.log(`[belific-calendar-feed] ${res.status}`);
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch {
    console.error('[belific-calendar-feed] unhandled exception');
    return new Response('The feed is unavailable. Try again later.\n', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
});
