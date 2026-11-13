import { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus, type PublicSyncStatus } from '../lib/sync';
import { syncBadgeText } from '../lib/syncText';

// 3.53.2: the always visible sync line, for the desktop top bar and the phone header. It follows the sync status
// and moves on every 30 s so "Synced 5 min ago" stays true.
export function useSyncBadge(): { text: string; warn: boolean } {
  const [status, setStatus] = useState<PublicSyncStatus>(getSyncStatus);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribeSyncStatus((s) => {
    setStatus(s);
    setNow(Date.now());
  }), []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  return syncBadgeText(status, now);
}
