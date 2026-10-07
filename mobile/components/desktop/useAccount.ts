import { useCallback, useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus, type PublicSyncStatus } from '../../lib/sync';
import { getAccountLabel, getAuthUi, isSessionPersistent, subscribeAuthUi, type AuthUiState } from '../../lib/desktopAuth';

// The account and sync state the profile menu and the Settings page both show
// (checkpoint 9). One place for the subscriptions: the account label, whether
// the session can be kept safely, the sign in UI state and the sync status.
export function useAccount() {
  const [account, setAccount] = useState<string | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [ui, setUi] = useState<AuthUiState>(getAuthUi);
  const [status, setStatus] = useState<PublicSyncStatus>(getSyncStatus);

  const refresh = useCallback(async () => {
    try {
      setAccount(await getAccountLabel());
      setPersistent(await isSessionPersistent());
    } catch {
      setAccount(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => subscribeAuthUi(setUi), []);
  useEffect(() => subscribeSyncStatus(setStatus), []);
  // A finished sign in or out changes the account without this hook acting.
  useEffect(() => {
    if (!ui.busy) refresh();
  }, [ui.busy, status.signedIn, refresh]);

  return { account, setAccount, persistent, ui, status, refresh };
}
