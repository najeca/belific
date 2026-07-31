import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { runFullSync } from './sync';

// Sign in with Apple is the only login method (see the accounts plan) —
// deliberately no other social login, which per Apple guideline 4.8
// means no "equivalent alternative" is required at all; 4.8 only
// triggers when a THIRD-PARTY/social login is offered alongside Apple's
// own, not when Apple is the sole option.
export async function signInWithApple(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // One call handles both the brand-new-account bulk upload (nothing
  // remote yet, so everything local just uploads) and merging onto an
  // existing account's data (union by id, newest updatedAt wins) — see
  // runFullSync's own comment. Never awaited by the caller's UI: sign-in
  // itself already succeeded, this just runs in the background.
  runFullSync().catch(() => {});
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Guideline 5.1.1(v): account creation requires in-app account
// deletion that removes the account AND its server-side data, not
// just deactivation. The client can never delete its own auth user
// directly (Supabase's client SDK has no self-delete call — that
// requires the service-role admin API, which must never ship in the
// app) — this invokes the delete-account Edge Function instead, which
// deletes every row across all 7 synced tables for this user, then
// the auth user itself, in that order, atomically.
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
  // The account no longer exists server-side — drop the now-invalid
  // local session too.
  await supabase.auth.signOut();
}
