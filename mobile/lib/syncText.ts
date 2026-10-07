// Plain words about sync and the account, for the profile menu and the
// Settings page (checkpoint 9, decision 025). Pure, no runtime imports, so
// `node --test` can run it; see syncText.test.ts.
export interface SyncLike {
  state: 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out' | string;
  signedIn: boolean;
  pending: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// One quiet line about sync (checkpoint 5, decision 013 item 6). Problems show
// as a warning only while the last error is under a day old.
export function syncLineText(s: SyncLike, now: number): { text: string; warn: boolean } {
  if (!s.signedIn || s.state === 'signed-out') return { text: 'Local only · not signed in', warn: false };
  if (s.state === 'syncing') return { text: 'Syncing…', warn: false };
  if (s.state === 'offline') return { text: `Offline · ${s.pending} change${s.pending === 1 ? '' : 's'} waiting`, warn: false };
  if (s.state === 'error') {
    const recent = s.lastErrorAt !== null && now - Date.parse(s.lastErrorAt) < DAY_MS;
    return { text: `Sync problem: ${s.lastError ?? 'unknown'}`, warn: recent };
  }
  return { text: s.pending > 0 ? `${s.pending} change${s.pending === 1 ? '' : 's'} waiting` : 'Synced', warn: false };
}

// "Last synced just now / 5 minutes ago / 2 days ago / Not synced yet".
export function lastSyncedText(lastSuccessAt: string | null, now: number): string {
  if (!lastSuccessAt) return 'Not synced yet';
  const t = Date.parse(lastSuccessAt);
  if (Number.isNaN(t)) return 'Not synced yet';
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return 'Last synced just now';
  if (mins < 60) return `Last synced ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last synced ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Last synced ${days} day${days === 1 ? '' : 's'} ago`;
}

// The sync error in plain words, or null when there is nothing to say. The
// raw text is shortened so a long server message never fills the menu.
export function syncErrorText(s: SyncLike): string | null {
  if (!s.signedIn || s.state !== 'error' || !s.lastError) return null;
  const msg = s.lastError.trim();
  return msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
}

// The letter on the profile icon: the first letter or digit of the name or
// email, upper case. Null when there is none (the icon then shows the glyph).
export function profileInitial(label: string | null | undefined): string | null {
  if (!label) return null;
  const m = /[\p{L}\p{N}]/u.exec(label.trim());
  return m ? m[0].toLocaleUpperCase() : null;
}
