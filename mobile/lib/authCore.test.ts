import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FAILURE_TEXT,
  PROVIDER_NAME,
  REDIRECT_TO,
  SIGN_IN_PROVIDERS,
  SIGN_IN_TEXT,
  accountLabel,
  beginFailureText,
  isSignInProvider,
  oauthOptions,
} from './authCore.ts';

// Checkpoint 12 (decision 026): the pure sign in code, the wording of the Sign
// in page, and source level checks that keep the desktop sign in away from the
// phone's Apple module and keep secrets out of logs.
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the providers are exactly Apple and Google', () => {
  assert.deepEqual([...SIGN_IN_PROVIDERS], ['apple', 'google']);
  assert.ok(isSignInProvider('apple') && isSignInProvider('google'));
  for (const bad of ['github', 'email', 'Apple', 'GOOGLE', 'apple ', '', null, undefined, 3, {}]) assert.equal(isSignInProvider(bad), false, String(bad));
});

test('oauthOptions: PKCE through the system browser to the belific callback, an account chooser only for Google', () => {
  assert.equal(REDIRECT_TO, 'belific://auth-callback');
  assert.deepEqual(oauthOptions('apple'), { redirectTo: REDIRECT_TO, skipBrowserRedirect: true });
  assert.deepEqual(oauthOptions('google'), { redirectTo: REDIRECT_TO, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } });
});

test('accountLabel: the email, else the provider, else a neutral name', () => {
  assert.equal(accountLabel(null), null);
  assert.equal(accountLabel(undefined), null);
  assert.equal(accountLabel({ email: ' a@b.test ' }), 'a@b.test');
  assert.equal(accountLabel({ email: null, app_metadata: { provider: 'apple' } }), 'Apple account');
  assert.equal(accountLabel({ email: '', app_metadata: { provider: 'google' } }), 'Google account');
  assert.equal(accountLabel({ identities: [{ provider: 'google' }] }), 'Google account');
  assert.equal(accountLabel({ app_metadata: { provider: 'email' } }), 'Your account');
  assert.equal(accountLabel({}), 'Your account');
});

test('beginFailureText: known reasons have their sentence, anything else is the generic start failure', () => {
  assert.equal(beginFailureText('no-browser'), 'Could not open your browser.');
  assert.equal(beginFailureText('busy'), 'A sign in is already open in your browser.');
  assert.match(beginFailureText('backup-failed'), /safety backup/);
  for (const odd of [undefined, '', 'constructor', '__proto__', 'toString', 'https://x.test/?code=SECRET', 'refused']) {
    assert.equal(beginFailureText(odd), FAILURE_TEXT.notStarted, String(odd));
  }
});

// ---- wording ----

const BANNED =
  /\b(lost|lose|losing|broke|broken|break|breaks|missed|miss|behind|fail|failed|overdue|late|risk|danger|warning|hurry|keep it up|don't|zero|streak at risk|must|required|forced|only way)\b|\b0 (days|of)\b/i;

function everyString(): string[] {
  const out: string[] = [...Object.values(SIGN_IN_TEXT), ...Object.values(FAILURE_TEXT)];
  for (const reason of ['backup-failed', 'no-browser', 'busy', 'refused', undefined, 'unknown']) out.push(beginFailureText(reason));
  for (const provider of SIGN_IN_PROVIDERS) out.push(`${PROVIDER_NAME[provider]} account`);
  out.push(accountLabel({}) as string);
  return out;
}

test('banned wording: nothing the Sign in page or a sign in failure can say pushes, warns or blames', () => {
  const strings = everyString();
  assert.ok(strings.length > 15);
  for (const s of strings) assert.ok(!BANNED.test(s), `banned wording in: ${s}`);
  for (const bad of ['You must sign in', 'Sign in is required', 'Do not miss out', "Don't lose your data", 'Sign in failed']) assert.ok(BANNED.test(bad), bad);
});

test('no dashes in any string, and no "Use email" until 2.19.0', () => {
  for (const s of everyString()) {
    assert.ok(!/[–—]/.test(s), `dash in: ${s}`);
    assert.ok(!/email/i.test(s) || s === 'Your account', `email wording in: ${s}`);
  }
  const page = read('mobile/components/desktop/SignInPage.tsx');
  assert.ok(!/use email/i.test(page));
  assert.ok(!/[–—]/.test(page));
});

test('the page says signing in is optional and offers Not now', () => {
  assert.equal(SIGN_IN_TEXT.optional, 'You can use Belific without an account.');
  assert.equal(SIGN_IN_TEXT.notNow, 'Not now');
  assert.equal(SIGN_IN_TEXT.apple, 'Continue with Apple');
  assert.equal(SIGN_IN_TEXT.google, 'Continue with Google');
});

test('identical errors: the failure sentences name no provider and no reason from outside', () => {
  const names = Object.values(PROVIDER_NAME).map((n) => n.toLowerCase());
  for (const s of [...Object.values(FAILURE_TEXT), ...['backup-failed', 'no-browser', 'busy', 'refused'].map(beginFailureText)]) {
    for (const n of names) assert.ok(!s.toLowerCase().includes(n), `${s} names ${n}`);
  }
  // Same function, same words for both providers: nothing takes a provider.
  assert.equal(beginFailureText.length, 1);
});

// ---- the desktop sign in never reaches the phone's Apple module ----

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

function importsOf(file: string): string[] {
  const out: string[] = [];
  for (const m of read(file).matchAll(IMPORT_RE)) out.push(m[1]);
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.join(path.posix.dirname(from), spec);
  for (const ext of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']) {
    const rel = base + ext;
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return rel;
  }
  return null;
}

test('no desktop auth file imports expo-apple-authentication, directly or through a local import', () => {
  const entries = [
    'mobile/lib/authCore.ts',
    'mobile/lib/desktopAuth.ts',
    'mobile/components/desktop/SignInPage.tsx',
    'mobile/components/desktop/ProfileMenu.tsx',
    'mobile/components/desktop/SettingsPage.tsx',
    'mobile/components/desktop/AccountChoiceModal.tsx',
    'mobile/components/desktop/useAccount.ts',
  ];
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(file)) {
      assert.ok(!spec.includes('expo-apple-authentication'), `${file} imports ${spec}`);
      const next = resolveLocal(file, spec);
      if (next) {
        assert.notEqual(next, 'mobile/lib/auth.ts', `${file} reaches the phone's auth.ts`);
        queue.push(next);
      }
    }
  }
  assert.ok(seen.size > entries.length, 'the walk followed local imports');
});

test('the pure module imports nothing at all', () => {
  assert.deepEqual(importsOf('mobile/lib/authCore.ts'), []);
});

// ---- no secrets in logs ----

test('no console call in the sign in code, and the main process logs only reasons', () => {
  for (const file of [
    'mobile/lib/authCore.ts',
    'mobile/lib/desktopAuth.ts',
    'mobile/components/desktop/SignInPage.tsx',
    'desktop/src/authLink.js',
    'desktop/src/signin.js',
  ]) {
    assert.ok(!/console\.(log|info|warn|error|debug)/.test(read(file)), `${file} calls console`);
  }
  const main = read('desktop/main.js');
  const risky = /\b(raw|url|code|token|verifier|link|argv|challenge|session)\b/i;
  for (const line of main.split('\n')) {
    if (!/\blog\(/.test(line) || line.includes('function log(')) continue;
    for (const hole of line.matchAll(/\$\{([^}]*)\}/g)) {
      assert.ok(!risky.test(hole[1]) || /result\.reason|\breason\b|err\.(message|stack)|kind/.test(hole[1]), `main.js logs: ${line.trim()}`);
    }
  }
});

test('the delete-account function logs no user id and returns no raw error text', () => {
  const src = read('mobile/supabase/functions/delete-account/index.ts');
  const logs = src.split('\n').filter((l) => /console\.(log|error|warn)/.test(l));
  assert.ok(logs.length >= 5);
  for (const l of logs) {
    assert.ok(!/user\??\.id|\.message|\$\{e\b|, e\)|String\(/.test(l), `log line leaks: ${l.trim()}`);
  }
  assert.ok(!/\.message/.test(src), 'no error text read anywhere');
  assert.ok(!/String\(e\)/.test(src));
  // Every response body is one of the two fixed objects.
  const responses = [...src.matchAll(/return json\(req, ([^,]+),\s*(\d+)\)/g)].map((m) => [m[1].trim(), m[2]]);
  assert.ok(responses.length >= 6);
  for (const [body, status] of responses) {
    if (status === '200') assert.equal(body, '{ success: true }');
    else if (status === '401') assert.equal(body, 'UNAUTHORIZED');
    else assert.equal(body, 'FAILED');
  }
  assert.match(src, /const UNAUTHORIZED = \{ error: 'Unauthorized' \};/);
  assert.match(src, /const FAILED = \{ error: 'The account could not be deleted' \};/);
});
