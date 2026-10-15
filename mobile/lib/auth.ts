import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { ensureCurrentProject, onSignedIn, onSignedOut } from './sync';
import { signOutThisDevice } from './phoneAuthCore';

// Sign in with Apple uses the native sheet (this file). Google (2.18.1) uses the
// system browser and lives in phoneGoogleAuth.ts. Apple's guideline 4.8 is met
// because Sign in with Apple is offered next to the third party login.
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

// Local scope only (2.18.1): the login is shared with the desktop and the other
// apps, and the default (global) scope would sign all of them out.
export async function signOut(): Promise<void> {
  await signOutThisDevice(supabase.auth);
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
  // local session too (this device only, see signOut).
  await signOutThisDevice(supabase.auth);
  await onSignedOut();
}
