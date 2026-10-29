import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView as RNScrollView, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { formatTime } from '../../lib/data';
import { addDays, dateKey, formatDayTitle, parseDateKey } from '../../lib/kanban';
import { movedCaption, movedFrom } from '../../lib/series';
import { duringCaption, hostIndex, insidePill } from '../../lib/hosting';
import { deleteBrainDumpItem, loadBrainDumpItems, loadListsRaw, loadProjects, loadRoutineCompletions, loadRoutines, loadTasksRaw, updateTask } from '../../lib/storage';
import { convertDumpItem } from '../../lib/taskActions';
import { createTaskIn } from '../../lib/taskCommands';
import { listCounts, liveLists, tasksInList } from '../../lib/lists';
import { rowId, splitThoughts, type ThoughtRow } from '../../lib/thoughts';
import { buildQuests, canPlanToday, questsBySection, streakText, QUEST_SECTIONS, type Quest } from '../../lib/quests';
import { completeQuest, planQuestToday, reopenQuest, skipQuest } from '../../lib/questActions';
import { labelColor } from '../../lib/labelColors';
import { isMustDo, MUST_DO_MARK } from '../../lib/mustDo';
import { counter } from '../../lib/subtasks';
import { formatDuration } from '../../lib/duration';
import { SERIES_PREFIX } from '../../lib/routineConvert';
import { deleteOne, deleteRepeating, duplicate, moveToList, skipDay, tickRoutine, tickTask } from '../../lib/phoneActions';
import type { BrainDumpItem, Project, Routine, Task, TaskList } from '../../lib/types';
import { AddButton, ScreenHeader } from '../../components/phone/chrome';
import { QuickAdd } from '../../components/phone/QuickAdd';
import { ListSheet } from '../../components/phone/ListSheet';
import { ActionMenu, type MenuItem } from '../../components/phone/menu';
import { PressRow, SwipeRow, haptic } from '../../components/phone/touch';
import { UndoBar, type UndoMessage } from '../../components/phone/UndoBar';
import { usePhonePref } from '../../components/phone/prefs';
import { refreshTaskReminders } from '../../components/phone/reminderScheduler';
import { TaskDetails, type DetailsTarget } from '../../components/phone/TaskDetails';
import { useStyles, useTheme } from '../../components/phone/theme';
import { Card, LabelDot, Pill, RoundCheck, SectionHeader } from '../../components/phone/ui';
import { inter, mono, type } from '../../components/phone/type';

// The Tasks tab (PLAN_phone P5): the desktop's left pane for a finger. A list switcher at the top
// (Brain Dump, every list, and Repeating, which replaces the old Quests tab), a quick add row, then
// every task in the chosen list, the ones with no date included (the desktop's rules: lists.ts,
// thoughts.ts). Swipe a row right to mark it done; swipe left for Tomorrow and Delete; tap to open it;
// press and hold for Edit, Duplicate, Move to list, Delete. Press and hold a list to edit it.

const REPEATING = '__repeating__';
type Chosen = string | undefined; // a list key, undefined for Brain Dump, or REPEATING

const make = (c: ColorTokens) => ({
  screen: { flex: 1, backgroundColor: c.background },
  chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  chipTextOn: { color: c.onAccent },
  chipCount: { ...inter(500), fontSize: 12, color: c.textSecondary },
  addRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  addInput: { flex: 1, ...inter(400), fontSize: 16, color: c.textPrimary, minHeight: 46, paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  addBtn: { width: 46, height: 46, borderRadius: radius.lg, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border },
  rowWrap: { backgroundColor: c.surface },
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, minHeight: 56 },
  sep: { borderTopWidth: 1, borderTopColor: c.border },
  tick: { width: 52, minHeight: 56, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { flex: 1, minHeight: 56, paddingVertical: 10, paddingRight: 12, justifyContent: 'center' as const },
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  title: { ...inter(500), fontSize: 16, lineHeight: 21, color: c.textPrimary, flexShrink: 1 },
  done: { color: c.textSecondary, textDecorationLine: 'line-through' as const },
  meta: { ...type.meta, color: c.textSecondary },
  // 3.10.0: a break's "2 inside" and a hosted task's "During Lunch".
  hostPill: { paddingHorizontal: 8, minHeight: 20, borderRadius: radius.full, backgroundColor: c.hostPill, justifyContent: 'center' as const },
  hostPillText: { ...type.meta, ...inter(600), color: c.onHostPill },
  hostCaption: { ...type.meta, ...inter(600), color: c.onHostPill },
  metaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 3, flexWrap: 'wrap' as const },
  mark: { fontSize: 12, color: c.danger },
  empty: { ...type.meta, color: c.textSecondary, padding: 16 },
  doneHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 48, paddingHorizontal: 14 },
  doneText: { ...inter(600), fontSize: 15, color: c.textSecondary },
  quest: { padding: 12, gap: 8 },
  questTitle: { ...inter(600), fontSize: 16, color: c.textPrimary, flexShrink: 1 },
  streak: { ...inter(500), fontSize: 12, color: c.textSecondary },
  qBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 6 },
  qBtnText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  note: { ...type.meta, color: c.textSecondary, paddingHorizontal: 4, paddingBottom: 6 },
});

export default function TasksTab() {
  const s = useStyles(make);
  const { c } = useTheme();
  const [chosen, setChosen] = useState<Chosen>(undefined);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [items, setItems] = useState<BrainDumpItem[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [completions, setCompletions] = useState<Array<{ routineId: string; date: string }>>([]);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<{ title: string; items: MenuItem[] } | null>(null);
  const [undo, setUndo] = useState<UndoMessage | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [details, setDetails] = useState<DetailsTarget | null>(null);
  const [listSheet, setListSheet] = useState<{ list: TaskList | null } | null>(null);
  const [showStreaks] = usePhonePref('showStreaks');
  const input = useRef<TextInput>(null);
  const todayKey = dateKey(new Date());
  const tomorrowKey = dateKey(addDays(parseDateKey(todayKey), 1));

  const load = useCallback(async () => {
    const [raw, dump, ls, ps, rs, comps] = await Promise.all([loadTasksRaw(), loadBrainDumpItems(), loadListsRaw(), loadProjects(), loadRoutines(), loadRoutineCompletions()]);
    setTasks(raw);
    // Any change made here (a tick, an edit) is followed by a load: the reminders follow it.
    refreshTaskReminders();
    setItems(dump);
    setLists(ls);
    setProjects(ps);
    setRoutines(rs);
    setCompletions(comps);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  const live = liveLists(lists);
  const listKey = chosen === REPEATING ? undefined : chosen && live.some((l) => l.key === chosen) ? chosen : undefined;
  const counts = useMemo(() => listCounts(tasks, lists), [tasks, lists]);
  const { rows, doneToday } = useMemo(
    () => splitThoughts(tasksInList(tasks, listKey, lists), listKey === undefined ? items : [], todayKey, { includeDated: listKey !== undefined }),
    [tasks, items, lists, listKey, todayKey],
  );
  // 3.10.0: "During Lunch" and "2 inside" on the dated rows of a list.
  const hosts = useMemo(() => hostIndex(tasks, rows.flatMap((r) => (r.kind === 'task' && r.task.dueDate && r.task.startTime ? [r.task.dueDate] : [])), todayKey), [tasks, rows, todayKey]);
  const quests = useMemo(() => (chosen === REPEATING ? buildQuests(tasks, completions, todayKey) : []), [chosen, tasks, completions, todayKey]);
  const listName = chosen === REPEATING ? 'Repeating' : listKey ? (live.find((l) => l.key === listKey)?.name ?? 'Brain Dump') : 'Brain Dump';

  // A legacy phone Brain Dump item becomes a task on its first action (lib/dumpConvert.ts, as on the desktop).
  async function asTask(row: ThoughtRow): Promise<Task> {
    return row.kind === 'task' ? row.task : convertDumpItem(row.item);
  }
  const done = async (row: ThoughtRow) => {
    haptic('success');
    const t = await asTask(row);
    await tickTask(t, false, true);
    await load();
    setUndo({ id: Date.now(), text: `Done: ${t.title}`, undo: () => void tickTask(t, false, false).then(load) });
  };
  const tomorrow = async (row: ThoughtRow) => {
    const t = await asTask(row);
    // The time stays (a repeating task is never moved this way: it has Skip).
    await updateTask({ ...t, dueDate: tomorrowKey });
    await load();
    setUndo({ id: Date.now(), text: `Moved to tomorrow: ${t.title}`, undo: () => void updateTask(t).then(load) });
  };
  const remove = async (row: ThoughtRow) => {
    if (row.kind === 'dump') await deleteBrainDumpItem(row.item.id);
    else if (row.task.recurrence) await skipDay(row.task);
    else await deleteOne(row.task);
    await load();
  };
  const open = async (row: ThoughtRow) => setDetails({ task: await asTask(row), projected: false });

  function holdMenu(row: ThoughtRow) {
    const title = row.kind === 'task' ? row.task.title : row.item.title;
    const after = (fn: (t: Task) => Promise<unknown>) => () => {
      asTask(row)
        .then(fn)
        .then(load);
    };
    const moveItems: MenuItem[] = [
      { label: 'Brain Dump', icon: 'file-tray-outline', run: after((t) => moveToList(t, false, undefined)) },
      ...live.map((l) => ({ label: `${l.emoji ? `${l.emoji} ` : ''}${l.name}`, icon: 'list-outline' as const, run: after((t) => moveToList(t, false, l.key)) })),
    ];
    const repeating = row.kind === 'task' && !!row.task.recurrence;
    setMenu({
      title,
      items: [
        { label: 'Edit', icon: 'create-outline', run: () => void open(row) },
        { label: 'Duplicate', icon: 'copy-outline', run: after((t) => duplicate(t, false)) },
        { label: 'Move to list', icon: 'list-outline', run: () => setTimeout(() => setMenu({ title: `Move "${title}" to`, items: moveItems }), 250) },
        ...(repeating
          ? [
              { label: 'Skip this day', icon: 'play-skip-forward-outline' as const, run: after((t) => skipDay(t)) },
              { label: 'Delete repeating task', icon: 'trash-outline' as const, danger: true, run: after((t) => deleteRepeating(t)) },
            ]
          : [{ label: 'Delete', icon: 'trash-outline' as const, danger: true, run: () => void remove(row) }]),
      ],
    });
  }

  async function addFromRow() {
    const t = await createTaskIn(text, { listKey });
    if (!t) return;
    setText('');
    await load();
    input.current?.focus();
  }

  const label = (t: Task) => {
    const p = t.projectKey ? projects.find((x) => x.key === t.projectKey) : undefined;
    return p ? { name: `${p.emoji ? `${p.emoji} ` : ''}${p.name}`, color: labelColor(p.colorKey)?.edge ?? c.textTertiary } : null;
  };

  function renderRow(row: ThoughtRow, first: boolean) {
    const id = rowId(row);
    const t = row.kind === 'task' ? row.task : null;
    const title = row.kind === 'task' ? `${row.task.emoji ? `${row.task.emoji} ` : ''}${row.task.title}` : row.item.title;
    const lab = t ? label(t) : null;
    const steps = counter(t?.subtasks);
    const when = t?.dueDate ? `${formatDayTitle(t.dueDate, todayKey)}${t.startTime ? `, ${formatTime(t.startTime)}` : ''}` : null;
    const repeating = !!t?.recurrence;
    // 3.3.0: a day of a repeating task moved on its own says where it came from.
    const moved = t ? movedCaption(t) : undefined;
    return (
      <View key={id} style={[s.rowWrap, !first && s.sep]}>
        <SwipeRow
          data={{ taskRow: row.kind === 'task' ? row.task.title : row.item.title }}
          right={{ label: 'Done', icon: 'checkmark', tone: 'accent', run: () => void done(row) }}
          // A repeating task's day is moved by Skip (its series keeps its rule), never by Tomorrow.
          left={
            repeating
              ? [{ label: 'Skip', icon: 'play-skip-forward-outline', tone: 'danger', run: () => void remove(row) }]
              : [
                  { label: 'Tomorrow', icon: 'arrow-forward-outline', tone: 'quiet', run: () => void tomorrow(row) },
                  { label: 'Delete', icon: 'trash-outline', tone: 'danger', run: () => void remove(row) },
                ]
          }
        >
          <View style={[s.row, { backgroundColor: c.surface }]}>
            <PressRow onTap={() => void done(row)} a11y={`Mark ${title} done`} style={s.tick} data={{ tick: id }}>
              <RoundCheck done={false} />
            </PressRow>
            <PressRow
              style={s.body}
              onTap={() => void open(row)}
              onHold={() => holdMenu(row)}
              a11y={`${title}${when ? `, ${when}` : ''}${moved ? `, ${moved}` : ''}`}
              hint="Tap to open. Press and hold for more. Swipe right for done, left for tomorrow or delete."
              actions={[
                { name: 'Done', run: () => void done(row) },
                ...(repeating ? [] : [{ name: 'Tomorrow', run: () => void tomorrow(row) }]),
                { name: repeating ? 'Skip' : 'Delete', run: () => void remove(row) },
              ]}
              data={{ taskBody: id }}
            >
              <View style={s.line}>
                <Text style={s.title} numberOfLines={2}>
                  {title}
                </Text>
                {t && isMustDo(t) ? <Text style={s.mark}>{MUST_DO_MARK}</Text> : null}
                {repeating ? <Ionicons name="repeat" size={14} color={c.textSecondary} accessibilityLabel="Repeats" /> : null}
                {t?.durationMinutes ? <Text style={[s.meta, { ...mono(500), fontSize: 13, color: c.textPrimary, marginLeft: 'auto' }]} accessibilityLabel={`Estimate ${formatDuration(t.durationMinutes)}`} {...({ dataSet: { taskLength: '1' } } as object)}>{formatDuration(t.durationMinutes)}</Text> : null}
              </View>
              {when || lab || steps.total ? (
                <View style={s.metaRow}>
                  {when ? <Text style={[s.meta, { ...mono(400), fontSize: 12 }]}>{when}</Text> : null}
                  {t && hosts.inside.get(t.id) ? (
                <View style={s.hostPill} {...({ dataSet: { hostPill: String(hosts.inside.get(t.id)) } } as object)}>
                  <Text style={s.hostPillText}>{insidePill(hosts.inside.get(t.id) ?? 0)}</Text>
                </View>
              ) : null}
              {t && hosts.during.get(t.id) ? <Text style={s.hostCaption} {...({ dataSet: { hostCaption: hosts.during.get(t.id) } } as object)}>{duringCaption(hosts.during.get(t.id) ?? '')}</Text> : null}
                  {moved ? <Text style={s.meta} {...({ dataSet: { movedFrom: movedFrom(t!) } } as object)}>{`↪ ${moved}`}</Text> : null}
                  {lab ? (
                    <View style={[s.line, { gap: 5 }]}>
                      <LabelDot color={lab.color} />
                      <Text style={s.meta}>{lab.name}</Text>
                    </View>
                  ) : null}
                  {steps.total ? <Text style={s.meta}>{`${steps.done}/${steps.total} steps`}</Text> : null}
                </View>
              ) : null}
            </PressRow>
          </View>
        </SwipeRow>
      </View>
    );
  }

  function renderQuest(q: Quest) {
    const isDone = q.due.kind === 'done';
    const target = q.target;
    const streak = showStreaks ? streakText(q) : null;
    const emoji = q.emoji ?? QUEST_SECTIONS.find((x) => x.key === q.section)?.emoji ?? '🔁';
    const act = (fn: () => Promise<unknown>) => () => {
      fn().then(load);
    };
    return (
      <View key={q.root} style={s.quest} {...({ dataSet: { quest: q.title } } as object)}>
        <View style={s.line}>
          <PressRow
            onTap={isDone && q.undo ? act(() => reopenQuest(q.undo!)) : target ? act(() => completeQuest(target)) : undefined}
            a11y={isDone ? `Reopen ${q.title}` : `Complete ${q.title}`}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            data={{ questTick: q.title }}
          >
            <RoundCheck done={isDone} />
          </PressRow>
          <View style={{ flex: 1 }}>
            <Text style={[s.questTitle, isDone && s.done]}>{`${emoji} ${q.title}`}</Text>
            <Text style={s.meta}>{q.repeat}</Text>
          </View>
        </View>
        <View style={[s.line, { flexWrap: 'wrap', paddingLeft: 50 }]}>
          <Pill tone={q.due.kind === 'dueToday' || q.due.kind === 'due' ? 'accent' : 'quiet'}>{q.due.text}</Pill>
          {streak ? <Text style={s.streak} {...({ dataSet: { streak: '1' } } as object)}>{streak}</Text> : null}
        </View>
        {target ? (
          <View style={[s.line, { paddingLeft: 50, gap: 8 }]}>
            <Pressable style={s.qBtn} onPress={act(() => skipQuest(target))} accessibilityRole="button" accessibilityLabel={`Skip ${q.title} this time`}>
              <Ionicons name="play-skip-forward-outline" size={16} color={c.textPrimary} />
              <Text style={s.qBtnText}>Skip</Text>
            </Pressable>
            {canPlanToday(q, todayKey) ? (
              <Pressable style={s.qBtn} onPress={act(() => planQuestToday(target, todayKey))} accessibilityRole="button" accessibilityLabel={`Put ${q.title} on today`}>
                <Ionicons name="today-outline" size={16} color={c.textPrimary} />
                <Text style={s.qBtnText}>Today</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  // Routines that are still routines (not converted): shown on Repeating too, ticked as before.
  const seriesRoots = new Set(tasks.filter((t) => !t.deletedAt).map((t) => t.id.split(':')[0]));
  const oldRoutines = routines.filter((r) => !r.deletedAt && !seriesRoots.has(`${SERIES_PREFIX}${r.id}`));
  const routineDone = new Set(completions.filter((x) => x.date === todayKey).map((x) => x.routineId));

  const chip = (key: Chosen, labelText: string, count: number | null, icon?: string) => {
    const on = chosen === key || (key === undefined && chosen !== REPEATING && listKey === undefined);
    const list = key && key !== REPEATING ? live.find((l) => l.key === key) : undefined;
    return (
      <PressRow
        key={key ?? 'dump'}
        onTap={() => setChosen(key)}
        onHold={list ? () => setListSheet({ list }) : undefined}
        a11y={`${labelText}${count !== null ? `, ${count} waiting` : ''}${on ? ', shown' : ''}`}
        hint={list ? 'Press and hold to edit the list.' : undefined}
        style={[s.chip, on && s.chipOn]}
        touchAction="pan-x"
        data={{ listChip: key ?? 'dump' }}
      >
        {icon ? <Text>{icon}</Text> : null}
        <Text style={[s.chipText, on && s.chipTextOn]}>{labelText}</Text>
        {count !== null ? <Text style={[s.chipCount, on && s.chipTextOn]}>{count}</Text> : null}
      </PressRow>
    );
  };

  return (
    <View style={s.screen}>
      <ScreenHeader title="Tasks" />
      <View>
        {/* React Native's own scroll view: gesture handler's horizontal one cancels a chip's hold on the web export. */}
        <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {chip(undefined, 'Brain Dump', counts.get('') ?? 0, '🧠')}
          {live.map((l) => chip(l.key, l.name, counts.get(l.key) ?? 0, l.emoji ?? '📋'))}
          {chip(REPEATING, 'Repeating', null, '🔁')}
          <PressRow onTap={() => setListSheet({ list: null })} a11y="New list" style={[s.chip, { borderStyle: 'dashed' }]} touchAction="pan-x" data={{ listChip: 'new' }}>
            <Ionicons name="add" size={16} color={c.textSecondary} />
            <Text style={[s.chipText, { color: c.textSecondary }]}>New list</Text>
          </PressRow>
        </RNScrollView>
      </View>
      {chosen !== REPEATING ? (
        <View style={s.addRow}>
          <TextInput
            ref={input}
            style={s.addInput}
            value={text}
            onChangeText={setText}
            placeholder={`Add to ${listName}`}
            placeholderTextColor={c.textTertiary}
            returnKeyType="done"
            blurOnSubmit={false}
            onSubmitEditing={() => void addFromRow()}
            accessibilityLabel={`Add to ${listName}`}
          />
          <Pressable style={s.addBtn} onPress={() => void addFromRow()} accessibilityRole="button" accessibilityLabel="Add" disabled={!text.trim()}>
            <Ionicons name="arrow-up" size={20} color={text.trim() ? c.accentText : c.textTertiary} />
          </Pressable>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        {chosen === REPEATING ? (
          <>
            {quests.length === 0 && oldRoutines.length === 0 ? <Text style={s.empty}>No repeating tasks yet. Give a task a repeat and it shows here.</Text> : null}
            {questsBySection(quests).map(({ section, quests: qs }) => (
              <View key={section.key}>
                <SectionHeader>{`${section.emoji} ${section.title}`}</SectionHeader>
                <Card>
                  {qs.map((q, n) => (
                    <View key={q.root} style={n > 0 ? s.sep : undefined}>
                      {renderQuest(q)}
                    </View>
                  ))}
                </Card>
              </View>
            ))}
            {oldRoutines.length > 0 ? (
              <View>
                <SectionHeader>Routines</SectionHeader>
                <Text style={s.note}>Ticked here or on Today, as before. Once converted (Settings, Data) they get a streak, Skip and Today.</Text>
                <Card>
                  {oldRoutines.map((r, n) => {
                    const isDone = routineDone.has(r.id);
                    return (
                      <View key={r.id} style={[s.row, n > 0 && s.sep]} {...({ dataSet: { routineRow: r.title } } as object)}>
                        <PressRow onTap={() => void tickRoutine(r.id, todayKey, !isDone).then(load)} a11y={isDone ? `Mark ${r.title} not done` : `Mark ${r.title} done`} style={s.tick}>
                          <RoundCheck done={isDone} />
                        </PressRow>
                        <View style={s.body}>
                          <Text style={[s.title, isDone && s.done]}>{r.title}</Text>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Card style={{ overflow: 'hidden', marginTop: 8 }}>
              {rows.length === 0 ? (
                <Text style={s.empty}>{listKey === undefined ? 'Nothing waiting. Type above to capture a thought; add the details later.' : 'This list is empty. Type above to add to it.'}</Text>
              ) : (
                rows.map((r, n) => renderRow(r, n === 0))
              )}
            </Card>
            {doneToday.length > 0 ? (
              <Card style={{ marginTop: 18 }}>
                <PressRow onTap={() => setShowDone((v) => !v)} a11y={`Done today, ${doneToday.length}. ${showDone ? 'Hide' : 'Show'}`} style={s.doneHead} data={{ doneToday: String(doneToday.length) }}>
                  <Text style={s.doneText}>{`Done today, ${doneToday.length}`}</Text>
                  <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={c.textSecondary} />
                </PressRow>
                {showDone
                  ? doneToday.map((t) => (
                      <View key={t.id} style={[s.row, s.sep]} {...({ dataSet: { doneRow: t.title } } as object)}>
                        <PressRow onTap={() => void tickTask(t, false, false).then(load)} a11y={`Mark ${t.title} not done`} style={s.tick}>
                          <RoundCheck done />
                        </PressRow>
                        <View style={s.body}>
                          <Text style={[s.title, s.done]}>{t.title}</Text>
                        </View>
                      </View>
                    ))
                  : null}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
      <UndoBar message={undo} onDone={() => setUndo(null)} />
      <AddButton onPress={() => setAdding(true)} a11y={`Add to ${chosen === REPEATING ? 'Brain Dump' : listName}`} />
      <QuickAdd visible={adding} where={{ listKey, label: chosen === REPEATING ? 'Brain Dump' : listName }} onClose={() => setAdding(false)} onAdded={() => void load()} />
      <ActionMenu visible={!!menu} title={menu?.title} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      <ListSheet
        visible={!!listSheet}
        list={listSheet?.list ?? null}
        lists={live}
        count={listSheet?.list ? (counts.get(listSheet.list.key) ?? 0) : 0}
        onClose={() => setListSheet(null)}
        onSaved={(key) => {
          setListSheet(null);
          if (key === null) setChosen(undefined);
          else setChosen(key);
          void load();
        }}
      />
      <TaskDetails target={details} onClose={() => setDetails(null)} onChanged={() => void load()} />
    </View>
  );
}
