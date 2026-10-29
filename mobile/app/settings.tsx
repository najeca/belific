import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useTheme, useThemed } from '../components/phone/theme';
import { Segmented } from '../components/phone/chrome';
import Toggle from '../components/Toggle';
import { type } from '../components/phone/type';
import { THEME_MODE_LABEL, THEME_MODES, type ThemeMode } from '../lib/themeMode';
import type { ColorTokens } from '../lib/tokens';
import {
  clearAllData,
  loadNotificationsEnabled,
  saveNotificationsEnabled,
  loadCustomEventsForDate,
} from '../lib/storage';
import {
  cancelEventNotifications,
  scheduleEventNotifications,
} from '../lib/notifications';
import {
  getWeeklyEventsForDate,
  customToScheduleEvent,
  timeToMinutes,
  formatDateKey,
} from '../lib/data';
import { seedOwnerSchedule } from '../lib/ownerSeed';
import { supabase } from '../lib/supabase';
import { signInWithApple, signOut, deleteAccount } from '../lib/auth';
import { phoneGoogle } from '../lib/phoneGoogleAuth';
import RoutineConvertSection from './components/RoutineConvertSection';
import CalendarsSection from './components/CalendarsSection';
import { usePhonePref } from '../components/phone/prefs';
import { refreshTaskReminders } from '../components/phone/reminderScheduler';
import type { Session } from '@supabase/supabase-js';

// Read from app.json's expo.version at runtime rather than hardcoded —
// this was previously a literal "1.0.0" string that never reflected
// actual version bumps.
const APP_VERSION = Constants.expoConfig?.version ?? '—';

export default function SettingsScreen() {
  const { c: Colors, mode, setMode } = useTheme();
  const styles = useThemed(make);
  const [showStreaks, setShowStreaks] = usePhonePref('showStreaks');
  const [remindTasks, setRemindTasks] = usePhonePref('remindTasks');
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showSettingsPrompt, setShowSettingsPrompt] = useState(false);
  const [ownerVisible, setOwnerVisible] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const ownerTapCount = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [google, setGoogle] = useState(phoneGoogle.getState());

  useEffect(() => {
    async function checkPermissions() {
      const stored = await loadNotificationsEnabled();
      if (stored) {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          setNotificationsEnabled(false);
          setShowSettingsPrompt(true);
          await saveNotificationsEnabled(false);
        } else {
          setNotificationsEnabled(true);
          setShowSettingsPrompt(false);
        }
      } else {
        setNotificationsEnabled(false);
        setShowSettingsPrompt(false);
      }
    }
    checkPermissions();
  }, []);

  // Accounts are entirely optional (see the accounts plan) — this just
  // reflects whatever session already exists, never requires one. Live
  // subscription keeps this in sync with sign-in/out/delete happening
  // from this same screen without a manual reload.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Google sign in (system browser): its waiting state and fixed messages.
  useEffect(() => phoneGoogle.subscribe(setGoogle), []);

  async function handleSignIn() {
    setAuthBusy(true);
    try {
      await signInWithApple();
    } catch (e) {
      // Apple's own sheet already communicates a user-initiated
      // cancellation — only surface a real failure.
      const code = (e as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', 'Could not sign in with Apple. Please try again.');
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setAuthBusy(true);
    try {
      await signOut();
    } catch {
      Alert.alert('Error', 'Could not sign out. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and every synced item on the server. Data on this device is not affected. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Second confirmation — irreversible and destroys server-side
            // data, warrants more friction than a single tap.
            Alert.alert(
              'Are you sure?',
              'This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Account',
                  style: 'destructive',
                  onPress: async () => {
                    setAuthBusy(true);
                    try {
                      await deleteAccount();
                    } catch {
                      Alert.alert('Error', 'Could not delete your account. Please try again.');
                    } finally {
                      setAuthBusy(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  async function handleNotificationsToggle(value: boolean) {
    setNotificationsEnabled(value);
    setShowSettingsPrompt(false);
    try {
      await saveNotificationsEnabled(value);
      if (!value) {
        await cancelEventNotifications();
      } else {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          setNotificationsEnabled(false);
          setShowSettingsPrompt(true);
          await saveNotificationsEnabled(false);
          return;
        }
        const today = new Date();
        const dateKey = formatDateKey(today);
        const template = getWeeklyEventsForDate(today);
        const custom = await loadCustomEventsForDate(dateKey);
        const customResolved = custom.map((e) => customToScheduleEvent(e));
        const merged = [...template, ...customResolved].sort(
          (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
        );
        const dayEntries: Array<{ events: typeof merged; date: Date }> = [
          { events: merged, date: today },
        ];
        for (let i = 1; i < 7; i++) {
          const futureDate = new Date(today);
          futureDate.setDate(today.getDate() + i);
          dayEntries.push({ events: getWeeklyEventsForDate(futureDate), date: futureDate });
        }
        await scheduleEventNotifications(dayEntries);
      }
    } catch {
      Alert.alert(
        'Notification error',
        'Could not update notification settings. Please try again.',
      );
      // Revert optimistic update
      const stored = await loadNotificationsEnabled();
      setNotificationsEnabled(stored);
    }
  }

  function handleOwnerTap() {
    ownerTapCount.current += 1;
    if (ownerTapCount.current >= 7) {
      ownerTapCount.current = 0;
      setOwnerVisible(true);
    }
  }

  async function handleSeedSchedule() {
    setIsSeeding(true);
    try {
      await seedOwnerSchedule();
      setOwnerVisible(false);
      Alert.alert('Schedule loaded.', 'Restart the app to see your full week.');
    } catch {
      Alert.alert('Error', 'Could not load schedule. Please try again.');
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleClearAll() {
    Alert.alert(
      'Clear All Data',
      'This will remove all custom events. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Alert.alert('Done', 'All data cleared.');
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Notifications section */}
        <Text style={styles.sectionHeader}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Daily Notifications</Text>
            <Toggle value={notificationsEnabled} onValueChange={handleNotificationsToggle} label="Daily Notifications" colors={Colors} />
          </View>
          {showSettingsPrompt && (
            <TouchableOpacity
              style={styles.settingsPromptRow}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.7}
              accessibilityLabel="Tap to enable notifications in Settings"
              accessibilityRole="button"
            >
              <Ionicons name="settings-outline" size={14} color={Colors.accentText} style={{ marginRight: 6 }} />
              <Text style={styles.settingsPromptText}>Tap to enable in Settings</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* On this iPhone (PLAN_phone P5): settings that stay on this phone, never synced. */}
        <Text style={styles.sectionHeader}>On this iPhone</Text>
        <View style={styles.card}>
          {/* The Theme (PLAN_phone P11): Light (the default), Dark or Match system, on this phone only. */}
          <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]} {...({ dataSet: { phoneTheme: mode } } as object)}>
            <Text style={styles.rowLabel}>Theme</Text>
            <Segmented<ThemeMode> a11y="Theme" value={mode} onChange={setMode} options={THEME_MODES.map((m) => ({ key: m, label: THEME_MODE_LABEL[m] }))} />
          </View>
          <View style={styles.row} {...({ dataSet: { phoneRemind: '1' } } as object)}>
            <Text style={styles.rowLabel}>Remind me on this device</Text>
            <Toggle
              value={remindTasks}
              onValueChange={(v) => {
                setRemindTasks(v);
                refreshTaskReminders();
              }}
              label="Remind me on this device"
              colors={Colors}
            />
          </View>
          <Text style={[styles.rowLabel, { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: 16, paddingBottom: 10 }]}>Reminders for timed tasks on this iPhone. Your computer has its own switch.</Text>
          <View style={styles.row} {...({ dataSet: { phoneStreaks: '1' } } as object)}>
            <Text style={styles.rowLabel}>Show streaks</Text>
            <Toggle value={showStreaks} onValueChange={setShowStreaks} label="Show streaks" colors={Colors} />
          </View>
        </View>

        {/* Account section — optional, app is fully usable signed out */}
        <Text style={styles.sectionHeader}>Account</Text>
        <View style={styles.card}>
          {session ? (
            <>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>Signed in as</Text>
                <Text style={styles.aboutValue} numberOfLines={1}>
                  {session.user.email ?? 'Apple ID'}
                </Text>
              </View>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.row}
                onPress={handleSignOut}
                disabled={authBusy}
                activeOpacity={0.7}
                accessibilityLabel="Sign out"
                accessibilityRole="button"
              >
                <Text style={styles.rowLabel}>Sign Out</Text>
                {authBusy && <ActivityIndicator size="small" color={Colors.textSecondary} />}
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.dangerRow}
                onPress={handleDeleteAccount}
                disabled={authBusy}
                activeOpacity={0.7}
                accessibilityLabel="Delete account"
                accessibilityRole="button"
              >
                <Ionicons name="person-remove-outline" size={18} color={Colors.danger} style={{ marginRight: 10 }} />
                <Text style={styles.dangerText}>Delete Account</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.row}
                onPress={handleSignIn}
                disabled={authBusy || google.busy}
                activeOpacity={0.7}
                accessibilityLabel="Sign in with Apple"
                accessibilityRole="button"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="logo-apple" size={18} color={Colors.textPrimary} style={{ marginRight: 10 }} />
                  <Text style={styles.rowLabel}>Sign in with Apple</Text>
                </View>
                {authBusy && <ActivityIndicator size="small" color={Colors.textSecondary} />}
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.row}
                onPress={() => (google.busy ? phoneGoogle.cancel() : phoneGoogle.start().catch(() => {}))}
                disabled={authBusy}
                activeOpacity={0.7}
                accessibilityLabel={google.busy ? 'Cancel Google sign in' : 'Sign in with Google'}
                accessibilityRole="button"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="logo-google" size={18} color={Colors.textPrimary} style={{ marginRight: 10 }} />
                  <Text style={styles.rowLabel}>{google.busy ? 'Cancel Google sign in' : 'Sign in with Google'}</Text>
                </View>
                {google.busy && <ActivityIndicator size="small" color={Colors.textSecondary} />}
              </TouchableOpacity>
              {google.message && <Text style={styles.authNote}>{google.message}</Text>}
            </>
          )}
        </View>

        {/* Calendars (build plan phase 8): the phone's own calendars and the feed link */}
        <CalendarsSection signedIn={!!session} />

        {/* Data section */}
        <Text style={styles.sectionHeader}>Data</Text>
        <View style={styles.card}>
          <RoutineConvertSection />
          <TouchableOpacity
            style={styles.dangerRow}
            onPress={handleClearAll}
            activeOpacity={0.7}
            accessibilityLabel="Clear all data"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={18} color={Colors.danger} style={{ marginRight: 10 }} />
            <Text style={styles.dangerText}>Clear All Data</Text>
          </TouchableOpacity>
        </View>

        {/* About section */}
        <Text style={styles.sectionHeader}>About</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App</Text>
            <Text style={styles.aboutValue}>Belific</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.aboutRow}
            onPress={handleOwnerTap}
            activeOpacity={1}
          >
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>{APP_VERSION}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Edition</Text>
            <Text style={styles.aboutValue}>Mobile</Text>
          </View>
        </View>

        {ownerVisible && (
          <>
            <Text style={styles.sectionHeader}>Owner</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.row}
                onPress={handleSeedSchedule}
                activeOpacity={0.7}
                disabled={isSeeding}
                accessibilityLabel="Load my schedule"
                accessibilityRole="button"
              >
                <Text style={[styles.rowLabel, { color: Colors.accentText }]}>
                  Load My Schedule
                </Text>
                {isSeeding && (
                  <ActivityIndicator size="small" color={Colors.accent} />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// The theme's colours (PLAN_phone P11): `Colors` here is the light or dark token set.
const make = (Colors: ColorTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    marginBottom: 20,
  },
  backBtn: {
    width: 44,
    height: 44,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The phone's big titles (P11): Newsreader, as on Today, Calendar and Tasks.
  title: {
    ...type.screenTitle,
    color: Colors.textPrimary,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 28,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowLabel: {
    fontSize: 16,
    color: Colors.textPrimary,
    flex: 1,
  },
  settingsPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  settingsPromptText: {
    fontSize: 13,
    color: Colors.accentText,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  dangerText: {
    fontSize: 16,
    color: Colors.danger,
    fontWeight: '600',
  },
  authNote: {
    fontSize: 13,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  aboutLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  aboutValue: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
});
