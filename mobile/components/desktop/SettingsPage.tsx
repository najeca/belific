import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { Colors } from '../../lib/theme';
import { deleteAccountDesktop, signOutDesktop, startAppleSignIn } from '../../lib/desktopAuth';
import { runFullSync } from '../../lib/sync';
import { lastSyncedText, syncErrorText, syncLineText } from '../../lib/syncText';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import type { DesktopSettings } from '../../lib/kv';
import { DAY_START_OPTIONS, isDayStart } from '../../lib/dayStart';
import { DAY_START_EVENT } from './useDayStart';
import { useAccount } from './useAccount';

// The Settings page (checkpoint 9, decision 025): a view inside the app, not
// an overlay. It replaces the old Settings modal; every setting and its
// behaviour is the same, only moved. The Back button lives in the top strip.
// Web only: no Alert.alert, so Delete account confirms inline.
export const PRIVACY_URL = 'https://najeca.github.io/belific/privacy.html';
export const ISSUES_URL = 'https://github.com/najeca/belific/issues';

function openExternal(url: string) {
  // The main process only lets the allow listed Belific pages through.
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function SettingsPage({ onOpenLabels, labelCount }: { onOpenLabels: () => void; labelCount: number }) {
  const { account, setAccount, persistent, ui, status } = useAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [prefs, setPrefs] = useState<DesktopSettings | null>(null);
  const [licences, setLicences] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const desktop = globalThis.belificDesktop;
  useEffect(() => {
    desktop?.settings.get().then(setPrefs).catch(() => {});
    // The licences row exists only if the licences file ships in the app folder.
    desktop?.actions.licensesAvailable?.().then(setLicences).catch(() => {});
  }, [desktop]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  function setPref(partial: Partial<DesktopSettings>) {
    const bridge = globalThis.belificDesktop?.settings;
    if (!bridge) return;
    setPrefs((p) => (p ? { ...p, ...partial } : p));
    bridge
      .set(partial)
      .then((next) => {
        setPrefs(next);
        // The Timebox reads "My day starts at" from the same settings.
        window.dispatchEvent(new Event(DAY_START_EVENT));
      })
      .catch(() => {});
  }

  const signedIn = account !== null;

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
      setConfirmDelete(false);
      setNote(
        `${err instanceof Error ? err.message : 'The account could not be deleted.'} Your account has not been deleted. If this keeps happening the delete service may be unavailable, so try again later.`,
      );
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

  const line = syncLineText(status, now);
  const error = syncErrorText(status);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.column}>
        <Text style={styles.heading}>Settings</Text>

        <Section title="Account">
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
                    <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Confirm delete account" style={styles.btn}>
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
              <Text style={styles.body}>Local only, not signed in. Sign in to keep your tasks on all your devices.</Text>
              <View style={styles.row}>
                <Pressable onPress={() => startAppleSignIn()} accessibilityRole="button" style={styles.btnPrimary}>
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
          {ui.revokePending && (
            <Text style={styles.hint}>Signed out here. Ending the session on the server is waiting for a connection and will retry.</Text>
          )}
          {(ui.message || note) && <Text style={styles.hint}>{note ?? ui.message}</Text>}
        </Section>

        <Section title="Sync">
          <Text style={[styles.body, line.warn && { color: Colors.danger }]}>{line.text}</Text>
          <Text style={styles.hint}>{lastSyncedText(status.lastSuccessAt, now)}</Text>
          <Text style={styles.hint}>Last error: {error ?? 'None'}</Text>
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
        </Section>

        {prefs && (
          <>
            <Section title="Planning">
              <View style={styles.timeRow}>
                <Text style={styles.body}>My day starts at</Text>
                <select
                  value={prefs.dayStart}
                  onChange={(e) => {
                    if (isDayStart(e.target.value)) setPref({ dayStart: e.target.value });
                  }}
                  style={domStyle}
                  aria-label="My day starts at"
                >
                  {DAY_START_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </View>
              <Text style={styles.hint}>
                The Timebox shows the whole day, 00:00 to 24:00. This is only where it opens: pick the time your day begins, whether that is early morning or the evening of a night shift.
              </Text>
            </Section>

            <Section title="Notifications">
              <ToggleRow label="Event starts" value={prefs.notifyEvents} onChange={(v) => setPref({ notifyEvents: v })} />
              <ToggleRow label="Tasks placed on the Timebox" value={prefs.notifyTasks} onChange={(v) => setPref({ notifyTasks: v })} />
              <ToggleRow label="Daily reminder of tasks planned for today" value={prefs.dailyReminder} onChange={(v) => setPref({ dailyReminder: v })} />
              {prefs.dailyReminder && (
                <View style={styles.timeRow}>
                  <Text style={styles.body}>Remind me at</Text>
                  <input
                    type="time"
                    value={prefs.dailyTime}
                    onChange={(e) => {
                      if (/^\d{2}:\d{2}$/.test(e.target.value)) setPref({ dailyTime: e.target.value });
                    }}
                    style={domStyle}
                    aria-label="Daily reminder time"
                  />
                </View>
              )}
              <Text style={styles.hint}>
                One quiet notification per day for tasks with a Day but no time. Event and task notifications fire at their start time.
              </Text>
              <ToggleRow label="Close to the system tray" value={prefs.closeToTray} onChange={(v) => setPref({ closeToTray: v })} />
              <ToggleRow label="Start with Windows" value={prefs.startWithWindows} onChange={(v) => setPref({ startWithWindows: v })} />
              <Text style={styles.hint}>
                Closing the window keeps Belific in the tray so reminders still arrive. Quit from the tray icon or File, Quit.
              </Text>
            </Section>
          </>
        )}

        <Section title="Data">
          <View style={styles.row}>
            <Pressable onPress={() => desktop?.actions.openBackups()} accessibilityRole="button" style={styles.btn}>
              <Text style={styles.btnText}>Open backups folder</Text>
            </Pressable>
            <Pressable onPress={() => desktop?.actions.exportData()} accessibilityRole="button" style={styles.btn}>
              <Text style={styles.btnText}>Export data…</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>A copy of your data is saved to the backups folder once a day, and the newest 14 are kept.</Text>
        </Section>

        <Section title="Labels">
          <Text style={styles.body}>
            {labelCount === 0 ? 'No labels yet.' : labelCount === 1 ? '1 label.' : `${labelCount} labels.`} Rename them, change their colour or delete them.
          </Text>
          <View style={styles.row}>
            <Pressable onPress={onOpenLabels} accessibilityRole="button" accessibilityLabel="Open Labels page" style={styles.btn}>
              <Text style={styles.btnText}>Manage labels</Text>
            </Pressable>
          </View>
        </Section>

        <Section title="About">
          <Text style={styles.body}>Belific {desktop?.version ?? ''}</Text>
          <View style={styles.row}>
            <Pressable onPress={() => openExternal(PRIVACY_URL)} accessibilityRole="link" accessibilityLabel="Privacy policy" style={styles.btn}>
              <Text style={styles.btnText}>Privacy policy</Text>
            </Pressable>
            <Pressable onPress={() => openExternal(ISSUES_URL)} accessibilityRole="link" accessibilityLabel="Report an issue" style={styles.btn}>
              <Text style={styles.btnText}>Report an issue</Text>
            </Pressable>
            {licences && (
              <Pressable onPress={() => desktop?.actions.openLicenses?.()} accessibilityRole="button" accessibilityLabel="Chromium and Electron licences" style={styles.btn}>
                <Text style={styles.btnText}>Chromium and Electron licences</Text>
              </Pressable>
            )}
          </View>
        </Section>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} accessibilityLabel={`${title} settings`}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.border, true: Colors.accent }}
        thumbColor={Colors.surface}
        accessibilityLabel={label}
      />
    </View>
  );
}

const domStyle: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 14,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 4, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  section: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  sectionTitle: { marginBottom: 6, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: Colors.textSecondary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36, marginTop: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
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
