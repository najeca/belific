import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { ensureCurrentProject, onSignedIn, onSignedOut } from './sync';

// Sign in with Apple is the only login method (see the accounts plan) —
// deliberately no other social login, which per Apple guideline 4.8
// means no "equivalent alternative" is required at all; 4.8 only
// triggers when a THIRD-PARTY/social login is offered alongside Apple's
// own, not when Apple is the sole option.
export async function signInWithApple(): Promise<void> {
  // Before a session exists: state left by another project is reset first.
  await ensureCurrentProject();
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
// app) — this invokes the delete-account Edge Function instead.
// Since the move to the shared Landis, Proload and Belific project the
// function deletes only this user's rows in the belific schema (7 tables)
// and NOT the auth user, which the other apps share. Whether that meets
// the guideline is an open decision (docs/sessions/2026-10-15-project-move.md).
// Not one transaction: if a table fails it stops early and the call errors.
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
  // The account no longer exists server-side — drop the now-invalid
  // local session too.
  await supabase.auth.signOut();
  await onSignedOut();
}
