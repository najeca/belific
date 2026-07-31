import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — see mobile/.env (gitignored, not committed).',
  );
}

// AsyncStorage-backed session persistence — same storage the rest of
// the app already uses (storage.ts), so the signed-in session survives
// app restarts exactly like every other local store. Accounts are
// optional (see the accounts plan) — this client is only ever touched
// by code paths behind an explicit "Sign in with Apple" action; nothing
// on app launch requires a session to exist.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No web OAuth redirect flow — Sign in with Apple's native sheet
    // returns an identity token directly, exchanged via
    // signInWithIdToken (see auth.ts). Never a URL to detect.
    detectSessionInUrl: false,
  },
});
