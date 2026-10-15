import { authStorage } from './kv';
import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from './dbSchema';
import { projectFingerprint } from './projectGuard';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — see mobile/.env (gitignored, not committed).',
  );
}

// Session persistence (AsyncStorage on iOS, an encrypted file on Windows via
// safeStorage, see authStorage in kv.ts) — same storage the rest of
// the app already uses (storage.ts), so the signed-in session survives
// app restarts exactly like every other local store. Accounts are
// optional (see the accounts plan) — this client is only ever touched
// by code paths behind an explicit "Sign in with Apple" action; nothing
// on app launch requires a session to exist.
// Belific's tables live in the "belific" schema of the shared Belific Landis
// Proload project (the "public" schema belongs to Landis). Only table queries
// use this; auth is project wide. "belific" must be listed under Data API,
// Exposed schemas, in the Supabase dashboard.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: DB_SCHEMA },
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No web OAuth redirect flow — Sign in with Apple's native sheet
    // returns an identity token directly, exchanged via
    // signInWithIdToken (see auth.ts). Never a URL to detect.
    detectSessionInUrl: false,
    // The desktop signs in through the system browser with PKCE (decision
    // 012). iOS keeps the default; its native sheet uses signInWithIdToken.
    flowType: globalThis.belificDesktop ? 'pkce' : 'implicit',
  },
});

// Which project and schema this build talks to; sync state is tied to it (projectGuard.ts).
export const PROJECT_FINGERPRINT = projectFingerprint(supabaseUrl, DB_SCHEMA);
