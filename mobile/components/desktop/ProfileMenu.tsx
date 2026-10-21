import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { signOutDesktop, type AuthUiState } from '../../lib/desktopAuth';
import { SIGN_IN_TEXT } from '../../lib/authCore';
import { runFullSync, type PublicSyncStatus } from '../../lib/sync';
import { lastSyncedText, profileInitial, syncErrorText, syncLineText } from '../../lib/syncText';
import Popover, { closePopover, Row, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { useAccount } from './useAccount';
import { useFeature } from './featureStore';
import { STREAK_TEXT } from '../../lib/seriesStreak';

const POPOVER_ID = 'profile';

// The one place for the account (checkpoint 9, decision 025): an icon at the
// top right of the app, always visible, signed in or not. It opens the shared
// small Popover, never a modal. Signed out it is a neutral person glyph and
// the menu has one Sign in button, which opens the Sign in page (checkpoint 12,
// decision 026: Apple and Google are chosen there). Signed in it shows the
// user's initial and the menu shows the account, sync status with Sync now,
// Settings and Sign out. The sign out, account choice and revoke code is unchanged.
// 2.26.0: it also holds the day actions that used to be buttons in the top
// strip (Plan my day, Shut down my day, Quick capture, Search, Keyboard
// shortcuts); their keyboard shortcuts are unchanged.
export interface ProfileActions {
  planning?: () => void;
  shutdown?: () => void;
  capture: () => void;
  search: () => void;
  shortcuts: () => void;
}

export default function ProfileMenu({
  onOpenSettings,
  onOpenProgress,
  onOpenSignIn,
  onOpenAnalytics,
  onOpenTrash,
  actions,
}: {
  onOpenSettings: () => void;
  onOpenProgress: () => void;
  onOpenSignIn: () => void;
  onOpenAnalytics: () => void;
  onOpenTrash: () => void;
  actions: ProfileActions;
}) {
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
      <Popover id={POPOVER_ID} anchor={get} width={288} label="Profile menu" maxHeight={720}>
        {signedIn ? (
          <SignedInBody actions={actions} account={account} status={status} ui={ui} onOpenSettings={() => { closePopover(); onOpenSettings(); }} onOpenProgress={() => { closePopover(); onOpenProgress(); }} onOpenAnalytics={() => { closePopover(); onOpenAnalytics(); }} onOpenTrash={() => { closePopover(); onOpenTrash(); }} />
        ) : (
          <SignedOutBody actions={actions} busy={ui.busy} message={ui.message} onOpenSignIn={() => { closePopover(); onOpenSignIn(); }} onOpenSettings={() => { closePopover(); onOpenSettings(); }} onOpenProgress={() => { closePopover(); onOpenProgress(); }} onOpenAnalytics={() => { closePopover(); onOpenAnalytics(); }} onOpenTrash={() => { closePopover(); onOpenTrash(); }} />
        )}
      </Popover>
    </>
  );
}

// The day actions and the shortcuts list, in the menu's list of rows. Each
// closes the menu, then acts.
function DayActions({ actions, onOpenSettings }: { actions: ProfileActions; onOpenSettings: () => void }) {
  const run = (fn: () => void) => () => {
    closePopover();
    fn();
  };
  return (
    <>
      {actions.planning && <Row icon="sunny-outline" label="Plan my day" onPress={run(actions.planning)} a11y="Plan my day" />}
      {actions.shutdown && <Row icon="moon-outline" label="Shut down my day" onPress={run(actions.shutdown)} a11y="Shut down my day" />}
      <Row icon="flash-outline" label="Quick capture" onPress={run(actions.capture)} a11y="Quick capture" />
      <Row icon="search-outline" label="Search" onPress={run(actions.search)} a11y="Search tasks" />
      <Row icon="settings-outline" label="Settings" onPress={onOpenSettings} a11y="Settings" />
      <Row icon="keypad-outline" label="Keyboard shortcuts" onPress={run(actions.shortcuts)} a11y="Keyboard shortcuts" />
    </>
  );
}

function SignedOutBody({ actions, busy, message, onOpenSignIn, onOpenSettings, onOpenProgress, onOpenAnalytics, onOpenTrash }: { actions: ProfileActions; busy: boolean; message: string | null; onOpenSignIn: () => void; onOpenSettings: () => void; onOpenProgress: () => void; onOpenAnalytics: () => void; onOpenTrash: () => void }) {
  const showAnalytics = useFeature('analytics');
  return (
    <View>
    <View style={styles.body}>
      <Text style={styles.title}>Local only, not signed in</Text>
      <Text style={styles.note}>Sign in to keep your tasks on all your devices</Text>
      <Pressable onPress={onOpenSignIn} accessibilityRole="button" accessibilityLabel={SIGN_IN_TEXT.openButton} style={styles.primary}>
        <Text style={styles.primaryText}>{SIGN_IN_TEXT.openButton}</Text>
      </Pressable>
      {(busy || message) && <Text style={styles.hint}>{message ?? SIGN_IN_TEXT.waiting}</Text>}
    </View>
    <View style={styles.rows}>
      <DayActions actions={actions} onOpenSettings={onOpenSettings} />
      <Row label={STREAK_TEXT.progressRow} onPress={onOpenProgress} a11y="Progress" />
      {showAnalytics && <Row icon="bar-chart-outline" label="Analytics" onPress={onOpenAnalytics} a11y="Analytics" />}
      <Row icon="trash-outline" label="Trash" onPress={onOpenTrash} a11y="Trash" />
    </View>
    </View>
  );
}

function SignedInBody({ actions, account, status, ui, onOpenSettings, onOpenProgress, onOpenAnalytics, onOpenTrash }: { actions: ProfileActions; account: string; status: PublicSyncStatus; ui: AuthUiState; onOpenSettings: () => void; onOpenProgress: () => void; onOpenAnalytics: () => void; onOpenTrash: () => void }) {
  const showAnalytics = useFeature('analytics');
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
        <DayActions actions={actions} onOpenSettings={onOpenSettings} />
        <Row label={STREAK_TEXT.progressRow} onPress={onOpenProgress} a11y="Progress" />
        {showAnalytics && <Row icon="bar-chart-outline" label="Analytics" onPress={onOpenAnalytics} a11y="Analytics" />}
        <Row icon="trash-outline" label="Trash" onPress={onOpenTrash} a11y="Trash" />
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
  primary: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 36, borderRadius: 10, backgroundColor: Colors.accent },
  primaryText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
});
