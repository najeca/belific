import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey, formatDuration } from '../../lib/kanban';
import { splitThoughts, rowId, type ThoughtRow } from '../../lib/thoughts';
import { loadBrainDumpItems, loadTasks } from '../../lib/storage';
import { loadLabels } from '../../lib/labels';
import { labelColor } from '../../lib/labelColors';
import { shortRepeat } from '../../lib/repeat';
import { getSyncStatus, subscribeSyncStatus, type PublicSyncStatus } from '../../lib/sync';
import { convertDumpItem, createThought, setTaskCompleted } from '../../lib/taskActions';
import TaskCard from './TaskCard';
import { dumpAsTask, opsForDump, opsForTask } from './taskOps';
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
  onOpenSettings,
}: {
  refreshKey: number;
  onChanged: () => void;
  onOpenSettings?: () => void;
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
    loadLabels().then(setProjects);
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
            const task = row.kind === 'task' ? row.task : dumpAsTask(row.item);
            const proj = projects.find((p) => p.key === task.projectKey);
            return (
              <TaskCard
                key={id}
                task={task}
                ops={row.kind === 'task' ? opsForTask(row.task) : opsForDump(row.item)}
                label={proj}
                color={labelColor(proj?.colorKey)}
                variant="row"
                todayKey={todayKey}
                onChanged={onChanged}
                divider={index > 0}
                dragging={drag?.item.id === id}
                nodeRef={sourceRef(`row:${id}`, () => ({
                  kind: 'row',
                  task: row.kind === 'task' ? row.task : undefined,
                  item: row.kind === 'dump' ? row.item : undefined,
                  id,
                  title: task.title,
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

      <SyncLine onPress={onOpenSettings} />
    </View>
  );
}

// One quiet line about sync (checkpoint 5, decision 013 item 6). Signed out it reads
// "Local only · not signed in". It is also the account line: clicking it
// opens the small Settings modal (checkpoint 6).
// Problems show in the danger colour only while the last error is under a day
// old.
export function syncLineText(s: PublicSyncStatus, now: number): { text: string; warn: boolean } {
  if (!s.signedIn || s.state === 'signed-out') return { text: 'Local only · not signed in', warn: false };
  if (s.state === 'syncing') return { text: 'Syncing…', warn: false };
  if (s.state === 'offline') return { text: `Offline · ${s.pending} change${s.pending === 1 ? '' : 's'} waiting`, warn: false };
  if (s.state === 'error') {
    const recent = s.lastErrorAt !== null && now - Date.parse(s.lastErrorAt) < 24 * 60 * 60 * 1000;
    return { text: `Sync problem: ${s.lastError ?? 'unknown'}`, warn: recent };
  }
  return { text: s.pending > 0 ? `${s.pending} change${s.pending === 1 ? '' : 's'} waiting` : 'Synced', warn: false };
}

function SyncLine({ onPress }: { onPress?: () => void }) {
  const [status, setStatus] = useState<PublicSyncStatus>(getSyncStatus);
  useEffect(() => subscribeSyncStatus(setStatus), []);
  const { text, warn } = syncLineText(status, Date.now());
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Account and sync settings">
      <Text style={[styles.syncLine, warn && styles.syncLineWarn]} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
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
  syncLine: { marginTop: 8, fontSize: 11, color: Colors.textSecondary },
  syncLineWarn: { color: Colors.danger },
  doneTitle: { flex: 1, fontSize: 13, color: Colors.textSecondary, textDecorationLine: 'line-through' },
});
