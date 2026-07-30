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
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import {
  PRIORITY_CHOICES,
  PRIORITY_LABELS,
  PRIORITY_DESCRIPTIONS,
  formatDateKey,
  type PriorityChoice,
} from '../../lib/data';
import {
  addTask,
  updateTask,
  deleteTask,
  loadProjects,
  addProject,
} from '../../lib/storage';
import type { EventPriority, Project, Task } from '../../lib/types';

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDueDate(d: Date): string {
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

function parseDateKey(key: string): Date {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, m - 1, day);
}

interface TaskFormContentProps {
  onClose: () => void;
  onSaved: () => void;
  editTask?: Task;
  // Prefills title without treating it as editing — used when promoting
  // a Brain Dump item via "Make Task".
  initialTitle?: string;
  // Set by the Dump "Make Task" path — tags the created Task's origin so
  // it renders with the 🧠 indicator, same as CustomEvent's origin field.
  // Ignored when editing (origin is decided at creation).
  origin?: 'dump';
}

export function TaskFormContent({ onClose, onSaved, editTask, initialTitle, origin }: TaskFormContentProps) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [priority, setPriority] = useState<PriorityChoice>('normal');
  const [projectKey, setProjectKey] = useState<string | undefined>(undefined);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isEditing = !!editTask;
  const canSave = title.trim().length > 0;

  useEffect(() => {
    loadProjects().then(setProjects);
  }, []);

  useEffect(() => {
    if (editTask) {
      setTitle(editTask.title);
      setDueDate(editTask.dueDate ? parseDateKey(editTask.dueDate) : null);
      setPriority(editTask.priority ?? 'normal');
      setProjectKey(editTask.projectKey);
    } else {
      setTitle(initialTitle ?? '');
      setDueDate(null);
      setPriority('normal');
      setProjectKey(undefined);
    }
    setShowDatePicker(false);
  }, [editTask?.id, initialTitle]);

  function reset() {
    setTitle('');
    setDueDate(null);
    setPriority('normal');
    setProjectKey(undefined);
    setShowDatePicker(false);
  }

  function handleAddProject() {
    Alert.prompt(
      'New Project',
      'What would you like to call it?',
      (name) => {
        const trimmed = name?.trim();
        if (!trimmed) return;
        const newProject: Project = { key: `project-${Date.now().toString(36)}`, name: trimmed };
        addProject(newProject).then(() => {
          setProjects((prev) => [...prev, newProject]);
          setProjectKey(newProject.key);
        });
      },
      'plain-text',
    );
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) {
      const d = new Date(selected);
      d.setHours(0, 0, 0, 0);
      setDueDate(d);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    const priorityField: EventPriority | undefined = priority === 'normal' ? undefined : priority;
    const dueDateField = dueDate ? formatDateKey(dueDate) : undefined;

    if (isEditing && editTask) {
      await updateTask({
        ...editTask,
        title: title.trim(),
        dueDate: dueDateField,
        priority: priorityField,
        projectKey,
      });
    } else {
      await addTask({
        id: generateId(),
        title: title.trim(),
        dueDate: dueDateField,
        priority: priorityField,
        projectKey,
        completed: false,
        createdAt: new Date().toISOString(),
        origin,
      });
    }
    reset();
    onSaved();
  }

  function handleDelete() {
    if (!editTask) return;
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTask(editTask.id);
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
          <Text style={styles.headerTitle}>{isEditing ? 'Edit task' : 'New task'}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.titleInput}
          placeholder="What needs doing?"
          placeholderTextColor={Colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          returnKeyType="done"
          autoFocus={!isEditing && !initialTitle}
        />

        <Text style={styles.label}>Due date</Text>
        <View style={styles.dueDateRow}>
          <TouchableOpacity
            style={styles.dueDateButton}
            onPress={() => setShowDatePicker(true)}
            accessibilityLabel={dueDate ? formatDueDate(dueDate) : 'No due date'}
            accessibilityRole="button"
          >
            <Text style={styles.timeText}>{dueDate ? formatDueDate(dueDate) : 'No due date'}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
          {dueDate && (
            <TouchableOpacity
              style={styles.clearDateBtn}
              onPress={() => setDueDate(null)}
              accessibilityLabel="Clear due date"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        {showDatePicker && (
          <DateTimePicker
            value={dueDate ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            textColor={Colors.textPrimary}
          />
        )}

        <Text style={styles.label}>Priority</Text>
        <View style={styles.priorityRow}>
          {PRIORITY_CHOICES.map((choice) => {
            const selected = priority === choice;
            return (
              <TouchableOpacity
                key={choice}
                style={[styles.priorityCard, selected && styles.priorityCardSelected]}
                onPress={() => setPriority(choice)}
                accessibilityLabel={`${PRIORITY_LABELS[choice]}: ${PRIORITY_DESCRIPTIONS[choice]}`}
                accessibilityRole="button"
              >
                <Text style={[styles.priorityCardLabel, selected && styles.priorityCardLabelSelected]}>
                  {PRIORITY_LABELS[choice]}
                </Text>
                <Text style={styles.priorityCardDescription}>{PRIORITY_DESCRIPTIONS[choice]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Project</Text>
        <View style={styles.categoryGrid}>
          <TouchableOpacity
            style={[styles.categoryChip, !projectKey && styles.categoryChipSelected]}
            onPress={() => setProjectKey(undefined)}
            accessibilityLabel="None"
            accessibilityRole="button"
          >
            <Text style={[styles.categoryChipText, !projectKey && styles.categoryChipTextSelected]}>None</Text>
          </TouchableOpacity>
          {projects.map((project) => {
            const selected = projectKey === project.key;
            return (
              <TouchableOpacity
                key={project.key}
                style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                onPress={() => setProjectKey(project.key)}
                accessibilityLabel={project.name}
                accessibilityRole="button"
              >
                <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>
                  {project.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.categoryChip}
            onPress={handleAddProject}
            accessibilityLabel="Add project"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={14} color={Colors.textSecondary} style={{ marginRight: 4 }} />
            <Text style={styles.categoryChipText}>Add</Text>
          </TouchableOpacity>
        </View>

        {isEditing && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            activeOpacity={0.7}
            accessibilityLabel="Delete task"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={18} color={Colors.danger} style={{ marginRight: 8 }} />
            <Text style={styles.deleteText}>Delete task</Text>
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
            accessibilityLabel={isEditing ? 'Save changes' : 'Save task'}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{isEditing ? 'Save changes' : 'Save task'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

interface TaskFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editTask?: Task;
  initialTitle?: string;
  origin?: 'dump';
}

export default function TaskFormModal({ visible, onClose, onSaved, editTask, initialTitle, origin }: TaskFormModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      {visible && (
        <TaskFormContent
          onClose={onClose}
          onSaved={onSaved}
          editTask={editTask}
          initialTitle={initialTitle}
          origin={origin}
        />
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
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dueDateButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearDateBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityCard: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  priorityCardSelected: {
    backgroundColor: Colors.accent + '22',
    borderColor: Colors.accent,
  },
  priorityCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  priorityCardLabelSelected: {
    color: Colors.accentText,
  },
  priorityCardDescription: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipSelected: {
    backgroundColor: Colors.accent + '22',
    borderColor: Colors.accent,
  },
  categoryChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  categoryChipTextSelected: {
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
