import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey } from '../../lib/kanban';
import { splitThoughts, rowId } from '../../lib/thoughts';
import { loadBrainDumpItems, loadLists, loadTasks } from '../../lib/storage';
import { listCounts, listEmojiOf, resolveSelectedList, tasksInList } from '../../lib/lists';
import { formatTotals, isOverEstimate, plannedText, totalsOf } from '../../lib/taskTotals';
import { createTaskIn } from '../../lib/taskCommands';
import { loadLabels } from '../../lib/labels';
import { labelColor } from '../../lib/labelColors';
import { setTaskCompleted } from '../../lib/taskActions';
import TaskCard from './TaskCard';
import MissedButton from './MissedButton';
import AddTaskBox from './AddTaskBox';
import { matchesLabels, type TaskFilter } from '../../lib/taskFilter';
import { dumpAsTask, opsForDump, opsForTask } from './taskOps';
import { useDrag } from './DragProvider';
import usePaneScroll from './usePaneScroll';
import { taskDuration } from '../../lib/drag';
import type { BrainDumpItem, Project, Task, TaskList } from '../../lib/types';
import ListSwitcher from './ListSwitcher';
import { openDetail, useSelectedList } from './uiStore';
import { editDumpItem } from '../../lib/taskActions';
import { useTick } from './timerUi';
import { useFeature } from './featureStore';
import TemplatePicker from './TemplatePicker';

// Desktop Brain Dump (decision 009, product flow 2c): the thing you capture IS
// the task. Typing a thought and pressing Enter creates a Task straight away
// (title only, no Day). The list is every incomplete task with no Day, plus any
// legacy BrainDumpItems from the phone shown identically. Clicking anywhere on
// a row opens the editor (name, duration, label, notes, Day, Repeat);
// giving a task a Day moves it onto the week board, clearing the Day brings it
// back here. A collapsed "Done today" line lets a mistaken tick be undone.
// Drag (checkpoint 4): a row can be dragged onto a day column or a Timebox
// slot; the whole pane is the drop target that clears a card's or block's Day.
export default function BrainDumpPane({
  refreshKey,
  onChanged,
  filter,
}: {
  refreshKey: number;
  onChanged: () => void;
  filter: TaskFilter;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dumpItems, setDumpItems] = useState<BrainDumpItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const selectedRaw = useSelectedList();
  const templatesOn = useFeature('templates');
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
    loadLabels().then(setProjects);
    loadLists().then(setLists);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const todayKey = dateKey(new Date());
  // Only the label part of the filter applies here: the list already holds
  // just incomplete tasks, and Done today keeps its own line. A legacy phone
  // item has no label, so it shows with "No label" or with no label filter.
  // The list shown: a named list, or Brain Dump (the default, and the fallback
  // when the remembered list was deleted). Legacy phone items live in Brain Dump.
  const selected = resolveSelectedList(selectedRaw, lists);
  const counts = useMemo(() => listCounts(tasks, lists), [tasks, lists]);
  const { rows, doneToday } = useMemo(
    () =>
      splitThoughts(
        tasksInList(tasks, selected, lists).filter((t) => matchesLabels(t, filter)),
        selected === undefined ? dumpItems.filter((i) => matchesLabels({}, filter)) : [],
        todayKey,
        // A named list keeps its scheduled tasks, with their day and time (2.27.0).
        { includeDated: selected !== undefined },
      ),
    [tasks, dumpItems, todayKey, filter, selected, lists],
  );
  // The add task box's total (2.26.0): "5h planned" for what is still to do.
  const planned = useMemo(() => plannedText(rows.map((r) => (r.kind === 'task' ? r.task : dumpAsTask(r.item)))), [rows]);

  async function untick(task: Task) {
    await setTaskCompleted(task, false);
    onChanged();
  }

  return (
    <View ref={paneRef as never} style={[styles.pane, isTarget && styles.paneTarget]}>
      <View style={styles.headRow}>
        <ListSwitcher lists={lists} counts={counts} selected={selected} />
        <MissedButton refreshKey={refreshKey} />
      </View>

      <View style={styles.captureRow}>
        <View style={styles.captureBox}>
          <AddTaskBox
            id="left"
            a11y="Capture a thought"
            autoFocus
            inputRef={captureRef}
            trailing={
              planned ? (
                <Text style={styles.planned} accessibilityLabel={`Estimated time still to do in this list: ${planned}`} {...({ dataSet: { planned: '1' } } as object)}>
                  {planned}
                </Text>
              ) : null
            }
            onAdd={async (title, extra) => {
              await createTaskIn(title, { listKey: selected, projectKey: extra.projectKey, durationMinutes: extra.durationMinutes });
              onChanged();
            }}
          />
        </View>
        {templatesOn && <TemplatePicker listKey={selected} refreshKey={refreshKey} onChanged={onChanged} />}
      </View>

      <ScrollView ref={scrollRef('left') as never} style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>
            {selected === undefined ? '🧠 Nothing waiting. Type above and press Enter; add the details later.' : '📋 This list is empty. Type above and press Enter to add to it.'}
          </Text>
        ) : (
          rows.map((row, index) => {
            const id = rowId(row);
            const task = row.kind === 'task' ? row.task : dumpAsTask(row.item);
            const proj = projects.find((p) => p.key === task.projectKey);
            return (
              <TaskCard
                key={id}
                task={task}
                ops={row.kind === 'task' ? opsForTask(row.task) : opsForDump(row.item)}
                label={proj}
                color={labelColor(proj?.colorKey)}
                listEmoji={listEmojiOf(task, lists)}
                variant="row"
                todayKey={todayKey}
                showDay
                // A legacy phone item becomes a task on its first edit; opening it is that edit.
                onOpen={row.kind === 'dump' ? (focus) => editDumpItem(row.item, {}).then((t) => (onChanged(), openDetail(t.id, focus))) : undefined}
                onChanged={onChanged}
                divider={false}
                dragging={drag?.item.id === id}
                nodeRef={sourceRef(`row:${id}`, () => ({
                  kind: 'row',
                  task: row.kind === 'task' ? row.task : undefined,
                  item: row.kind === 'dump' ? row.item : undefined,
                  id,
                  title: task.title,
                  emoji: task.emoji,
                  duration: row.kind === 'task' ? taskDuration(row.task) : 30,
                }))}
              />
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
                <View key={t.id} style={styles.doneRow}>
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
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Inside the sidebar (2.26.0): no frame of its own.
  pane: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 2,
    minWidth: 0,
    borderRadius: 12,
  },
  paneLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginLeft: -10 },
  totals: { fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  totalsOver: { color: Colors.accentText, fontWeight: '700' },
  captureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 },
  captureBox: { flex: 1, minWidth: 0, marginBottom: -10 },
  capturePlus: { fontSize: 14, color: Colors.textSecondary, width: 16, textAlign: 'center' },
  captureInput: {
    flex: 1,
    height: 40,
    minWidth: 0,
    color: Colors.textPrimary,
    fontSize: 14,
    outlineStyle: 'none',
  } as object,
  addBtn: { height: 28, paddingHorizontal: 10, borderRadius: 8, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 12, fontWeight: '700', color: Colors.onAccent },
  planned: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, backgroundColor: Colors.surfaceRaised, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontVariant: ['tabular-nums'] },
  list: { flex: 1 },
  // 2.26.0: cards 10 px apart, with room for their shadow.
  listContent: { gap: 10, padding: 2, paddingBottom: 12 },
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
  paneTarget: { backgroundColor: Colors.background },
  dragging: { opacity: 0.4 },
  check: { paddingTop: 1 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, color: Colors.textPrimary },
  titleLow: { color: Colors.textSecondary },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  labelTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chip: {
    fontSize: 12,
    fontWeight: '500',
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
