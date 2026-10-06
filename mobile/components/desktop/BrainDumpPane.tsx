import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey, formatDuration } from '../../lib/kanban';
import { splitThoughts, rowId, type ThoughtRow } from '../../lib/thoughts';
import { loadBrainDumpItems, loadProjects, loadTasks } from '../../lib/storage';
import { convertDumpItem, createThought, setTaskCompleted } from '../../lib/taskActions';
import HoverPressable from './HoverPressable';
import { useDrag } from './DragProvider';
import usePaneScroll from './usePaneScroll';
import { taskDuration } from '../../lib/drag';
import type { BrainDumpItem, Project, Task } from '../../lib/types';

// Desktop Brain Dump (decision 009, product flow 2c): the thing you capture IS
// the task. Typing a thought and pressing Enter creates a Task straight away
// (title only, no Day). The list is every incomplete task with no Day, plus any
// legacy BrainDumpItems from the phone shown identically. Clicking anywhere on
// a row opens the editor (name, duration, priority, label, notes, Day, Repeat);
// giving a task a Day moves it onto the week board, clearing the Day brings it
// back here. A collapsed "Done today" line lets a mistaken tick be undone.
// Drag (checkpoint 4): a row can be dragged onto a day column or a Timebox
// slot; the whole pane is the drop target that clears a card's or block's Day.
export default function BrainDumpPane({
  refreshKey,
  onChanged,
  onEditTask,
  onEditDump,
}: {
  refreshKey: number;
  onChanged: () => void;
  onEditTask: (task: Task) => void;
  onEditDump: (item: BrainDumpItem) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dumpItems, setDumpItems] = useState<BrainDumpItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [captureText, setCaptureText] = useState('');
  const [doneOpen, setDoneOpen] = useState(false);
  const captureRef = useRef<TextInput>(null);
  const { drag, registerZone, sourceRef } = useDrag();
  const scrollRef = usePaneScroll();
  const paneRef = useCallback(
    (node: unknown) => registerZone('left', node ? { kind: 'left', node: node as HTMLElement } : null),
    [registerZone],
  );
  // Highlighted while a card or block is over it (dropping clears its Day).
  const isTarget = !!drag && drag.mode === 'move' && drag.item.kind !== 'row' && drag.target?.kind === 'left';

  const reload = useCallback(() => {
    loadTasks().then(setTasks);
    loadBrainDumpItems().then(setDumpItems);
    loadProjects().then(setProjects);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const todayKey = dateKey(new Date());
  const { rows, doneToday } = useMemo(() => splitThoughts(tasks, dumpItems, todayKey), [tasks, dumpItems, todayKey]);
  const projectName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.key, p.name);
    return map;
  }, [projects]);

  async function handleCapture() {
    if (!captureText.trim()) return;
    await createThought(captureText);
    setCaptureText('');
    onChanged();
    captureRef.current?.focus();
  }

  async function tick(row: ThoughtRow) {
    if (row.kind === 'task') await setTaskCompleted(row.task, true);
    else await convertDumpItem(row.item, { completed: true, completedAt: new Date().toISOString() });
    onChanged();
  }

  async function untick(task: Task) {
    await setTaskCompleted(task, false);
    onChanged();
  }

  return (
    <View ref={paneRef as never} style={[styles.pane, isTarget && styles.paneTarget]}>
      <Text style={styles.paneLabel}>BRAIN DUMP</Text>

      <View style={styles.captureRow}>
        <TextInput
          ref={captureRef}
          style={styles.captureInput}
          placeholder="What needs doing?"
          placeholderTextColor={Colors.textSecondary}
          value={captureText}
          onChangeText={setCaptureText}
          onSubmitEditing={handleCapture}
          accessibilityLabel="Capture a thought"
          autoFocus
        />
        <Pressable
          style={[styles.addBtn, !captureText.trim() && styles.addBtnDisabled]}
          onPress={handleCapture}
          disabled={!captureText.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add"
        >
          <Ionicons name="add" size={20} color={Colors.onAccent} />
        </Pressable>
      </View>

      <ScrollView ref={scrollRef('left') as never} style={styles.list} showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>Nothing waiting. Type above and press Enter; add the details later.</Text>
        ) : (
          rows.map((row, index) => {
            const id = rowId(row);
            const task = row.kind === 'task' ? row.task : undefined;
            const title = row.kind === 'task' ? row.task.title : row.item.title;
            const duration = task ? formatDuration(task.durationMinutes) : undefined;
            const label = task?.projectKey ? projectName.get(task.projectKey) : undefined;
            return (
              <HoverPressable
                key={id}
                nodeRef={sourceRef(`row:${id}`, () => ({
                  kind: 'row',
                  task,
                  item: row.kind === 'dump' ? row.item : undefined,
                  id,
                  title,
                  duration: task ? taskDuration(task) : 30,
                }))}
                onPress={() => (row.kind === 'task' ? onEditTask(row.task) : onEditDump(row.item))}
                style={[styles.row, index > 0 && styles.rowDivider, drag?.item.id === id && styles.dragging]}
                hoverStyle={styles.rowHover}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${title}`}
              >
                {(hovered) => (
                  <>
                <Pressable
                  onPress={() => tick(row)}
                  style={styles.check}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${title} complete`}
                >
                  <Ionicons name="ellipse-outline" size={20} color={Colors.textSecondary} />
                </Pressable>

                <View style={styles.body}>
                  <Text style={[styles.title, task?.priority === 'low' && styles.titleLow]}>{title}</Text>
                  {task && (task.priority === 'high' || label || duration || task.recurrence) && (
                    <View style={styles.meta}>
                      {task.priority === 'high' && <Ionicons name="flag" size={11} color={Colors.accentText} />}
                      {label && <Text style={styles.metaText}>{label}</Text>}
                      {duration && <Text style={styles.chip}>{duration}</Text>}
                      {task.recurrence && <Ionicons name="repeat" size={13} color={Colors.textSecondary} />}
                    </View>
                  )}
                </View>

                {/* Affordance only: the whole row is the click target. */}
                <View style={styles.pencil} pointerEvents="none">
                  {hovered && <Ionicons name="pencil" size={14} color={Colors.textSecondary} />}
                </View>
                  </>
                )}
              </HoverPressable>
            );
          })
        )}
      </ScrollView>

      {doneToday.length > 0 && (
        <View style={styles.doneSection}>
          <Pressable
            onPress={() => setDoneOpen((o) => !o)}
            style={styles.doneHeader}
            accessibilityRole="button"
            accessibilityLabel={doneOpen ? 'Hide done today' : 'Show done today'}
          >
            <Ionicons name={doneOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={Colors.textSecondary} />
            <Text style={styles.doneHeaderText}>Done today ({doneToday.length})</Text>
          </Pressable>
          {doneOpen && (
            <ScrollView style={styles.doneList} showsVerticalScrollIndicator={false}>
              {doneToday.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => onEditTask(t)}
                  style={styles.doneRow}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${t.title}`}
                >
                  <Pressable
                    onPress={() => untick(t)}
                    style={styles.check}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${t.title} incomplete`}
                  >
                    <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
                  </Pressable>
                  <Text style={styles.doneTitle} numberOfLines={2}>
                    {t.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    minWidth: 0,
  },
  paneLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary },
  captureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 8 },
  captureInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: 14,
    outlineColor: Colors.accent,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  list: { flex: 1 },
  empty: { marginTop: 12, fontSize: 14, color: Colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 8,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowHover: { backgroundColor: Colors.background },
  paneTarget: { borderColor: Colors.accent, backgroundColor: Colors.background },
  dragging: { opacity: 0.4 },
  check: { paddingTop: 1 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, color: Colors.textPrimary },
  titleLow: { color: Colors.textSecondary },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  chip: {
    fontSize: 11,
    color: Colors.textSecondary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  pencil: { width: 18, paddingTop: 3, alignItems: 'center' },
  doneSection: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    maxHeight: '40%',
  },
  doneHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 4 },
  doneHeaderText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  doneList: { flexGrow: 0 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 4 },
  doneTitle: { flex: 1, fontSize: 13, color: Colors.textSecondary, textDecorationLine: 'line-through' },
});
