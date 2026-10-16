// Static checks of the belific schema files (written, not applied): they only
// touch the belific schema, every table has row level security and the owner
// policy, grants go to authenticated only, and every column the sync code
// sends exists. Nothing here connects to a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TABLE_SPECS } from './syncCore.ts';

const DIR = path.resolve(import.meta.dirname, '..', 'supabase', 'belific_schema');
const SQL = fs.readFileSync(path.join(DIR, '001_belific_schema.sql'), 'utf8');
const ROLLBACK = fs.readFileSync(path.join(DIR, '001_belific_schema_rollback.sql'), 'utf8');
const code = (s: string) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const SQL_CODE = code(SQL);
const TABLES = ['custom_events', 'brain_dump_items', 'routines', 'routine_completions', 'tasks', 'projects', 'custom_categories'];

function columns(table: string): Set<string> {
  const m = SQL_CODE.match(new RegExp(`create table belific\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  assert.ok(m, table);
  const cols = new Set<string>();
  for (const line of m[1].split('\n')) {
    const c = line.trim().match(/^"?(\w+)"?\s+(uuid|text|boolean|integer|jsonb|timestamptz)\b/);
    if (c) cols.add(c[1]);
  }
  return cols;
}

test('it creates the seven tables in belific and nothing outside it', () => {
  assert.deepEqual([...SQL_CODE.matchAll(/create table (\S+) \(/g)].map((m) => m[1]).sort(), TABLES.map((t) => `belific.${t}`).sort());
  // Every alter / create / grant / revoke on a relation names belific; auth.users only appears as a foreign key target.
  assert.doesNotMatch(SQL_CODE, /\bpublic\./);
  assert.doesNotMatch(SQL_CODE.replace(/references auth\.users \(id\)/g, ''), /\bauth\.(?!uid\(\))/);
  assert.doesNotMatch(SQL_CODE, /\bdrop\b/i);
  assert.match(ROLLBACK, /drop schema if exists belific cascade/);
  assert.doesNotMatch(code(ROLLBACK), /public|auth\./);
});

test('row level security and the owner policy on every table', () => {
  for (const t of TABLES) {
    assert.match(SQL_CODE, new RegExp(`alter table belific\\.${t} enable row level security`), t);
    assert.match(
      SQL_CODE,
      new RegExp(`create policy "owner_full_access" on belific\\.${t}\\s+for all to authenticated using \\(user_id = \\(select auth\\.uid\\(\\)\\)\\) with check \\(user_id = \\(select auth\\.uid\\(\\)\\)\\)`),
      t,
    );
  }
  assert.equal([...SQL_CODE.matchAll(/enable row level security/g)].length, TABLES.length);
});

test('grants: usage and table privileges to authenticated only, nothing to anon', () => {
  assert.match(SQL_CODE, /grant usage on schema belific to authenticated/);
  assert.match(SQL_CODE, /grant select, insert, update, delete on all tables in schema belific to authenticated/);
  const grants = [...SQL_CODE.matchAll(/\bgrant\b[^;]*;/gi)].map((m) => m[0]);
  assert.equal(grants.length, 2);
  for (const g of grants) assert.doesNotMatch(g, /anon|public|service_role/);
  assert.match(SQL_CODE, /revoke all on all tables in schema belific from anon/);
  assert.match(SQL_CODE, /revoke all on schema belific from anon/);
});

test('every table has the server_updated_at column, trigger and index', () => {
  for (const t of TABLES) {
    assert.ok(columns(t).has('server_updated_at'), t);
    assert.match(SQL_CODE, new RegExp(`create trigger set_server_updated_at before insert or update on belific\\.${t}\\b`), t);
    assert.match(SQL_CODE, new RegExp(`create index ${t}_user_server_updated_at_idx on belific\\.${t} \\(user_id, server_updated_at\\)`), t);
    assert.ok(columns(t).has('user_id'), t);
  }
  assert.match(SQL_CODE, /function belific\.set_server_updated_at\(\)[\s\S]*set search_path = ''/);
});

test('tombstones, subtasks and reminder_minutes are there, and so is every column the sync sends', () => {
  for (const t of TABLES.filter((x) => x !== 'routine_completions')) assert.ok(columns(t).has('deleted_at'), `${t} deleted_at`);
  assert.ok(columns('tasks').has('subtasks'));
  assert.ok(columns('tasks').has('reminder_minutes'));
  assert.ok(columns('projects').has('color_key'));
  const caps = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true };
  const sample: Record<string, Record<string, unknown>> = {
    custom_events: { id: 'a', title: 't', category: 'c', icon: 'i', start: '09:00', end: '10:00', notes: 'n', date: '2026-10-01', recurrence: 'daily', seriesId: 's', recurrenceDays: ['Mon'], priority: 'high', origin: 'x', updatedAt: 'u', deletedAt: 'd' },
    brain_dump_items: { id: 'a', title: 't', notes: 'n', createdAt: 'c', updatedAt: 'u', deletedAt: 'd' },
    routines: { id: 'a', title: 't', timeOfDay: 'morning', createdAt: 'c', updatedAt: 'u', deletedAt: 'd' },
    tasks: { id: 'a', title: 't', dueDate: 'd', priority: 'p', projectKey: 'k', notes: 'n', completed: true, completedAt: 'c', createdAt: 'c', durationMinutes: 5, startTime: '09:00', recurrence: 'daily', recurrenceDays: ['Mon'], recurrenceMonthDay: 3, subtasks: [{ id: '1', title: 's', done: false }], reminderMinutes: 5, origin: 'o', updatedAt: 'u', deletedAt: 'd' },
    projects: { key: 'k', name: 'n', colorKey: 'c', createdAt: 'c', updatedAt: 'u', deletedAt: 'd' },
    custom_categories: { key: 'k', name: 'n', icon: 'i', color: 'c', createdAt: 'c', updatedAt: 'u', deletedAt: 'd' },
  };
  for (const [table, row] of Object.entries(sample)) {
    const spec = TABLE_SPECS[table as keyof typeof TABLE_SPECS];
    const sent = Object.keys(spec.toRemote(row, caps));
    const missing = sent.filter((c) => !columns(table).has(c));
    assert.deepEqual(missing, [], `${table} columns sent but not created`);
  }
});

test('the schema files stay out of the migrations folder the CLI would push', () => {
  assert.ok(!fs.existsSync(path.join(DIR, '..', 'migrations', '001_belific_schema.sql')));
  assert.ok(fs.readdirSync(path.join(DIR, '..', 'migrations')).every((f) => !/belific_schema/.test(f)));
});

// --- 002: lists, user settings, task timer and emoji ---
const SQL2 = fs.readFileSync(path.join(DIR, '002_lists_settings_timer.sql'), 'utf8');
const ROLLBACK2 = fs.readFileSync(path.join(DIR, '002_lists_settings_timer_rollback.sql'), 'utf8');
const SQL2_CODE = code(SQL2);
const NEW_TABLES = ['lists', 'user_settings'];

function columns2(table: string): Set<string> {
  const cols = new Set<string>();
  const m = SQL2_CODE.match(new RegExp(`create table belific\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (m) for (const line of m[1].split('\n')) {
    const c = line.trim().match(/^"?(\w+)"?\s+(uuid|text|boolean|integer|jsonb|timestamptz)\b/);
    if (c) cols.add(c[1]);
  }
  const alter = SQL2_CODE.match(new RegExp(`alter table belific\\.${table}\\s+([\\s\\S]*?);`));
  if (alter) for (const a of alter[1].matchAll(/add column (\w+) /g)) cols.add(a[1]);
  return cols;
}

test('002 is additive, inside belific only, one transaction, in the house style', () => {
  assert.match(SQL2_CODE, /^\s*begin;[\s\S]*commit;\s*$/);
  assert.deepEqual([...SQL2_CODE.matchAll(/create table (\S+) \(/g)].map((m) => m[1]).sort(), NEW_TABLES.map((t) => `belific.${t}`));
  assert.doesNotMatch(SQL2_CODE, /\bpublic\./);
  assert.doesNotMatch(SQL2_CODE.replace(/references auth\.users \(id\)/g, ''), /\bauth\.(?!uid\(\))/);
  assert.doesNotMatch(SQL2_CODE, /\bdrop\b/i);
  assert.doesNotMatch(SQL2_CODE.replace(/with check \(/g, ''), /\bcheck\s*\(/i, 'no CHECK constraints');
  assert.doesNotMatch(SQL2_CODE, /\breferences belific\./, 'no foreign keys between tables');
  assert.doesNotMatch(SQL2_CODE, /\buuid\b(?! not null references auth\.users)/, 'no uuid ids');
  assert.doesNotMatch(SQL2_CODE, /publication|realtime/i);
  // the new task and label columns are nullable with no default, so old clients' rows stay valid
  const alters = [...SQL2_CODE.matchAll(/add column [^,;]+/g)].map((m) => m[0]);
  assert.equal(alters.length, 5);
  for (const a of alters) assert.doesNotMatch(a, /not null|default/i, a);
  for (const t of NEW_TABLES) {
    assert.match(SQL2_CODE, new RegExp(`create table belific\\.${t} \\(\\s+user_id uuid not null references auth\\.users \\(id\\) on delete cascade,\\s+key text not null,`), t);
    assert.match(SQL2_CODE, new RegExp(`primary key \\(user_id, key\\)\\s*\\n\\);`), t);
    assert.ok(columns2(t).has('deleted_at'), t);
    assert.ok(columns2(t).has('server_updated_at'), t);
    assert.ok(columns2(t).has('updated_at'), t);
  }
});

test('002 row level security, policy, trigger, index and grants on both new tables', () => {
  for (const t of NEW_TABLES) {
    assert.match(SQL2_CODE, new RegExp(`alter table belific\\.${t} enable row level security`), t);
    assert.match(
      SQL2_CODE,
      new RegExp(`create policy "owner_full_access" on belific\\.${t}\\s+for all to authenticated using \\(user_id = \\(select auth\\.uid\\(\\)\\)\\) with check \\(user_id = \\(select auth\\.uid\\(\\)\\)\\)`),
      t,
    );
    assert.match(SQL2_CODE, new RegExp(`create trigger set_server_updated_at before insert or update on belific\\.${t}\\b`), t);
    assert.match(SQL2_CODE, new RegExp(`create index ${t}_user_server_updated_at_idx on belific\\.${t} \\(user_id, server_updated_at\\)`), t);
  }
  const grants = [...SQL2_CODE.matchAll(/\bgrant\b[^;]*;/gi)].map((m) => m[0]);
  assert.deepEqual(grants, ['grant select, insert, update, delete on belific.lists, belific.user_settings to authenticated;']);
  assert.match(SQL2_CODE, /revoke all on belific\.lists, belific\.user_settings from anon;/);
  assert.match(SQL2_CODE, /revoke all on belific\.lists, belific\.user_settings from public;/);
});

test('002 has every column the sync sends once the planner capability is on', () => {
  const caps = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true, planner: true };
  const has = (t: string) => new Set([...(t === 'tasks' || t === 'projects' ? columns(t) : []), ...columns2(t)]);
  const sample: Record<string, Record<string, unknown>> = {
    tasks: { id: 'a', title: 't', completed: false, createdAt: 'c', updatedAt: 'u', deletedAt: 'd', durationMinutes: 5, subtasks: [{ id: '1', title: 's', done: false }], actualMinutes: 4, timerStartedAt: '2026-10-16T09:00:00Z', listKey: 'l', emoji: 'e' },
    projects: { key: 'k', name: 'n', colorKey: 'c', emoji: 'e', createdAt: 'c', updatedAt: 'u', deletedAt: 'd' },
    lists: { key: 'k', name: 'n', emoji: 'e', sortOrder: 1, createdAt: 'c', updatedAt: 'u', deletedAt: 'd' },
    user_settings: { key: 'k', value: 'v', updatedAt: 'u', deletedAt: 'd' },
  };
  for (const [table, row] of Object.entries(sample)) {
    const sent = Object.keys(TABLE_SPECS[table as keyof typeof TABLE_SPECS].toRemote(row, caps));
    assert.deepEqual(sent.filter((c) => !has(table).has(c)), [], `${table} columns sent but not created`);
  }
});

test('002 rollback drops only what 002 added', () => {
  const rb = code(ROLLBACK2);
  assert.doesNotMatch(rb, /drop schema|public\.|auth\./);
  assert.deepEqual([...rb.matchAll(/drop table if exists (\S+);/g)].map((m) => m[1]).sort(), ['belific.lists', 'belific.user_settings']);
  assert.deepEqual([...rb.matchAll(/drop column if exists (\w+)/g)].map((m) => m[1]).sort(), ['actual_minutes', 'emoji', 'emoji', 'list_key', 'timer_started_at']);
});
