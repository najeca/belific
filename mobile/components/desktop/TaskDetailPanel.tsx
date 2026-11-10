import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { isDateKey } from '../../lib/kanban';
import { addSubtask, counterLabel, deleteSubtask, renameSubtask } from '../../lib/subtasks';
import { generateId } from '../../lib/data';
import { idDate, movedCaptionLong, projectOccurrences } from '../../lib/series';
import { reminderHint, taskRemindersLabel } from '../../lib/reminder';
import { useDefaultReminders } from './reminderStore';
import { effectiveListKey } from '../../lib/lists';
import { duplicateTaskById } from '../../lib/taskCommands';
import { loadLabels } from '../../lib/labels';
import { addTask, loadLists, loadTasksRaw } from '../../lib/storage';
import { DETAILS_LONGER, hostLinks, type HostLink } from '../../lib/hosting';
import { breakRefusal } from '../../lib/hostActions';
import { carryBreaks } from '../../lib/breakCarry';
import { toMinutes } from '../../lib/timebox';
import { taskDuration } from '../../lib/drag';
import { DuringBreak, InsideBreak } from './HostDetails';
import { BREAK_HINT, KIND_LABEL, TASK_HINT, breakIgnored, kindOf, kindPatch, type TaskKind } from '../../lib/taskKind';
import { isTextEntryTarget, ownsKeys } from '../../lib/editable';
import type { Project, Task, TaskList } from '../../lib/types';
import { MUST_DO_MARK, MUST_DO_TIP, isMustDo, mustDoPatch } from '../../lib/mustDo';
import { tipRef } from './tip';
import EmojiField from './EmojiField';
import DurationSelect from './DurationSelect';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import Popover, { Row, closePopover, isPopoverOpen, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { LabelBody, MoveToDayBody, ReminderBody, RepeatBody, SeriesNote } from './TaskPopovers';
import { labelColor } from '../../lib/labelColors';
import StreakLine from './StreakLine';
import { shortRepeat } from '../../lib/repeat';
import { dateKey } from '../../lib/kanban';
import { movesOneDay, opsForProjected, opsForTask, withoutDay, type TaskOps } from './taskOps';
import { moveDay } from '../../lib/seriesActions';
import { OWN_TIME_NOTE, SERIES_TIME_NOTE } from '../../lib/seriesTime';
import { formatTime } from '../../lib/data';
import { isMultiTime, MAX_TIMES, addTimeFields, isTimeDone, moveTimeFields, removeTimeFields, suggestNextTime, timesOf, type TimeEdit, type TimeRefusal } from '../../lib/times';
import { closeDetail, getDetailFocus, isDraftId, notifyChanged, openDetail, useDetailDraft, useDetailId, type NewTaskWhere } from './uiStore';
import { useFeatures } from './featureStore';
import { startFocus } from './pomodoroStore';
import { saveTemplateFromTask } from '../../lib/templateActions';
import Toggle from '../Toggle';
import ListPick from './ListPick';
import { PaneBand, RoundCheck, ShortDivider, checkRing, checkRingDone } from './ui';
import { useResolvedTheme } from './themeStore';
import { radius } from '../../lib/tokens';

// The task details (build plan phase 2; a centred modal since 2.26.0): every
// field of a task in one place, as fields and not as steps. Opens from Open
// details in a card's menu, or O on a focused card, and closes with its button,
// a press outside or Escape. It is not a screen: nothing navigates, the panes
// behind it stay as they were. Edits save as they are made (a blur or Enter for
// text, a click for choices), through the same task commands as the card, so a
// change here and on the card are the same change.
//
// The rows, in order: Task date, Estimated time, Label, Repeats,
// List, then Notes and Subtasks. Emoji, duplicate, save as template, pomodoro
// and delete are in the ⋮ menu. Repeats (phase 4) is the card's own Repeat
// control, opened from here.
export default function TaskDetailPanel({ refreshKey }: { refreshKey: number }) {
  const id = useDetailId();
  const where = useDetailDraft();
  const [task, setTask] = useState<Task | null>(null);
  // 3.23.0: a new task card (the + of an Add row): the fields live here, in memory, until the task has a title.
  const [draft, setDraft] = useState<Task | null>(null);
  const draftRef = useRef<Task | null>(null);
  const madeRef = useRef<Promise<unknown> | null>(null);
  // A day of a repeating series that is shown, not stored (decision 023): the
  // modal edits the series, as the card did, and opening it writes nothing.
  const [projected, setProjected] = useState(false);
  const [labels, setLabels] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  // 3.10.0: the task's day, as the Timebox draws it: the tasks inside this break, or the break it is during.
  const [links, setLinks] = useState<HostLink[]>([]);

  useEffect(() => {
    const blank = id && isDraftId(id) ? blankDraft(id, where ?? {}) : null;
    draftRef.current = blank;
    madeRef.current = null;
    setDraft(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A change to the new card: kept in memory while there is no title; with a title the task is stored under the
  // card's own id (so the open card carries on as an ordinary task, nothing remounts).
  const patchDraft = useCallback(async (fields: Partial<Task>) => {
    const cur = draftRef.current;
    if (!cur) return;
    // Already being stored (the title's blur, then Save): the change goes to the stored task once it is there.
    if (madeRef.current) {
      await madeRef.current;
      await opsForTask(cur).patch(fields);
      notifyChanged();
      await reload();
      return;
    }
    const next: Task = { ...cur, ...fields };
    draftRef.current = next;
    setDraft(next);
    const title = next.title.trim();
    if (!title) return;
    const now = new Date().toISOString();
    madeRef.current = addTask({ ...next, title, createdAt: now, updatedAt: now });
    await madeRef.current;
    notifyChanged();
    await reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setLinks(found && found.dueDate ? hostLinks(tasks, found.dueDate, dateKey(new Date())) : []);
    setLabels(l);
    setLists(ls);
    // The task was deleted (here, or on the other device): nothing to show. A new card is not stored yet.
    if (!found && !isDraftId(id)) closeDetail();
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

  const shown = task ?? (isDraftId(id) ? draft : null);
  if (!id || !shown) return null;
  return (
    <View style={styles.layer} {...({ dataSet: { detailLayer: '1' } } as object)}>
      <Pressable style={styles.scrim} onPress={closeDetail} accessibilityLabel="Close the task details" {...({ tabIndex: -1 } as object)} />
      <View style={styles.centre} pointerEvents="box-none">
        <Panel key={shown.id} task={shown} projected={projected} labels={labels} lists={lists} links={links} draftPatch={task ? undefined : patchDraft} onSaved={() => { if (task) { notifyChanged(); reload(); } }} />
      </View>
    </View>
  );
}

// A new card that is not stored yet (3.23.0): every change goes to the card's memory.
function blankDraft(id: string, where: NewTaskWhere): Task {
  const now = new Date().toISOString();
  const t: Task = { id, title: '', completed: false, createdAt: now, updatedAt: now };
  if (where.listKey) t.listKey = where.listKey;
  if (where.dueDate) t.dueDate = where.dueDate;
  if (where.dueDate && where.startTime) t.startTime = where.startTime;
  if (where.projectKey) t.projectKey = where.projectKey;
  if (where.durationMinutes) t.durationMinutes = where.durationMinutes;
  return t;
}

function Panel({ task, projected, labels, lists, links, onSaved, draftPatch }: { task: Task; projected: boolean; labels: Project[]; lists: TaskList[]; links: HostLink[]; onSaved: () => void; draftPatch?: (fields: Partial<Task>) => Promise<void> }) {
  const drafting = !!draftPatch;
  const dark = useResolvedTheme() === 'dark';
  const draftOps: TaskOps = {
    patch: draftPatch ?? (async () => {}),
    patchDay: draftPatch ?? (async () => {}),
    setCompleted: async (done) => void (await draftPatch?.({ completed: done })),
    setTimeDone: async () => {},
    toggleSubtask: async (sid) => void (await draftPatch?.({ subtasks: (task.subtasks ?? []).map((s) => (s.id === sid ? { ...s, done: !s.done } : s)) })),
    remove: async () => closeDetail(),
  };
  const ops: TaskOps = drafting ? draftOps : projected ? opsForProjected(task) : opsForTask(task);
  const patch = async (fields: Partial<Task>) => {
    if (drafting) {
      await draftPatch?.(fields);
      return;
    }
    // 3.11.0: a hosted task changed so it would stick out of its break (or a new start inside a break it
    // does not fit) is refused, and the Time row says why.
    const refused = await breakRefusal(task, fields, 'details');
    if (refused) {
      setTimeNote(refused);
      onSaved();
      return;
    }
    if (timeNote === DETAILS_LONGER) setTimeNote(null);
    // D5 (PLAN_breaks_as_gaps P3): a new time or day for a placed task takes the breaks inside it along, in the same
    // gesture (one undo). A task with several times changes them in the Time row, not here.
    const was = !isMultiTime(task) && task.dueDate ? toMinutes(task.startTime) : null;
    const newDay = isDateKey(fields.dueDate) && fields.dueDate !== task.dueDate ? fields.dueDate : undefined;
    const moves = was !== null && (('startTime' in fields && !!fields.startTime) || !!newDay);
    const carry = () =>
      moves && was !== null && task.dueDate
        ? carryBreaks(task, { dayKey: task.dueDate, startMin: was, endMin: was + taskDuration(task) }, newDay ?? task.dueDate, toMinutes(fields.startTime ?? task.startTime) ?? was, 'panel')
        : Promise.resolve(0);
    // A new Day on a repeating task moves this day only (3.2.0); the series' first row comes back
    // under a new id (series.planMoveDay), so the details follow it there.
    if (task.recurrence && movesOneDay(task, fields)) {
      const row = await moveDay(task, fields.dueDate as string, withoutDay(fields));
      await carry();
      if (row && row.id !== task.id) openDetail(row.id);
      onSaved();
      return;
    }
    await ops.patch(fields);
    await carry();
    onSaved();
  };
  const dayOps: TaskOps = { ...ops, patch };
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [confirming, setConfirming] = useState(false);
  const feats = useFeatures();
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplNote, setTplNote] = useState<string | null>(null);
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
    // Estimate (Ctrl+E) opens its time drop-down.
    const dropDown = focus === 'estimate' ? 'Estimated time' : null;
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

  // 3.23.0: Save on a new card stores it (when it has a title) and closes; without a title it only asks for one.
  const saveNew = async () => {
    const t = title.trim();
    if (!t) {
      titleRef.current?.focus();
      return;
    }
    await patch({ title: t });
    closeDetail();
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
    <View style={[styles.panel, dark ? styles.panelDark : styles.panelSlab]} accessibilityLabel="Task details" {...({ role: 'dialog', 'aria-modal': true, dataSet: { detailPanel: '1' } } as object)}>
      <PaneBand />
      <View style={styles.header}>
        {!drafting && !task.cutsBelow && (
        <Pressable
          // Completing goes through setTaskCompleted (subtasks, repeats), not a bare patch.
          onPress={() => ops.setCompleted(!task.completed).then(onSaved)}
          style={[styles.tick, task.completed && styles.tickOn]}
          accessibilityRole="button"
          accessibilityLabel={task.completed ? 'Reopen the task' : 'Mark the task complete'}
        >
          {task.completed && <Ionicons name="checkmark" size={18} color={Colors.onAccent} />}
        </Pressable>
        )}
        {task.emoji ? <Text style={styles.titleEmoji}>{task.emoji}</Text> : null}
        <TextInput
          ref={titleRef}
          style={[styles.titleInput, task.completed && styles.titleDone]}
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          onSubmitEditing={saveTitle}
          accessibilityLabel="Title"
          placeholder={drafting ? 'New task' : undefined}
          placeholderTextColor={Colors.textSecondary}
        />
        {drafting ? (
          <Pressable onPress={saveNew} style={styles.bigBtn} accessibilityRole="button" accessibilityLabel="Save the new task" {...({ dataSet: { ctl: 'saveNew' } } as object)}>
            <Text style={styles.bigBtnText}>Save</Text>
          </Pressable>
        ) : (
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
        )}
        <Pressable onPress={closeDetail} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close task details">
          <Ionicons name="close" size={22} color={Colors.background} />
        </Pressable>
      </View>
      <ShortDivider width={80} style={{ marginTop: 14, marginBottom: 6 }} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {projected && <SeriesNote />}
        {movedCaptionLong(task) ? (
          <Text style={styles.quietSub} {...({ dataSet: { detailMoved: '1' } } as object)}>
            ↪ {movedCaptionLong(task)}
          </Text>
        ) : null}
        <StreakLine task={task} />
        <InsideBreak links={links.filter((l) => l.brk.full.id === task.id)} labels={labels} />
        <DuringBreak links={links.filter((l) => l.guest.full.id === task.id)} labels={labels} />
        <DetailRow icon="calendar-outline" label="Task date">
          <View style={styles.row}>
            <input
              type="date"
              value={isDateKey(task.dueDate) ? task.dueDate : ''}
              aria-label="Day"
              min={task.recurrence ? dateKey(new Date()) : undefined}
              // A day of a repeating task is never left without a Day (it would leave the series).
              onChange={(e) => (e.target.value || !task.recurrence ? patch({ dueDate: e.target.value || undefined }) : undefined)}
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
            <DatePickField task={task} ops={dayOps} onSaved={onSaved} />
            {task.startTime && !multi ? (
              <Pressable onPress={() => patch({ startTime: undefined })} style={styles.xBtn} accessibilityRole="button" accessibilityLabel="Remove time" {...({ title: 'Remove time' } as object)}>
                <Ionicons name="close" size={13} color={Colors.textSecondary} />
              </Pressable>
            ) : null}
            {!multi ? addLink : null}
            {task.dueDate && !projected && !task.recurrence ? (
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
                      <RoundCheck done={done} size={16} />
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
          ) : task.recurrence ? (
            <Text style={styles.quietSub} {...({ dataSet: { seriesTimeNote: '1' } } as object)}>
              {movedCaptionLong(task) ? OWN_TIME_NOTE : SERIES_TIME_NOTE}
            </Text>
          ) : null}
        </DetailRow>

        <DetailRow icon="hourglass-outline" label="Estimated time">
          <DurationSelect id={`${task.id}:estimate`} label="Estimated time" value={task.durationMinutes} onChange={(m) => patch({ durationMinutes: m })} />
        </DetailRow>

        <DetailRow icon="pricetag-outline" label="Label">
          <LabelField task={task} labels={labels} ops={ops} onSaved={onSaved} />
        </DetailRow>

        {/* Must do (2.27.0): one switch over the stored priority (on = high, off = none). */}
        <DetailRow glyph={MUST_DO_MARK} label="Must do" shown="" tip={MUST_DO_TIP}>
          <View style={styles.row}>
            <Toggle value={isMustDo(task)} onValueChange={(v) => patch(mustDoPatch(v))} label={MUST_DO_TIP} dataSet={{ mustDoSwitch: isMustDo(task) ? '1' : '0' }} />
            <Text style={styles.quietText}>{isMustDo(task) ? 'Shown first in its day, with a ❗ marker' : 'Off'}</Text>
          </View>
        </DetailRow>

        <DetailRow icon="repeat-outline" label="Repeats">
          <RepeatField task={task} ops={ops} onSaved={onSaved} />
        </DetailRow>

        {/* Task or Break (3.27.0; was the Split switch, field cutsBelow): a Break cuts the timed tasks it overlaps into pieces. */}
        <DetailRow icon={kindOf(task) === 'break' ? 'cafe-outline' : 'checkmark-circle-outline'} label={KIND_LABEL} shown="Type" tip={KIND_LABEL}>
          <KindChoice value={kindOf(task)} onChange={(k) => patch(kindPatch(k))} />
          <Text style={styles.hintText} {...({ dataSet: { kindHint: kindOf(task) } } as object)}>
            {kindOf(task) === 'break' ? BREAK_HINT : TASK_HINT}
          </Text>
          {task.cutsBelow && links.some((l) => l.guest.full.id === task.id) ? (
            <Text style={styles.quietSub} {...({ dataSet: { splitIgnored: '1' } } as object)}>
              {breakIgnored(links.find((l) => l.guest.full.id === task.id)?.brk.full.title ?? 'the break')}
            </Text>
          ) : null}
        </DetailRow>

        {feats.dueDates && (
          <DetailRow icon="notifications-outline" label="Reminder">
            <ReminderField task={task} ops={ops} onSaved={onSaved} />
          </DetailRow>
        )}

        <DetailRow icon="list-outline" label="List">
          <ListPick lists={lists} value={listKey} onChange={(key) => patch({ listKey: key })} />
        </DetailRow>

        <View style={styles.divider} />
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="document-text-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.sectionLabel} accessibilityRole="header">
              Notes
            </Text>
          </View>
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

        <View style={styles.divider} />
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="checkbox-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.sectionLabel} accessibilityRole="header">
              Subtasks  {counterLabel(task.subtasks)}
            </Text>
          </View>
          {subtasks.map((s) => (
            <View key={s.id} style={styles.subRow} {...({ dataSet: { subRow: s.id } } as object)}>
              <Pressable
                onPress={() => ops.toggleSubtask(s.id).then(onSaved)}
                accessibilityRole="button"
                accessibilityLabel={s.done ? `Untick ${s.title}` : `Tick ${s.title}`}
              >
                <RoundCheck done={s.done} size={18} />
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

// The date popover (TaskPopovers.MoveToDayBody): Today, Tomorrow, Next week and a month grid, beside
// the date field. The field itself is unchanged; this only offers the quick way to the same value.
function DatePickField({ task, ops, onSaved }: { task: Task; ops: TaskOps; onSaved: () => void }) {
  const { ref, get } = usePopoverAnchor();
  const id = `detail:${task.id}:date`;
  const open = useIsOpen(id);
  const wrapped: TaskOps = { ...ops, patch: (f) => ops.patch(f).then(onSaved) };
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.xBtn, open && styles.openBg]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Pick a date"
        {...({ title: 'Pick a date', dataSet: { ctl: 'datePick' } } as object)}
      >
        <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
      </Pressable>
      <Popover id={id} anchor={get} width={288} maxHeight={560}>
        <MoveToDayBody task={task} ops={wrapped} done={() => closePopover(true)} />
      </Popover>
    </>
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
  // Part C: with several times a day the list applies to each of them.
  const text = `${taskRemindersLabel(task, defaults)}${isMultiTime(task) ? ', for each time' : ''}`;
  const hint = reminderHint(task);
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
      {hint && (Array.isArray(task.reminders) || task.reminderMinutes != null) ? (
        <Text style={styles.hintText} {...({ dataSet: { reminderRowHint: '1' } } as object)}>
          {hint}
        </Text>
      ) : null}
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
// Task | Break (3.27.0): two options side by side, each with its icon; the chosen one is filled.
function KindChoice({ value, onChange }: { value: TaskKind; onChange: (k: TaskKind) => void }) {
  const opts: Array<[TaskKind, string, React.ComponentProps<typeof Ionicons>['name']]> = [
    ['task', 'Task', 'checkmark-circle-outline'],
    ['break', 'Break', 'cafe-outline'],
  ];
  return (
    <View style={styles.kindSeg} accessibilityRole="radiogroup" accessibilityLabel={KIND_LABEL} {...({ dataSet: { kindChoice: value } } as object)}>
      {opts.map(([k, text, icon]) => {
        const on = value === k;
        return (
          <Pressable
            key={k}
            onPress={() => !on && onChange(k)}
            style={[styles.kindOpt, on && styles.kindOptOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={text}
            {...({ 'aria-checked': on, dataSet: { kind: k } } as object)}
          >
            <Ionicons name={icon} size={16} color={on ? Colors.onAccent : Colors.onHostPill} />
            <Text style={[styles.kindText, on && styles.kindTextOn]}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DetailRow({ glyph, icon, label, shown, tip, children }: { glyph?: string; icon?: React.ComponentProps<typeof Ionicons>['name']; label: string; shown?: string; tip?: string; children: React.ReactNode }) {
  const text = shown ?? label;
  return (
    <View style={styles.detailRow} {...({ dataSet: { detailRow: label } } as object)}>
      {text ? (
        <View style={styles.rowLabelBox}>
          {icon ? <Ionicons name={icon} size={16} color={Colors.textSecondary} /> : null}
          <Text ref={tipRef(tip) as never} style={styles.rowLabel} numberOfLines={1} accessibilityRole="header" accessibilityLabel={tip}>
            {text}
          </Text>
        </View>
      ) : (
        // The priority row shows only its mark: the mark itself carries the tooltip and the name.
        <Text ref={tipRef(tip) as never} style={styles.rowGlyph} accessibilityRole="header" accessibilityLabel={tip}>
          {glyph}
        </Text>
      )}
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

// A value that reads as text until it is used (2.27.1, the compact rows).
const domSelect: React.CSSProperties = {
  height: 34,
  padding: '0 6px',
  borderRadius: 8,
  border: '1px solid transparent',
  background: 'transparent',
  color: Colors.textPrimary,
  fontSize: 16,
  fontWeight: 700,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
  cursor: 'pointer',
  minWidth: 0,
  maxWidth: '100%',
};

const styles = StyleSheet.create({
  // 3.32.0: Task | Break: two square buttons side by side, the chosen one primary.
  kindSeg: { flexDirection: 'row', alignSelf: 'flex-start' },
  kindOpt: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 16, borderRadius: radius.square, backgroundColor: Colors.hostPill },
  kindOptOn: { backgroundColor: Colors.accent },
  kindText: { fontSize: 16, fontWeight: '700', color: Colors.onHostPill },
  kindTextOn: { color: Colors.onAccent },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Colors.scrim, cursor: 'default' } as never,
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: {
    width: 640,
    maxWidth: '100%',
    maxHeight: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  } as never,
  // 3.32.0: a flat 10 px slab behind the window on light (--ds-slab-window-offset, 0 on dark, where the soft shadow stays).
  panelSlab: { boxShadow: `var(--ds-slab-window-offset, 0px) var(--ds-slab-window-offset, 0px) 0 0 ${Colors.borderStrong}` } as never,
  panelDark: { boxShadow: Colors.shadowLg } as never,
  // The study's measurements: header 20px 35px 5px, body 0 35px 30px.
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 34, paddingTop: 8 + 22, paddingBottom: 5 },
  tick: { ...checkRing(26), borderWidth: 3 } as object,
  tickOn: { ...checkRingDone },
  titleEmoji: { fontSize: 22 },
  titleInput: { flex: 1, minWidth: 0, fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: Colors.textPrimary, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', outlineColor: Colors.accent },
  titleDone: { color: Colors.textSecondary, textDecorationLine: 'line-through' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.square },
  // The close button is a 44 px ink circle (round, like the avatar).
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.textPrimary },
  iconBtnOn: { backgroundColor: Colors.hover },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 34, paddingBottom: 30, gap: 2 },
  // A short, thick, centred divider between the sections.
  divider: { height: 4, width: 80, alignSelf: 'center', backgroundColor: Colors.border, marginTop: 14, marginBottom: 4 },
  // One line per row: the name on the left, the value on the right, no lines.
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, minHeight: 44 },
  // An icon in front of a grey bold label (15/700; 156 px so "Estimated time" is not cut).
  rowLabelBox: { width: 156, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  rowGlyph: { fontSize: 16, width: 156, minHeight: 44, lineHeight: 44, flexShrink: 0, color: Colors.textPrimary },
  rowLabel: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  valueText: { fontSize: 13, color: Colors.textPrimary, paddingHorizontal: 6 },
  section: { gap: 4, paddingTop: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  input: { flex: 1, minWidth: 120, height: 28, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  inputBad: { borderColor: Colors.danger },
  bad: { fontSize: 12, color: Colors.danger },
  // Notes: a raised, quiet field (no outline), radius 10.
  notes: { minHeight: 70, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: Colors.surfaceRaised, color: Colors.textPrimary, fontSize: 15, outlineColor: Colors.accent },
  muted: { fontSize: 12, color: Colors.textSecondary },
  bigBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, height: 36, borderRadius: radius.square, backgroundColor: Colors.accent },
  bigBtnOn: { backgroundColor: Colors.accent },
  bigBtnText: { fontSize: 16, fontWeight: '700', color: Colors.onAccent },
  bigBtnTextOn: { color: Colors.onAccent },
  quiet: { paddingHorizontal: 6, height: 36, borderRadius: 8, justifyContent: 'center' },
  // A value in a row: 16/700 in the text colour.
  quietText: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  // A hint: 11px, grey (the study's hint size).
  hintText: { fontSize: 12, color: Colors.textSecondary },
  quietSub: { fontSize: 13, color: Colors.textSecondary },
  openBg: { backgroundColor: Colors.background },
  labelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  labelDot: { width: 8, height: 8, borderRadius: 4 },
  xBtn: { width: 26, height: 26, borderRadius: radius.square, alignItems: 'center', justifyContent: 'center' },
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
