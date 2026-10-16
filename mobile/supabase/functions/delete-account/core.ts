// The rules of delete-account, kept free of Deno and network code so
// `node --test` can check them (lib/deleteAccountCore.test.ts).
//
// What this function does after the move to the shared Landis, Proload and
// Belific project: it deletes the calling user's rows in the belific schema and
// nothing else. It does NOT delete the auth user (that account is shared with
// the other apps) and it never touches the public schema.

// Every table in the belific schema that holds a user's rows. The test checks
// this list against 001_belific_schema.sql and the tables lib/sync.ts uses.
export const BELIFIC_SCHEMA = 'belific';
export const BELIFIC_TABLES = [
  'custom_events',
  'brain_dump_items',
  'routines',
  'routine_completions',
  'tasks',
  'projects',
  'custom_categories',
  'lists',
  'user_settings',
] as const;

// The user id comes only from the user the auth server verified from the JWT.
// Nothing in the request body, query string or headers is ever consulted.
export function verifiedUserId(user: { id?: unknown } | null | undefined): string | null {
  return typeof user?.id === 'string' && user.id.length > 0 ? user.id : null;
}

// The slice of a supabase-js client this needs, so a test can fake it.
export interface SchemaClient {
  schema(name: string): {
    from(table: string): {
      delete(): { eq(column: string, value: string): PromiseLike<{ error: unknown }> };
    };
  };
}

// Deletes the user's rows table by table, always through .schema('belific') and
// always filtered on user_id. Stops at the first failure and returns the name
// of the table for the (id free) function log; never an error text.
export async function deleteOwnRows(client: SchemaClient, userId: string): Promise<{ ok: true } | { ok: false; table: string }> {
  for (const table of BELIFIC_TABLES) {
    const { error } = await client.schema(BELIFIC_SCHEMA).from(table).delete().eq('user_id', userId);
    if (error) return { ok: false, table };
  }
  return { ok: true };
}
