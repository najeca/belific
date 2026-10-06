'use strict';
// Shared helpers for the real-app checks (run with Electron, not node --test).
// Every launch uses an isolated data folder, asserted NOT to be the real
// belific-desktop folder, and never touches the real Supabase project:
// every request to the Supabase host is cancelled and recorded.
const crypto = require('node:crypto');
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAIN = path.join(__dirname, '..', '..', 'main.js');
const SUPABASE_HOST = 'uucycebkpgwbktdytxvr.supabase.co';

function realFolders() {
  const appData = app.getPath('appData');
  return [path.join(appData, 'belific-desktop'), path.join(appData, 'belific-desktop-dev'), path.join(appData, 'Belific')]
    .map((p) => path.resolve(p).toLowerCase());
}

// Sets userData to a folder under the OS temp dir (or the one given by the
// parent run) and asserts it is isolated before main.js loads.
function isolate() {
  const userData = path.resolve(process.env.BELIFIC_REAL_USERDATA || fs.mkdtempSync(path.join(os.tmpdir(), 'belific-real-')));
  const lower = userData.toLowerCase();
  if (!lower.startsWith(path.resolve(os.tmpdir()).toLowerCase())) throw new Error(`ASSERT: ${userData} is not under the temp folder`);
  for (const real of realFolders()) {
    if (lower === real || lower.startsWith(real + path.sep)) throw new Error(`ASSERT: ${userData} is a real data folder`);
  }
  app.setPath('userData', userData);
  if (app.getPath('userData') !== userData) throw new Error('ASSERT: userData was not applied');
  return userData;
}

// Records every request leaving a window session and cancels any to Supabase.
function watchNetwork() {
  const seen = [];
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let host = '';
    try {
      const u = new URL(details.url);
      host = u.protocol === 'app:' || u.protocol === 'devtools:' || u.protocol === 'data:' ? '' : u.host;
    } catch {
      host = 'unparseable';
    }
    if (host) seen.push(host);
    callback({ cancel: host === SUPABASE_HOST });
  });
  return seen;
}

// A fake Supabase for the real checks (cp6.1): the page's https requests to the
// Supabase host are answered here, in this process, by overriding the https
// scheme on the window session. Nothing leaves the machine; any other host
// is refused and recorded. The token endpoint does a REAL PKCE check: the code
// must be GOODCODE (user 1) or GOODCODE2 (user 2) and sha256(code_verifier)
// must equal the code_challenge of the URL the app opened.
// A JWT shaped token (unsigned) so auth-js can read its expiry like a real one.
function fakeJwt(sub, exp) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub, exp, aud: 'authenticated', role: 'authenticated' })}.fakesig`;
}

function installFakeSupabase() {
  const state = {
    hosts: [],
    unexpected: [],
    tokenCalls: 0,
    restCalls: 0,
    logoutCalls: 0,
    logoutOnline: false,
    challenge: null,
    users: { GOODCODE: 'user-one-1111', GOODCODE2: 'user-two-2222' },
  };
  const json = (status, body, extra = {}) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', ...extra },
    });
  session.defaultSession.protocol.handle('https', async (request) => {
    const url = new URL(request.url);
    state.hosts.push(url.host);
    if (url.host !== SUPABASE_HOST) {
      state.unexpected.push(url.host);
      return new Response('refused', { status: 502 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
      });
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      state.tokenCalls += 1;
      const body = await request.json();
      const user = state.users[body.auth_code];
      const hash = crypto.createHash('sha256').update(String(body.code_verifier || '')).digest('base64url');
      if (!user || !body.code_verifier || hash !== state.challenge) {
        return json(400, { error: 'invalid_grant', error_description: 'bad code or verifier' });
      }
      const now = Math.floor(Date.now() / 1000);
      return json(200, {
        access_token: fakeJwt(user, now + 3600),
        refresh_token: 'fake-refresh-' + user,
        expires_in: 3600,
        expires_at: now + 3600,
        token_type: 'bearer',
        user: { id: user, aud: 'authenticated', role: 'authenticated', email: user + '@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      });
    }
    if (url.pathname === '/auth/v1/user') {
      const bearer = (request.headers.get('authorization') || '').replace('Bearer ', '');
      let sub = 'unknown';
      try {
        sub = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub;
      } catch {}
      return json(200, { id: sub, aud: 'authenticated', role: 'authenticated', email: sub + '@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    }
    if (url.pathname === '/auth/v1/logout') {
      state.logoutCalls += 1;
      return state.logoutOnline ? json(204, null) : Response.error();
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      state.restCalls += 1;
      return json(request.method === 'GET' ? 200 : 201, []);
    }
    return json(503, { message: 'not faked' });
  });
  return state;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms = 15000, step = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor timed out');
    await sleep(step);
  }
}

function seedTasks(userData, tasks) {
  const dir = path.join(userData, 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'belific_tasks.kv'), JSON.stringify(tasks));
}

function makeChecker() {
  const results = [];
  return {
    check(name, ok, detail = '') {
      results.push({ name, ok: !!ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
    },
    summary() {
      const failed = results.filter((r) => !r.ok).length;
      console.log(`SUMMARY ${results.length - failed}/${results.length} passed`);
      return failed;
    },
  };
}

function firstWindow() {
  return BrowserWindow.getAllWindows()[0];
}

module.exports = { MAIN, SUPABASE_HOST, isolate, watchNetwork, installFakeSupabase, sleep, waitFor, seedTasks, makeChecker, firstWindow };
