import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { DURATION_PRESETS, formatClock, parseDuration, presetLabel } from '../../lib/duration';
import { isDateKey } from '../../lib/kanban';
import { isTimerRunning } from '../../lib/taskTimer';
import { formatTaskTime } from '../../lib/taskTotals';
import { counterLabel } from '../../lib/subtasks';
import { effectiveListKey, listTitle } from '../../lib/lists';
import { setActualFor } from '../../lib/timerActions';
import { duplicateTaskById } from '../../lib/taskCommands';
import { loadLabels } from '../../lib/labels';
import { loadLists, loadTasksRaw } from '../../lib/storage';
import { isTextEntryTarget } from '../../lib/editable';
import type { EventPriority, Project, Task, TaskList } from '../../lib/types';
import EmojiField from './EmojiField';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import { isPopoverOpen } from './Popover';
import { opsForTask, type TaskOps } from './taskOps';
import { toggleTimer, useNow } from './timerUi';
import { closeDetail, notifyChanged, useDetailId } from './uiStore';

// The task details panel (build plan phase 2): every field of a task in one
// place, as fields and not as steps. It opens beside the board (Open details in
// a card's menu, or O on a focused card), covers the right pane while it is
// open, and closes with its button or Escape. It is not a screen: nothing
// navigates, the panes behind it stay as they were. Edits save as they are made
// (a blur or Enter for text, a click for choices), through the same task
// commands as the card, so a change here and on the card are the same change.
//
// A repeating task has no Repeats field here: repeating is phase 4.
export default function TaskDetailPanel({ refreshKey }: { refreshKey: number }) {
  const id = useDetailId();
  const [task, setTask] = useState<Task | null>(null);
  const [labels, setLabels] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);

  const reload = useCallback(async () => {
    if (!id) return;
    const [tasks, l, ls] = await Promise.all([loadTasksRaw(), loadLabels(), loadLists()]);
    const found = tasks.find((t) => t.id === id && !t.deletedAt) ?? null;
    setTask(found);
    setLabels(l);
    setLists(ls);
    // The task was deleted (here, or on the other device): nothing to show.
    if (!found) closeDetail();
  }, [id]);
  useEffect(() => {
    if (!id) {
      setTask(null);
      return;
    }
    reload();
  }, [id, refreshKey, reload]);

  // Escape closes the panel, unless a field or a popover has it.
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isPopoverOpen() || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  if (!id || !task) return null;
  return <Panel key={task.id} task={task} labels={labels} lists={lists} onSaved={() => { notifyChanged(); reload(); }} />;
}

function Panel({ task, labels, lists, onSaved }: { task: Task; labels: Project[]; lists: TaskList[]; onSaved: () => void }) {
  const ops: TaskOps = opsForTask(task);
  const patch = async (fields: Partial<Task>) => {
    await ops.patch(fields);
    onSaved();
  };
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [custom, setCustom] = useState('');
  const [customBad, setCustomBad] = useState(false);
  const [actualText, setActualText] = useState('');
  const [actualBad, setActualBad] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const running = isTimerRunning(task);
  const now = useNow(running);
  const titleRef = useRef<TextInput>(null);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setNotes(task.notes ?? ''), [task.notes]);
  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const saveTitle = () => {
    const t = title.trim();
    if (!t) setTitle(task.title);
    else if (t !== task.title) patch({ title: t });
  };
  const saveNotes = () => {
    const n = notes.trim();
    if (n !== (task.notes ?? '')) patch({ notes: n.length > 0 ? n : undefined });
  };
  const applyCustom = () => {
    const m = parseDuration(custom);
    if (m === null) {
      setCustomBad(true);
      return;
    }
    setCustom('');
    patch({ durationMinutes: m });
  };
  const applyActual = async () => {
    const m = parseDuration(actualText);
    if (m === null || !(await setActualFor(task.id, m))) {
      setActualBad(true);
      return;
    }
    setActualText('');
    onSaved();
  };
  const listKey = effectiveListKey(task, lists);
  const priority = task.priority;
  const subtasks = task.subtasks ?? [];

  return (
    <View style={styles.panel} accessibilityLabel="Task details" {...({ role: "complementary", dataSet: { detailPanel: "1" } } as object)}>
      <View style={styles.header}>
        <Text style={styles.heading}>Task details</Text>
        <Pressable onPress={closeDetail} style={styles.close} accessibilityRole="button" accessibilityLabel="Close task details">
          <Ionicons name="close" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <TextInput
          ref={titleRef}
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          onSubmitEditing={saveTitle}
          accessibilityLabel="Title"
        />
        <Field glyph="🙂" label="Emoji">
          <EmojiField label="Task emoji" value={task.emoji} onChange={(emoji) => patch({ emoji })} />
        </Field>

        <View style={styles.row}>
          <Pressable
            // Completing goes through setTaskCompleted (subtasks, repeats), not a bare patch.
            onPress={() => ops.setCompleted(!task.completed).then(onSaved)}
            style={[styles.bigBtn, task.completed && styles.bigBtnOn]}
            accessibilityRole="button"
            accessibilityLabel={task.completed ? 'Reopen the task' : 'Mark the task complete'}
          >
            <Text style={[styles.bigBtnText, task.completed && styles.bigBtnTextOn]}>{task.completed ? '✅ Done. Reopen' : '⬜ Mark complete'}</Text>
          </Pressable>
        </View>

        <Field glyph="📋" label="List">
          <select
            value={listKey ?? ''}
            aria-label="List"
            onChange={(e) => patch({ listKey: e.target.value || undefined })}
            style={domSelect}
          >
            <option value="">{listTitle(undefined)}</option>
            {lists.map((l) => (
              <option key={l.key} value={l.key}>
                {listTitle(l)}
              </option>
            ))}
          </select>
        </Field>

        <Field glyph="📅" label="Day">
          <View style={styles.row}>
            <input
              type="date"
              value={isDateKey(task.dueDate) ? task.dueDate : ''}
              aria-label="Day"
              onChange={(e) => patch({ dueDate: e.target.value || undefined })}
              style={domSelect}
            />
            {task.dueDate ? (
              <Pressable onPress={() => patch({ dueDate: undefined })} style={styles.quiet} accessibilityRole="button" accessibilityLabel="Remove the day">
                <Text style={styles.quietText}>Remove day</Text>
              </Pressable>
            ) : null}
          </View>
        </Field>

        <Field glyph="⏳" label={`Estimate  ${formatClock(task.durationMinutes)}`}>
          <View style={styles.chips}>
            <Chip label="None" on={task.durationMinutes === undefined} onPress={() => patch({ durationMinutes: undefined })} />
            {DURATION_PRESETS.map((m) => (
              <Chip key={m} label={presetLabel(m)} on={task.durationMinutes === m} onPress={() => patch({ durationMinutes: m })} />
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, customBad && styles.inputBad]}
              value={custom}
              onChangeText={(t) => {
                setCustom(t);
                setCustomBad(false);
              }}
              onSubmitEditing={applyCustom}
              placeholder="Custom: 45m, 1h 30m, 130"
              placeholderTextColor={Colors.textSecondary}
              accessibilityLabel="Custom estimate"
            />
          </View>
          {customBad && <Text style={styles.bad}>Not a time. Try 45m, 1h 30m or 130.</Text>}
        </Field>

        <Field glyph="⏱️" label={`Actual  ${formatTaskTime(task, now)}`}>
          <View style={styles.row}>
            <Pressable
              onPress={() => toggleTimer(task)}
              style={[styles.bigBtn, running && styles.bigBtnOn]}
              accessibilityRole="button"
              accessibilityLabel={running ? 'Stop the timer' : 'Start the timer'}
            >
              <Ionicons name={running ? 'pause' : 'play'} size={14} color={running ? Colors.onAccent : Colors.accentText} />
              <Text style={[styles.bigBtnText, running && styles.bigBtnTextOn]}>{running ? 'Stop' : 'Start'}</Text>
            </Pressable>
            <TextInput
              style={[styles.input, actualBad && styles.inputBad]}
              value={actualText}
              onChangeText={(t) => {
                setActualText(t);
                setActualBad(false);
              }}
              onSubmitEditing={applyActual}
              placeholder="Set the time: 45m, 1h 30m"
              placeholderTextColor={Colors.textSecondary}
              accessibilityLabel="Set the actual time"
            />
            {(task.actualMinutes ?? 0) > 0 ? (
              <Pressable onPress={() => patch({ actualMinutes: undefined })} style={styles.quiet} accessibilityRole="button" accessibilityLabel="Clear the actual time">
                <Text style={styles.quietText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          {actualBad && <Text style={styles.bad}>Not a time. Try 45m, 1h 30m or 130.</Text>}
        </Field>

        <Field glyph="🏷️" label="Label">
          <select
            value={task.projectKey ?? ''}
            aria-label="Label"
            onChange={(e) => patch({ projectKey: e.target.value || undefined })}
            style={domSelect}
          >
            <option value="">No label</option>
            {labels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.emoji ? `${l.emoji} ` : ''}
                {l.name}
              </option>
            ))}
          </select>
        </Field>

        <Field glyph="🚩" label="Priority">
          <View style={styles.chips}>
            {([[undefined, 'Normal'], ['high', 'High'], ['low', 'Low']] as Array<[EventPriority | undefined, string]>).map(([p, name]) => (
              <Chip key={name} label={name} on={priority === p} onPress={() => patch({ priority: p })} />
            ))}
          </View>
        </Field>

        <Field glyph="📝" label="Notes">
          <TextInput
            style={styles.notes}
            value={notes}
            onChangeText={setNotes}
            onBlur={saveNotes}
            placeholder="Notes"
            placeholderTextColor={Colors.textSecondary}
            multiline
            accessibilityLabel="Notes"
          />
        </Field>

        <Field glyph="☑️" label={`Subtasks  ${counterLabel(task.subtasks)}`}>
          {subtasks.length === 0 ? (
            <Text style={styles.muted}>None. Add them on the card (S, then Ctrl+S).</Text>
          ) : (
            subtasks.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => ops.toggleSubtask(s.id).then(onSaved)}
                style={styles.subRow}
                accessibilityRole="button"
                accessibilityLabel={s.done ? `Untick ${s.title}` : `Tick ${s.title}`}
              >
                <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={s.done ? Colors.accent : Colors.textSecondary} />
                <Text style={[styles.subText, s.done && styles.subDone]}>{s.title}</Text>
              </Pressable>
            ))
          )}
        </Field>

        <View style={styles.actions}>
          <Pressable
            onPress={async () => {
              await duplicateTaskById(task.id);
              notifyChanged();
            }}
            style={styles.quiet}
            accessibilityRole="button"
            accessibilityLabel="Duplicate task"
          >
            <Text style={styles.quietText}>Duplicate</Text>
          </Pressable>
          {confirming ? (
            <View style={styles.row}>
              <Text style={styles.muted}>Delete?</Text>
              <Pressable
                onPress={async () => {
                  await ops.remove();
                  closeDetail();
                  notifyChanged();
                }}
                accessibilityRole="button"
                accessibilityLabel="Confirm delete task"
              >
                <Text style={styles.yes}>Yes</Text>
              </Pressable>
              <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Cancel delete task">
                <Text style={styles.no}>No</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirming(true)} style={styles.quiet} accessibilityRole="button" accessibilityLabel="Delete task">
              <Text style={[styles.quietText, { color: Colors.danger }]}>Delete</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ glyph, label, children }: { glyph: string; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel} accessibilityRole="header">
        {glyph}  {label}
      </Text>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      {...({ 'aria-pressed': on } as object)}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const domSelect: React.CSSProperties = {
  height: 34,
  padding: '0 8px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 14,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
  minWidth: 0,
  maxWidth: '100%',
};

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 56,
    right: 12,
    bottom: 12,
    width: 392,
    zIndex: 30,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    boxShadow: '0 8px 32px rgba(38,37,31,0.16)',
  } as never,
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  heading: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary, textTransform: 'uppercase' },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  scroll: { flex: 1 },
  body: { padding: 16, paddingTop: 8, gap: 14 },
  titleInput: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, outlineColor: Colors.accent },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, height: 30, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 13, color: Colors.textPrimary },
  chipTextOn: { color: Colors.onAccent, fontWeight: '600' },
  input: { flex: 1, minWidth: 120, height: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  inputBad: { borderColor: Colors.danger },
  bad: { fontSize: 12, color: Colors.danger },
  notes: { minHeight: 72, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  muted: { fontSize: 12, color: Colors.textSecondary },
  bigBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 12, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.background },
  bigBtnOn: { backgroundColor: Colors.accent },
  bigBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  bigBtnTextOn: { color: Colors.onAccent },
  quiet: { paddingHorizontal: 12, height: 32, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  quietText: { fontSize: 13, color: Colors.textPrimary },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  subText: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  subDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  yes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  no: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
});
