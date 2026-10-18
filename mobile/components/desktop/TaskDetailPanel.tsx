import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { DURATION_PRESETS, formatClock, parseDuration, presetLabel } from '../../lib/duration';
import { isDateKey } from '../../lib/kanban';
import { isTimerRunning } from '../../lib/taskTimer';
import { formatTaskTime } from '../../lib/taskTotals';
import { addSubtask, counterLabel, deleteSubtask, renameSubtask } from '../../lib/subtasks';
import { generateId } from '../../lib/data';
import { idDate, projectOccurrences } from '../../lib/series';
import { reminderLabel } from '../../lib/reminder';
import { effectiveListKey, listTitle } from '../../lib/lists';
import { setActualFor } from '../../lib/timerActions';
import { duplicateTaskById } from '../../lib/taskCommands';
import { loadLabels } from '../../lib/labels';
import { loadLists, loadTasksRaw } from '../../lib/storage';
import { isTextEntryTarget } from '../../lib/editable';
import type { Project, Task, TaskList } from '../../lib/types';
import EmojiField from './EmojiField';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import Popover, { Row, closePopover, isPopoverOpen, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { ReminderBody, RepeatBody, SeriesNote } from './TaskPopovers';
import StreakLine from './StreakLine';
import { shortRepeat } from '../../lib/repeat';
import { dateKey } from '../../lib/kanban';
import { opsForProjected, opsForTask, type TaskOps } from './taskOps';
import { toggleTimer, useNow } from './timerUi';
import { closeDetail, getDetailFocus, notifyChanged, useDetailId } from './uiStore';
import { useFeatures } from './featureStore';
import { startFocus } from './pomodoroStore';
import { saveTemplateFromTask } from '../../lib/templateActions';

// The task details (build plan phase 2; a centred modal since 2.26.0): every
// field of a task in one place, as fields and not as steps. Opens from Open
// details in a card's menu, or O on a focused card, and closes with its button,
// a press outside or Escape. It is not a screen: nothing navigates, the panes
// behind it stay as they were. Edits save as they are made (a blur or Enter for
// text, a click for choices), through the same task commands as the card, so a
// change here and on the card are the same change.
//
// The rows, in order: Task date, Estimated time, Actual time, Label, Repeats,
// List, then Notes and Subtasks. Emoji, duplicate, save as template, pomodoro
// and delete are in the ⋮ menu. Repeats (phase 4) is the card's own Repeat
// control, opened from here.
export default function TaskDetailPanel({ refreshKey }: { refreshKey: number }) {
  const id = useDetailId();
  const [task, setTask] = useState<Task | null>(null);
  // A day of a repeating series that is shown, not stored (decision 023): the
  // modal edits the series, as the card did, and opening it writes nothing.
  const [projected, setProjected] = useState(false);
  const [labels, setLabels] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);

  const reload = useCallback(async () => {
    if (!id) return;
    const [tasks, l, ls] = await Promise.all([loadTasksRaw(), loadLabels(), loadLists()]);
    let found = tasks.find((t) => t.id === id && !t.deletedAt) ?? null;
    let proj = false;
    const day = idDate(id);
    if (!found && day && !tasks.some((t) => t.id === id)) {
      const today = dateKey(new Date());
      found = projectOccurrences(tasks, [day], today, { minKey: day }).find((t) => t.id === id) ?? null;
      proj = !!found;
    }
    setTask(found);
    setProjected(proj);
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

  // Escape closes the modal, unless a popover has it. From a field too (the
  // title has focus when it opens): the field is blurred first, which saves it.
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isPopoverOpen()) return;
      e.preventDefault();
      if (isTextEntryTarget(e.target)) (e.target as HTMLElement).blur();
      closeDetail();
    };
    // Capture: a focused text field stops Escape before it reaches the window.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [id]);

  // Focus goes back to where it was (the card) when the modal closes.
  useEffect(() => {
    if (!id) return;
    const before = document.activeElement as HTMLElement | null;
    return () => {
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, [id]);

  if (!id || !task) return null;
  return (
    <View style={styles.layer} {...({ dataSet: { detailLayer: '1' } } as object)}>
      <Pressable style={styles.scrim} onPress={closeDetail} accessibilityLabel="Close the task details" {...({ tabIndex: -1 } as object)} />
      <View style={styles.centre} pointerEvents="box-none">
        <Panel key={task.id} task={task} projected={projected} labels={labels} lists={lists} onSaved={() => { notifyChanged(); reload(); }} />
      </View>
    </View>
  );
}

function Panel({ task, projected, labels, lists, onSaved }: { task: Task; projected: boolean; labels: Project[]; lists: TaskList[]; onSaved: () => void }) {
  const ops: TaskOps = projected ? opsForProjected(task) : opsForTask(task);
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
  const feats = useFeatures();
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplNote, setTplNote] = useState<string | null>(null);
  const running = isTimerRunning(task);
  const now = useNow(running);
  const titleRef = useRef<TextInput>(null);
  const more = usePopoverAnchor();
  const moreId = `detail:${task.id}:more`;
  const moreOpen = useIsOpen(moreId);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setNotes(task.notes ?? ''), [task.notes]);
  const subRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
  const customRef = useRef<TextInput>(null);
  const actualRef = useRef<TextInput>(null);
  const [newSub, setNewSub] = useState('');
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [editSubText, setEditSubText] = useState('');
  // The keyboard goes where the card's key asked (2.27.0), else the title.
  useEffect(() => {
    const focus = getDetailFocus();
    const target = { subtask: subRef, notes: notesRef, estimate: customRef, actual: actualRef, title: titleRef }[focus ?? 'title'] ?? titleRef;
    const t = setTimeout(() => (target.current ?? titleRef.current)?.focus(), 30);
    return () => clearTimeout(t);
  }, []);
  const addStep = async () => {
    const t = newSub.trim();
    if (!t) return;
    setNewSub('');
    await patch({ subtasks: addSubtask(task.subtasks, t, generateId()) });
    subRef.current?.focus();
  };
  const commitStep = (sid: string, before: string) => {
    const t = editSubText.trim();
    setEditingSub(null);
    if (t && t !== before) patch({ subtasks: renameSubtask(task.subtasks, sid, t) });
  };

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
  const saveTemplate = async () => {
    const t = await saveTemplateFromTask(task, tplName);
    setTplNote(t ? `Saved the template ${t.name}.` : 'There are already 50 templates. Delete one in Settings first.');
    if (t) setTplOpen(false);
  };
  const listKey = effectiveListKey(task, lists);
  const subtasks = task.subtasks ?? [];

  return (
    <View style={styles.panel} accessibilityLabel="Task details" {...({ role: 'dialog', 'aria-modal': true, dataSet: { detailPanel: '1' } } as object)}>
      <View style={styles.header}>
        <Pressable
          // Completing goes through setTaskCompleted (subtasks, repeats), not a bare patch.
          onPress={() => ops.setCompleted(!task.completed).then(onSaved)}
          style={[styles.tick, task.completed && styles.tickOn]}
          accessibilityRole="button"
          accessibilityLabel={task.completed ? 'Reopen the task' : 'Mark the task complete'}
        >
          {task.completed && <Ionicons name="checkmark" size={16} color={Colors.onAccent} />}
        </Pressable>
        {task.emoji ? <Text style={styles.titleEmoji}>{task.emoji}</Text> : null}
        <TextInput
          ref={titleRef}
          style={[styles.titleInput, task.completed && styles.titleDone]}
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          onSubmitEditing={saveTitle}
          accessibilityLabel="Title"
        />
        <Pressable
          ref={more.ref as never}
          onPress={() => togglePopover(moreId, more.get)}
          style={[styles.iconBtn, moreOpen && styles.iconBtnOn]}
          accessibilityRole="button"
          accessibilityState={{ expanded: moreOpen }}
          accessibilityLabel="More task actions"
        >
          <Ionicons name="ellipsis-vertical" size={16} color={Colors.textSecondary} />
        </Pressable>
        <Pressable onPress={closeDetail} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close task details">
          <Ionicons name="close" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {projected && <SeriesNote />}
        <StreakLine task={task} />
        <DetailRow glyph="📅" label="Task date">
          <View style={styles.row}>
            <input
              type="date"
              value={isDateKey(task.dueDate) ? task.dueDate : ''}
              aria-label="Day"
              disabled={projected}
              onChange={(e) => patch({ dueDate: e.target.value || undefined })}
              style={domSelect}
            />
            {/* A time of day belongs to a Day (patchTask clears it with the Day). */}
            {isDateKey(task.dueDate) && (
              <input
                type="time"
                step={300}
                value={task.startTime ?? ''}
                aria-label="Time"
                onChange={(e) => patch({ startTime: /^\d\d:\d\d$/.test(e.target.value) ? e.target.value : undefined })}
                style={domSelect}
              />
            )}
            {task.startTime ? (
              <Pressable onPress={() => patch({ startTime: undefined })} style={styles.quiet} accessibilityRole="button" accessibilityLabel="Remove time">
                <Text style={styles.quietText}>Remove time</Text>
              </Pressable>
            ) : null}
            {task.dueDate && !projected ? (
              <Pressable onPress={() => patch({ dueDate: undefined })} style={styles.quiet} accessibilityRole="button" accessibilityLabel="Remove the day">
                <Text style={styles.quietText}>Remove date</Text>
              </Pressable>
            ) : null}
          </View>
        </DetailRow>

        <DetailRow glyph="⏳" label="Estimated time" value={formatClock(task.durationMinutes)}>
          <View style={styles.chips}>
            <Chip label="None" on={task.durationMinutes === undefined} onPress={() => patch({ durationMinutes: undefined })} />
            {DURATION_PRESETS.map((m) => (
              <Chip key={m} label={presetLabel(m)} on={task.durationMinutes === m} onPress={() => patch({ durationMinutes: m })} />
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              ref={customRef}
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
        </DetailRow>

        <DetailRow glyph="⏱️" label="Actual time" value={formatTaskTime(task, now)}>
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
              ref={actualRef}
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
        </DetailRow>

        <DetailRow glyph="🏷️" label="Label">
          <select value={task.projectKey ?? ''} aria-label="Label" onChange={(e) => patch({ projectKey: e.target.value || undefined })} style={domSelect}>
            <option value="">No label</option>
            {labels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.emoji ? `${l.emoji} ` : ''}
                {l.name}
              </option>
            ))}
          </select>
        </DetailRow>

        <DetailRow glyph="🔁" label="Repeats">
          <RepeatField task={task} ops={ops} onSaved={onSaved} />
        </DetailRow>

        {feats.dueDates && (
          <DetailRow glyph="🔔" label="Reminder">
            <ReminderField task={task} ops={ops} onSaved={onSaved} />
          </DetailRow>
        )}

        <DetailRow glyph="📋" label="List">
          <select value={listKey ?? ''} aria-label="List" onChange={(e) => patch({ listKey: e.target.value || undefined })} style={domSelect}>
            <option value="">{listTitle(undefined)}</option>
            {lists.map((l) => (
              <option key={l.key} value={l.key}>
                {listTitle(l)}
              </option>
            ))}
          </select>
        </DetailRow>

        <View style={styles.section}>
          <Text style={styles.sectionLabel} accessibilityRole="header">
            📝  Notes
          </Text>
          <TextInput
            ref={notesRef}
            style={styles.notes}
            value={notes}
            onChangeText={setNotes}
            onBlur={saveNotes}
            placeholder="Add notes"
            placeholderTextColor={Colors.textSecondary}
            multiline
            accessibilityLabel="Notes"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel} accessibilityRole="header">
            ☑️  Subtasks  {counterLabel(task.subtasks)}
          </Text>
          {subtasks.map((s) => (
            <View key={s.id} style={styles.subRow} {...({ dataSet: { subRow: s.id } } as object)}>
              <Pressable
                onPress={() => ops.toggleSubtask(s.id).then(onSaved)}
                accessibilityRole="button"
                accessibilityLabel={s.done ? `Untick ${s.title}` : `Tick ${s.title}`}
              >
                <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={s.done ? Colors.accent : Colors.textSecondary} />
              </Pressable>
              {editingSub === s.id ? (
                <TextInput
                  style={[styles.input, styles.subInput]}
                  value={editSubText}
                  onChangeText={setEditSubText}
                  onSubmitEditing={() => commitStep(s.id, s.title)}
                  onBlur={() => commitStep(s.id, s.title)}
                  autoFocus
                  selectTextOnFocus
                  accessibilityLabel={`Edit subtask ${s.title}`}
                />
              ) : (
                <Text
                  style={[styles.subText, s.done && styles.subDone]}
                  onPress={() => {
                    setEditingSub(s.id);
                    setEditSubText(s.title);
                  }}
                  accessibilityLabel={`Rename subtask ${s.title}`}
                >
                  {s.title}
                </Text>
              )}
              <Pressable onPress={() => patch({ subtasks: deleteSubtask(task.subtasks, s.id) })} style={styles.subDelete} accessibilityRole="button" accessibilityLabel={`Delete subtask ${s.title}`}>
                <Ionicons name="close" size={14} color={Colors.textSecondary} />
              </Pressable>
            </View>
          ))}
          <View style={styles.subRow}>
            <Ionicons name="add" size={18} color={Colors.textSecondary} />
            <TextInput
              ref={subRef}
              style={[styles.input, styles.subInput]}
              value={newSub}
              onChangeText={setNewSub}
              onSubmitEditing={addStep}
              blurOnSubmit={false}
              placeholder="Add subtask"
              placeholderTextColor={Colors.textSecondary}
              accessibilityLabel={`Add subtask to ${task.title}`}
            />
          </View>
        </View>

        {feats.templates && tplOpen && (
          <View style={styles.row} accessibilityLabel="Save as template form">
            <TextInput
              style={styles.input}
              value={tplName}
              onChangeText={setTplName}
              onSubmitEditing={saveTemplate}
              placeholder="Template name"
              placeholderTextColor={Colors.textSecondary}
              maxLength={40}
              autoFocus
              accessibilityLabel="Template name"
            />
            <Pressable onPress={saveTemplate} style={styles.bigBtn} accessibilityRole="button" accessibilityLabel="Save the template">
              <Text style={styles.bigBtnText}>Save</Text>
            </Pressable>
          </View>
        )}
        {tplNote && <Text style={styles.muted} accessibilityLabel="Template note">{tplNote}</Text>}
        {confirming && (
          <View style={styles.confirm}>
            <Text style={styles.muted}>Delete this task?</Text>
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
        )}
      </ScrollView>

      <Popover id={moreId} anchor={more.get} width={260} label="More task actions" maxHeight={480}>
        <View style={styles.menuEmoji}>
          <Text style={styles.menuLabel}>🙂  Emoji</Text>
          <EmojiField label="Task emoji" value={task.emoji} onChange={(emoji) => patch({ emoji })} />
        </View>
        <Row
          label="Duplicate"
          leading={<Text>📄</Text>}
          a11y="Duplicate task"
          onPress={async () => {
            closePopover(true);
            await duplicateTaskById(task.id);
            notifyChanged();
          }}
        />
        {feats.templates && (
          <Row
            label="Save as template"
            leading={<Text>📑</Text>}
            a11y="Save as template"
            onPress={() => {
              closePopover(false);
              setTplName(task.title.slice(0, 40));
              setTplNote(null);
              setTplOpen(true);
            }}
          />
        )}
        {feats.pomodoro && !task.completed && (
          <Row
            label="Start a pomodoro"
            leading={<Text>🍅</Text>}
            a11y="Start a pomodoro"
            onPress={() => {
              closePopover(true);
              startFocus(task);
            }}
          />
        )}
        <Row
          label="Delete"
          leading={<Text>🗑️</Text>}
          danger
          a11y="Delete task"
          onPress={() => {
            closePopover(false);
            setConfirming(true);
          }}
        />
      </Popover>
    </View>
  );
}

// The Repeat control of the card (TaskPopovers.RepeatBody), opened from the
// modal: the same component, the same rules and the same writes; nothing forked.
function RepeatField({ task, ops, onSaved }: { task: Task; ops: TaskOps; onSaved: () => void }) {
  const { ref, get } = usePopoverAnchor();
  const id = `detail:${task.id}:repeat`;
  const open = useIsOpen(id);
  const wrapped: TaskOps = { ...ops, patch: (f) => ops.patch(f).then(onSaved) };
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.quiet, open && styles.chipOn, { alignSelf: 'flex-start' }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Repeat: ${task.recurrence ? shortRepeat(task, dateKey(new Date())) ?? 'repeats' : 'Does not repeat'}`}
      >
        <Text style={[styles.quietText, open && styles.chipTextOn]}>{task.recurrence ? shortRepeat(task, dateKey(new Date())) ?? 'Repeats' : 'Does not repeat'}</Text>
      </Pressable>
      <Popover id={id} anchor={get} width={300}>
        <RepeatBody task={task} ops={wrapped} done={() => closePopover(true)} />
      </Popover>
    </>
  );
}

// The card's Reminder dropdown (TaskPopovers.ReminderBody), opened from the
// modal (2.27.0: the bell left the card face).
function ReminderField({ task, ops, onSaved }: { task: Task; ops: TaskOps; onSaved: () => void }) {
  const { ref, get } = usePopoverAnchor();
  const id = `detail:${task.id}:reminder`;
  const open = useIsOpen(id);
  const wrapped: TaskOps = { ...ops, patch: (f) => ops.patch(f).then(onSaved) };
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.quiet, open && styles.chipOn, { alignSelf: 'flex-start' }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Reminder: ${reminderLabel(task.reminderMinutes)}`}
      >
        <Text style={[styles.quietText, open && styles.chipTextOn]}>{reminderLabel(task.reminderMinutes)}</Text>
      </Pressable>
      <Popover id={id} anchor={get} width={240}>
        <ReminderBody task={task} ops={wrapped} done={() => closePopover(true)} />
      </Popover>
    </>
  );
}

// One row of the modal: the name on the left (with its value), the control on
// the right.
function DetailRow({ glyph, label, value, children }: { glyph: string; label: string; value?: string; children: React.ReactNode }) {
  return (
    <View style={styles.detailRow} {...({ dataSet: { detailRow: label } } as object)}>
      <View style={styles.rowHead}>
        <Text style={styles.rowLabel} accessibilityRole="header">
          {glyph}  {label}
        </Text>
        {value ? (
          <Text style={styles.rowValue} {...({ dataSet: { mono: '1' } } as object)}>
            {value}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowBody}>{children}</View>
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
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(38,37,31,0.28)', cursor: 'default' } as never,
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: {
    width: 600,
    maxWidth: '100%',
    maxHeight: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    boxShadow: '0 16px 48px rgba(38,37,31,0.22)',
  } as never,
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  tick: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  titleEmoji: { fontSize: 22 },
  titleInput: { flex: 1, minWidth: 0, fontSize: 23, fontWeight: '700', color: Colors.textPrimary, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', outlineColor: Colors.accent },
  titleDone: { color: Colors.textSecondary, textDecorationLine: 'line-through' },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  iconBtnOn: { backgroundColor: Colors.background },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 20, paddingBottom: 20, gap: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  rowHead: { width: 150, gap: 2, paddingTop: 7 },
  rowLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  rowValue: { fontSize: 13, color: Colors.textPrimary, paddingLeft: 26 },
  rowBody: { flex: 1, minWidth: 0, gap: 8 },
  section: { gap: 8, paddingTop: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, height: 30, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 13, color: Colors.textPrimary },
  chipTextOn: { color: Colors.onAccent, fontWeight: '600' },
  input: { flex: 1, minWidth: 120, height: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  inputBad: { borderColor: Colors.danger },
  bad: { fontSize: 12, color: Colors.danger },
  notes: { minHeight: 88, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  muted: { fontSize: 12, color: Colors.textSecondary },
  bigBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 12, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.background },
  bigBtnOn: { backgroundColor: Colors.accent },
  bigBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  bigBtnTextOn: { color: Colors.onAccent },
  quiet: { paddingHorizontal: 12, height: 32, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  quietText: { fontSize: 13, color: Colors.textPrimary },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30 },
  subText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  subDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  subInput: { height: 30, minWidth: 0 },
  subDelete: { padding: 6 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  yes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  no: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  menuEmoji: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  menuLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
});
