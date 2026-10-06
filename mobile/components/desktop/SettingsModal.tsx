import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { getSyncStatus, runFullSync, subscribeSyncStatus, type PublicSyncStatus } from '../../lib/sync';
import {
  deleteAccountDesktop,
  getAccountLabel,
  getAuthUi,
  isSessionPersistent,
  signOutDesktop,
  startAppleSignIn,
  subscribeAuthUi,
  type AuthUiState,
} from '../../lib/desktopAuth';
import { syncLineText } from './BrainDumpPane';

// A small desktop Settings modal (checkpoint 6), opened from the account line
// at the bottom of the Brain Dump pane. Quiet Function and minimal: this is
// not the full Settings spec. Web only: no Alert.alert, so Delete account
// confirms inline.
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [account, setAccount] = useState<string | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [ui, setUi] = useState<AuthUiState>(getAuthUi);
  const [status, setStatus] = useState<PublicSyncStatus>(getSyncStatus);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refreshAccount = useCallback(async () => {
    try {
      setAccount(await getAccountLabel());
      setPersistent(await isSessionPersistent());
    } catch {
      setAccount(null);
    }
  }, []);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);
  useEffect(() => subscribeAuthUi(setUi), []);
  useEffect(() => subscribeSyncStatus(setStatus), []);
  // A finished sign in changes the account line without this modal acting.
  useEffect(() => {
    if (!ui.busy) refreshAccount();
  }, [ui.busy, status.signedIn, refreshAccount]);

  const signedIn = account !== null;
  const desktop = globalThis.belificDesktop;

  async function onSignOut() {
    setNote(null);
    try {
      await signOutDesktop();
      setAccount(null);
    } catch {
      setNote('Could not sign out. Please try again.');
    }
  }

  async function onDelete() {
    setNote(null);
    try {
      await deleteAccountDesktop();
      setConfirmDelete(false);
      setAccount(null);
      setNote('Account deleted. Your data on this computer was kept.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'The account could not be deleted.');
    }
  }

  async function onSyncNow() {
    setSyncing(true);
    try {
      await runFullSync();
    } catch {
      // The failure is recorded in the sync status shown below.
    }
    setSyncing(false);
  }

  const lastSuccess = status.lastSuccessAt ? new Date(status.lastSuccessAt).toLocaleString() : 'Not yet';
  const lastError = status.lastError ? `${status.lastError}${status.lastErrorAt ? ` (${new Date(status.lastErrorAt).toLocaleString()})` : ''}` : 'None';

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.panel} accessibilityViewIsModal>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.headingRow}>
            <Text style={styles.heading}>Settings</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.linkBtn}>
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>Account</Text>
          {signedIn ? (
            <>
              <Text style={styles.body}>Signed in as {account}</Text>
              <View style={styles.row}>
                <Pressable onPress={onSignOut} accessibilityRole="button" style={styles.btn}>
                  <Text style={styles.btnText}>Sign out</Text>
                </Pressable>
                {!confirmDelete && (
                  <Pressable onPress={() => setConfirmDelete(true)} accessibilityRole="button" style={styles.btn}>
                    <Text style={styles.dangerText}>Delete account</Text>
                  </Pressable>
                )}
              </View>
              {confirmDelete && (
                <View style={styles.confirm}>
                  <Text style={styles.body}>
                    This deletes your Belific account and the data synced to it, on every device. Data stored on this
                    computer is kept.
                  </Text>
                  <View style={styles.row}>
                    <Pressable onPress={onDelete} accessibilityRole="button" style={styles.btn}>
                      <Text style={styles.dangerText}>Delete account</Text>
                    </Pressable>
                    <Pressable onPress={() => setConfirmDelete(false)} accessibilityRole="button" style={styles.btn}>
                      <Text style={styles.btnText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.body}>Local only. Sign in to share your tasks with your iPhone.</Text>
              <View style={styles.row}>
                <Pressable
                  onPress={() => startAppleSignIn()}
                  disabled={ui.busy}
                  accessibilityRole="button"
                  style={[styles.btnPrimary, ui.busy && styles.disabled]}
                >
                  <Text style={styles.btnPrimaryText}>Sign in with Apple</Text>
                </Pressable>
              </View>
            </>
          )}
          {!persistent && (
            <Text style={styles.hint}>
              This computer can't keep a sign in safely, so a sign in lasts until you close Belific.
            </Text>
          )}
          {(ui.message || note) && <Text style={styles.hint}>{note ?? ui.message}</Text>}

          <Text style={styles.section}>Sync</Text>
          <Text style={styles.body}>{syncLineText(status, Date.now()).text}</Text>
          <Text style={styles.hint}>Last success: {lastSuccess}</Text>
          <Text style={styles.hint}>Last error: {lastError}</Text>
          <View style={styles.row}>
            <Pressable
              onPress={onSyncNow}
              disabled={!signedIn || syncing}
              accessibilityRole="button"
              style={[styles.btn, (!signedIn || syncing) && styles.disabled]}
            >
              <Text style={styles.btnText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>Data</Text>
          <View style={styles.row}>
            <Pressable onPress={() => desktop?.actions.exportData()} accessibilityRole="button" style={styles.btn}>
              <Text style={styles.btnText}>Export data…</Text>
            </Pressable>
            <Pressable onPress={() => desktop?.actions.openBackups()} accessibilityRole="button" style={styles.btn}>
              <Text style={styles.btnText}>Open backups folder</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(38, 37, 31, 0.35)' },
  panel: { width: 460, maxWidth: '92%', maxHeight: '90%', backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  content: { padding: 20 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  heading: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  linkBtn: { paddingHorizontal: 8, height: 36, justifyContent: 'center' },
  link: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  section: { marginTop: 18, marginBottom: 6, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: Colors.textSecondary },
  body: { fontSize: 14, color: Colors.textPrimary },
  hint: { marginTop: 6, fontSize: 12, color: Colors.textSecondary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  confirm: { marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  btn: { paddingHorizontal: 14, height: 36, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  btnPrimary: { paddingHorizontal: 16, height: 36, borderRadius: 14, backgroundColor: Colors.accent, justifyContent: 'center' },
  btnPrimaryText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  dangerText: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  disabled: { opacity: 0.5 },
});
