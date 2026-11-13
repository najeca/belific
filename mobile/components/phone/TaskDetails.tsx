import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { addDays, dateKey, formatDayLabel, formatDayTitle, isDateKey, parseDateKey } from '../../lib/kanban';
import { formatTime, generateId } from '../../lib/data';
import { DURATION_PRESETS, formatDuration, parseDuration, presetLabel } from '../../lib/duration';
import { isMustDo, MUST_DO_MARK } from '../../lib/mustDo';
import { labelColor } from '../../lib/labelColors';
import { createLabel, loadLabels } from '../../lib/labels';
import { liveLists } from '../../lib/lists';
import { addSubtask, deleteSubtask, renameSubtask } from '../../lib/subtasks';
import { opsForProjected, opsForTask } from '../../lib/taskOps';
import { materialise, moveDay } from '../../lib/seriesActions';
import { END_REPEAT_HERE, MOVE_THIS_DAY_NOTE, endTooEarlyText, movedCaptionLong, seriesOf } from '../../lib/series';
import { rootTaskId } from '../../lib/recurrence';
import { OWN_TIME_NOTE, SERIES_TIME_NOTE } from '../../lib/seriesTime';
import { BREAK_HINT, KIND_LABEL, TASK_HINT, kindOf, kindPatch, showsInside, type TaskKind } from '../../lib/taskKind';
import { addTask, loadListsRaw, loadTasksRaw } from '../../lib/storage';
import { ADD_PART, CHECKLIST, PARTS, TURN_INTO_PARTS, canHaveParts, deleteAllText, deleteOnlyText, parentTaskOf, partOfText, partsAddUp, partsFor, partsProgress, takeOutText } from '../../lib/parts';
import { addPart, convertSteps, deleteSeriesWithParts, deleteWithParts, setPartDone, takeOut } from '../../lib/partActions';
import { datePatch, durationPatch, emojiPatch, labelPatch, listPatch, notesPatch, priorityPatch, timePatch, titlePatch } from '../../lib/detailsPatches';
import type { Project, Task, TaskList } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { useReducedMotion } from './touch';
import { ActionMenu, type MenuItem } from './menu';
import { MonthGrid } from './MonthGrid';
import { TimeField } from './TimeField';
import { inter, mono, type } from './type';
import { Button, LabelDot, RoundCheck } from './ui';
import Toggle from '../Toggle';
import { RepeatEditor } from './RepeatEditor';
import { TimesEditor } from './TimesEditor';
import { RemindersEditor } from './RemindersEditor';
import { repeatKindOf, REPEAT_CHOICES, repeatLine } from '../../lib/repeat';
import { reminderHint, taskRemindersLabel } from '../../lib/reminder';
import { isMultiTime, timesOf } from '../../lib/times';
import { hostLinks, type HostLink } from '../../lib/hosting';
import { breakRefusal, moveOutOfBreak } from '../../lib/hostActions';
import { formatMinutes, toTime } from '../../lib/timebox';
import { UNDO_MS } from './UndoBar';

// A task's details on the iPhone (PLAN_phone P6): the desktop's details panel for a finger, as a full
// sheet. Every change is written at once through the shared taskOps (a projected day of a repeating
// series edits the series; its date moves only that day, stored first), with patches that name only
// their own fields (lib/detailsPatches.ts), so nothing the phone does not show is ever lost.
// P7 (2.55.0): Repeat, extra times (several times a day) and reminders, with the desktop's rules.

export interface DetailsTarget {
  task: Task;
  projected: boolean;
  // 3.23.0: a new task that is not stored yet (the + of the Tasks tab's add row); it is stored when it has a title.
  draft?: boolean;
}

type Open = 'date' | 'time' | 'duration' | 'repeat' | 'until' | 'times' | 'reminders' | null;

const make = (c: ColorTokens) => ({
  screen: { flex: 1, backgroundColor: c.background },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.pane },
  headTitle: { ...type.sheetTitle, color: c.textPrimary },
  doneBtn: { minHeight: 44, minWidth: 64, alignItems: 'flex-end' as const, justifyContent: 'center' as const },
  doneText: { ...inter(700), fontSize: 17, color: c.accentText },
  titleRow: { flexDirection: 'row' as const, gap: 8, alignItems: 'center' as const },
  titleInput: { flex: 1, ...inter(600), fontSize: 20, color: c.textPrimary, minHeight: 48, paddingHorizontal: 4 },
  emojiInput: { width: 52, minHeight: 44, textAlign: 'center' as const, fontSize: 22, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 52, paddingHorizontal: 14, gap: 12 },
  sep: { borderTopWidth: 1, borderTopColor: c.border },
  rowLabel: { ...inter(500), fontSize: 16, color: c.textPrimary, flex: 1 },
  rowValue: { ...inter(500), fontSize: 15, color: c.textSecondary },
  rowValueSet: { color: c.textPrimary },
  panel: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  chipTextOn: { color: c.onAccent },
  input: { ...inter(400), fontSize: 16, color: c.textPrimary, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.pane },
  notes: { ...inter(400), fontSize: 16, color: c.textPrimary, minHeight: 96, padding: 12, textAlignVertical: 'top' as const },
  step: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 48, paddingHorizontal: 14 },
  stepInput: { flex: 1, ...inter(400), fontSize: 16, color: c.textPrimary, minHeight: 44 },
  section: { ...type.section, color: c.textSecondary, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  note: { ...type.meta, color: c.textSecondary },
  warn: { ...type.meta, color: c.danger },
  mark: { fontSize: 18, color: c.danger },
  // 3.27.0: Task | Break, two options of 44pt.
  kindCard: { padding: 12, gap: 8 },
  kindSeg: { flexDirection: 'row' as const, gap: 4, padding: 3, borderRadius: radius.md, backgroundColor: c.pane },
  kindOpt: { flex: 1, minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, borderRadius: radius.md - 2 },
  kindOptOn: { backgroundColor: c.accent },
  kindText: { ...inter(600), fontSize: 15, color: c.textSecondary },
  kindTextOn: { color: c.onAccent },
  // 3.10.0: "Inside this break" and "Shows inside Lunch" (3.27.0; was "During: Lunch").
  hostBox: { backgroundColor: c.hostPill, borderRadius: radius.lg, paddingHorizontal: 6, paddingVertical: 4, marginTop: 10 },
  hostHead: { ...type.meta, ...inter(700), color: c.onHostPill, paddingHorizontal: 8, paddingTop: 6 },
  hostRow: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 48, gap: 4 },
  hostTick: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  hostOpen: { flex: 1, minHeight: 44, justifyContent: 'center' as const },
  hostName: { ...inter(600), fontSize: 15, color: c.onHostPill },
  hostMeta: { ...type.meta, color: c.onHostPill },
  hostOut: { minHeight: 44, minWidth: 64, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: c.onHostPill, alignItems: 'center' as const, justifyContent: 'center' as const },
  hostOutText: { ...inter(600), fontSize: 14, color: c.onHostPill },
  // R6: Parts, 44pt rows, 14 px or more, nothing red.
  partRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 48, paddingHorizontal: 14 },
  partTitle: { flex: 1, ...inter(500), fontSize: 16, color: c.textPrimary },
  partBtn: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  partBtnText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  partsBar: { height: 6, borderRadius: 3, backgroundColor: c.borderStrong, overflow: 'hidden' as const, marginHorizontal: 14, marginTop: 12 },
  partsBarFill: { height: 6, borderRadius: 3, backgroundColor: c.accent },
  partOfRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 8, marginTop: 8 },
  undoRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: c.inverseBg },
  undoText: { ...inter(500), fontSize: 14, color: c.inverseText, flex: 1 },
  undoBtn: { minWidth: 64, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  undoBtnText: { ...inter(700), fontSize: 14, color: c.inverseText, textDecorationLine: 'underline' as const },
});

export function TaskDetails({ target, onClose, onChanged }: { target: DetailsTarget | null; onClose: () => void; onChanged: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [task, setTask] = useState<Task | null>(null);
  const [projected, setProjected] = useState(false);
  const [labels, setLabels] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [open, setOpen] = useState<Open>(null);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('');
  const [notes, setNotes] = useState('');
  const [newStep, setNewStep] = useState('');
  // R6: Parts (the same rules as the desktop's) and Repeat until.
  const [parts, setParts] = useState<Task[]>([]);
  const [partOf, setPartOf] = useState<Task | undefined>(undefined);
  const [newPartText, setNewPartText] = useState('');
  const [seriesStart, setSeriesStart] = useState<string | undefined>(undefined);
  const [untilNote, setUntilNote] = useState<string | null>(null);
  const [partsAsk, setPartsAsk] = useState(false);
  const partInputRef = useRef<TextInput>(null);
  const [customDur, setCustomDur] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ title: string; items: MenuItem[] } | null>(null);
  const [newLabel, setNewLabel] = useState<string | null>(null);
  const todayKey = dateKey(new Date());
  // 3.10.0: the task's day as the Calendar draws it, and the Undo of a Move out (5 seconds).
  const [links, setLinks] = useState<HostLink[]>([]);
  const [undo, setUndo] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  // 3.11.0: why a time, a length or a day was refused (shown whichever row was open).
  const [breakNote, setBreakNote] = useState<string | null>(null);
  // 3.23.0: true while this is a new task with no title yet (nothing is stored).
  const [unsaved, setUnsaved] = useState(false);
  const titleRef = useRef<TextInput>(null);
  const refreshHost = useCallback(async (t: Task) => {
    setLinks(t.dueDate ? hostLinks(await loadTasksRaw(), t.dueDate, dateKey(new Date())) : []);
  }, []);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const show = useCallback((t: Task, proj: boolean) => {
    setTask(t);
    setProjected(proj);
    void refreshHost(t);
    setTitle(t.title);
    setEmoji(t.emoji ?? '');
    setNotes(t.notes ?? '');
    // R6: the task's parts (a repeating parent's, for its day), whose part it is, and where its series starts.
    void loadTasksRaw().then((raw) => {
      setParts(partsFor(raw, t));
      setPartOf(parentTaskOf(t, raw));
      setSeriesStart(t.recurrence ? seriesOf(raw, rootTaskId(t.id))?.startKey : undefined);
    });
  }, [refreshHost]);

  useEffect(() => {
    if (!target) return;
    setUndo(null);
    setBreakNote(null);
    show(target.task, target.projected);
    setUnsaved(!!target.draft);
    // The sheet's own focus handling can win a race with autoFocus: ask once more when it has settled.
    const focusLater = target.draft ? setTimeout(() => titleRef.current?.focus(), 350) : null;
    setOpen(null);
    setNote(null);
    setUntilNote(null);
    setPartsAsk(false);
    setNewPartText('');
    setNewLabel(null);
    loadLabels().then(setLabels).catch(() => {});
    loadListsRaw().then(setLists).catch(() => {});
    return () => {
      if (focusLater) clearTimeout(focusLater);
    };
  }, [target, show]);

  if (!target || !task) return null;
  const ops = projected ? opsForProjected(task) : opsForTask(task);

  // Writes a patch, then shows the task as stored (a projected day: the patch is shown on it).
  async function write(fields: Partial<Task> | null) {
    if (!task || !fields || Object.keys(fields).length === 0) return;
    // 3.23.0: a new task is kept in memory until it has a title, then stored under its own id.
    if (unsaved) {
      const next: Task = { ...task, ...fields };
      if (next.title.trim()) {
        const now = new Date().toISOString();
        setUnsaved(false);
        await addTask({ ...next, title: next.title.trim(), createdAt: now, updatedAt: now });
        onChanged();
      }
      show(next, false);
      return;
    }
    // 3.11.0: a time, a length or a day that would leave a task sticking out of a break is refused.
    const refused = await breakRefusal(task, fields, 'details');
    if (refused) {
      setBreakNote(refused);
      return;
    }
    setBreakNote(null);
    await ops.patch(fields);
    const stored = projected ? null : (await loadTasksRaw()).find((t) => t.id === task.id);
    show(stored ?? { ...task, ...fields }, projected);
    onChanged();
  }

  // The date of a day of a repeating task (projected or stored) moves only that day (3.2.0): through
  // seriesActions.moveDay, as on the desktop. The series' first row comes back under a new id.
  async function setDate(key: string | undefined) {
    if (!task) return;
    setOpen(null);
    const refused = key ? await breakRefusal(task, { dueDate: key }, 'details') : null;
    if (refused) {
      setBreakNote(refused);
      return;
    }
    if (task.recurrence && key) {
      const row = await moveDay(task, key);
      if (row) show(row, false);
      onChanged();
      return;
    }
    if (projected) {
      const row = await materialise(task);
      if (!row) return;
      const stored = { ...row };
      await opsForTask(stored).patch(datePatch(key));
      const after = (await loadTasksRaw()).find((t) => t.id === row.id);
      if (after) show(after, false);
      onChanged();
      return;
    }
    await write(datePatch(key));
  }

  async function setTime(time: string | undefined) {
    if (!task) return;
    const res = timePatch(task, time);
    if ('note' in res) {
      setNote(res.note);
      return;
    }
    setNote(null);
    await write(res.fields);
  }

  const inside = links.filter((l) => l.brk.full.id === task.id);
  const during = links.filter((l) => l.guest.full.id === task.id);
  async function tickHosted(l: HostLink) {
    const o = l.guest.projected ? opsForProjected(l.guest.full) : opsForTask(l.guest.full);
    await (l.guest.time ? o.setTimeDone(l.guest.time, !l.guest.task.completed) : o.setCompleted(!l.guest.task.completed));
    if (task) await refreshHost(task);
    onChanged();
  }
  async function moveOut(l: HostLink) {
    if (!task) return;
    const r = await moveOutOfBreak({ full: l.guest.full, time: l.guest.time, projected: l.guest.projected }, { endMin: l.brk.endMin, title: l.brk.task.title });
    if (!r.ok) {
      setNote(r.note);
      return;
    }
    setUndo({ text: r.text, run: r.undo });
    const stored = (await loadTasksRaw()).find((t) => t.id === task.id);
    show(stored ?? task, projected && !stored);
    onChanged();
  }

  const label = task.projectKey ? labels.find((l) => l.key === task.projectKey) : undefined;
  const list = task.listKey ? liveLists(lists).find((l) => l.key === task.listKey) : undefined;
  const liveLabels = labels.filter((l) => !l.deletedAt);
  const steps = task.subtasks ?? [];
  // R6: parts on a task, repeating or not (not a part, not free time); the old steps show only when the task has some.
  const partsHere = !unsaved && !partOf && canHaveParts(task);
  const showSteps = !partOf && (!partsHere || steps.length > 0);
  const progress = partsProgress(parts);
  const addsUp = partsAddUp(task, parts, formatMinutes);
  const reshow = async () => {
    const raw = await loadTasksRaw();
    const stored = raw.find((t) => t.id === task.id && !t.deletedAt);
    // A projected day has no row of its own: it takes the end from its series' root (Repeat until is set on every row).
    const root = !stored && task.recurrence ? raw.find((t) => t.id === rootTaskId(task.id) && !t.deletedAt) : undefined;
    show(stored ?? (root ? { ...task, repeatUntil: root.repeatUntil } : task), projected && !stored);
    onChanged();
  };
  const addOnePart = async () => {
    const made = await addPart(task, newPartText);
    if (made) {
      setNewPartText('');
      await reshow();
    }
    partInputRef.current?.focus();
  };
  const until = isDateKey(task.repeatUntil) ? task.repeatUntil : undefined;
  const dayText = task.dueDate ? formatDayTitle(task.dueDate, todayKey) : 'No date';
  const tomorrowKey = dateKey(addDays(parseDateKey(todayKey), 1));

  const labelMenu = () =>
    setMenu({
      title: 'Label',
      items: [
        { label: 'No label', icon: 'pricetag-outline', selected: !task.projectKey, run: () => void write(labelPatch(undefined)) },
        ...liveLabels.map((l) => ({
          label: `${l.emoji ? `${l.emoji} ` : ''}${l.name}`,
          icon: 'pricetag-outline' as const,
          leading: <View style={{ width: 22, alignItems: 'center' }}><LabelDot color={labelColor(l.colorKey)?.edge ?? c.textTertiary} size={12} /></View>,
          selected: l.key === task.projectKey,
          run: () => void write(labelPatch(l.key)),
        })),
        { label: 'New label', icon: 'add', run: () => setNewLabel('') },
      ],
    });
  const listMenu = () =>
    setMenu({
      title: 'List',
      items: [
        { label: 'Brain Dump', icon: 'file-tray-outline', selected: !task.listKey, run: () => void write(listPatch(undefined)) },
        ...liveLists(lists).map((l) => ({ label: `${l.emoji ? `${l.emoji} ` : ''}${l.name}`, icon: 'list-outline' as const, selected: l.key === task.listKey, run: () => void write(listPatch(l.key)) })),
      ],
    });
  const deleteMenu = () =>
    parts.length > 0 && !partOf
      ? setMenu({
          title: `${task.title}: ${parts.length === 1 ? '1 part' : `${parts.length} parts`}`,
          items: [
            ...(ops.series ? [{ label: 'Skip this day', icon: 'play-skip-forward-outline' as const, run: () => void ops.series!.skipDay().then(() => (onChanged(), onClose())) }] : []),
            { label: deleteOnlyText, icon: 'trash-outline' as const, danger: true, run: () => void (ops.series ? deleteSeriesWithParts(task, 'only') : deleteWithParts(task, 'only')).then(() => (onChanged(), onClose())) },
            { label: deleteAllText(parts.length), icon: 'trash-outline' as const, danger: true, run: () => void (ops.series ? deleteSeriesWithParts(task, 'all') : deleteWithParts(task, 'all')).then(() => (onChanged(), onClose())) },
          ],
        })
      : setMenu({
      title: task.title,
      items: ops.series
        ? [
            { label: 'Skip this day', icon: 'play-skip-forward-outline', run: () => void ops.series!.skipDay().then(() => (onChanged(), onClose())) },
            { label: 'Delete repeating task', icon: 'trash-outline', danger: true, run: () => void ops.series!.deleteSeries().then(() => (onChanged(), onClose())) },
          ]
        : [{ label: 'Delete task', icon: 'trash-outline', danger: true, run: () => void ops.remove().then(() => (onChanged(), onClose())) }],
    });

  const row = (icon: React.ComponentProps<typeof Ionicons>['name'], text: string, value: React.ReactNode, onPress: () => void, a11y: string, first = false, data?: string) => (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, !first && s.sep, pressed && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityLabel={a11y} {...({ dataSet: data ? { detailRow: data } : {} } as object)}>
      <Ionicons name={icon} size={20} color={c.textSecondary} />
      <Text style={s.rowLabel}>{text}</Text>
      {typeof value === 'string' ? <Text style={s.rowValue}>{value}</Text> : value}
    </Pressable>
  );

  return (
    <Modal visible animationType={reduced ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.head, { paddingTop: Platform.OS === 'ios' ? 10 : insets.top + 10 }]} {...({ dataSet: { taskDetails: task.id } } as object)}>
          <Text style={s.headTitle}>{projected ? 'Repeating task' : unsaved ? 'New task' : 'Task'}</Text>
          <Pressable onPress={onClose} style={s.doneBtn} accessibilityRole="button" accessibilityLabel={unsaved ? 'Save' : 'Done'}>
            <Text style={s.doneText}>{unsaved ? 'Save' : 'Done'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <View style={s.titleRow}>
            <TextInput
              style={s.emojiInput}
              value={emoji}
              onChangeText={setEmoji}
              onBlur={() => void write(emojiPatch(task, emoji))}
              placeholder="🙂"
              placeholderTextColor={c.textTertiary}
              accessibilityLabel="Task emoji"
            />
            <TextInput
              ref={titleRef}
              style={s.titleInput}
              value={title}
              onChangeText={setTitle}
              onBlur={() => void write(titlePatch(task, title))}
              onSubmitEditing={() => void write(titlePatch(task, title))}
              returnKeyType="done"
              multiline={false}
              autoFocus={unsaved}
              placeholder={unsaved ? 'New task' : undefined}
              placeholderTextColor={c.textTertiary}
              accessibilityLabel="Task title"
            />
          </View>
          {partOf ? (
            <View style={s.partOfRow} {...({ dataSet: { partOf: partOf.id } } as object)}>
              <Text style={s.note}>{partOfText(partOf.title)}</Text>
              <Pressable onPress={() => show(partOf, false)} style={s.partBtn} accessibilityRole="button" accessibilityLabel={`Open ${partOf.title}`} {...({ dataSet: { partParent: partOf.id } } as object)}>
                <Text style={s.partBtnText}>{`Open ${partOf.title}`}</Text>
              </Pressable>
              <Pressable onPress={() => void takeOut(task).then(async () => { onChanged(); onClose(); })} style={s.partBtn} accessibilityRole="button" accessibilityLabel={takeOutText(partOf.title)} {...({ dataSet: { takeOut: task.id } } as object)}>
                <Text style={s.partBtnText}>{takeOutText(partOf.title)}</Text>
              </Pressable>
            </View>
          ) : null}
          {task.recurrence ? <Text style={[s.note, { marginTop: 4 }]} {...({ dataSet: { seriesTimeNote: '1' } } as object)}>{movedCaptionLong(task) ? OWN_TIME_NOTE : SERIES_TIME_NOTE}</Text> : null}
          {movedCaptionLong(task) ? <Text style={[s.note, { marginTop: 4 }]} {...({ dataSet: { detailMoved: '1' } } as object)}>{`↪ ${movedCaptionLong(task)}`}</Text> : null}
          {inside.length > 0 ? (
            <View style={s.hostBox} {...({ dataSet: { insideBreak: String(inside.length) } } as object)}>
              <Text style={s.hostHead}>INSIDE THIS BREAK</Text>
              {inside.map((l) => {
                const g = l.guest.task;
                return (
                  <View key={l.guest.id} style={s.hostRow} {...({ dataSet: { insideRow: l.guest.id } } as object)}>
                    <Pressable onPress={() => void tickHosted(l)} style={s.hostTick} accessibilityRole="checkbox" accessibilityState={{ checked: !!g.completed }} accessibilityLabel={g.completed ? `Untick ${g.title}` : `Tick ${g.title}`} {...({ dataSet: { insideTick: l.guest.id } } as object)}>
                      <RoundCheck done={!!g.completed} />
                    </Pressable>
                    <Pressable onPress={() => show(g, l.guest.projected)} style={s.hostOpen} accessibilityRole="button" accessibilityLabel={`Open ${g.title}`} {...({ dataSet: { insideOpen: l.guest.id } } as object)}>
                      <Text style={[s.hostName, g.completed && { textDecorationLine: 'line-through' as const }]} numberOfLines={1}>
                        {g.title}
                      </Text>
                      <Text style={s.hostMeta}>{[formatTime(toTime(l.guest.startMin)), formatDuration(g.durationMinutes) ?? ''].filter(Boolean).join(', ')}</Text>
                    </Pressable>
                    <Pressable onPress={() => void moveOut(l)} style={s.hostOut} accessibilityRole="button" accessibilityLabel={`Move ${g.title} out`} {...({ dataSet: { insideOut: l.guest.id } } as object)}>
                      <Text style={s.hostOutText}>Move out</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
          {during.map((l) => (
            <View key={l.guest.id} style={[s.hostBox, s.hostRow, { paddingLeft: 12 }]} {...({ dataSet: { duringBreak: l.brk.task.title } } as object)}>
              <Text style={[s.hostName, { flex: 1 }]} numberOfLines={1}>
                {showsInside(l.brk.task.title)}
              </Text>
              <Pressable onPress={() => void moveOut(l)} style={s.hostOut} accessibilityRole="button" accessibilityLabel="Move out" {...({ dataSet: { duringOut: l.guest.id } } as object)}>
                <Text style={s.hostOutText}>Move out</Text>
              </Pressable>
            </View>
          ))}
          {breakNote ? (
            <Text style={[s.warn, { marginTop: 8 }]} accessibilityRole="alert" {...({ dataSet: { breakNote: '1' } } as object)}>
              {breakNote}
            </Text>
          ) : null}
          {undo ? (
            <View style={s.undoRow} {...({ dataSet: { detailsUndo: '1' } } as object)}>
              <Text style={s.undoText} numberOfLines={2}>
                {undo.text}
              </Text>
              <Pressable
                onPress={() => {
                  const u = undo;
                  setUndo(null);
                  void u.run().then(async () => {
                    const t = (await loadTasksRaw()).find((x) => x.id === task.id);
                    show(t ?? task, projected && !t);
                    onChanged();
                  });
                }}
                style={s.undoBtn}
                accessibilityRole="button"
                accessibilityLabel="Undo"
              >
                <Text style={s.undoBtnText}>Undo</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={s.section}>When</Text>
          <View style={s.card}>
            {!partOf ? row('flag-outline', 'Top priority', (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isMustDo(task) ? <Text style={s.mark}>{MUST_DO_MARK}</Text> : null}
                <Toggle value={isMustDo(task)} onValueChange={(v) => void write(priorityPatch(v))} label="Top priority" colors={c} />
              </View>
            ), () => void write(priorityPatch(!isMustDo(task))), 'Top priority', true, 'priority') : null}
            {partOf ? null : row('calendar-outline', 'Date', dayText, () => setOpen(open === 'date' ? null : 'date'), `Date, ${dayText}`, false, 'date')}
            {open === 'date' && !partOf ? (
              <View style={s.panel}>
                {task.recurrence ? <Text style={s.note} {...({ dataSet: { moveDayNote: '1' } } as object)}>{MOVE_THIS_DAY_NOTE}</Text> : null}
                <View style={s.chips}>
                  {[
                    ['Today', todayKey],
                    ['Tomorrow', tomorrowKey],
                    // A day of a repeating task keeps a Day.
                    ...(task.recurrence ? [] : [['No date', undefined]]),
                  ].map(([text, key]) => (
                    <Pressable key={text} style={[s.chip, task.dueDate === key && s.chipOn]} onPress={() => void setDate(key)} accessibilityRole="button" accessibilityLabel={text as string}>
                      <Text style={[s.chipText, task.dueDate === key && s.chipTextOn]}>{text}</Text>
                    </Pressable>
                  ))}
                </View>
                <MonthGrid value={task.dueDate} todayKey={todayKey} onPick={(k) => void setDate(k)} />
              </View>
            ) : null}
            {partOf ? null : row('time-outline', 'Time', task.startTime ? formatTime(task.startTime) : task.dueDate ? 'No time' : 'Pick a date first', () => task.dueDate && setOpen(open === 'time' ? null : 'time'), `Time, ${task.startTime ? formatTime(task.startTime) : 'none'}`, false, 'time')}
            {open === 'time' && task.dueDate && !partOf ? (
              <View style={[s.panel, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }]}>
                <TimeField value={task.startTime} onChange={(t) => void setTime(t)} a11y="Start time" />
                {task.startTime ? <Button label="No time" onPress={() => void setTime(undefined)} a11y="Clear the time" /> : null}
                {note ? <Text style={s.warn}>{note}</Text> : null}
              </View>
            ) : null}
            {row('hourglass-outline', 'Length', formatDuration(task.durationMinutes) ?? 'None', () => setOpen(open === 'duration' ? null : 'duration'), `Length, ${formatDuration(task.durationMinutes) ?? 'none'}`, false, 'duration')}
            {open === 'duration' ? (
              <View style={s.panel}>
                <View style={s.chips}>
                  {DURATION_PRESETS.map((m) => (
                    <Pressable key={m} style={[s.chip, task.durationMinutes === m && s.chipOn]} onPress={() => void write(durationPatch(m))} accessibilityRole="button" accessibilityLabel={`Length ${presetLabel(m)}`}>
                      <Text style={[s.chipText, task.durationMinutes === m && s.chipTextOn]}>{presetLabel(m)}</Text>
                    </Pressable>
                  ))}
                  {task.durationMinutes ? (
                    <Pressable style={s.chip} onPress={() => void write(durationPatch(undefined))} accessibilityRole="button" accessibilityLabel="No length">
                      <Text style={s.chipText}>None</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  style={[s.input, { ...mono(400) }]}
                  value={customDur}
                  onChangeText={setCustomDur}
                  placeholder="Other: 20, 1h 15m, 1:15"
                  placeholderTextColor={c.textTertiary}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    const m = parseDuration(customDur);
                    if (m) void write(durationPatch(m));
                    setCustomDur('');
                  }}
                  accessibilityLabel="Other length"
                />
              </View>
            ) : null}
          </View>

          {/* Task or Break (3.27.0): the desktop's control, for a finger. The stored value is cutsBelow. */}
          {!partOf ? <Text style={s.section}>{KIND_LABEL}</Text> : null}
          {!partOf ? <View style={[s.card, s.kindCard]} {...({ dataSet: { kindChoice: kindOf(task) } } as object)}>
            <View style={s.kindSeg} accessibilityRole="radiogroup" accessibilityLabel={KIND_LABEL}>
              {(
                [
                  ['task', 'Task', 'checkmark-circle-outline'],
                  ['break', 'Break', 'cafe-outline'],
                ] as Array<[TaskKind, string, React.ComponentProps<typeof Ionicons>['name']]>
              ).map(([k, text, icon]) => {
                const on = kindOf(task) === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => (on ? undefined : void write(kindPatch(k)))}
                    style={[s.kindOpt, on && s.kindOptOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={text}
                    {...({ dataSet: { kind: k } } as object)}
                  >
                    <Ionicons name={icon} size={18} color={on ? c.onAccent : c.textSecondary} />
                    <Text style={[s.kindText, on && s.kindTextOn]}>{text}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={s.note} {...({ dataSet: { kindHint: kindOf(task) } } as object)}>
              {kindOf(task) === 'break' ? BREAK_HINT : TASK_HINT}
            </Text>
          </View> : null}

          {!partOf ? <Text style={s.section}>Repeat and reminders</Text> : null}
          {!partOf ? <View style={s.card}>
            {row('repeat-outline', 'Repeat', task.recurrence ? (repeatLine(task, todayKey) ?? REPEAT_CHOICES.find((r) => r.kind === repeatKindOf(task.recurrence))?.label ?? 'Repeats') : 'Does not repeat', () => setOpen(open === 'repeat' ? null : 'repeat'), 'Repeat', true, 'repeat')}
            {open === 'repeat' ? (
              <View style={s.panel}>
                <RepeatEditor
                  task={task}
                  onApply={(fields) => {
                    setOpen(null);
                    void write(fields);
                  }}
                />
              </View>
            ) : null}
            {task.recurrence && ops.series ? row('flag-outline', 'Repeat until', until ? formatDayLabel(until) : 'No end', () => setOpen(open === 'until' ? null : 'until'), `Repeat until, ${until ? formatDayLabel(until) : 'no end'}`, false, 'until') : null}
            {open === 'until' && task.recurrence && ops.series ? (
              <View style={s.panel} {...({ dataSet: { repeatUntilPanel: until ?? '' } } as object)}>
                <Text style={s.note}>The last day it happens. Later days are hidden, not deleted.</Text>
                {untilNote ? <Text style={s.note} {...({ dataSet: { untilNote: '1' } } as object)}>{untilNote}</Text> : null}
                {until ? <Button label="Clear" onPress={() => void ops.series!.setUntil(undefined).then(async () => { setUntilNote(null); setOpen(null); await reshow(); })} a11y="Clear the end date" /> : null}
                <MonthGrid
                  value={until}
                  todayKey={todayKey}
                  onPick={(k) => {
                    if (seriesStart && k < seriesStart) {
                      setUntilNote(`${endTooEarlyText(seriesStart)}.`);
                      return;
                    }
                    setUntilNote(null);
                    void ops.series!.setUntil(k).then(async () => { setOpen(null); await reshow(); });
                  }}
                />
              </View>
            ) : null}
            {row('time-outline', 'Times a day', task.startTime ? (isMultiTime(task) ? timesOf(task).map(formatTime).join(', ') : 'Once') : 'Pick a time first', () => task.startTime && setOpen(open === 'times' ? null : 'times'), 'Times a day', false, 'times')}
            {open === 'times' && task.startTime ? (
              <View style={s.panel}>
                <TimesEditor task={task} onWrite={(fields) => void write(fields)} />
              </View>
            ) : null}
            {row('notifications-outline', 'Reminders', `${taskRemindersLabel(task)}${isMultiTime(task) ? ', each time' : ''}${reminderHint(task) && (Array.isArray(task.reminders) || task.reminderMinutes != null) ? `, ${reminderHint(task)!.toLowerCase()}` : ''}`, () => setOpen(open === 'reminders' ? null : 'reminders'), 'Reminders', false, 'reminders')}
            {open === 'reminders' ? (
              <View style={s.panel}>
                <RemindersEditor task={task} onWrite={(fields) => void write(fields)} />
              </View>
            ) : null}
          </View> : null}

          {!partOf ? <Text style={s.section}>Where</Text> : null}
          {!partOf ? <View style={s.card}>
            {row('pricetag-outline', 'Label', label ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <LabelDot color={labelColor(label.colorKey)?.edge ?? c.textTertiary} />
                <Text style={[s.rowValue, s.rowValueSet]}>{`${label.emoji ? `${label.emoji} ` : ''}${label.name}`}</Text>
              </View>
            ) : 'None', labelMenu, `Label, ${label ? label.name : 'none'}`, true, 'label')}
            {newLabel !== null ? (
              <View style={[s.panel, { flexDirection: 'row', gap: 8 }]}>
                <TextInput style={[s.input, { flex: 1 }]} value={newLabel} onChangeText={setNewLabel} placeholder="New label name" placeholderTextColor={c.textTertiary} autoFocus accessibilityLabel="New label name" />
                <Button
                  label="Add"
                  kind="primary"
                  onPress={async () => {
                    const res = await createLabel(newLabel);
                    setNewLabel(null);
                    if (!res) return;
                    setLabels(await loadLabels());
                    await write(labelPatch(res.label.key));
                  }}
                  a11y="Add label"
                />
              </View>
            ) : null}
            {row('list-outline', 'List', list ? `${list.emoji ? `${list.emoji} ` : ''}${list.name}` : 'Brain Dump', listMenu, `List, ${list ? list.name : 'Brain Dump'}`, false, 'list')}
          </View> : null}

          <Text style={s.section}>Notes</Text>
          <View style={s.card}>
            <TextInput
              style={s.notes}
              value={notes}
              onChangeText={setNotes}
              onBlur={() => void write(notesPatch(task, notes))}
              multiline
              placeholder="Anything to remember"
              placeholderTextColor={c.textTertiary}
              accessibilityLabel="Notes"
            />
          </View>

          {/* R6: Parts, the desktop's wording: one "Add part" button and a box (type a name, Enter, next); each part has a tick
              that works in place; "2 of 5 done" and a bar. E3: Add part replaces Add a step; steps a task already has stay
              under a small "Checklist" heading with "Turn into parts". */}
          {partsHere ? (
            <>
              <Text style={s.section} {...({ dataSet: { partsHead: String(parts.length) } } as object)}>{parts.length > 0 ? `${PARTS}  ${progress.text}` : PARTS}</Text>
              <View style={s.card} {...({ dataSet: { partsCard: String(parts.length) } } as object)}>
                {parts.length > 0 ? (
                  <View style={s.partsBar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: progress.total, now: progress.done }} {...({ dataSet: { partsBar: `${progress.done}/${progress.total}` } } as object)}>
                    <View style={[s.partsBarFill, { width: `${Math.round((progress.done / progress.total) * 100)}%` }]} />
                  </View>
                ) : null}
                {parts.map((p, n) => (
                  <View key={p.id} style={[s.partRow, n > 0 && s.sep]} {...({ dataSet: { partRow: p.title } } as object)}>
                    <Pressable
                      onPress={() => void setPartDone(task, p, !p.completed).then(reshow)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: p.completed }}
                      accessibilityLabel={p.completed ? `Untick ${p.title}` : `Tick ${p.title}`}
                      hitSlop={8}
                      {...({ dataSet: { partTick: p.title } } as object)}
                    >
                      <RoundCheck done={p.completed} size={22} />
                    </Pressable>
                    <Text style={[s.partTitle, p.completed && { color: c.textSecondary, textDecorationLine: 'line-through' as const }]} numberOfLines={2}>{p.title}</Text>
                    {p.durationMinutes ? <Text style={s.note}>{formatMinutes(p.durationMinutes)}</Text> : null}
                    <Pressable onPress={() => show(p, false)} style={s.partBtn} accessibilityRole="button" accessibilityLabel={`Open ${p.title}`} {...({ dataSet: { partOpen: p.title } } as object)}>
                      <Text style={s.partBtnText}>Open</Text>
                    </Pressable>
                  </View>
                ))}
                <View style={[s.partRow, parts.length > 0 && s.sep]}>
                  <TextInput
                    ref={partInputRef}
                    style={s.stepInput}
                    value={newPartText}
                    onChangeText={setNewPartText}
                    placeholder="Name of the part"
                    placeholderTextColor={c.textTertiary}
                    returnKeyType="done"
                    blurOnSubmit={false}
                    onSubmitEditing={() => void addOnePart()}
                    accessibilityLabel={`Add a part to ${task.title}`}
                    {...({ dataSet: { partInput: '1' } } as object)}
                  />
                  <Pressable onPress={() => void addOnePart()} style={s.partBtn} accessibilityRole="button" accessibilityLabel={ADD_PART} {...({ dataSet: { addPart: '1' } } as object)}>
                    <Text style={s.partBtnText}>{ADD_PART}</Text>
                  </Pressable>
                </View>
              </View>
              {addsUp ? <Text style={[s.note, { marginTop: 6, marginLeft: 4 }]}>{addsUp}</Text> : null}
            </>
          ) : null}

          {showSteps ? <Text style={s.section}>{`${partsHere ? CHECKLIST : 'Steps'}${steps.length ? ` ${steps.filter((x) => x.done).length}/${steps.length}` : ''}`}</Text> : null}
          {showSteps && partsHere && !task.recurrence ? (
            <View style={{ alignItems: 'flex-start', marginBottom: 8 }}>
              <Button label={TURN_INTO_PARTS} onPress={() => void convertSteps(task).then(reshow)} a11y={TURN_INTO_PARTS} />
            </View>
          ) : null}
          {showSteps ? <View style={s.card}>
            {steps.map((st, n) => (
              <View key={st.id} style={[s.step, n > 0 && s.sep]} {...({ dataSet: { detailStep: st.title } } as object)}>
                <Pressable onPress={() => void ops.toggleSubtask(st.id).then(async () => { const t = (await loadTasksRaw()).find((x) => x.id === task.id); if (t) show(t, projected); onChanged(); })} accessibilityRole="button" accessibilityLabel={`Step ${st.title}${st.done ? ', done' : ''}`} hitSlop={8}>
                  <RoundCheck done={st.done} size={20} />
                </Pressable>
                <TextInput
                  style={[s.stepInput, st.done && { color: c.textSecondary, textDecorationLine: 'line-through' }]}
                  defaultValue={st.title}
                  onEndEditing={(e) => {
                    const text = e.nativeEvent.text.trim();
                    if (text && text !== st.title) void write({ subtasks: renameSubtask(steps, st.id, text) });
                  }}
                  accessibilityLabel={`Rename step ${st.title}`}
                />
                <Pressable onPress={() => void write({ subtasks: deleteSubtask(steps, st.id) })} accessibilityRole="button" accessibilityLabel={`Delete step ${st.title}`} hitSlop={10}>
                  <Ionicons name="close" size={20} color={c.textSecondary} />
                </Pressable>
              </View>
            ))}
            {!partsHere ? <View style={[s.step, steps.length > 0 && s.sep]}>
              <Ionicons name="add" size={20} color={c.textSecondary} />
              <TextInput
                style={s.stepInput}
                value={newStep}
                onChangeText={setNewStep}
                placeholder="Add a step"
                placeholderTextColor={c.textTertiary}
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  if (!newStep.trim()) return;
                  void write({ subtasks: addSubtask(steps, newStep, generateId()) });
                  setNewStep('');
                }}
                accessibilityLabel="Add a step"
              />
            </View> : null}
          </View> : null}

          {unsaved ? null : <View style={{ marginTop: 28, alignItems: 'flex-start' }}>
            <Button label={ops.series ? 'Delete or skip' : 'Delete task'} kind="danger" icon="trash-outline" onPress={deleteMenu} a11y={ops.series ? 'Delete or skip' : 'Delete task'} />
          </View>}
        </ScrollView>
        <ActionMenu visible={!!menu} title={menu?.title} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      </KeyboardAvoidingView>
    </Modal>
  );
}
