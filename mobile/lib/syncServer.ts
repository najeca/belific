import type { SupabaseClient } from '@supabase/supabase-js';
import { groupByColumns, type Caps, type TimestampedTable } from './syncCore.ts';
import type { PageQuery, ServerAdapter } from './syncEngine.ts';

// The sync engine's server, as a Supabase client. Split out of sync.ts so a
// test can run it against a real client with a fake fetch (it must not import
// react-native or the app's own client). The client decides the schema: the
// app's client is created with db.schema = 'belific', so every request here
// carries Accept-Profile / Content-Profile: belific.

type AnyTable = TimestampedTable | 'routine_completions';

const ON_CONFLICT: Record<AnyTable, string> = {
  custom_events: 'user_id,id',
  brain_dump_items: 'user_id,id',
  routines: 'user_id,id',
  tasks: 'user_id,id',
  projects: 'user_id,key',
  custom_categories: 'user_id,key',
  lists: 'user_id,key',
  user_settings: 'user_id,key',
  routine_completions: 'user_id,routine_id,date',
};

const ORDER: Record<AnyTable, string[]> = {
  custom_events: ['id'],
  brain_dump_items: ['id'],
  routines: ['id'],
  tasks: ['id'],
  projects: ['key'],
  custom_categories: ['key'],
  lists: ['key'],
  user_settings: ['key'],
  routine_completions: ['routine_id', 'date'],
};

interface PgError {
  code?: string;
  message?: string;
}

// A missing column, or (for the tables migration 002 adds) a missing table.
// Both mean "not migrated yet", never a failure.
function isMissingColumn(error: PgError): boolean {
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /column .* does not exist|could not find the .* column|relation .* does not exist|could not find the table/i.test(error.message ?? '')
  );
}

export function createSupabaseServer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  getUserId: () => Promise<string | null>,
): ServerAdapter {
  async function columnExists(table: AnyTable, column: string): Promise<boolean> {
    const { error } = await client.from(table).select(column).limit(1);
    if (!error) return true;
    if (isMissingColumn(error)) return false;
    throw new Error(error.message);
  }

  return {
    userId: getUserId,
    // Which migrations the server has: both work before and after (see
    // docs/sessions/2026-10-06-cp5.md, "before and after the migrations").
    async probe(): Promise<Caps> {
      const [serverUpdatedAt, taskCols, projectCols, subtasksCol, reminderCol, ...planner] = await Promise.all([
        columnExists('tasks', 'server_updated_at'),
        columnExists('tasks', 'duration_minutes'),
        columnExists('projects', 'color_key'),
        columnExists('tasks', 'subtasks'),
        columnExists('tasks', 'reminder_minutes'),
        // Migration 002 runs in one transaction; one probe per table it changes.
        columnExists('tasks', 'actual_minutes'),
        columnExists('projects', 'emoji'),
        columnExists('lists', 'sort_order'),
        columnExists('user_settings', 'value'),
      ]);
      return {
        serverUpdatedAt,
        taskPipeline: taskCols && projectCols,
        taskExtras: subtasksCol && reminderCol,
        planner: planner.every(Boolean),
      };
    },
    async selectPage(table: AnyTable, q: PageQuery): Promise<Record<string, unknown>[]> {
      const userId = await getUserId();
      if (!userId) return [];
      let query = client.from(table).select('*').eq('user_id', userId);
      if (q.since) query = query.gte('server_updated_at', q.since).order('server_updated_at', { ascending: true });
      for (const col of ORDER[table]) query = query.order(col, { ascending: true });
      const { data, error } = await query.range(q.from, q.to);
      if (error) throw new Error(error.message);
      return (data ?? []) as Record<string, unknown>[];
    },
    async upsert(table: AnyTable, rows: Record<string, unknown>[]): Promise<void> {
      // One request per set of columns: in a mixed batch PostgREST would write
      // NULL into a column a row left out, so a live row next to a tombstone
      // would clear deleted_at on the server.
      for (const group of groupByColumns(rows)) {
        const { error } = await client.from(table).upsert(group, { onConflict: ON_CONFLICT[table] });
        if (error) throw new Error(error.message);
      }
    },
    async deleteCompletion(routineId: string, date: string): Promise<void> {
      const userId = await getUserId();
      if (!userId) return;
      const { error } = await client
        .from('routine_completions')
        .delete()
        .eq('user_id', userId)
        .eq('routine_id', routineId)
        .eq('date', date);
      if (error) throw new Error(error.message);
    },
  };
}
