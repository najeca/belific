import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import PaletteSwitch from './PaletteSwitch';
import RoutineConvertRow from './RoutineConvertRow';
import { Colors } from '../../lib/theme';
import { deleteAccountDesktop, signOutDesktop } from '../../lib/desktopAuth';
import { SIGN_IN_TEXT } from '../../lib/authCore';
import { runFullSync } from '../../lib/sync';
import { lastSyncedText, syncErrorText, syncLineText } from '../../lib/syncText';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import type { DesktopSettings } from '../../lib/kv';
import { DAY_START_OPTIONS, isDayStart } from '../../lib/dayStart';
import { DAY_START_EVENT } from './useDayStart';
import { useAccount } from './useAccount';
import { STREAK_TEXT } from '../../lib/seriesStreak';
import { exportMyData } from '../../lib/exportActions';
import { exportMessage } from '../../lib/dataExport';
import { dayStamp, downloadText } from './download';
import ResetCacheRow from './ResetCacheRow';
import TemplatesManager from './TemplatesManager';
import { setFeature, useFeatures } from './featureStore';
import { FEATURES } from '../../lib/features';
import CalendarsSection from './CalendarsSection';
import { setCutMin, useCutMin } from './cutStore';
import { setVibrant, useVibrant } from './vibrantStore';
import { setThemeMode, useThemeMode } from './themeStore';
import { THEME_MODES, THEME_MODE_LABEL } from '../../lib/themeMode';
import { setDefaultReminders, useDefaultReminders } from './reminderStore';
import { REMINDER_LEADS, leadLabel, toggleLead } from '../../lib/reminder';
import { CUT_MIN_OPTIONS, parseCutMin } from '../../lib/cuts';
import { displayKeys, shortcutGroups } from '../../lib/shortcuts';
import { DISPLAY_FONT_FAMILY } from './desktopFont';

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

export default function SettingsPage({ onOpenLabels, onOpenSignIn, labelCount, onChanged, refreshKey = 0 }: { onOpenLabels: () => void; onOpenSignIn: () => void; labelCount: number; onChanged: () => void; refreshKey?: number }) {
  const { account, setAccount, persistent, ui, status } = useAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [prefs, setPrefs] = useState<DesktopSettings | null>(null);
  const [licences, setLicences] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [exportNote, setExportNote] = useState<string | null>(null);
  const features = useFeatures();
  const cutMin = useCutMin();
  const vibrant = useVibrant();
  const themeMode = useThemeMode();
  const defaultReminders = useDefaultReminders();

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

  // Your own data, as it is on this computer: JSON (every table) or CSV (the
  // tasks). Never a sign in session or a token (lib/dataExport.ts).
  async function onExport(what: 'json' | 'csv') {
    setExportNote(null);
    try {
      const result = await exportMyData(desktop?.version ?? '');
      if (what === 'json') downloadText(`belific-data-${dayStamp()}.json`, result.json, 'application/json');
      else downloadText(`belific-tasks-${dayStamp()}.csv`, result.csv, 'text/csv');
      setExportNote(exportMessage(result, what));
    } catch {
      setExportNote('The export could not be made. Nothing was saved.');
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.column}>
        <Text style={styles.heading}>Settings</Text>

        <Section title="Account" emoji="👤">
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
                <Pressable onPress={onOpenSignIn} accessibilityRole="button" accessibilityLabel={SIGN_IN_TEXT.openButton} style={styles.btnPrimary}>
                  <Text style={styles.btnPrimaryText}>{SIGN_IN_TEXT.openButton}</Text>
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

        <Section title="Sync" emoji="🔄">
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
            <Section title="Planning" emoji="🗓️">
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
              <ToggleRow label={STREAK_TEXT.settingLabel} value={prefs.showStreaks} onChange={(v) => setPref({ showStreaks: v })} />
              <Text style={styles.hint}>{STREAK_TEXT.settingHint}</Text>
              <View style={styles.timeRow}>
                <Text style={styles.body}>Smallest piece when a break splits a task</Text>
                <select
                  value={String(cutMin)}
                  onChange={(e) => setCutMin(parseCutMin(e.target.value))}
                  style={domStyle}
                  aria-label="Smallest piece when a break splits a task"
                >
                  {CUT_MIN_OPTIONS.map((m) => (
                    <option key={m} value={String(m)}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </View>
              <Text style={styles.hint}>
                A task with "Split" on (for example a break) splits the tasks it overlaps into pieces. It only does so when every piece left is at least this long; otherwise the two sit side by side and the break says why. Nothing is changed on the tasks themselves.
              </Text>
            </Section>

            <Section title="Appearance" emoji="🎨">
              <Text style={styles.body}>Theme</Text>
              <View style={styles.leadRow} {...({ dataSet: { themeSetting: '1' } } as object)}>
                {THEME_MODES.map((m) => {
                  const on = themeMode === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setThemeMode(m)}
                      style={[styles.leadChip, on && styles.leadChipOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`Theme: ${THEME_MODE_LABEL[m]}`}
                      {...({ 'aria-checked': on, dataSet: { themeMode: m } } as object)}
                    >
                      <Text style={[styles.leadChipText, on && styles.leadChipTextOn]}>{THEME_MODE_LABEL[m]}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>Light is the default. Match system follows the light or dark setting of this computer. This is kept on this computer only.</Text>
              <View {...({ dataSet: { vibrantSetting: '1' } } as object)}>
                <ToggleRow label="Vibrant task colours" value={vibrant} onChange={(v) => setVibrant(v)} />
              </View>
              <Text style={styles.hint}>
                Calendar blocks and Timebox cards use a stronger version of their label colour with bold white text. Colours that are too light for white text are darkened just enough to stay readable. The task cards in the list are not changed. This is kept on this computer only.
              </Text>
            </Section>

            <Section title="Notifications" emoji="🔔">
              <ToggleRow label="Event starts" value={prefs.notifyEvents} onChange={(v) => setPref({ notifyEvents: v })} />
              <ToggleRow label="Tasks placed on the Timebox" value={prefs.notifyTasks} onChange={(v) => setPref({ notifyTasks: v })} />
              {prefs.notifyTasks && (
                <>
                  <Text style={styles.body}>Reminders for a timed task</Text>
                  <View style={styles.leadRow} {...({ dataSet: { defaultReminders: '1' } } as object)}>
                    {REMINDER_LEADS.map((lead) => {
                      const on = defaultReminders.includes(lead);
                      return (
                        <Pressable
                          key={lead}
                          onPress={() => setDefaultReminders(toggleLead(defaultReminders, lead))}
                          style={[styles.leadChip, on && styles.leadChipOn]}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={`Default reminder: ${leadLabel(lead)}`}
                          {...({ 'aria-checked': on, dataSet: { defaultLead: String(lead) } } as object)}
                        >
                          <Text style={[styles.leadChipText, on && styles.leadChipTextOn]}>{leadLabel(lead)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.hint}>
                    Every timed task gets these unless it has its own list (the Reminder row in its details). Up to five. A reminder that has already passed is skipped, and one missed while Belific was quit or the computer was asleep is not shown late.
                  </Text>
                  <Text style={styles.hint} {...({ dataSet: { reminderRunningNote: '1' } } as object)}>
                    Reminders only work while Belific is running. Closing the window keeps it in the system tray, so they keep arriving; choosing Quit from the tray stops them until you start Belific again.
                    {prefs.startWithWindows ? ' Start with Windows is on, so Belific is running after you sign in.' : ' To have it running after you sign in to Windows, turn on Start with Windows below.'}
                  </Text>
                  {!prefs.startWithWindows && (
                    <Pressable
                      onPress={() => setPref({ startWithWindows: true })}
                      style={[styles.btn, { alignSelf: 'flex-start', marginTop: 6 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Turn on Start with Windows"
                    >
                      <Text style={styles.btnText}>Turn on Start with Windows</Text>
                    </Pressable>
                  )}
                </>
              )}
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

        <Section title="Calendars" emoji="📅">
          <CalendarsSection signedIn={signedIn} refreshKey={refreshKey} />
        </Section>

        <Section title="Power features" emoji="⚡">
          <Text style={styles.hint}>Turn off what you do not use and it disappears from the screen. Nothing is deleted: turn it on again and it is all still there.</Text>
          {FEATURES.map((f) => (
            <View key={f.key}>
              {f.comingLater ? (
                <View style={styles.toggleRow} accessibilityLabel={`${f.label}, coming later`}>
                  <Text style={[styles.body, { flex: 1 }]}>{f.emoji} {f.label}</Text>
                  <Text style={styles.hint}>Coming later</Text>
                </View>
              ) : (
                <ToggleRow label={`${f.emoji} ${f.label}`} value={features[f.key]} onChange={(v) => setFeature(f.key, v)} />
              )}
              <Text style={styles.hint}>{f.hint}</Text>
            </View>
          ))}
          {features.templates && <TemplatesManager />}
        </Section>

        <Section title="Data" emoji="💾">
          <View style={styles.row}>
            <Pressable onPress={() => desktop?.actions.openBackups()} accessibilityRole="button" style={styles.btn}>
              <Text style={styles.btnText}>Open backups folder</Text>
            </Pressable>
            <Pressable onPress={() => desktop?.actions.exportData()} accessibilityRole="button" style={styles.btn}>
              <Text style={styles.btnText}>Export data…</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable onPress={() => onExport('json')} accessibilityRole="button" accessibilityLabel="Export my data as JSON" style={styles.btn}>
              <Text style={styles.btnText}>📤 My data (JSON)</Text>
            </Pressable>
            <Pressable onPress={() => onExport('csv')} accessibilityRole="button" accessibilityLabel="Export my tasks as CSV" style={styles.btn}>
              <Text style={styles.btnText}>📤 My tasks (CSV)</Text>
            </Pressable>
          </View>
          {exportNote && (
            <Text style={styles.hint} accessibilityLabel="Export note">
              {exportNote}
            </Text>
          )}
          <Text style={styles.hint}>JSON has every table; CSV has the tasks, one row each. Only data on this computer is used, and no sign in session or token is ever included.</Text>
          <Text style={styles.hint}>A copy of your data is saved to the backups folder once a day, and the newest 14 are kept.</Text>
          <RoutineConvertRow onChanged={onChanged} />
          <ResetCacheRow onChanged={onChanged} />
        </Section>

        <Section title="Labels" emoji="🏷️">
          <Text style={styles.body}>
            {labelCount === 0 ? 'No labels yet.' : labelCount === 1 ? '1 label.' : `${labelCount} labels.`} Rename them, change their colour or delete them.
          </Text>
          <View style={styles.row}>
            <Pressable onPress={onOpenLabels} accessibilityRole="button" accessibilityLabel="Open Labels" style={styles.btn}>
              <Text style={styles.btnText}>Manage labels</Text>
            </Pressable>
          </View>
        </Section>

        <Section title="Keyboard shortcuts" emoji="⌨️">
          <Text style={styles.hint}>Shift+/ shows this list over the home screen at any time. Letters work when you are not typing in a box; task keys act on the card that has the keyboard focus.</Text>
          {shortcutGroups().map(({ group, items }) => (
            <View key={group} style={{ marginTop: 10 }} accessibilityLabel={`${group} shortcuts`}>
              <Text style={styles.keyGroup}>{group}</Text>
              {items.map((d) => (
                <View key={d.id} style={styles.keyRow}>
                  <Text style={[styles.body, { flex: 1 }]}>{d.label}</Text>
                  <Text style={styles.keys}>{displayKeys(d.keys)}</Text>
                </View>
              ))}
            </View>
          ))}
        </Section>

        <Section title="About" emoji="ℹ️">
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

function Section({ title, emoji, children }: { title: string; emoji?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} accessibilityLabel={`${title} settings`}>
      <Text style={styles.sectionTitle}>{emoji ? `${emoji} ${title}` : title}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <PaletteSwitch value={value} onValueChange={onChange} label={label} />
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
  heading: { fontSize: 18, fontFamily: DISPLAY_FONT_FAMILY, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  section: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  sectionTitle: { marginBottom: 6, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: Colors.textSecondary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36, marginTop: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  body: { fontSize: 14, color: Colors.textPrimary },
  hint: { marginTop: 6, fontSize: 12, color: Colors.textSecondary },
  leadRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  leadChip: { paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  leadChipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  leadChipText: { fontSize: 12, color: Colors.textPrimary },
  leadChipTextOn: { color: Colors.onAccent, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  confirm: { marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  btn: { paddingHorizontal: 14, height: 36, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  btnPrimary: { paddingHorizontal: 16, height: 36, borderRadius: 14, backgroundColor: Colors.accent, justifyContent: 'center' },
  btnPrimaryText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  dangerText: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  disabled: { opacity: 0.5 },
  keyGroup: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 2 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
  keys: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, backgroundColor: Colors.background, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, fontVariant: ['tabular-nums'] },
});
