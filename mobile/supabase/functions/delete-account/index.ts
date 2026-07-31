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

Deno.serve(async (req: Request) => {
  console.log('[delete-account] invoked');
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[delete-account] missing Authorization header');
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    console.log(
      `[delete-account] env present: url=${!!supabaseUrl} anon=${!!anonKey} service=${!!serviceRoleKey}`,
    );
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: missing env vars' }), { status: 500 });
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
      return new Response(JSON.stringify({ error: `Unauthorized: ${userError?.message ?? 'no user'}` }), { status: 401 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    for (const table of SYNCED_TABLES) {
      const { error } = await adminClient.from(table).delete().eq('user_id', user.id);
      console.log(`[delete-account] delete ${table} -> ${error ? error.message : 'ok'}`);
      if (error) {
        return new Response(JSON.stringify({ error: `Failed deleting ${table}: ${error.message}` }), { status: 500 });
      }
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);
    console.log(`[delete-account] deleteUser(${user.id}) -> ${deleteUserError ? deleteUserError.message : 'ok'}`);
    if (deleteUserError) {
      return new Response(JSON.stringify({ error: deleteUserError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[delete-account] unhandled exception', e);
    return new Response(JSON.stringify({ error: `Unhandled: ${e instanceof Error ? e.message : String(e)}` }), { status: 500 });
  }
});
