import { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { createCustomEvent, durationMinutes, formatDateKey } from '../../lib/data';
import { addCustomEvent, updateCustomEvent, deleteCustomEvent } from '../../lib/storage';
import type { CustomEvent } from '../../lib/types';

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatEventDate(d: Date): string {
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

function parseDateKey(key: string): Date {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function toTimeDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(mins: number): string {
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function now(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
}

interface EventFormProps {
  date: Date;
  onClose: () => void;
  onSaved: (event: CustomEvent) => void;
  editEvent?: CustomEvent;
}

// Bare form content, no Modal of its own — the caller decides how it's
// presented. AddEventModal below wraps this in its own pageSheet for
// screens (today.tsx) that just need a single, standalone form modal.
// calendar.tsx renders this directly inside its own unified pageSheet
// instead, swapping it in for the day-detail view without closing and
// reopening a separate Modal (which is what caused the onDismiss chaining
// this component used to need).
export function EventForm({ date, onClose, onSaved, editEvent }: EventFormProps) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [icon, setIcon] = useState('');
  const [eventDate, setEventDate] = useState<Date>(date);
  const [startDate, setStartDate] = useState(now);
  const [endDate, setEndDate] = useState(() => {
    const d = now();
    d.setMinutes(d.getMinutes() + 1);
    return d;
  });
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  // True once the user has manually changed end time this session;
  // prevents start-change from silently overwriting a deliberate end time.
  const endTouched = useRef(false);

  // EventForm is always conditionally mounted by its caller (mounted only
  // while actually shown), so populating on mount/editEvent-change is
  // enough — no separate "visible" flag needed here.
  useEffect(() => {
    if (editEvent) {
      setTitle(editEvent.title);
      setCategory(editEvent.category);
      setIcon(editEvent.icon || '');
      setEventDate(parseDateKey(editEvent.date));
      setStartDate(toTimeDate(editEvent.start));
      setEndDate(toTimeDate(editEvent.end));
      setNotes(editEvent.notes || '');
      // Treat the existing end time as manually set so start changes don't override it
      endTouched.current = true;
    } else {
      setEventDate(date);
      endTouched.current = false;
    }
  }, [editEvent?.id]);

  const startHHMM = dateToHHMM(startDate);
  const endHHMM = dateToHHMM(endDate);
  const duration = durationMinutes(startHHMM, endHHMM);
  const isEditing = !!editEvent;

  function reset() {
    setTitle('');
    setCategory('');
    setIcon('');
    setEventDate(date);
    setStartDate(now());
    const d = now();
    d.setMinutes(d.getMinutes() + 1);
    setEndDate(d);
    setNotes('');
    setShowDatePicker(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    endTouched.current = false;
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter an event title.');
      return;
    }
    if (duration <= 0) {
      Alert.alert('Invalid time', 'End time must be after start time.');
      return;
    }

    if (isEditing && editEvent) {
      const updated: CustomEvent = {
        ...editEvent,
        title: title.trim(),
        category: category.trim() || 'free',
        icon: icon.trim() || '📌',
        start: startHHMM,
        end: endHHMM,
        notes: notes.trim(),
        date: formatDateKey(eventDate),
      };
      await updateCustomEvent(updated);
      reset();
      onSaved(updated);
    } else {
      const event = createCustomEvent({
        title: title.trim(),
        category: category.trim() || 'free',
        icon: icon.trim() || '📌',
        start: startHHMM,
        end: endHHMM,
        notes: notes.trim(),
        date: formatDateKey(eventDate),
      });
      await addCustomEvent(event);
      reset();
      onSaved(event);
    }
  }

  async function handleDelete() {
    if (!editEvent) return;
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCustomEvent(editEvent.id);
            reset();
            onSaved(editEvent);
          },
        },
      ],
    );
  }

  function handleDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) {
      // Preserve only the date portion — zero out time so it doesn't affect dateKey
      const d = new Date(selected);
      d.setHours(0, 0, 0, 0);
      setEventDate(d);
    }
  }

  function handleStartChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowStartPicker(false);
    if (selected) {
      setStartDate(selected);
      if (!endTouched.current) {
        const autoEnd = new Date(selected);
        autoEnd.setMinutes(autoEnd.getMinutes() + 1);
        setEndDate(autoEnd);
      }
    }
  }

  function handleEndChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowEndPicker(false);
    if (selected) {
      endTouched.current = true;
      if (selected <= startDate) {
        const corrected = new Date(startDate);
        corrected.setMinutes(corrected.getMinutes() + 1);
        setEndDate(corrected);
      } else {
        setEndDate(selected);
      }
    }
  }

  return (
    <>
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Event' : 'New Event'}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Event Title</Text>
          <TextInput
            style={styles.input}
            placeholder="What are you doing?"
            placeholderTextColor={Colors.textSecondary}
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
          />

          <Text style={styles.label}>Category</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. work, fitness, routine…"
            placeholderTextColor={Colors.textSecondary}
            value={category}
            onChangeText={setCategory}
            returnKeyType="next"
          />

          <Text style={styles.label}>Emoji Icon</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 💼"
            placeholderTextColor={Colors.textSecondary}
            value={icon}
            onChangeText={setIcon}
            returnKeyType="next"
          />

          <Text style={styles.label}>Date</Text>
          <TouchableOpacity
            style={styles.timeRow}
            onPress={() => {
              setShowDatePicker(true);
              setShowStartPicker(false);
              setShowEndPicker(false);
            }}
          >
            <Text style={styles.timeText}>{formatEventDate(eventDate)}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={eventDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
              textColor={Colors.textPrimary}
            />
          )}

          <Text style={styles.label}>Start Time</Text>
          <TouchableOpacity
            style={styles.timeRow}
            onPress={() => {
              setShowStartPicker(true);
              setShowDatePicker(false);
              setShowEndPicker(false);
            }}
          >
            <Text style={styles.timeText}>{startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
          {showStartPicker && (
            <DateTimePicker
              value={startDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleStartChange}
              textColor={Colors.textPrimary}
            />
          )}

          <Text style={styles.label}>End Time</Text>
          <TouchableOpacity
            style={styles.timeRow}
            onPress={() => {
              setShowEndPicker(true);
              setShowDatePicker(false);
              setShowStartPicker(false);
            }}
          >
            <Text style={styles.timeText}>{endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
          {showEndPicker && (
            <DateTimePicker
              value={endDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleEndChange}
              textColor={Colors.textPrimary}
            />
          )}

          <View style={styles.durationRow}>
            <Text style={styles.durationLabel}>Duration</Text>
            <Text style={styles.durationValue}>{formatDuration(duration)}</Text>
          </View>

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Optional notes…"
            placeholderTextColor={Colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {isEditing && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              activeOpacity={0.7}
              accessibilityLabel="Delete event"
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={18} color={Colors.danger} style={{ marginRight: 8 }} />
              <Text style={styles.deleteText}>Delete Event</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleClose}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            accessibilityLabel={isEditing ? 'Save changes' : 'Save event'}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{isEditing ? 'Save Changes' : 'Save Event'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

interface Props {
  visible: boolean;
  date: Date;
  onClose: () => void;
  onSaved: (event: CustomEvent) => void;
  editEvent?: CustomEvent;
}

// Standalone form modal, used where the form isn't part of a larger
// unified sheet (e.g. today.tsx's own add/edit flow, which has no
// day-detail step to chain with).
export default function AddEventModal({ visible, date, onClose, onSaved, editEvent }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      {visible && (
        <EventForm date={date} onClose={onClose} onSaved={onSaved} editEvent={editEvent} />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    paddingBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  timeRow: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 4,
  },
  durationLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  durationValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.accent,
  },
  notesInput: {
    minHeight: 80,
    paddingTop: 14,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger + '60',
    backgroundColor: Colors.danger + '15',
  },
  deleteText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
