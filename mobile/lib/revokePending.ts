// A sign out whose server revoke failed (offline) keeps the tokens needed to
// retry in the ENCRYPTED secure store (cp6.1, M3), so the server session does
// not stay alive just because the network was down. Pure, with injected
// storage and revoke call, so it is unit tested. desktopAuth.ts wires it up.
export const REVOKE_KEY = 'belific_revoke_pending';

export interface RevokeTokens {
  access_token: string;
  refresh_token: string;
}

export interface RevokeDeps {
  // The secure (encrypted) store.
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  // 'done' = revoked, 'dead' = the server says the session is already gone,
  // 'offline' = could not reach the server (try again later).
  revoke(tokens: RevokeTokens): Promise<'done' | 'dead' | 'offline'>;
}

export async function noteRevokeFailed(d: RevokeDeps, tokens: RevokeTokens): Promise<void> {
  await d.setItem(REVOKE_KEY, JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token }));
}

export async function isRevokePending(d: Pick<RevokeDeps, 'getItem'>): Promise<boolean> {
  return (await d.getItem(REVOKE_KEY)) !== null;
}

// Returns true while a revoke is still pending afterwards.
export async function retryRevoke(d: RevokeDeps): Promise<boolean> {
  const raw = await d.getItem(REVOKE_KEY);
  if (raw === null) return false;
  let tokens: RevokeTokens | null = null;
  try {
    const p = JSON.parse(raw) as Partial<RevokeTokens>;
    if (typeof p.access_token === 'string' && typeof p.refresh_token === 'string') {
      tokens = { access_token: p.access_token, refresh_token: p.refresh_token };
    }
  } catch {
    // unreadable: nothing to retry with
  }
  if (!tokens) {
    await d.removeItem(REVOKE_KEY);
    return false;
  }
  let result: 'done' | 'dead' | 'offline';
  try {
    result = await d.revoke(tokens);
  } catch {
    result = 'offline';
  }
  if (result === 'offline') return true;
  await d.removeItem(REVOKE_KEY);
  return false;
}
