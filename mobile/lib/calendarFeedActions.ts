// The feed link's commands (build plan phase 8, step 2), shared by the desktop
// Settings and the iPhone Settings. The rules are in calendarFeed.ts.
//
// The token is the user_settings row FEED_TOKEN_KEY. Making a new one writes
// the row (the old link stops working the moment the new value reaches the
// server); turning the feed off writes its tombstone. Both then sync at once and
// report whether the change has reached the server yet: until it has, the
// server still holds the old value.
import { deleteUserSetting, loadUserSetting, setUserSetting } from './storage';
import { getSyncStatus, runFullSync } from './sync';
import { outboxStore } from './outbox';
import { pendingFor } from './syncCore';
import { FEED_TOKEN_KEY, feedUrl, isFeedToken, newFeedToken } from './calendarFeed';

export async function loadFeedToken(): Promise<string | null> {
  const v = await loadUserSetting(FEED_TOKEN_KEY);
  return isFeedToken(v) ? v : null;
}

export function feedLinkFor(token: string | null): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return token && base ? feedUrl(base, token) : null;
}

// Is the token's change still waiting in the outbox (not on the server yet)?
export async function feedChangePending(): Promise<boolean> {
  try {
    return pendingFor(await outboxStore.read(), 'user_settings').has(FEED_TOKEN_KEY);
  } catch {
    return true;
  }
}

async function syncNow(): Promise<boolean> {
  try {
    await runFullSync();
  } catch {
    // The status and the outbox say what happened.
  }
  return !(await feedChangePending()) && getSyncStatus().signedIn;
}

// Creates the link, or replaces it (Make a new link). Returns the token and
// whether the server has it yet.
export async function newFeedLink(): Promise<{ token: string; synced: boolean }> {
  const token = newFeedToken();
  await setUserSetting(FEED_TOKEN_KEY, token);
  return { token, synced: await syncNow() };
}

export async function turnOffFeed(): Promise<{ synced: boolean }> {
  await deleteUserSetting(FEED_TOKEN_KEY);
  return { synced: await syncNow() };
}
