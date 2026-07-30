import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { addRoutine, updateRoutine, deleteRoutine } from '../../lib/storage';
import type { Routine, TimeOfDay } from '../../lib/types';

const TIME_OF_DAY_CHOICES: TimeOfDay[] = ['morning', 'afternoon', 'evening'];
const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RoutineFormContentProps {
  onClose: () => void;
  onSaved: () => void;
  editRoutine?: Routine;
}

// Bare form content, same split as EventForm/AddEventModal — a caller
// that needs it inside its own sheet (none yet) can use this directly;
// RoutineFormModal below is the standalone pageSheet wrapper Today uses.
export function RoutineFormContent({ onClose, onSaved, editRoutine }: RoutineFormContentProps) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning');
  const isEditing = !!editRoutine;
  const canSave = title.trim().length > 0;

  useEffect(() => {
    if (editRoutine) {
      setTitle(editRoutine.title);
      setTimeOfDay(editRoutine.timeOfDay);
    } else {
      setTitle('');
      setTimeOfDay('morning');
    }
  }, [editRoutine?.id]);

  function reset() {
    setTitle('');
    setTimeOfDay('morning');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSave() {
    if (!canSave) return;
    if (isEditing && editRoutine) {
      await updateRoutine({ ...editRoutine, title: title.trim(), timeOfDay });
    } else {
      await addRoutine({
        id: generateId(),
        title: title.trim(),
        timeOfDay,
        createdAt: new Date().toISOString(),
      });
    }
    reset();
    onSaved();
  }

  function handleDelete() {
    if (!editRoutine) return;
    Alert.alert(
      'Delete Routine',
      'Are you sure you want to delete this routine?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRoutine(editRoutine.id);
            reset();
            onSaved();
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit routine' : 'New routine'}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.titleInput}
          placeholder="What's the routine?"
          placeholderTextColor={Colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          returnKeyType="done"
          autoFocus={!isEditing}
        />

        <Text style={styles.label}>Time of day</Text>
        <View style={styles.chipRow}>
          {TIME_OF_DAY_CHOICES.map((choice) => {
            const selected = timeOfDay === choice;
            return (
              <TouchableOpacity
                key={choice}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setTimeOfDay(choice)}
                accessibilityLabel={TIME_OF_DAY_LABELS[choice]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {TIME_OF_DAY_LABELS[choice]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isEditing && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            activeOpacity={0.7}
            accessibilityLabel="Delete routine"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={18} color={Colors.danger} style={{ marginRight: 8 }} />
            <Text style={styles.deleteText}>Delete routine</Text>
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }} />

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} accessibilityLabel="Cancel" accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            accessibilityLabel={isEditing ? 'Save changes' : 'Save routine'}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{isEditing ? 'Save changes' : 'Save routine'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

interface RoutineFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editRoutine?: Routine;
}

export default function RoutineFormModal({ visible, onClose, onSaved, editRoutine }: RoutineFormModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      {visible && (
        <RoutineFormContent onClose={onClose} onSaved={onSaved} editRoutine={editRoutine} />
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
  titleInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.3,
    marginBottom: 8,
    marginTop: 16,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.accent + '22',
    borderColor: Colors.accent,
  },
  chipText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    color: Colors.accentText,
    fontWeight: '600',
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
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: Colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});
