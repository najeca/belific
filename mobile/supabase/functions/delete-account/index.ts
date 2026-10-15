// "Delete Belific data" (the Edge Function is still called delete-account).
// Removes every row the calling user owns in the belific schema, across all 7
// tables, and nothing else. It does NOT delete the auth user: since the move to
// the shared Landis, Proload and Belific project that user belongs to the other
// apps too. Whether Apple's account deletion rule (5.1.1(v)) is met by this is
// an open decision for Jethro (docs/sessions/2026-10-15-project-move.md).
//
// The rows are deleted with the caller's OWN JWT, so row level security
// (user_id = auth.uid()) is a second wall behind the explicit user_id filter:
// even a bug here could only ever reach the caller's rows. No service role key
// is used, so none is read.
//
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically into every Edge
// Function's environment, nothing to configure. The rules live in core.ts.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { deleteOwnRows, verifiedUserId } from './core.ts';

// CORS (checkpoint 5, review section 4): only the Windows desktop app's own
// origin may call this from a page. The iPhone calls it from native code,
// which sends no Origin and needs no CORS at all, so no browser origin is
// allowed and there is no wildcard. Any other Origin gets no
// Access-Control-Allow-Origin header, so a browser refuses the response.
const ALLOWED_ORIGINS = ['app://belific'];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

// What a caller is ever told when something goes wrong: one sentence per
// status, never a server error text, a table name or an id (checkpoint 12).
// Details stay in the function log, and the log never holds a user id.
const UNAUTHORIZED = { error: 'Unauthorized' };
const FAILED = { error: 'The account could not be deleted' };

function json(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

Deno.serve(async (req: Request) => {
  // Preflight: answered before any auth, never touches data.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  console.log('[delete-account] invoked');
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[delete-account] missing Authorization header');
      return json(req, UNAUTHORIZED, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    console.log(`[delete-account] env present: url=${!!supabaseUrl} anon=${!!anonKey}`);
    if (!supabaseUrl || !anonKey) {
      return json(req, FAILED, 500);
    }

    // The caller's own client: every request carries their JWT, so RLS applies.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Asks the auth server to verify the JWT. The id used below comes from
    // here and nowhere else; the request body is never read.
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    const userId = userError ? null : verifiedUserId(user);
    console.log(`[delete-account] getUser -> ${userId ? 'ok' : 'rejected'}`);
    if (!userId) {
      return json(req, UNAUTHORIZED, 401);
    }

    const result = await deleteOwnRows(userClient, userId);
    console.log(`[delete-account] delete rows -> ${result.ok ? 'ok' : `failed at ${result.table}`}`);
    if (!result.ok) {
      return json(req, FAILED, 500);
    }

    return json(req, { success: true }, 200);
  } catch {
    console.error('[delete-account] unhandled exception');
    return json(req, FAILED, 500);
  }
});
