import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Colors } from '../../lib/theme';
import { useTimerStore } from '../../lib/store';
import {
  clearAllData,
  loadNotificationsEnabled,
  saveNotificationsEnabled,
  loadCustomEventsForDate,
} from '../../lib/storage';
import {
  cancelEventNotifications,
  scheduleEventNotifications,
} from '../../lib/notifications';
import {
  getWeeklyEventsForDate,
  customToScheduleEvent,
  timeToMinutes,
  formatDateKey,
} from '../../lib/data';
import { seedOwnerSchedule } from '../../lib/ownerSeed';
import type { TimerSettings } from '../../lib/types';

type SettingKey = keyof TimerSettings;

interface SettingMeta {
  key: SettingKey;
  label: string;
  unit: string;
  min: number;
  max: number;
}

const POMODORO_SETTINGS: SettingMeta[] = [
  { key: 'focusDuration',          label: 'Focus Duration',           unit: 'min', min: 5,  max: 90 },
  { key: 'breakDuration',          label: 'Break Duration',           unit: 'min', min: 1,  max: 30 },
  { key: 'longBreakDuration',      label: 'Long Break',               unit: 'min', min: 5,  max: 60 },
  { key: 'sessionsUntilLongBreak', label: 'Sessions until long break', unit: '',    min: 1,  max: 10 },
];

function SettingRow({
  meta,
  value,
  onPress,
}: {
  meta: SettingMeta;
  value: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={meta.label}
      accessibilityRole="button"
    >
      <Text style={styles.rowLabel}>{meta.label}</Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>
          {value}{meta.unit ? ` ${meta.unit}` : ''}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const store = useTimerStore();
  const [editingKey, setEditingKey] = useState<SettingKey | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showSettingsPrompt, setShowSettingsPrompt] = useState(false);
  const [ownerVisible, setOwnerVisible] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const ownerTapCount = useRef(0);

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

  const editingMeta = editingKey
    ? POMODORO_SETTINGS.find(s => s.key === editingKey) ?? null
    : null;

  function openEdit(meta: SettingMeta) {
    setEditingKey(meta.key);
    setInputValue(String(store[meta.key]));
  }

  function handleSave() {
    if (!editingKey || !editingMeta) return;
    const num = parseInt(inputValue, 10);
    if (isNaN(num) || num < editingMeta.min || num > editingMeta.max) {
      Alert.alert(
        'Invalid value',
        `Please enter a number between ${editingMeta.min} and ${editingMeta.max}.`,
      );
      return;
    }
    store.update({ [editingKey]: num });
    setEditingKey(null);
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
        const customResolved = custom.map(customToScheduleEvent);
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
      'This will remove all custom events and reset timer settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            store.update({
              focusDuration: 25,
              breakDuration: 5,
              longBreakDuration: 15,
              sessionsUntilLongBreak: 4,
            });
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
        <Text style={styles.title}>Settings</Text>

        {/* Notifications section */}
        <Text style={styles.sectionHeader}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Daily Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={Colors.onAccent}
            />
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

        {/* Pomodoro section */}
        <Text style={styles.sectionHeader}>Pomodoro timer</Text>
        <View style={styles.card}>
          {POMODORO_SETTINGS.map((meta, i) => (
            <View key={meta.key}>
              <SettingRow
                meta={meta}
                value={store[meta.key]}
                onPress={() => openEdit(meta)}
              />
              {i < POMODORO_SETTINGS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* Data section */}
        <Text style={styles.sectionHeader}>Data</Text>
        <View style={styles.card}>
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
            <Text style={styles.aboutValue}>1.0.0</Text>
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

      {/* Edit modal */}
      <Modal
        visible={editingKey != null}
        animationType="fade"
        transparent
        onRequestClose={() => setEditingKey(null)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setEditingKey(null)}
        >
          <TouchableOpacity style={styles.editCard} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.editTitle}>{editingMeta?.label}</Text>
            {editingMeta && (
              <Text style={styles.editHint}>
                {editingMeta.min} – {editingMeta.max}{editingMeta.unit ? ` ${editingMeta.unit}` : ''}
              </Text>
            )}
            <TextInput
              style={styles.editInput}
              keyboardType="number-pad"
              value={inputValue}
              onChangeText={setInputValue}
              selectTextOnFocus
              autoFocus
            />
            <View style={styles.editButtons}>
              <TouchableOpacity
                style={styles.editCancelBtn}
                onPress={() => setEditingKey(null)}
                accessibilityLabel="Cancel"
                accessibilityRole="button"
              >
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editSaveBtn}
                onPress={handleSave}
                accessibilityLabel="Save"
                accessibilityRole="button"
              >
                <Text style={styles.editSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    paddingTop: 16,
    marginBottom: 28,
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
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    fontSize: 16,
    color: Colors.textSecondary,
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  editCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  editTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  editHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  editInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  editCancelBtn: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editCancelText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  editSaveBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editSaveText: {
    color: Colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});
