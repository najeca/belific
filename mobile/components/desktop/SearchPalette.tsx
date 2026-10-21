import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { formatShortDate, isDateKey } from '../../lib/kanban';
import { loadLabels } from '../../lib/labels';
import { loadLists, loadTasksRaw } from '../../lib/storage';
import { searchTasks } from '../../lib/taskSearch';
import type { Project, Task, TaskList } from '../../lib/types';
import { closeOverlay, requestReveal } from './uiStore';

// Search (Ctrl+K; build plan phase 3): type to find any task by its title,
// notes, subtasks, label or list. Up and Down choose, Enter shows the task where
// it lives (its week on the board, or its list on the left) and puts the
// keyboard on its card; a task that is hidden by the filter or finished opens
// its details instead. An overlay, not a screen; Escape closes it.
export default function SearchPalette() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    loadTasksRaw().then(setTasks);
    loadLabels().then(setLabels);
    loadLists().then(setLists);
    const before = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => input.current?.focus(), 20);
    return () => {
      clearTimeout(t);
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  const hits = useMemo(() => searchTasks(tasks, labels, lists, query), [tasks, labels, lists, query]);
  useEffect(() => setAt(0), [query]);

  function choose(task: Task) {
    closeOverlay();
    requestReveal({ taskId: task.id, dueDate: isDateKey(task.dueDate) ? task.dueDate : undefined, listKey: task.listKey });
  }

  return (
    <Pressable style={styles.scrim} onPress={closeOverlay} accessibilityLabel="Close search">
      <Pressable onPress={() => {}} style={styles.card} accessibilityLabel="Search tasks" {...({ role: 'dialog', 'aria-modal': true } as object)}>
        <TextInput
          ref={input}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="🔎 Search tasks, notes, labels and lists"
          placeholderTextColor={Colors.textSecondary}
          onKeyPress={(e) => {
            const key = (e.nativeEvent as { key?: string }).key;
            if (key === 'Escape') {
              (e as { stopPropagation?: () => void }).stopPropagation?.();
              closeOverlay();
            } else if (key === 'ArrowDown') {
              (e as { preventDefault?: () => void }).preventDefault?.();
              setAt((i) => Math.min(hits.length - 1, i + 1));
            } else if (key === 'ArrowUp') {
              (e as { preventDefault?: () => void }).preventDefault?.();
              setAt((i) => Math.max(0, i - 1));
            } else if (key === 'Enter' && hits[at]) {
              (e as { preventDefault?: () => void }).preventDefault?.();
              choose(hits[at].task);
            }
          }}
          accessibilityLabel="Search"
        />
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {query.trim() === '' ? (
            <Text style={styles.empty}>Type to search. Up and Down choose, Enter shows the task.</Text>
          ) : hits.length === 0 ? (
            <Text style={styles.empty}>Nothing found for “{query.trim()}”.</Text>
          ) : (
            hits.map((h, i) => {
              const t = h.task;
              const label = labels.find((l) => l.key === t.projectKey);
              const list = lists.find((l) => l.key === t.listKey && !l.deletedAt);
              const where = t.completed ? 'Done' : isDateKey(t.dueDate) ? formatShortDate(t.dueDate) : list ? `${list.emoji ?? '📋'} ${list.name}` : '🧠 Brain Dump';
              return (
                <Pressable
                  key={t.id}
                  onPress={() => choose(t)}
                  style={[styles.row, i === at && styles.rowOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: i === at }}
                  accessibilityLabel={`Show ${t.title}`}
                >
                  <Text style={[styles.title, t.completed && styles.done]} numberOfLines={1}>
                    {t.emoji ? `${t.emoji} ` : ''}
                    {t.title}
                  </Text>
                  {label ? <Text style={styles.meta} numberOfLines={1}>{label.emoji ?? '🏷️'} {label.name}</Text> : null}
                  <Text style={styles.meta}>{where}</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, alignItems: 'center', paddingTop: 100, backgroundColor: Colors.scrim },
  card: { width: 600, maxWidth: '92%', maxHeight: '70%', borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 8, alignSelf: 'center' },
  input: { height: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 16, outlineColor: Colors.accent },
  list: { flexGrow: 0 },
  empty: { fontSize: 13, color: Colors.textSecondary, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingHorizontal: 12, borderRadius: 10 },
  rowOn: { backgroundColor: Colors.background },
  title: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  done: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  meta: { fontSize: 12, color: Colors.textSecondary },
});
