// Account deletion (Apple guideline 5.1.1(v)): removes every row this
// user owns across all 7 synced tables, then the auth user itself, in
// that order. Must run server-side with the service-role key — the
// client can never delete its own auth user directly, Supabase's
// client SDK has no self-delete call for that reason.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// injected automatically into every Edge Function's environment —
// nothing to configure.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SYNCED_TABLES = [
  'custom_events',
  'brain_dump_items',
  'routines',
  'routine_completions',
  'tasks',
  'projects',
  'custom_categories',
] as const;

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
      return json(req, { error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    console.log(
      `[delete-account] env present: url=${!!supabaseUrl} anon=${!!anonKey} service=${!!serviceRoleKey}`,
    );
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(req, { error: 'Server misconfigured: missing env vars' }, 500);
    }

    // Verifies the caller's own JWT — identifies exactly one real,
    // already-authenticated user; there is no other way to reach this
    // function's admin-privileged deletion path.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    console.log(`[delete-account] getUser -> user=${user?.id ?? 'none'} error=${userError?.message ?? 'none'}`);
    if (userError || !user) {
      return json(req, { error: `Unauthorized: ${userError?.message ?? 'no user'}` }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    for (const table of SYNCED_TABLES) {
      const { error } = await adminClient.from(table).delete().eq('user_id', user.id);
      console.log(`[delete-account] delete ${table} -> ${error ? error.message : 'ok'}`);
      if (error) {
        return json(req, { error: `Failed deleting ${table}: ${error.message}` }, 500);
      }
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);
    console.log(`[delete-account] deleteUser(${user.id}) -> ${deleteUserError ? deleteUserError.message : 'ok'}`);
    if (deleteUserError) {
      return json(req, { error: deleteUserError.message }, 500);
    }

    return json(req, { success: true }, 200);
  } catch (e) {
    console.error('[delete-account] unhandled exception', e);
    return json(req, { error: `Unhandled: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
