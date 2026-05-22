import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import type * as Notifications from 'expo-notifications';
import {
  scheduleCustomReminder,
  cancelNotification,
  getAllCustomReminders,
} from '../../lib/notifications';

interface ReminderItem {
  id: string;
  title: string;
  scheduledDate: string;
}

function toReminderItems(requests: Notifications.NotificationRequest[]): ReminderItem[] {
  return requests.map((r) => ({
    id: r.identifier,
    title: r.content.title ?? '',
    scheduledDate: (r.content.data?.scheduledDate as string) ?? '',
  }));
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nextHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(nextHour);

  const refresh = useCallback(async () => {
    const requests = await getAllCustomReminders();
    setReminders(toReminderItems(requests));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function handleAdd() {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter a reminder title.');
      return;
    }
    if (date <= new Date()) {
      Alert.alert('Invalid time', 'Please choose a time in the future.');
      return;
    }
    await scheduleCustomReminder(date, title.trim(), '');
    setTitle('');
    setDate(nextHour());
    setModalVisible(false);
    await refresh();
  }

  async function handleDelete(id: string) {
    await cancelNotification(id);
    await refresh();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.heading}>Reminders</Text>

      <FlatList
        data={reminders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={reminders.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={styles.empty}>No reminders yet.{'\n'}Tap + to add one.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowDate}>{formatDate(item.scheduledDate)}</Text>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={20} color="#bbb" />
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modal, { paddingTop: insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Reminder</Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Reminder title"
            placeholderTextColor="#bbb"
            value={title}
            onChangeText={setTitle}
            returnKeyType="done"
          />

          <Text style={styles.label}>Date &amp; Time</Text>
          <DateTimePicker
            value={date}
            mode="datetime"
            display="spinner"
            minimumDate={new Date()}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              if (selected) setDate(selected);
            }}
            textColor="#333"
          />

          <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
            <Text style={styles.addButtonText}>Add Reminder</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const BRAND = '#D97652';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF8F5' },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: { color: '#bbb', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  rowDate: { fontSize: 13, color: '#999' },
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  modal: {
    flex: 1,
    backgroundColor: '#FAF8F5',
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  modalClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 24,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  addButton: {
    backgroundColor: BRAND,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  addButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
