import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey, isDateKey } from '../../lib/kanban';
import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  QUICK_DURATIONS,
  formatDuration,
  joinDuration,
  splitDuration,
} from '../../lib/duration';
import { LABEL_COLORS, labelColor, nextColorKey } from '../../lib/labelColors';
import { loadLabels, setLabelColor } from '../../lib/labels';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import {
  REPEAT_CHOICES,
  WEEKDAY_SET,
  WEEKEND_SET,
  WEEK_ORDER,
  effectiveDays,
  repeatKindOf,
  repeatSummary,
  resolveRepeat,
  sameDays,
  toggleDay,
  weekdayOf,
  type RepeatKind,
} from '../../lib/repeat';
import { convertDumpItem, setTaskCompleted } from '../../lib/taskActions';
import {
  updateTask,
  deleteTask,
  deleteBrainDumpItem,
  addProject,
} from '../../lib/storage';
import type { BrainDumpItem, EventPriority, Project, Task, WeekDay } from '../../lib/types';

// Desktop task editor: a centred overlay on Desktop Home, never a new screen
// (DESKTOP_HOME_NAV_SPEC standing rule). It never creates tasks (a thought
// typed in the Brain Dump pane already is a Task); it edits one, at any time,
// before or after scheduling. It also opens a legacy BrainDumpItem from the
// phone: saving converts it into a Task in one step and removes the item.
// Web only: the Day field is a plain <input type="date"> because
// DateTimePicker renders nothing on web, and there are no Alert.alert dialogs
// (no-ops on web), so delete confirms inline.
export type TaskModalState =
  | { mode: 'edit'; task: Task }
  | { mode: 'dump'; item: BrainDumpItem };

type PriorityChoice = 'normal' | EventPriority;


const PRIORITIES: Array<{ key: PriorityChoice; label: string }> = [
  { key: 'normal', label: 'Normal' },
  { key: 'low', label: 'Low' },
  { key: 'high', label: 'High' },
];

const domSelectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 13,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const domInputStyle: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 14,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

export default function TaskModal({
  state,
  onClose,
  onSaved,
}: {
  state: TaskModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editTask = state.mode === 'edit' ? state.task : undefined;
  const dumpItem = state.mode === 'dump' ? state.item : undefined;
  const [title, setTitle] = useState(editTask?.title ?? dumpItem?.title ?? '');
  const [day, setDay] = useState(editTask?.dueDate ?? '');
  const [priority, setPriority] = useState<PriorityChoice>(editTask?.priority ?? 'normal');
  const [projectKey, setProjectKey] = useState<string | undefined>(editTask?.projectKey);
  const [duration, setDuration] = useState<number | undefined>(editTask?.durationMinutes);
  // Custom is open from the start when the stored duration is not a quick chip.
  const [customOpen, setCustomOpen] = useState(
    editTask?.durationMinutes !== undefined && !QUICK_DURATIONS.some((d) => d.minutes === editTask.durationMinutes),
  );
  const [notes, setNotes] = useState(editTask?.notes ?? dumpItem?.notes ?? '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelText, setLabelText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(editTask?.completed ?? false);
  // No past dates can be chosen. A task that already has a past Day keeps it
  // until the user changes it.
  const todayKey = dateKey(new Date());
  // Repeat (checkpoint 4.2). An older weekly task with no days shows the
  // weekday of its Day, which is what it has always repeated on.
  const [repeat, setRepeat] = useState<RepeatKind>(repeatKindOf(editTask?.recurrence));
  const [repeatDays, setRepeatDays] = useState<WeekDay[]>(() => {
    const kind = repeatKindOf(editTask?.recurrence);
    return editTask && (kind === 'days' || kind === 'biweekly') ? effectiveDays(editTask, todayKey) : [];
  });

  useEffect(() => {
    loadLabels().then(setProjects);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Capture phase: react-native-web's TextInput stops key events from
    // bubbling, so a bubbling listener never sees Escape while a field has focus.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  if (Platform.OS !== 'web') return null;

  const dayOrNone = isDateKey(day) ? day : undefined;
  const resolved = resolveRepeat(repeat, repeatDays, dayOrNone, todayKey, editTask?.recurrenceMonthDay);
  const summary = repeatSummary(repeat, repeatDays, dayOrNone, todayKey, editTask?.recurrenceMonthDay);
  // A day based repeat needs at least one day.
  const canSave = title.trim().length > 0 && !saving && resolved !== null;

  function chooseRepeat(kind: RepeatKind) {
    setRepeat(kind);
    // Switching to a day based repeat with nothing chosen starts from the
    // weekday of the Day, if there is one.
    if ((kind === 'days' || kind === 'biweekly') && repeatDays.length === 0 && dayOrNone) {
      setRepeatDays([weekdayOf(dayOrNone)]);
    }
  }

  async function handleSave() {
    if (!canSave || !resolved) return;
    setSaving(true);
    // A day based repeat moves the Day to the first chosen weekday on or
    // after it (the summary line says so before saving).
    const dueDate = resolved.dueDate;
    const fields = {
      title: title.trim(),
      dueDate,
      priority: priority === 'normal' ? undefined : priority,
      projectKey,
      notes: notes.trim().length > 0 ? notes.trim() : undefined,
      durationMinutes: duration,
      recurrence: resolved.recurrence,
      recurrenceDays: resolved.recurrenceDays,
      recurrenceMonthDay: resolved.recurrenceMonthDay,
    };
    if (editTask) {
      // A time slot only makes sense on a day: clearing the Day unplaces it.
      const updated: Task = { ...editTask, ...fields, startTime: dueDate ? editTask.startTime : undefined };
      await updateTask(updated);
      // Completion always goes through setTaskCompleted so a recurring task
      // gets its next occurrence (built from the details just saved).
      if (done !== editTask.completed) await setTaskCompleted(updated, done);
    } else if (dumpItem) {
      // Any save converts the legacy item into a Task and removes the item.
      await convertDumpItem(dumpItem, fields);
    }
    onSaved();
  }

  // Recolouring is a property of the label, saved straight away (local only).
  async function recolor(key: string, colorKey: string) {
    setProjects((prev) => prev.map((p) => (p.key === key ? { ...p, colorKey } : p)));
    await setLabelColor(key, colorKey);
  }

  const picked = splitDuration(duration);
  const selectedLabel = projects.find((p) => p.key === projectKey);

  async function handleDelete() {
    if (editTask) await deleteTask(editTask.id);
    else if (dumpItem) await deleteBrainDumpItem(dumpItem.id);
    onSaved();
  }

  async function handleAddLabel() {
    const name = labelText.trim();
    if (!name) return;
    const now = new Date().toISOString();
    // A new label takes the next free palette colour; the swatches under the
    // label chips (shown for the selected label) can change it.
    const project: Project = {
      key: `project-${Date.now().toString(36)}`,
      name,
      createdAt: now,
      updatedAt: now,
      colorKey: nextColorKey(projects),
    };
    await addProject(project);
    setProjects((prev) => [...prev, project]);
    setProjectKey(project.key);
    setLabelText('');
    setAddingLabel(false);
  }

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.panel} accessibilityViewIsModal>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.headingRow}>
            <Text style={styles.heading}>Edit task</Text>
            {editTask && (
              <Pressable
                onPress={() => setDone((d) => !d)}
                style={styles.doneBtn}
                accessibilityRole="button"
                accessibilityState={{ checked: done }}
                accessibilityLabel={done ? 'Mark as not done' : 'Mark as done'}
              >
                <Ionicons
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={done ? Colors.accent : Colors.textSecondary}
                />
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            )}
          </View>

          <TextInput
            style={styles.titleInput}
            placeholder="What needs doing?"
            placeholderTextColor={Colors.textSecondary}
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={handleSave}
            autoFocus
            accessibilityLabel="Task title"
          />

          <Text style={styles.label}>Duration</Text>
          <View style={styles.chips}>
            {QUICK_DURATIONS.map((d) => (
              <Chip
                key={d.minutes}
                label={d.label}
                selected={!customOpen && duration === d.minutes}
                onPress={() => {
                  setCustomOpen(false);
                  setDuration(duration === d.minutes && !customOpen ? undefined : d.minutes);
                }}
              />
            ))}
            <Chip label="Custom" selected={customOpen} onPress={() => setCustomOpen((o) => !o)} />
          </View>
          {customOpen && (
            <View style={styles.customRow}>
              <select
                value={picked.hours}
                onChange={(e) => setDuration(joinDuration(Number(e.target.value), picked.minutes))}
                style={domSelectStyle}
                aria-label="Hours"
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </select>
              <select
                value={picked.minutes}
                onChange={(e) => setDuration(joinDuration(picked.hours, Number(e.target.value)))}
                style={domSelectStyle}
                aria-label="Minutes"
              >
                {MINUTE_OPTIONS.map((m) => (
                  <option key={m} value={m} disabled={picked.hours === 24 && m !== 0}>
                    {m} min
                  </option>
                ))}
              </select>
              <Text style={styles.muted}>
                {duration === undefined ? 'Not set' : formatDuration(duration)}
              </Text>
            </View>
          )}

          <Text style={styles.label}>Priority</Text>
          <View style={styles.chips}>
            {PRIORITIES.map((p) => (
              <Chip key={p.key} label={p.label} selected={priority === p.key} onPress={() => setPriority(p.key)} />
            ))}
          </View>

          <Text style={styles.label}>Label</Text>
          <View style={styles.chips}>
            <Chip label="None" selected={!projectKey} onPress={() => setProjectKey(undefined)} />
            {projects.map((p) => (
              <Chip
                key={p.key}
                label={p.name}
                dot={labelColor(p.colorKey)?.edge}
                selected={projectKey === p.key}
                onPress={() => setProjectKey(p.key)}
              />
            ))}
            {addingLabel ? (
              <TextInput
                style={styles.labelInput}
                placeholder="Label name"
                placeholderTextColor={Colors.textSecondary}
                value={labelText}
                onChangeText={setLabelText}
                onSubmitEditing={handleAddLabel}
                onBlur={() => !labelText.trim() && setAddingLabel(false)}
                autoFocus
                accessibilityLabel="New label name"
              />
            ) : (
              <Pressable onPress={() => setAddingLabel(true)} accessibilityRole="button" accessibilityLabel="Add label">
                <Text style={styles.link}>+ Label</Text>
              </Pressable>
            )}
          </View>

          {selectedLabel && (
            <View style={styles.swatches}>
              {LABEL_COLORS.map((c) => {
                const on = selectedLabel.colorKey === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => recolor(selectedLabel.key, c.key)}
                    style={[styles.swatch, on && styles.swatchSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${c.name} colour for ${selectedLabel.name}`}
                  >
                    <View style={[styles.swatchFill, { backgroundColor: c.edge }]} />
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Optional"
            placeholderTextColor={Colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            accessibilityLabel="Notes"
          />

          <Text style={styles.label}>Day</Text>
          <View style={styles.dayRow}>
            <input
              type="date"
              value={isDateKey(day) ? day : ''}
              min={todayKey}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || (isDateKey(v) && v >= todayKey)) setDay(v);
              }}
              style={domInputStyle}
              aria-label="Day"
            />
            {day ? (
              <Pressable onPress={() => setDay('')} accessibilityRole="button" accessibilityLabel="Clear day">
                <Text style={styles.link}>No day</Text>
              </Pressable>
            ) : (
              <Text style={styles.muted}>Unscheduled</Text>
            )}
          </View>

          <Text style={styles.label}>Repeat</Text>
          <View style={styles.chips}>
            {REPEAT_CHOICES.map((r) => (
              <Chip key={r.kind} label={r.label} selected={repeat === r.kind} onPress={() => chooseRepeat(r.kind)} />
            ))}
          </View>
          {(repeat === 'days' || repeat === 'biweekly') && (
            <>
              <View style={[styles.chips, styles.weekdayRow]}>
                {WEEK_ORDER.map((w) => (
                  <Chip
                    key={w}
                    label={w}
                    selected={repeatDays.includes(w)}
                    onPress={() => setRepeatDays((prev) => toggleDay(prev, w))}
                  />
                ))}
              </View>
              <View style={[styles.chips, styles.weekdayRow]}>
                <Pressable onPress={() => setRepeatDays(WEEKDAY_SET)} accessibilityRole="button" accessibilityLabel="Weekdays">
                  <Text style={[styles.link, sameDays(repeatDays, WEEKDAY_SET) && styles.linkOn]}>Weekdays</Text>
                </Pressable>
                <Pressable onPress={() => setRepeatDays(WEEKEND_SET)} accessibilityRole="button" accessibilityLabel="Weekends">
                  <Text style={[styles.link, sameDays(repeatDays, WEEKEND_SET) && styles.linkOn]}>Weekends</Text>
                </Pressable>
              </View>
            </>
          )}
          {/* Always says exactly what will happen. */}
          <Text style={[styles.hint, resolved === null && styles.hintWarn]} accessibilityLabel="Repeat summary">
            {summary}
          </Text>

          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              {(editTask || dumpItem) &&
                (confirmingDelete ? (
                  <View style={styles.confirm}>
                    <Text style={styles.muted}>Delete?</Text>
                    <Pressable onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Confirm delete task">
                      <Text style={styles.confirmYes}>Yes</Text>
                    </Pressable>
                    <Pressable onPress={() => setConfirmingDelete(false)} accessibilityRole="button" accessibilityLabel="Cancel delete task">
                      <Text style={styles.confirmNo}>No</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setConfirmingDelete(true)} accessibilityRole="button" accessibilityLabel="Delete task">
                    <Text style={styles.danger}>Delete task</Text>
                  </Pressable>
                ))}
            </View>
            <Pressable style={styles.cancelBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel="Save task"
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  dot,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  // A label's colour, shown as a small dot before its name.
  dot?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, dot !== undefined && styles.chipWithDot, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {dot && <View style={[styles.dot, { backgroundColor: dot }, selected && styles.dotSelected]} />}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(38, 37, 31, 0.35)',
  },
  panel: {
    width: 460,
    maxWidth: '92%',
    maxHeight: '90%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  content: { padding: 20 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 36 },
  doneText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  weekdayRow: { marginTop: 8 },
  hint: { marginTop: 6, fontSize: 12, color: Colors.textSecondary },
  hintWarn: { color: Colors.danger },
  linkOn: { textDecorationLine: 'underline' },
  titleInput: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: 15,
    outlineColor: Colors.accent,
  },
  label: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    height: 30,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipWithDot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotSelected: { borderWidth: 1, borderColor: Colors.onAccent },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  swatch: { width: 28, height: 28, borderRadius: 14, padding: 3, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: Colors.textPrimary },
  swatchFill: { flex: 1, borderRadius: 10 },
  chipText: { fontSize: 13, color: Colors.textPrimary },
  chipTextSelected: { color: Colors.onAccent, fontWeight: '600' },
  labelInput: {
    height: 30,
    width: 130,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: 13,
    outlineColor: Colors.accent,
  },
  link: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  muted: { fontSize: 13, color: Colors.textSecondary },
  notesInput: {
    minHeight: 72,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top',
    outlineColor: Colors.accent,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  footerLeft: { flex: 1 },
  danger: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmYes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  confirmNo: { fontSize: 13, fontWeight: '700', color: Colors.accentText },
  cancelBtn: { paddingHorizontal: 14, height: 36, justifyContent: 'center' },
  cancelText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  saveBtn: {
    paddingHorizontal: 20,
    height: 36,
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: Colors.accent,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { fontSize: 14, fontWeight: '700', color: Colors.onAccent },
});
