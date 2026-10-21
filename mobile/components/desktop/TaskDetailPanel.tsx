import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { isDateKey } from '../../lib/kanban';
import { isTimerRunning } from '../../lib/taskTimer';
import { formatTaskTime } from '../../lib/taskTotals';
import { addSubtask, counterLabel, deleteSubtask, renameSubtask } from '../../lib/subtasks';
import { generateId } from '../../lib/data';
import { idDate, projectOccurrences } from '../../lib/series';
import { taskRemindersLabel } from '../../lib/reminder';
import { useDefaultReminders } from './reminderStore';
import { effectiveListKey, listOptionText, listTitle } from '../../lib/lists';
import { setActualFor } from '../../lib/timerActions';
import { duplicateTaskById } from '../../lib/taskCommands';
import { loadLabels } from '../../lib/labels';
import { loadLists, loadTasksRaw } from '../../lib/storage';
import { isTextEntryTarget, ownsKeys } from '../../lib/editable';
import type { Project, Task, TaskList } from '../../lib/types';
import { MUST_DO_MARK, MUST_DO_TIP, isMustDo, mustDoPatch } from '../../lib/mustDo';
import { tipRef } from './tip';
import EmojiField from './EmojiField';
import DurationSelect from './DurationSelect';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import Popover, { Row, closePopover, isPopoverOpen, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { LabelBody, ReminderBody, RepeatBody, SeriesNote } from './TaskPopovers';
import { labelColor } from '../../lib/labelColors';
import StreakLine from './StreakLine';
import { shortRepeat } from '../../lib/repeat';
import { dateKey } from '../../lib/kanban';
import { opsForProjected, opsForTask, type TaskOps } from './taskOps';
import { toggleTimer, useNow } from './timerUi';
import { startFromChoices } from '../../lib/timerSession';
import { formatTime } from '../../lib/data';
import { MAX_TIMES, addTimeFields, isTimeDone, moveTimeFields, removeTimeFields, suggestNextTime, timesOf, type TimeEdit, type TimeRefusal } from '../../lib/times';
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
      if (isPopoverOpen() || ownsKeys(e.target)) return;
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
  const [confirming, setConfirming] = useState(false);
  const feats = useFeatures();
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplNote, setTplNote] = useState<string | null>(null);
  const running = isTimerRunning(task);
  const now = useNow(running);
  // Part C: a task that happens several times a day. A refused change says why, here, in the Time row.
  const times = timesOf(task);
  const multi = times.length > 1;
  const [timeNote, setTimeNote] = useState<string | null>(null);
  const applyTimes = async (res: TimeEdit | TimeRefusal) => {
    if (!res.ok) {
      setTimeNote(res.note);
      return;
    }
    setTimeNote(null);
    if (Object.keys(res.fields).length > 0) await patch(res.fields);
  };
  const addAnother = () => {
    const next = suggestNextTime(task);
    if (!next) setTimeNote('There is no room for another time today.');
    else void applyTimes(addTimeFields(task, next));
  };
  const addLink = isDateKey(task.dueDate) && task.startTime && times.length < MAX_TIMES ? (
    <Pressable onPress={addAnother} style={styles.quiet} accessibilityRole="button" accessibilityLabel="Add another time" {...({ dataSet: { addTime: '1' } } as object)}>
      <Text style={styles.quietSub}>+ Add another time</Text>
    </Pressable>
  ) : null;
  const titleRef = useRef<TextInput>(null);
  const more = usePopoverAnchor();
  const moreId = `detail:${task.id}:more`;
  const moreOpen = useIsOpen(moreId);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setNotes(task.notes ?? ''), [task.notes]);
  const subRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
  const [newSub, setNewSub] = useState('');
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [editSubText, setEditSubText] = useState('');
  // The keyboard goes where the card's key asked (2.27.0), else the title.
  useEffect(() => {
    const focus = getDetailFocus();
    // Estimate and actual (Ctrl+E, Ctrl+B) open their time drop-down.
    const dropDown = focus === 'estimate' ? 'Estimated time' : focus === 'actual' ? 'Actual time' : null;
    const refs: Record<string, React.RefObject<TextInput | null>> = { subtask: subRef, notes: notesRef, title: titleRef };
    const target = refs[focus ?? 'title'] ?? titleRef;
    const t = setTimeout(() => {
      // A click inside the modal in its first moments (Notes, a subtask) keeps the keyboard.
      const active = document.activeElement;
      if (active && active !== document.body && active.closest('[data-detail-panel]')) return;
      const btn = dropDown ? document.querySelector<HTMLElement>(`[data-detail-panel] [data-duration-select="${dropDown}"]`) : null;
      if (btn) btn.click();
      else (target.current ?? titleRef.current)?.focus();
    }, 30);
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
            {isDateKey(task.dueDate) && !multi && (
              <input
                type="time"
                step={300}
                value={task.startTime ?? ''}
                aria-label="Time"
                onChange={(e) => patch({ startTime: /^\d\d:\d\d$/.test(e.target.value) ? e.target.value : undefined })}
                style={domSelect}
              />
            )}
            {task.startTime && !multi ? (
              <Pressable onPress={() => patch({ startTime: undefined })} style={styles.xBtn} accessibilityRole="button" accessibilityLabel="Remove time" {...({ title: 'Remove time' } as object)}>
                <Ionicons name="close" size={13} color={Colors.textSecondary} />
              </Pressable>
            ) : null}
            {!multi ? addLink : null}
            {task.dueDate && !projected ? (
              <Pressable onPress={() => patch({ dueDate: undefined })} style={styles.quiet} accessibilityRole="button" accessibilityLabel="Remove the day">
                <Text style={styles.quietSub}>Remove date</Text>
              </Pressable>
            ) : null}
          </View>
          {multi ? (
            <View style={styles.row} {...({ dataSet: { timesList: '1' } } as object)}>
              {times.map((time, i) => {
                const done = isTimeDone(task, time);
                return (
                  <View key={time} style={styles.row} {...({ dataSet: { timeItem: time } } as object)}>
                    <Pressable
                      onPress={() => ops.setTimeDone(time, !done).then(onSaved)}
                      style={styles.xBtn}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
                      accessibilityLabel={`Mark the ${formatTime(time)} time ${done ? 'not done' : 'done'}`}
                      {...({ dataSet: { timeTick: time } } as object)}
                    >
                      <Ionicons name={done ? 'checkbox' : 'square-outline'} size={15} color={done ? Colors.accent : Colors.textSecondary} />
                    </Pressable>
                    <input
                      type="time"
                      step={300}
                      value={time}
                      aria-label={`Time ${i + 1}`}
                      onChange={(e) => {
                        if (/^\d\d:\d\d$/.test(e.target.value)) void applyTimes(moveTimeFields(task, time, e.target.value));
                      }}
                      style={domSelect}
                    />
                    <Pressable
                      onPress={() => applyTimes(removeTimeFields(task, time))}
                      style={styles.xBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove the ${formatTime(time)} time`}
                      {...({ title: `Remove the ${formatTime(time)} time` } as object)}
                    >
                      <Ionicons name="close" size={13} color={Colors.textSecondary} />
                    </Pressable>
                  </View>
                );
              })}
              {addLink}
            </View>
          ) : null}
          {timeNote ? (
            <Text style={styles.quietSub} accessibilityRole="alert" {...({ dataSet: { timeNote: '1' } } as object)}>
              {timeNote}
            </Text>
          ) : null}
        </DetailRow>

        <DetailRow glyph="⏳" label="Estimated time">
          <DurationSelect id={`${task.id}:estimate`} label="Estimated time" value={task.durationMinutes} onChange={(m) => patch({ durationMinutes: m })} />
        </DetailRow>

        <DetailRow glyph="⏱️" label="Actual time">
          <View style={styles.row}>
            <DurationSelect
              id={`${task.id}:actual`}
              label="Actual time"
              value={(task.actualMinutes ?? 0) > 0 ? task.actualMinutes : undefined}
              onChange={async (m) => {
                if (m === undefined) {
                  await patch({ actualMinutes: undefined });
                  return true;
                }
                // setActualFor reads the latest task and validates the number.
                const ok = await setActualFor(task.id, m);
                if (ok) onSaved();
                return ok;
              }}
            />
            {running && (
              <Text style={styles.valueText} {...({ dataSet: { mono: '1' } } as object)}>
                {formatTaskTime(task, now)}
              </Text>
            )}
            <Pressable
              onPress={() => toggleTimer(task)}
              style={styles.quiet}
              accessibilityRole="button"
              accessibilityLabel={running ? 'Stop the timer' : 'Start the timer'}
            >
              <Text style={running ? styles.timerOn : styles.quietSub}>{running ? '■ Stop timer' : '(Start timer)'}</Text>
            </Pressable>
            {!running && !task.completed && startFromChoices(task, new Date()).map((c) => (
              <Pressable
                key={c.time}
                onPress={() => toggleTimer(task, c.startedAtMs)}
                style={styles.quiet}
                accessibilityRole="button"
                accessibilityLabel={`Start the timer from ${formatTime(c.time)}, ${c.minutesAgo} minutes ago`}
                {...({ dataSet: { startFrom: c.time } } as object)}
              >
                <Text style={styles.quietSub}>{`(Start from ${formatTime(c.time)})`}</Text>
              </Pressable>
            ))}
          </View>
        </DetailRow>

        <DetailRow glyph="🏷️" label="Label">
          <LabelField task={task} labels={labels} ops={ops} onSaved={onSaved} />
        </DetailRow>

        {/* Must do (2.27.0): one switch over the stored priority (on = high, off = none). */}
        <DetailRow glyph={MUST_DO_MARK} label="Must do" shown="" tip={MUST_DO_TIP}>
          <View style={styles.row}>
            <Pressable
              onPress={() => patch(mustDoPatch(!isMustDo(task)))}
              style={[styles.switch, isMustDo(task) && styles.switchOn]}
              accessibilityRole="switch"
              accessibilityState={{ checked: isMustDo(task) }}
              accessibilityLabel={MUST_DO_TIP}
              // react-native-web leaves aria-checked off a switch: set it, so its state is read out.
              {...({ 'aria-checked': isMustDo(task), dataSet: { mustDoSwitch: isMustDo(task) ? '1' : '0' } } as object)}
            >
              <View style={[styles.knob, isMustDo(task) && styles.knobOn]} />
            </Pressable>
            <Text style={styles.quietText}>{isMustDo(task) ? 'Shown first in its day, with a ❗ marker' : 'Off'}</Text>
          </View>
        </DetailRow>

        <DetailRow glyph="🔁" label="Repeats">
          <RepeatField task={task} ops={ops} onSaved={onSaved} />
        </DetailRow>

        {/* Split (Part B; field cutsBelow): a break splits the timed tasks it overlaps into pieces. Off by default. */}
        <DetailRow glyph="✂️" label="Split" shown="Split" tip="Split">
          <View style={styles.row}>
            <Pressable
              onPress={() => patch({ cutsBelow: task.cutsBelow ? undefined : true })}
              style={[styles.switch, task.cutsBelow && styles.switchOn]}
              accessibilityRole="switch"
              accessibilityState={{ checked: !!task.cutsBelow }}
              accessibilityLabel="Split"
              {...({ 'aria-checked': !!task.cutsBelow, dataSet: { cutSwitch: task.cutsBelow ? '1' : '0' } } as object)}
            >
              <View style={[styles.knob, task.cutsBelow && styles.knobOn]} />
            </Pressable>
            <Text style={styles.quietText}>Splits the tasks it overlaps, so you still see them before and after it.</Text>
          </View>
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
                {listOptionText(l)}
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
            placeholder="Add any notes to the task"
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

      <Popover id={moreId} anchor={more.get} width={300} label="More task actions" maxHeight={560}>
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
        style={[styles.quiet, open && styles.openBg, { alignSelf: 'flex-start' }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Repeat: ${task.recurrence ? shortRepeat(task, dateKey(new Date())) ?? 'repeats' : 'Does not repeat'}`}
      >
        <Text style={styles.quietText}>{task.recurrence ? shortRepeat(task, dateKey(new Date())) ?? 'Repeats' : 'Does not repeat'}</Text>
      </Pressable>
      <Popover id={id} anchor={get} width={300}>
        <RepeatBody task={task} ops={wrapped} done={() => closePopover(true)} />
      </Popover>
    </>
  );
}

// The label menu of a card (TaskPopovers.LabelBody), opened from the modal
// (2.27.1): the label shows as its colour dot, emoji and name; the menu creates a
// label only through the form with name, emoji and colour.
function LabelField({ task, labels, ops, onSaved }: { task: Task; labels: Project[]; ops: TaskOps; onSaved: () => void }) {
  const { ref, get } = usePopoverAnchor();
  const id = `detail:${task.id}:label`;
  const open = useIsOpen(id);
  const wrapped: TaskOps = { ...ops, patch: (f) => ops.patch(f).then(onSaved) };
  const label = labels.find((l) => l.key === task.projectKey);
  const color = labelColor(label?.colorKey);
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.quiet, styles.labelBtn, open && styles.openBg]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label ? `Label: ${label.name}` : 'Label: none'}
        {...({ dataSet: { detailLabel: label?.key ?? '' } } as object)}
      >
        {label ? (
          <>
            <View style={[styles.labelDot, { backgroundColor: color?.edge ?? Colors.textSecondary }]} />
            <Text style={styles.quietText} numberOfLines={1}>
              {label.emoji ? `${label.emoji} ` : ''}
              {label.name}
            </Text>
          </>
        ) : (
          <Text style={styles.quietSub}>Select a label</Text>
        )}
      </Pressable>
      <Popover id={id} anchor={get} width={284} maxHeight={540} label="Task options">
        <LabelBody task={task} ops={wrapped} done={() => closePopover(true)} />
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
  const defaults = useDefaultReminders();
  const text = taskRemindersLabel(task, defaults);
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.quiet, open && styles.openBg, { alignSelf: 'flex-start' }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Reminder: ${text}`}
      >
        <Text style={styles.quietText} numberOfLines={2}>
          {text}
        </Text>
      </Pressable>
      <Popover id={id} anchor={get} width={260}>
        <ReminderBody task={task} ops={wrapped} done={() => closePopover(true)} />
      </Popover>
    </>
  );
}

// One row of the modal (2.27.1): one compact line, the name on the left and its
// value on the right, no divider lines.
// `label` keys the row; `shown` replaces the words on screen (the priority row shows
// only its mark) and `tip` is then its hover tooltip and screen reader name.
function DetailRow({ glyph, label, shown, tip, children }: { glyph: string; label: string; shown?: string; tip?: string; children: React.ReactNode }) {
  const text = shown ?? label;
  return (
    <View style={styles.detailRow} {...({ dataSet: { detailRow: label } } as object)}>
      <Text ref={tipRef(tip) as never} style={styles.rowLabel} numberOfLines={1} accessibilityRole="header" accessibilityLabel={tip}>
        {text ? `${glyph}  ${text}` : glyph}
      </Text>
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

// A value that reads as text until it is used (2.27.1, the compact rows).
const domSelect: React.CSSProperties = {
  height: 28,
  padding: '0 6px',
  borderRadius: 8,
  border: '1px solid transparent',
  background: 'transparent',
  color: Colors.textPrimary,
  fontSize: 13,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
  cursor: 'pointer',
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  tick: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  titleEmoji: { fontSize: 22 },
  titleInput: { flex: 1, minWidth: 0, fontSize: 23, fontWeight: '700', color: Colors.textPrimary, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', outlineColor: Colors.accent },
  titleDone: { color: Colors.textSecondary, textDecorationLine: 'line-through' },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  iconBtnOn: { backgroundColor: Colors.background },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 20, paddingBottom: 16, gap: 2 },
  // One line per row: the name on the left, the value on the right, no lines.
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  rowLabel: { width: 132, flexShrink: 0, fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  valueText: { fontSize: 13, color: Colors.textPrimary, paddingHorizontal: 6 },
  section: { gap: 4, paddingTop: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  switch: { width: 34, height: 20, borderRadius: 10, padding: 3, backgroundColor: Colors.border, justifyContent: 'center' },
  switchOn: { backgroundColor: Colors.accent },
  knob: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF' },
  knobOn: { alignSelf: 'flex-end' },
  input: { flex: 1, minWidth: 120, height: 28, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  inputBad: { borderColor: Colors.danger },
  bad: { fontSize: 12, color: Colors.danger },
  notes: { minHeight: 44, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  muted: { fontSize: 12, color: Colors.textSecondary },
  bigBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 26, borderRadius: 8, backgroundColor: Colors.background },
  bigBtnOn: { backgroundColor: Colors.accent },
  bigBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  bigBtnTextOn: { color: Colors.onAccent },
  quiet: { paddingHorizontal: 6, height: 28, borderRadius: 8, justifyContent: 'center' },
  quietText: { fontSize: 13, color: Colors.textPrimary },
  quietSub: { fontSize: 12, color: Colors.textSecondary },
  openBg: { backgroundColor: Colors.background },
  labelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  labelDot: { width: 8, height: 8, borderRadius: 4 },
  timerOn: { fontSize: 12, fontWeight: '600', color: Colors.accentText },
  xBtn: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  subText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  subDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  subInput: { height: 26, minWidth: 0, borderColor: 'transparent', backgroundColor: 'transparent' },
  subDelete: { padding: 6 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  yes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  no: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  menuEmoji: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  menuLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
});
