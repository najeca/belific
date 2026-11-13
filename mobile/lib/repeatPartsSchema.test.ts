// Run with `npm test` from mobile/. Migration 005 (Repeat until, and Parts, APPLIED 2026-11-13):
// the file is additive only, keeps its rollback as comments, and says it is applied and not to be run again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, '..', 'supabase', 'belific_schema');
const sql = fs.readFileSync(path.join(DIR, '005_repeat_until_and_parts.sql'), 'utf8');

test('005 says APPLIED near the top and names the plan', () => {
  assert.match(sql.split('\n').slice(0, 6).join('\n'), /APPLIED 2026-11-13/);
  assert.match(sql, /PLAN_repeat_end_and_parts/);
});

test('005 is two nullable columns on belific.tasks and nothing else', () => {
  const code = sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  assert.match(code, /^begin; alter table belific\.tasks add column repeat_until date, add column parent_id text ?; commit;$/);
  assert.ok(!/\b(drop|delete|update|truncate|grant|revoke|default|not null|check|references|foreign|index|policy)\b/i.test(code), 'additive only, no default, no constraint, no key');
  assert.ok(!/\bpublic\./i.test(code), 'nothing outside the belific schema');
});

test('005 keeps the rollback commented out, never as live code', () => {
  assert.match(sql, /^-- alter table belific\.tasks drop column if exists parent_id, drop column if exists repeat_until;$/m);
  assert.ok(!/^drop /im.test(sql) && !/^alter table belific\.tasks drop/im.test(sql));
});

test('the README lists 005 as applied 2026-11-13, and 004 is untouched as applied', () => {
  const readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
  assert.match(readme, /005_repeat_until_and_parts\.sql.*APPLIED 2026-11-13/);
  assert.match(readme, /004_part_b\.sql.*APPLIED 2026-10-21/);
});
