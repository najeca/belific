import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { Colors } from '../../../lib/theme';
import { generateId } from '../../../lib/data';
import { DURATION_CHOICES, isDateKey } from '../../../lib/kanban';
import {
  addTask,
  updateTask,
  deleteTask,
  deleteBrainDumpItem,
  loadProjects,
  addProject,
} from '../../../lib/storage';
import type { EventPriority, Project, Task } from '../../../lib/types';

// Desktop task modal: a centred overlay on Desktop Home, never a new screen
// (DESKTOP_HOME_NAV_SPEC standing rule). Create and edit share it. Web only:
// the Day field is a plain <input type="date"> because DateTimePicker renders
// nothing on web, and there are no Alert.alert dialogs (no-ops on web), so
// delete confirms inline.
export type TaskModalState =
  | { mode: 'edit'; task: Task }
  | { mode: 'new'; title?: string; dueDate?: string; dumpId?: string };

type PriorityChoice = 'normal' | EventPriority;

const PRIORITIES: Array<{ key: PriorityChoice; label: string }> = [
  { key: 'normal', label: 'Normal' },
  { key: 'low', label: 'Low' },
  { key: 'high', label: 'High' },
];

const domInputStyle: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 14,
  fontFamily: 'inherit',
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
  const [title, setTitle] = useState(editTask?.title ?? (state.mode === 'new' ? state.title ?? '' : ''));
  const [day, setDay] = useState(editTask?.dueDate ?? (state.mode === 'new' ? state.dueDate ?? '' : ''));
  const [priority, setPriority] = useState<PriorityChoice>(editTask?.priority ?? 'normal');
  const [projectKey, setProjectKey] = useState<string | undefined>(editTask?.projectKey);
  const [duration, setDuration] = useState<number | undefined>(editTask?.durationMinutes);
  const [notes, setNotes] = useState(editTask?.notes ?? '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelText, setLabelText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProjects().then(setProjects);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (Platform.OS !== 'web') return null;

  const canSave = title.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const dueDate = isDateKey(day) ? day : undefined;
    const fields = {
      title: title.trim(),
      dueDate,
      priority: priority === 'normal' ? undefined : priority,
      projectKey,
      notes: notes.trim().length > 0 ? notes.trim() : undefined,
      durationMinutes: duration,
    };
    if (editTask) {
      // A time slot only makes sense on a day: clearing the Day unplaces it.
      await updateTask({ ...editTask, ...fields, startTime: dueDate ? editTask.startTime : undefined });
    } else {
      const now = new Date().toISOString();
      const dumpId = state.mode === 'new' ? state.dumpId : undefined;
      await addTask({
        id: generateId(),
        ...fields,
        completed: false,
        createdAt: now,
        updatedAt: now,
        origin: dumpId ? 'dump' : undefined,
      });
      // Promote to Task MOVES the Brain Dump item (UBIQUITOUS_LANGUAGE).
      if (dumpId) await deleteBrainDumpItem(dumpId);
    }
    onSaved();
  }

  async function handleDelete() {
    if (!editTask) return;
    await deleteTask(editTask.id);
    onSaved();
  }

  async function handleAddLabel() {
    const name = labelText.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const project: Project = {
      key: `project-${Date.now().toString(36)}`,
      name,
      createdAt: now,
      updatedAt: now,
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
          <Text style={styles.heading}>{editTask ? 'Edit task' : 'New task'}</Text>

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

          <Text style={styles.label}>Day</Text>
          <View style={styles.dayRow}>
            <input
              type="date"
              value={isDateKey(day) ? day : ''}
              onChange={(e) => setDay(e.target.value)}
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
              <Chip key={p.key} label={p.name} selected={projectKey === p.key} onPress={() => setProjectKey(p.key)} />
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

          <Text style={styles.label}>Duration</Text>
          <View style={styles.chips}>
            {DURATION_CHOICES.map((d) => (
              <Chip
                key={d.minutes}
                label={d.label}
                selected={duration === d.minutes}
                onPress={() => setDuration(duration === d.minutes ? undefined : d.minutes)}
              />
            ))}
          </View>

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

          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              {editTask &&
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

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
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
  heading: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
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
