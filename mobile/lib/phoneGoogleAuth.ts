import { Linking } from 'react-native';
import { supabase } from './supabase';
import { ensureCurrentProject, onSignedIn } from './sync';
import { createPhoneGoogleFlow } from './phoneGoogleFlow';
import { authStorage } from './kv';
import { ensureSha256Challenge, pkceVerifierStorageKey, randomnessIsSecure, type CryptoHost, type RandomHost } from './phoneAuthCore';

// iPhone only. Wires the Google sign in flow (phoneGoogleFlow.ts, rules in
// phoneAuthCore.ts) to the system browser through Linking and to the app's
// client. Nothing here imports desktop code, Electron or the desktop sign in.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;

export const phoneGoogle = createPhoneGoogleFlow({
  origin: new URL(supabaseUrl).origin,
  auth: supabase.auth,
  openUrl: (url) => Linking.openURL(url),
  prepare: async () => {
    // Before a session exists: state left by another project is reset first.
    await ensureCurrentProject();
    // Hermes has no crypto.subtle; without this auth-js falls back to a plain
    // PKCE challenge, which the gate refuses.
    ensureSha256Challenge(globalThis as unknown as CryptoHost);
  },
  // The verifier is drawn from crypto.getRandomValues (react-native-get-random-values
  // on the phone); the browser opens only if that source is secure and the stored
  // verifier hashes to the challenge in the URL (phoneAuthCore.ts).
  randomIsSecure: () => randomnessIsSecure(globalThis as unknown as RandomHost),
  readVerifier: async (flowId) => {
    const raw = await authStorage.getItem(pkceVerifierStorageKey(supabaseUrl, flowId));
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw); // auth-js stores it JSON encoded
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  },
  afterSignIn: onSignedIn,
});

// Called once from the root layout. A link that arrives with no sign in
// pending (a cold start, a stale tab, someone else's link) is ignored.
export function watchGoogleLinks(): () => void {
  const sub = Linking.addEventListener('url', ({ url }) => {
    phoneGoogle.handleLink(url).catch(() => {});
  });
  return () => sub.remove();
}
