import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../lib/theme';
import { sortTasksForDisplay } from '../lib/data';
import { loadTasks, addTask, updateTask, loadProjects } from '../lib/storage';
import TaskFormModal from './components/TaskForm';
import type { Project, Task } from '../lib/types';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDueDateKey(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [captureText, setCaptureText] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      loadTasks().then(setTasks);
      loadProjects().then(setProjects);
    }, []),
  );

  async function handleCapture() {
    const trimmed = captureText.trim();
    if (!trimmed) return;
    await addTask({ id: generateId(), title: trimmed, completed: false, createdAt: new Date().toISOString() });
    setCaptureText('');
    loadTasks().then(setTasks);
    inputRef.current?.focus();
  }

  async function toggleTask(task: Task) {
    await updateTask({
      ...task,
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : undefined,
    });
    loadTasks().then(setTasks);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setFormVisible(true);
  }

  function handleFormClose() {
    setFormVisible(false);
    setEditTask(undefined);
  }

  function handleSaved() {
    setFormVisible(false);
    setEditTask(undefined);
    loadTasks().then(setTasks);
  }

  const filteredTasks = projectFilter
    ? tasks.filter((t) => t.projectKey === projectFilter)
    : tasks;
  const sorted = sortTasksForDisplay(filteredTasks);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
        <Text style={styles.title}>Tasks</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.captureRow}>
        <TextInput
          ref={inputRef}
          style={styles.captureInput}
          placeholder="Add a task…"
          placeholderTextColor={Colors.textSecondary}
          value={captureText}
          onChangeText={setCaptureText}
          onSubmitEditing={handleCapture}
          returnKeyType="done"
          accessibilityLabel="Add a task"
        />
        <TouchableOpacity
          style={[styles.captureBtn, !captureText.trim() && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={!captureText.trim()}
          accessibilityLabel="Add task"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={24} color={Colors.onAccent} />
        </TouchableOpacity>
      </View>

      {projects.length > 0 && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, !projectFilter && styles.filterChipSelected]}
            onPress={() => setProjectFilter(undefined)}
            accessibilityLabel="All projects"
            accessibilityRole="button"
          >
            <Text style={[styles.filterChipText, !projectFilter && styles.filterChipTextSelected]}>All</Text>
          </TouchableOpacity>
          {projects.map((project) => {
            const selected = projectFilter === project.key;
            return (
              <TouchableOpacity
                key={project.key}
                style={[styles.filterChip, selected && styles.filterChipSelected]}
                onPress={() => setProjectFilter(project.key)}
                accessibilityLabel={project.name}
                accessibilityRole="button"
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                  {project.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {sorted.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No tasks yet</Text>
          <Text style={styles.emptyStateSubtext}>Type above to add your first task</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(t) => t.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Pressable
              style={({ pressed }) => [
                styles.taskRow,
                index === sorted.length - 1 && styles.taskRowLast,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => openEdit(item)}
              accessibilityLabel={item.title}
              accessibilityHint="Tap to edit"
            >
              <TouchableOpacity
                onPress={() => toggleTask(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={item.completed ? 'Mark incomplete' : 'Mark complete'}
                accessibilityRole="button"
              >
                <Ionicons
                  name={item.completed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={item.completed ? Colors.accent : Colors.textSecondary}
                />
              </TouchableOpacity>

              {!item.completed && item.priority === 'high' && (
                <Ionicons name="flag" size={12} color={Colors.accentText} style={styles.taskFlag} />
              )}
              {item.origin === 'dump' && <Text style={styles.taskOrigin}>🧠</Text>}

              <Text
                style={[
                  styles.taskTitle,
                  item.completed && styles.taskTitleDone,
                  !item.completed && item.priority === 'low' && styles.taskTitleLow,
                ]}
                numberOfLines={2}
              >
                {item.title}
              </Text>

              {!!item.dueDate && !item.completed && (
                <Text style={styles.taskDue}>{formatDueDateKey(item.dueDate)}</Text>
              )}
            </Pressable>
          )}
        />
      )}

      <TaskFormModal
        visible={formVisible}
        onClose={handleFormClose}
        onSaved={handleSaved}
        editTask={editTask}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  captureInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  captureBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnDisabled: {
    opacity: 0.5,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipSelected: {
    backgroundColor: Colors.accent + '22',
    borderColor: Colors.accent,
  },
  filterChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterChipTextSelected: {
    color: Colors.accentText,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  taskRowLast: {
    borderBottomWidth: 0,
  },
  taskFlag: {
    marginLeft: -2,
  },
  taskOrigin: {
    fontSize: 14,
  },
  taskTitle: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  taskTitleDone: {
    color: Colors.textSecondary,
  },
  taskTitleLow: {
    color: Colors.textSecondary,
  },
  taskDue: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    opacity: 0.7,
  },
});
