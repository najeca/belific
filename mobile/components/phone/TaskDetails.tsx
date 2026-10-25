import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { addDays, dateKey, formatDayTitle, parseDateKey } from '../../lib/kanban';
import { formatTime, generateId } from '../../lib/data';
import { DURATION_PRESETS, formatDuration, parseDuration, presetLabel } from '../../lib/duration';
import { isMustDo, MUST_DO_MARK } from '../../lib/mustDo';
import { labelColor } from '../../lib/labelColors';
import { createLabel, loadLabels } from '../../lib/labels';
import { liveLists } from '../../lib/lists';
import { addSubtask, deleteSubtask, renameSubtask } from '../../lib/subtasks';
import { opsForProjected, opsForTask } from '../../lib/taskOps';
import { materialise, moveDay } from '../../lib/seriesActions';
import { MOVE_THIS_DAY_NOTE, movedCaptionLong } from '../../lib/series';
import { loadListsRaw, loadTasksRaw } from '../../lib/storage';
import { datePatch, durationPatch, emojiPatch, labelPatch, listPatch, notesPatch, priorityPatch, timePatch, titlePatch } from '../../lib/detailsPatches';
import type { Project, Task, TaskList } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { useReducedMotion } from './touch';
import { ActionMenu, type MenuItem } from './menu';
import { ScopeSheet } from './ScopeSheet';
import { MonthGrid } from './MonthGrid';
import { TimeField } from './TimeField';
import { inter, mono, type } from './type';
import { Button, LabelDot, RoundCheck } from './ui';
import { RepeatEditor } from './RepeatEditor';
import { TimesEditor } from './TimesEditor';
import { RemindersEditor } from './RemindersEditor';
import { repeatKindOf, REPEAT_CHOICES, shortRepeat } from '../../lib/repeat';
import { taskRemindersLabel } from '../../lib/reminder';
import { isMultiTime, timesOf } from '../../lib/times';

// A task's details on the iPhone (PLAN_phone P6): the desktop's details panel for a finger, as a full
// sheet. Every change is written at once through the shared taskOps (a projected day of a repeating
// series edits the series; its date moves only that day, stored first), with patches that name only
// their own fields (lib/detailsPatches.ts), so nothing the phone does not show is ever lost.
// P7 (2.55.0): Repeat, extra times (several times a day) and reminders, with the desktop's rules.

export interface DetailsTarget {
  task: Task;
  projected: boolean;
}

type Open = 'date' | 'time' | 'duration' | 'repeat' | 'times' | 'reminders' | null;

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
  const [customDur, setCustomDur] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ title: string; items: MenuItem[] } | null>(null);
  const [newLabel, setNewLabel] = useState<string | null>(null);
  const todayKey = dateKey(new Date());

  const show = useCallback((t: Task, proj: boolean) => {
    setTask(t);
    setProjected(proj);
    setTitle(t.title);
    setEmoji(t.emoji ?? '');
    setNotes(t.notes ?? '');
  }, []);

  useEffect(() => {
    if (!target) return;
    show(target.task, target.projected);
    setOpen(null);
    setNote(null);
    setNewLabel(null);
    loadLabels().then(setLabels).catch(() => {});
    loadListsRaw().then(setLists).catch(() => {});
  }, [target, show]);

  if (!target || !task) return null;
  const ops = projected ? opsForProjected(task) : opsForTask(task);

  // Writes a patch, then shows the task as stored (a projected day: the patch is shown on it).
  async function write(fields: Partial<Task> | null) {
    if (!task || !fields || Object.keys(fields).length === 0) return;
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

  const label = task.projectKey ? labels.find((l) => l.key === task.projectKey) : undefined;
  const list = task.listKey ? liveLists(lists).find((l) => l.key === task.listKey) : undefined;
  const liveLabels = labels.filter((l) => !l.deletedAt);
  const steps = task.subtasks ?? [];
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
    setMenu({
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
          <Text style={s.headTitle}>{projected ? 'Repeating task' : 'Task'}</Text>
          <Pressable onPress={onClose} style={s.doneBtn} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={s.doneText}>Done</Text>
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
              style={s.titleInput}
              value={title}
              onChangeText={setTitle}
              onBlur={() => void write(titlePatch(task, title))}
              onSubmitEditing={() => void write(titlePatch(task, title))}
              returnKeyType="done"
              multiline={false}
              accessibilityLabel="Task title"
            />
          </View>
          {projected ? <Text style={[s.note, { marginTop: 4 }]}>A day of a repeating task: changes apply to every day from today. A new date moves this day only; a new time or length asks.</Text> : null}
          {movedCaptionLong(task) ? <Text style={[s.note, { marginTop: 4 }]} {...({ dataSet: { detailMoved: '1' } } as object)}>{`↪ ${movedCaptionLong(task)}`}</Text> : null}

          <Text style={s.section}>When</Text>
          <View style={s.card}>
            {row('flag-outline', 'Top priority', (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isMustDo(task) ? <Text style={s.mark}>{MUST_DO_MARK}</Text> : null}
                <Switch
                  value={isMustDo(task)}
                  onValueChange={(v) => void write(priorityPatch(v))}
                  trackColor={{ false: c.borderStrong, true: c.danger }}
                  thumbColor={c.surface}
                  accessibilityLabel="Top priority"
                />
              </View>
            ), () => void write(priorityPatch(!isMustDo(task))), 'Top priority', true, 'priority')}
            {row('calendar-outline', 'Date', dayText, () => setOpen(open === 'date' ? null : 'date'), `Date, ${dayText}`, false, 'date')}
            {open === 'date' ? (
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
            {row('time-outline', 'Time', task.startTime ? formatTime(task.startTime) : task.dueDate ? 'No time' : 'Pick a date first', () => task.dueDate && setOpen(open === 'time' ? null : 'time'), `Time, ${task.startTime ? formatTime(task.startTime) : 'none'}`, false, 'time')}
            {open === 'time' && task.dueDate ? (
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

          <Text style={s.section}>Repeat and reminders</Text>
          <View style={s.card}>
            {row('repeat-outline', 'Repeat', task.recurrence ? (shortRepeat(task, todayKey) ?? REPEAT_CHOICES.find((r) => r.kind === repeatKindOf(task.recurrence))?.label ?? 'Repeats') : 'Does not repeat', () => setOpen(open === 'repeat' ? null : 'repeat'), 'Repeat', true, 'repeat')}
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
            {row('time-outline', 'Times a day', task.startTime ? (isMultiTime(task) ? timesOf(task).map(formatTime).join(', ') : 'Once') : 'Pick a time first', () => task.startTime && setOpen(open === 'times' ? null : 'times'), 'Times a day', false, 'times')}
            {open === 'times' && task.startTime ? (
              <View style={s.panel}>
                <TimesEditor task={task} onWrite={(fields) => void write(fields)} />
              </View>
            ) : null}
            {row('notifications-outline', 'Reminders', `${taskRemindersLabel(task)}${isMultiTime(task) ? ', each time' : ''}`, () => setOpen(open === 'reminders' ? null : 'reminders'), 'Reminders', false, 'reminders')}
            {open === 'reminders' ? (
              <View style={s.panel}>
                <RemindersEditor task={task} onWrite={(fields) => void write(fields)} />
              </View>
            ) : null}
          </View>

          <Text style={s.section}>Where</Text>
          <View style={s.card}>
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
          </View>

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

          <Text style={s.section}>{`Steps${steps.length ? ` ${steps.filter((x) => x.done).length}/${steps.length}` : ''}`}</Text>
          <View style={s.card}>
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
            <View style={[s.step, steps.length > 0 && s.sep]}>
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
            </View>
          </View>

          <View style={{ marginTop: 28, alignItems: 'flex-start' }}>
            <Button label={ops.series ? 'Delete or skip' : 'Delete task'} kind="danger" icon="trash-outline" onPress={deleteMenu} a11y={ops.series ? 'Delete or skip' : 'Delete task'} />
          </View>
        </ScrollView>
        <ActionMenu visible={!!menu} title={menu?.title} items={menu?.items ?? []} onClose={() => setMenu(null)} />
        {/* 3.4.0: "This day only / All days" when a repeating day's time or length changes here. */}
        <ScopeSheet />
      </KeyboardAvoidingView>
    </Modal>
  );
}
