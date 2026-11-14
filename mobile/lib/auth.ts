import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { ensureCurrentProject, onSignedOut } from './sync';
import { signOutThisDevice } from './phoneAuthCore';
import { afterPhoneSignIn, dropPhoneHold, holdPhoneSync, phoneSignedOut } from './phoneAccount';

// Sign in with Apple uses the native sheet (this file). Google (2.18.1) uses the
// in app sign in sheet (3.58.0) and lives in phoneGoogleAuth.ts. Apple's guideline 4.8 is met
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

  // 3.58.0: the hold goes on before the session exists, so no sync can upload
  // this phone's rows before the account is checked (lib/firstLaunch.ts).
  await holdPhoneSync();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) {
    await dropPhoneHold();
    throw error;
  }

  // The account is checked first: with tasks, the usual first full pass runs
  // (local rows the server lacks are uploaded, the account's rows downloaded,
  // same-id rows follow lib/syncCore.ts); with none, the "no tasks yet" sheet
  // asks first. Not awaited: the Sign in screen follows the gate's state.
  afterPhoneSignIn().catch(() => {});
}

// Local scope only (2.18.1): the login is shared with the desktop and the other
// apps, and the default (global) scope would sign all of them out.
export async function signOut(): Promise<void> {
  await signOutThisDevice(supabase.auth);
  // Stop queueing and forget the queue and cursors (local data is kept).
  await onSignedOut();
  // 3.58.0: the Sign in screen comes back after any sign out.
  await phoneSignedOut();
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
  await phoneSignedOut();
}
