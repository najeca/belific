import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { signOutDesktop, startAppleSignIn, type AuthUiState } from '../../lib/desktopAuth';
import { runFullSync, type PublicSyncStatus } from '../../lib/sync';
import { lastSyncedText, profileInitial, syncErrorText, syncLineText } from '../../lib/syncText';
import Popover, { closePopover, Row, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { useAccount } from './useAccount';

const POPOVER_ID = 'profile';

// The one place for the account (checkpoint 9, decision 025): an icon at the
// top right of the app, always visible, signed in or not. It opens the shared
// small Popover, never a modal. Signed out it is a neutral person glyph and
// the menu offers Sign in with Apple. Signed in it shows the user's initial
// and the menu shows the account, sync status with Sync now, Settings and Sign
// out. The sign in, sign out, account choice and revoke code is unchanged.
export default function ProfileMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { account, status, ui } = useAccount();
  const { ref, get } = usePopoverAnchor();
  const open = useIsOpen(POPOVER_ID);
  const signedIn = account !== null;
  const initial = profileInitial(account);

  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(POPOVER_ID, get)}
        style={(state) => {
          const s = state as typeof state & { hovered?: boolean };
          return [styles.icon, signedIn && styles.iconOn, (open || s.hovered) && styles.iconActive];
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={signedIn ? 'Profile and account' : 'Profile, not signed in'}
      >
        {signedIn && initial ? (
          <Text style={styles.initial}>{initial}</Text>
        ) : (
          <Ionicons name="person-outline" size={18} color={signedIn ? Colors.onAccent : Colors.textSecondary} />
        )}
      </Pressable>
      <Popover id={POPOVER_ID} anchor={get} width={288} label="Profile menu">
        {signedIn ? (
          <SignedInBody account={account} status={status} ui={ui} onOpenSettings={() => { closePopover(); onOpenSettings(); }} />
        ) : (
          <SignedOutBody busy={ui.busy} message={ui.message} onOpenSettings={() => { closePopover(); onOpenSettings(); }} />
        )}
      </Popover>
    </>
  );
}

function SignedOutBody({ busy, message, onOpenSettings }: { busy: boolean; message: string | null; onOpenSettings: () => void }) {
  return (
    <View>
    <View style={styles.body}>
      <Text style={styles.title}>Local only, not signed in</Text>
      <Text style={styles.note}>Sign in to keep your tasks on all your devices</Text>
      <Pressable onPress={() => startAppleSignIn()} accessibilityRole="button" accessibilityLabel="Sign in with Apple" style={styles.primary}>
        <Ionicons name="logo-apple" size={16} color={Colors.onAccent} />
        <Text style={styles.primaryText}>Sign in with Apple</Text>
      </Pressable>
      {(busy || message) && <Text style={styles.hint}>{message ?? 'Finish signing in in your browser…'}</Text>}
    </View>
    <View style={styles.rows}>
      <Row label="Settings" onPress={onOpenSettings} a11y="Settings" />
    </View>
    </View>
  );
}

function SignedInBody({ account, status, ui, onOpenSettings }: { account: string; status: PublicSyncStatus; ui: AuthUiState; onOpenSettings: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [syncing, setSyncing] = useState(false);
  // The "last synced" wording moves on while the menu is open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  const line = syncLineText(status, now);
  const error = syncErrorText(status);

  async function syncNow() {
    setSyncing(true);
    try {
      await runFullSync();
    } catch {
      // The failure is recorded in the sync status shown above.
    }
    setSyncing(false);
  }

  async function signOut() {
    closePopover();
    try {
      await signOutDesktop();
    } catch {
      // The Settings page shows a message if signing out fails; here the menu is closed.
    }
  }

  return (
    <View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {account}
        </Text>
        <Text style={[styles.note, line.warn && styles.warn]}>{line.text}</Text>
        <Text style={styles.hint}>{lastSyncedText(status.lastSuccessAt, now)}</Text>
        {error && <Text style={[styles.hint, styles.warn]}>Last problem: {error}</Text>}
        {ui.message && <Text style={styles.hint}>{ui.message}</Text>}
      </View>
      <View style={styles.rows}>
        <Row label={syncing || status.state === 'syncing' ? 'Syncing…' : 'Sync now'} onPress={syncNow} disabled={syncing || status.state === 'syncing'} a11y="Sync now" />
        <Row label="Settings" onPress={onOpenSettings} a11y="Settings" />
        <Row label="Sign out" onPress={signOut} a11y="Sign out" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  iconOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  iconActive: { borderColor: Colors.accent },
  initial: { fontSize: 14, fontWeight: '700', color: Colors.onAccent },
  body: { padding: 14, gap: 6 },
  rows: { paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  title: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  note: { fontSize: 13, color: Colors.textPrimary },
  hint: { fontSize: 12, color: Colors.textSecondary },
  warn: { color: Colors.danger },
  primary: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 36, borderRadius: 14, backgroundColor: Colors.accent },
  primaryText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
});
