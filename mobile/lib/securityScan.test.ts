import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Checkpoint 9: the repo security scan (.claude/skills/workflow/security-review/
// scripts/security-scan.sh) against throwaway git repositories. The scan must
// accept the real delete-account function as it is, and still fail on a real
// secret value, a key committed in any file, and the service role key used
// outside supabase/functions. Secret looking values are built at run time so
// this file itself never contains one.
const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, '.claude', 'skills', 'workflow', 'security-review', 'scripts', 'security-scan.sh');
const REAL_FUNCTION = fs.readFileSync(path.join(REPO, 'mobile', 'supabase', 'functions', 'delete-account', 'index.ts'), 'utf8');
const FAKE_JWT = ['eyJ', 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', '.fakepayload.fakesig'].join('');
const FAKE_SK = ['sk', '-ant-', 'api03-notarealkey'].join('');
const NAME = ['SUPABASE_SERVICE', '_ROLE_KEY'].join('');

function scan(files: Record<string, string>): { code: number; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'belific-scan-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    for (const [name, text] of Object.entries(files)) {
      const file = path.join(dir, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    spawnSync('git', ['add', '-A'], { cwd: dir });
    const r = spawnSync('bash', [SCRIPT], { cwd: dir, env: { ...process.env, SCAN_ROOT: dir }, encoding: 'utf8' });
    return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const FN = 'mobile/supabase/functions/delete-account/index.ts';

test('PASS: the real delete-account function, as it exists, is accepted', () => {
  // Since the move to the shared project the function deletes with the caller's own JWT (RLS), no service role key.
  assert.ok(!REAL_FUNCTION.includes(NAME), 'the real function no longer reads the service role key');
  const r = scan({ [FN]: REAL_FUNCTION });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /No hardcoded credentials/);
});

test('PASS: either quote style for the environment read', () => {
  const single = `const k = Deno.env.get('${NAME}');\n`;
  const double = `const k = Deno.env.get("${NAME}");\n`;
  assert.equal(scan({ 'supabase/functions/a/index.ts': single }).code, 0);
  assert.equal(scan({ 'supabase/functions/a/index.ts': double }).code, 0);
});

test('FAIL: a real secret value inside supabase/functions', () => {
  const r = scan({ [FN]: `${REAL_FUNCTION}\nconst leaked = '${FAKE_JWT}';\n` });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /hardcoded credentials|FAIL/i);
});

test('FAIL: a key committed in any file (code, json, docs, env file)', () => {
  for (const [name, text] of [
    ['mobile/lib/config.ts', `export const key = '${FAKE_JWT}';\n`],
    ['mobile/app.json', `{"key": "${FAKE_JWT}"}\n`],
    ['docs/notes.md', `service key: ${FAKE_JWT}\n`],
    ['mobile/.env.local', `KEY=${FAKE_JWT}\n`],
    ['mobile/lib/ai.ts', `const k = '${FAKE_SK}';\n`],
  ] as const) {
    const r = scan({ [name]: text });
    assert.equal(r.code, 1, `${name}: ${r.out}`);
  }
});

test('FAIL: the service role key used outside supabase/functions', () => {
  for (const [name, text] of [
    ['mobile/lib/admin.ts', `const k = process.env.${NAME};\n`],
    ['mobile/app/admin.tsx', `const k = Deno.env.get('${NAME}');\n`],
    ['desktop/main.js', `const k = process.env.${NAME};\n`],
  ] as const) {
    const r = scan({ [name]: text });
    assert.equal(r.code, 1, `${name}: ${r.out}`);
  }
});

test('FAIL: inside supabase/functions, anything but a comment or the environment read', () => {
  for (const text of [
    `const k = Deno.env.get('${NAME}') ?? 'fallback';\n`,
    `console.log('${NAME}');\n`,
    `const k = '${NAME}=abc';\n`,
    `return json({ key: Deno.env.get('${NAME}') });\n`,
  ]) {
    const r = scan({ 'mobile/supabase/functions/x/index.ts': text });
    assert.equal(r.code, 1, `${text}: ${r.out}`);
  }
});
