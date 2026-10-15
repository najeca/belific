// Every data request must name the belific schema (checkpoint: project move).
// The real sync server (syncServer.ts) runs on a real supabase-js client whose
// fetch is replaced by an in-process fake that, like PostgREST, refuses a
// request without the profile header: Accept-Profile on reads, Content-Profile
// on writes. No network, no real project.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from './dbSchema.ts';
import { createSupabaseServer } from './syncServer.ts';
import { TIMESTAMPED_TABLES } from './syncCore.ts';

const URL_ = 'https://example-project.supabase.co';
const KEY = 'anon-test-key';

interface Seen {
  method: string;
  pathname: string;
  accept: string | null;
  content: string | null;
}

function fakeFetch(seen: Seen[]): typeof fetch {
  return (async (input: unknown, init?: { method?: string; headers?: unknown }) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input));
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase();
    const headers = new Headers((init?.headers as HeadersInit | undefined) ?? req?.headers);
    const entry = { method, pathname: url.pathname, accept: headers.get('accept-profile'), content: headers.get('content-profile') };
    seen.push(entry);
    const read = method === 'GET' || method === 'HEAD';
    if ((read ? entry.accept : entry.content) !== DB_SCHEMA) {
      return new Response(JSON.stringify({ code: 'PGRST106', message: 'The schema must be one of the following: public' }), {
        status: 406,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (read) return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
    return new Response(null, { status: method === 'DELETE' ? 204 : 201 });
  }) as typeof fetch;
}

function client(seen: Seen[], schema: string | null) {
  return createClient(URL_, KEY, {
    ...(schema ? { db: { schema } } : {}),
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fakeFetch(seen) },
  });
}

test('the app client is created with the belific schema', () => {
  assert.equal(DB_SCHEMA, 'belific');
  const source = fs.readFileSync(path.join(import.meta.dirname, 'supabase.ts'), 'utf8');
  assert.match(source, /db:\s*\{\s*schema:\s*DB_SCHEMA\s*\}/);
});

test('every data request of the sync server carries the belific profile header', async () => {
  const seen: Seen[] = [];
  const server = createSupabaseServer(client(seen, DB_SCHEMA), async () => 'u1');
  const caps = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true };

  assert.deepEqual(await server.probe(), caps);
  for (const table of [...TIMESTAMPED_TABLES, 'routine_completions' as const]) {
    await server.selectPage(table, { from: 0, to: 999 }, caps);
    if (table !== 'routine_completions') await server.selectPage(table, { since: '2026-10-01T00:00:00Z', from: 0, to: 999 }, caps);
    await server.upsert(table, [{ user_id: 'u1', id: 'a', key: 'a', routine_id: 'r', date: '2026-10-01' }]);
  }
  await server.deleteCompletion('r', '2026-10-01');

  const methods = new Set(seen.map((s) => s.method));
  for (const m of ['GET', 'POST', 'DELETE']) assert.ok(methods.has(m), `a ${m} request was made`);
  assert.ok(seen.length >= 20, `only ${seen.length} requests seen`);
  for (const s of seen) {
    assert.ok(s.pathname.startsWith('/rest/v1/'), s.pathname);
    const read = s.method === 'GET' || s.method === 'HEAD';
    assert.equal(read ? s.accept : s.content, 'belific', `${s.method} ${s.pathname}`);
  }
  // Every synced table was reached.
  const tables = new Set(seen.map((s) => s.pathname.replace('/rest/v1/', '')));
  for (const t of [...TIMESTAMPED_TABLES, 'routine_completions']) assert.ok(tables.has(t), t);
});

test('control: a client without the schema is refused by the fake, as by PostgREST', async () => {
  const seen: Seen[] = [];
  const server = createSupabaseServer(client(seen, null), async () => 'u1');
  await assert.rejects(server.selectPage('tasks', { from: 0, to: 9 }, { serverUpdatedAt: true, taskPipeline: true }), /schema/i);
  await assert.rejects(server.upsert('tasks', [{ user_id: 'u1', id: 'a' }]), /schema/i);
  await assert.rejects(server.deleteCompletion('r', '2026-10-01'), /schema/i);
});
