// The iPhone's Google sign in flow (phoneGoogleFlow.ts) with injected fakes: no
// device, no browser, no network, no real project. The rules it relies on are
// tested in phoneAuthCore.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FAILURE_TEXT, SIGN_IN_TEXT, beginFailureText } from './authCore.ts';
import { PHONE_SIGN_IN_WINDOW_MS, pkceChallengeOf } from './phoneAuthCore.ts';
import { createPhoneGoogleFlow, type PhoneGoogleDeps, type PhoneSignInState } from './phoneGoogleFlow.ts';

const ORIGIN = 'https://example-project.supabase.co';
const FLOW_ID = 'clientflow_1234';
const SECRET_CODE = 'SECRETCODE.abc-123';
const VERIFIER = 'ab'.repeat(56);
const GOOD_URL = `${ORIGIN}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent('belific://auth-callback')}&code_challenge=${pkceChallengeOf(VERIFIER)}&code_challenge_method=s256&prompt=select_account&skip_http_redirect=true`;
const PLAIN_URL = GOOD_URL.replace('code_challenge_method=s256', 'code_challenge_method=plain');
const CALLBACK = `belific://auth-callback?code=${SECRET_CODE}`;

function setup(over: Partial<PhoneGoogleDeps> & { exchange?: () => Promise<{ data: { session?: unknown } | null; error: unknown }>; url?: string } = {}) {
  const log = { opened: [] as string[], exchanges: [] as Array<{ code: string; flowId?: string | null }>, signedIn: 0, prepared: 0, oauth: [] as unknown[] };
  let clock = 1_000_000;
  const deps: PhoneGoogleDeps = {
    origin: ORIGIN,
    auth: {
      signInWithOAuth: async (c) => {
        log.oauth.push(c);
        return { data: { url: over.url ?? GOOD_URL, flowId: FLOW_ID }, error: null };
      },
      exchangeCodeForSession: async (code, options) => {
        log.exchanges.push({ code, flowId: options?.flowId });
        return over.exchange ? over.exchange() : { data: { session: { ok: true } }, error: null };
      },
    },
    openUrl: async (u) => void log.opened.push(u),
    prepare: async () => void (log.prepared += 1),
    randomIsSecure: () => true,
    readVerifier: async () => VERIFIER,
    afterSignIn: async () => void (log.signedIn += 1),
    now: () => clock,
    ...over,
  };
  const flow = createPhoneGoogleFlow(deps);
  const states: PhoneSignInState[] = [];
  flow.subscribe((s) => states.push(s));
  return { flow, log, states, tick: (ms: number) => void (clock += ms) };
}

test('start: prepares, asks for the Google URL with the shared options, and opens exactly that URL', async () => {
  const { flow, log } = setup();
  await flow.start();
  assert.equal(log.prepared, 1);
  assert.deepEqual(log.oauth, [
    { provider: 'google', options: { redirectTo: 'belific://auth-callback', skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } },
  ]);
  assert.deepEqual(log.opened, [GOOD_URL]);
  assert.deepEqual(flow.getState(), { busy: true, message: SIGN_IN_TEXT.waiting });
});

test('a good link: one exchange bound to this flow, then sync starts once, and a replay does nothing', async () => {
  const { flow, log } = setup();
  await flow.start();
  await flow.handleLink(CALLBACK);
  assert.deepEqual(log.exchanges, [{ code: SECRET_CODE, flowId: FLOW_ID }]);
  assert.equal(log.signedIn, 1);
  assert.deepEqual(flow.getState(), { busy: false, message: null });
  await flow.handleLink(CALLBACK);
  assert.equal(log.exchanges.length, 1, 'accepted once');
  assert.equal(log.signedIn, 1);
});

test('a link with no sign in started in this run is ignored without any exchange or screen change', async () => {
  const { flow, log, states } = setup();
  await flow.handleLink(CALLBACK);
  assert.equal(log.exchanges.length, 0);
  assert.equal(states.length, 0);
  assert.deepEqual(flow.getState(), { busy: false, message: null });
});

test('forged links while a sign in waits are ignored: wrong shape, wrong host, a flow id nobody asked for', async () => {
  const { flow, log } = setup();
  await flow.start();
  for (const bad of [
    'belific://other?code=abc',
    'https://auth-callback/?code=abc',
    `belific://auth-callback/x?code=abc`,
    'belific://auth-callback?code=abc#x',
    'belific://auth-callback?sb_flow_id=someoneelse99&code=abc',
    'belific://auth-callback',
    '',
    'garbage',
  ]) await flow.handleLink(bad);
  assert.equal(log.exchanges.length, 0);
  assert.deepEqual(flow.getState(), { busy: true, message: SIGN_IN_TEXT.waiting });
});

test('a failed exchange keeps waiting; the third failure ends it; only fixed sentences are shown', async () => {
  const { flow, log, states } = setup({ exchange: async () => ({ data: null, error: new Error(`provider said ${SECRET_CODE} and a token eyJabc`) }) });
  await flow.start();
  await flow.handleLink(CALLBACK);
  assert.deepEqual(flow.getState(), { busy: true, message: SIGN_IN_TEXT.stillWaiting });
  await flow.handleLink(CALLBACK);
  assert.deepEqual(flow.getState(), { busy: true, message: SIGN_IN_TEXT.stillWaiting });
  await flow.handleLink(CALLBACK);
  assert.deepEqual(flow.getState(), { busy: false, message: FAILURE_TEXT.notCompleted });
  assert.equal(log.exchanges.length, 3);
  assert.equal(log.signedIn, 0);
  await flow.handleLink(CALLBACK);
  assert.equal(log.exchanges.length, 3, 'ended: nothing pending');
  const allowed = new Set<string | null>([null, SIGN_IN_TEXT.waiting, SIGN_IN_TEXT.stillWaiting, FAILURE_TEXT.notCompleted]);
  for (const s of states) assert.ok(allowed.has(s.message), String(s.message));
});

test('an exchange that throws, or returns no session, counts as a failure', async () => {
  for (const exchange of [
    async () => {
      throw new Error('network down');
    },
    async () => ({ data: { session: null }, error: null }),
  ]) {
    const { flow, log } = setup({ exchange });
    await flow.start();
    await flow.handleLink(CALLBACK);
    assert.deepEqual(flow.getState(), { busy: true, message: SIGN_IN_TEXT.stillWaiting });
    assert.equal(log.signedIn, 0);
  }
});

test('a link after the ten minute window is refused', async () => {
  const { flow, log, tick } = setup();
  await flow.start();
  tick(PHONE_SIGN_IN_WINDOW_MS + 1);
  await flow.handleLink(CALLBACK);
  assert.equal(log.exchanges.length, 0);
  assert.deepEqual(flow.getState(), { busy: false, message: FAILURE_TEXT.notCompleted });
});

test('cancel ends the sign in, and a late link is then ignored', async () => {
  const { flow, log } = setup();
  await flow.start();
  flow.cancel();
  assert.deepEqual(flow.getState(), { busy: false, message: null });
  await flow.handleLink(CALLBACK);
  assert.equal(log.exchanges.length, 0);
});

test('a provider error link: waits for the first two, ends on the third, says cancelled', async () => {
  const { flow } = setup();
  await flow.start();
  const err = 'belific://auth-callback?error=access_denied&error_description=secret+text';
  await flow.handleLink(err);
  assert.deepEqual(flow.getState(), { busy: true, message: SIGN_IN_TEXT.stillWaiting });
  await flow.handleLink(err);
  await flow.handleLink(err);
  assert.deepEqual(flow.getState(), { busy: false, message: FAILURE_TEXT.cancelled });
});

test('the browser stays closed unless the randomness is secure and the stored verifier proves the challenge', async () => {
  const cases: Array<[string, Partial<PhoneGoogleDeps>]> = [
    ['insecure randomness', { randomIsSecure: () => false }],
    ['no verifier stored', { readVerifier: async () => null }],
    ['verifier read fails', { readVerifier: async () => { throw new Error('storage'); } }],
    ['a Math.random shaped verifier', { readVerifier: async () => 'AB-._~'.repeat(19).slice(0, 112) }],
    ['a verifier that is not the challenge', { readVerifier: async () => 'cd'.repeat(56) }],
  ];
  for (const [name, over] of cases) {
    const { flow, log } = setup(over);
    await flow.start();
    assert.deepEqual(log.opened, [], name);
    assert.deepEqual(flow.getState(), { busy: false, message: FAILURE_TEXT.notStarted }, name);
    await flow.handleLink(CALLBACK);
    assert.equal(log.exchanges.length, 0, name);
  }
  // no OAuth call is even made when the randomness is insecure
  const insecure = setup({ randomIsSecure: () => false });
  await insecure.flow.start();
  assert.equal(insecure.log.oauth.length, 0);
});

test('a plain PKCE challenge is refused before the browser opens', async () => {
  const { flow, log } = setup({ url: PLAIN_URL });
  await flow.start();
  assert.deepEqual(log.opened, []);
  assert.deepEqual(flow.getState(), { busy: false, message: FAILURE_TEXT.notStarted });
  await flow.handleLink(CALLBACK);
  assert.equal(log.exchanges.length, 0);
});

test('a URL for another host or provider is refused before the browser opens', async () => {
  for (const url of [GOOD_URL.replace('example-project', 'evil'), GOOD_URL.replace('provider=google', 'provider=apple')]) {
    const { flow, log } = setup({ url });
    await flow.start();
    assert.deepEqual(log.opened, []);
    assert.equal(flow.getState().message, FAILURE_TEXT.notStarted);
  }
});

test('start failures say fixed sentences: client error, no URL, project check failed, browser would not open', async () => {
  const boom = 'raw server text with a token eyJabc';
  const cases: Array<[Partial<PhoneGoogleDeps>, string]> = [
    [{ auth: { signInWithOAuth: async () => ({ data: null, error: new Error(boom) }), exchangeCodeForSession: async () => ({ data: null, error: null }) } }, FAILURE_TEXT.notStarted],
    [{ auth: { signInWithOAuth: async () => ({ data: { url: null }, error: null }), exchangeCodeForSession: async () => ({ data: null, error: null }) } }, FAILURE_TEXT.notStarted],
    [{ prepare: async () => { throw new Error(boom); } }, FAILURE_TEXT.notStarted],
    [{ openUrl: async () => { throw new Error(boom); } }, beginFailureText('no-browser')],
  ];
  for (const [over, expected] of cases) {
    const { flow, log } = setup(over);
    await flow.start();
    assert.deepEqual(flow.getState(), { busy: false, message: expected });
    assert.doesNotMatch(String(flow.getState().message), /raw server|eyJ/);
    await flow.handleLink(CALLBACK);
    assert.equal(log.exchanges.length, 0, 'a failed start leaves nothing pending');
  }
});

test('a new start replaces the earlier attempt', async () => {
  const { flow, log } = setup();
  await flow.start();
  await flow.start();
  assert.equal(log.opened.length, 2);
  await flow.handleLink(CALLBACK);
  assert.equal(log.exchanges.length, 1);
});

test('the wiring file uses Linking and the shared flow only: no desktop or Electron code', () => {
  const root = path.resolve(import.meta.dirname);
  for (const f of ['phoneGoogleAuth.ts', 'phoneGoogleFlow.ts', 'phoneAuthCore.ts', '../app/+native-intent.ts']) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    const imports = [...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const i of imports) assert.doesNotMatch(i, /desktop|electron|accountSwitch|SignInPage/i, `${f} imports ${i}`);
    assert.doesNotMatch(text, /require\(\s*['"]electron/);
  }
  const wiring = fs.readFileSync(path.join(root, 'phoneGoogleAuth.ts'), 'utf8');
  assert.match(wiring, /Linking\.openURL/);
  assert.match(wiring, /Linking\.addEventListener\('url'/);
});
