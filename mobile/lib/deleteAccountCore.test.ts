// delete-account (supabase/functions/delete-account): which tables, which
// schema, where the user id comes from, and what the function must never do.
// The rules are in core.ts (plain TypeScript); index.ts is checked as text
// because Deno is not available here. Nothing is deployed or called.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BELIFIC_SCHEMA, BELIFIC_TABLES, deleteOwnRows, verifiedUserId, type SchemaClient } from '../supabase/functions/delete-account/core.ts';
import { TABLE_SPECS, TIMESTAMPED_TABLES } from './syncCore.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase/functions/delete-account/index.ts'), 'utf8');
// Every numbered schema file, applied in order (001, 002, ...); rollbacks excluded.
const SCHEMA_DIR = path.join(ROOT, 'supabase/belific_schema');
const SQL = fs
  .readdirSync(SCHEMA_DIR)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f) && !f.includes('rollback'))
  .sort()
  .map((f) => fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'))
  .join('\n');
// Code only: comments may mention anything.
const CODE = INDEX.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

function recordingClient(failTable?: string) {
  const log: Array<{ schema: string; table: string; column: string; value: string }> = [];
  const client: SchemaClient = {
    schema: (schema) => ({
      from: (table) => ({
        delete: () => ({
          eq: async (column, value) => {
            log.push({ schema, table, column, value });
            return { error: table === failTable ? { message: 'boom' } : null };
          },
        }),
      }),
    }),
  };
  return { client, log };
}

test('the table list is exactly the synced tables, and the ones the schema files create', () => {
  assert.deepEqual(
    [...BELIFIC_TABLES].sort(),
    ['brain_dump_items', 'custom_categories', 'custom_events', 'lists', 'projects', 'routine_completions', 'routines', 'tasks', 'user_settings'],
  );
  assert.deepEqual([...BELIFIC_TABLES].sort(), [...TIMESTAMPED_TABLES, 'routine_completions'].sort());
  assert.ok(Object.keys(TABLE_SPECS).every((t) => (BELIFIC_TABLES as readonly string[]).includes(t)));
  const created = [...SQL.matchAll(/^create table belific\.(\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(created, [...BELIFIC_TABLES].sort());
});

test('every delete goes through the belific schema, filtered on the user id, table by table', async () => {
  const { client, log } = recordingClient();
  const result = await deleteOwnRows(client, 'jwt-user');
  assert.deepEqual(result, { ok: true });
  assert.equal(BELIFIC_SCHEMA, 'belific');
  assert.deepEqual(log.map((l) => l.table), [...BELIFIC_TABLES]);
  for (const l of log) {
    assert.equal(l.schema, 'belific');
    assert.equal(l.column, 'user_id');
    assert.equal(l.value, 'jwt-user');
  }
});

test('it stops at the first failure and names the table, never an error text', async () => {
  const { client, log } = recordingClient('tasks');
  const result = await deleteOwnRows(client, 'u');
  assert.deepEqual(result, { ok: false, table: 'tasks' });
  assert.equal(log[log.length - 1].table, 'tasks');
});

test('user id source: only the verified user, never the request', () => {
  assert.equal(verifiedUserId({ id: 'abc' }), 'abc');
  for (const bad of [null, undefined, {}, { id: '' }, { id: 5 }]) assert.equal(verifiedUserId(bad as never), null);
  // The id comes from getUser() on the caller's JWT ...
  assert.match(CODE, /auth\.getUser\(\)/);
  assert.match(CODE, /verifiedUserId\(user\)/);
  // ... and the request body, query string and other headers are never read.
  for (const read of [/req\.json\(/, /req\.text\(/, /req\.formData\(/, /req\.arrayBuffer\(/, /req\.body/, /searchParams/, /new URL\(req/, /headers\.get\('(?!Authorization'|Origin')/i]) {
    assert.doesNotMatch(CODE, read, String(read));
  }
});

test('it never deletes the auth user and never uses the service role', () => {
  assert.doesNotMatch(CODE, /deleteUser/);
  assert.doesNotMatch(CODE, /auth\.admin/);
  assert.doesNotMatch(CODE, /SERVICE_ROLE/);
  assert.doesNotMatch(CODE, /\.from\(/, 'table access only through core.ts, which always sets the schema');
});

test('no logging of the user id, no raw error text returned, CORS only app://belific', () => {
  for (const raw of CODE.split('\n').filter((l) => /console\.(log|error|warn|info)/.test(l))) {
    // The only mention allowed is a yes/no test of whether an id was found.
    const line = raw.replace("${userId ? 'ok' : 'rejected'}", '');
    assert.doesNotMatch(line, /userId|user\.id|user\b.*\bid\b|authHeader|\berror\b\.message|userError/, line);
  }
  // Responses are fixed sentences.
  assert.doesNotMatch(CODE, /error\.message|\.message\b/);
  assert.match(CODE, /const ALLOWED_ORIGINS = \['app:\/\/belific'\];/);
  assert.doesNotMatch(CODE, /Allow-Origin['"]?:\s*['"]\*/);
  assert.doesNotMatch(CODE, /ALLOWED_ORIGINS\s*=\s*\[[^\]]*,/, 'exactly one allowed origin');
});
