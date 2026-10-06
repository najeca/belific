import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { onSignedIn, onSignedOut } from './sync';

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

  // Turns sync on and runs the first full pass: local rows the server lacks
  // are uploaded, the account's rows are downloaded, same-id rows follow the
  // rules in lib/syncCore.ts (checkpoint 5). Never awaited by the caller's UI:
  // sign-in itself already succeeded, this just runs in the background.
  onSignedIn().catch(() => {});
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  // Stop queueing and forget the queue and cursors (local data is kept).
  await onSignedOut();
}

// Guideline 5.1.1(v): account creation requires in-app account
// deletion that removes the account AND its server-side data, not
// just deactivation. The client can never delete its own auth user
// directly (Supabase's client SDK has no self-delete call — that
// requires the service-role admin API, which must never ship in the
// app) — this invokes the delete-account Edge Function instead, which
// deletes every row across all 7 synced tables for this user, then
// the auth user itself, in that order. Not one transaction: if a table
// fails it stops early, and the on delete cascade on user_id covers the
// rest once the auth user goes (gap V7i).
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
  // The account no longer exists server-side — drop the now-invalid
  // local session too.
  await supabase.auth.signOut();
  await onSignedOut();
}
