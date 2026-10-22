import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import {
  getStarterEventsForDate,
  getWeeklyEventsForDate,
  customToScheduleEvent,
  formatTime,
} from '../../lib/data';
import {
  loadCustomCategories,
  loadCustomEvents,
  loadListsRaw,
  loadProjects,
  loadRoutineCompletions,
  loadRoutines,
  loadTasksRaw,
  shouldShowStarterRoutine,
} from '../../lib/storage';
import { dateKey } from '../../lib/kanban';
import { buildToday, itemTitle, type TodayItem } from '../../lib/todayView';
import { formatDuration } from '../../lib/duration';
import { labelColor } from '../../lib/labelColors';
import { liveLists } from '../../lib/lists';
import { isMustDo, MUST_DO_MARK } from '../../lib/mustDo';
import { counter } from '../../lib/subtasks';
import { deleteOne, deleteRepeating, duplicate, moveToList, skipDay, storedTask, tickRoutine, tickTask, toggleSubtask } from '../../lib/phoneActions';
import type { CustomEvent, Project, Routine, ScheduleEvent, Task, TaskList } from '../../lib/types';
import { AddButton, ScreenHeader } from '../../components/phone/chrome';
import { QuickAdd } from '../../components/phone/QuickAdd';
import { ActionMenu, type MenuItem } from '../../components/phone/menu';
import { PressRow, haptic } from '../../components/phone/touch';
import { UndoBar, type UndoMessage } from '../../components/phone/UndoBar';
import { useStyles, useTheme } from '../../components/phone/theme';
import { Button, Card, LabelDot, RoundCheck, SectionHeader } from '../../components/phone/ui';
import { inter, mono, type } from '../../components/phone/type';
import AddEventModal from '../components/AddEventModal';
import RoutineFormModal from '../components/RoutineForm';
import TaskFormModal from '../components/TaskForm';

// Today on the iPhone (PLAN_phone P4): only today, in time order, with an Anytime group below; a
// small Now and Next line at the top; a tick takes the row away with Undo for a few seconds and
// "Done today" shows them again; a tap opens the row in place (notes, steps, label, list, time) with
// Edit; press and hold opens Edit, Duplicate, Move to list, Delete. The rules: lib/todayView.ts.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TIME_OF_DAY: Record<Routine['timeOfDay'], string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const make = (c: ColorTokens) => ({
  screen: { flex: 1, backgroundColor: c.background },
  nowLine: { ...type.meta, color: c.textSecondary },
  nowStrong: { ...inter(600), color: c.textPrimary },
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, minHeight: 56 },
  rowSep: { borderTopWidth: 1, borderTopColor: c.border },
  tick: { width: 52, minHeight: 56, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { flex: 1, minHeight: 56, paddingVertical: 10, paddingRight: 12, justifyContent: 'center' as const },
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  time: { ...mono(500), fontSize: 13, color: c.textSecondary, minWidth: 58 },
  title: { ...inter(500), fontSize: 16, lineHeight: 21, color: c.textPrimary, flexShrink: 1 },
  titleDone: { color: c.textSecondary, textDecorationLine: 'line-through' as const },
  eventTitle: { color: c.textSecondary },
  meta: { ...type.meta, color: c.textSecondary },
  metaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 3, flexWrap: 'wrap' as const },
  mark: { fontSize: 12, color: c.danger },
  expanded: { paddingLeft: 52, paddingRight: 12, paddingBottom: 12, gap: 8 },
  notes: { ...type.body, fontSize: 15, color: c.textPrimary },
  detail: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  step: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 44 },
  stepText: { ...type.body, fontSize: 15, color: c.textPrimary, flexShrink: 1 },
  eventBar: { width: 4, height: 28, borderRadius: radius.xs },
  empty: { ...type.meta, color: c.textSecondary, padding: 16 },
  doneHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 48, paddingHorizontal: 14 },
  doneText: { ...inter(600), fontSize: 15, color: c.textSecondary },
});

export default function TodayScreen() {
  const s = useStyles(make);
  const { c } = useTheme();
  const [todayKey, setTodayKey] = useState(() => dateKey(new Date()));
  const [nowMin, setNowMin] = useState(nowMinutes);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routinesDone, setRoutinesDone] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ title: string; items: MenuItem[] } | null>(null);
  const [undo, setUndo] = useState<UndoMessage | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>();
  const [editEvent, setEditEvent] = useState<CustomEvent | undefined>();
  const [editRoutine, setEditRoutine] = useState<Routine | undefined>();

  const load = useCallback(async () => {
    const now = new Date();
    const key = dateKey(now);
    const [raw, starter, custom, categories, rs, comps, ps, ls] = await Promise.all([
      loadTasksRaw(),
      shouldShowStarterRoutine(),
      loadCustomEvents(),
      loadCustomCategories(),
      loadRoutines(),
      loadRoutineCompletions(),
      loadProjects(),
      loadListsRaw(),
    ]);
    setTodayKey(key);
    setNowMin(nowMinutes());
    setTasks(raw);
    setCustomEvents(custom);
    const template = starter ? getStarterEventsForDate(now) : getWeeklyEventsForDate(now);
    setEvents([...template, ...custom.filter((e) => e.date === key).map((e) => customToScheduleEvent(e, categories))]);
    setRoutines(rs);
    setRoutinesDone(new Set(comps.filter((x) => x.date === key).map((x) => x.routineId)));
    setProjects(ps);
    setLists(ls);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
      const timer = setInterval(() => setNowMin(nowMinutes()), 60_000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const view = useMemo(() => buildToday({ tasks, todayKey, nowMin, events, routines, routinesDone }), [tasks, todayKey, nowMin, events, routines, routinesDone]);
  const live = liveLists(lists);

  async function tick(item: TodayItem, done: boolean, withUndo = true) {
    if (item.kind === 'event') return;
    haptic(done ? 'success' : 'light');
    if (item.kind === 'routine') await tickRoutine(item.routine.id, todayKey, done);
    // A projected day is stored by its first tick, so its Undo acts on the stored row.
    else await tickTask(item.task, item.projected && done, done, item.time, item.multi);
    if (expanded === item.key) setExpanded(null);
    await load();
    if (done && withUndo) setUndo({ id: Date.now(), text: `Done: ${itemTitle(item)}`, undo: () => void tick(item, false, false) });
  }

  async function openEdit(task: Task, projected: boolean) {
    const row = await storedTask(task, projected);
    if (row) setEditTask(row);
  }

  function openMenu(item: TodayItem) {
    if (item.kind === 'event') {
      const custom = item.event.isCustom ? customEvents.find((e) => e.id === item.event.id) : undefined;
      if (custom) setEditEvent(custom);
      return;
    }
    if (item.kind === 'routine') {
      setMenu({ title: item.routine.title, items: [{ label: 'Edit routine', icon: 'create-outline', run: () => setEditRoutine(item.routine) }] });
      return;
    }
    const { task, projected } = item;
    const after = (fn: () => Promise<unknown>) => () => {
      fn().then(load);
    };
    const moveItems: MenuItem[] = [
      { label: 'Brain Dump', icon: 'file-tray-outline', run: after(() => moveToList(task, projected, undefined)) },
      ...live.map((l) => ({ label: `${l.emoji ? `${l.emoji} ` : ''}${l.name}`, icon: 'list-outline' as const, run: after(() => moveToList(task, projected, l.key)) })),
    ];
    const items: MenuItem[] = [
      { label: 'Edit', icon: 'create-outline', run: () => void openEdit(task, projected) },
      { label: 'Duplicate', icon: 'copy-outline', run: after(() => duplicate(task, projected)) },
      // The menu closes first; the list choice opens as a second menu.
      { label: 'Move to list', icon: 'list-outline', run: () => setTimeout(() => setMenu({ title: `Move "${task.title}" to`, items: moveItems }), 250) },
      ...(task.recurrence
        ? [
            { label: 'Skip this day', icon: 'play-skip-forward-outline' as const, run: after(() => skipDay(task)) },
            { label: 'Delete repeating task', icon: 'trash-outline' as const, danger: true, run: after(() => deleteRepeating(task)) },
          ]
        : [{ label: 'Delete', icon: 'trash-outline' as const, danger: true, run: after(() => deleteOne(task)) }]),
    ];
    setMenu({ title: task.title, items });
  }

  const label = (t: Task) => {
    const p = t.projectKey ? projects.find((x) => x.key === t.projectKey) : undefined;
    return p ? { name: `${p.emoji ? `${p.emoji} ` : ''}${p.name}`, color: labelColor(p.colorKey)?.edge ?? c.textTertiary } : null;
  };
  const listOf = (t: Task) => {
    const l = t.listKey ? live.find((x) => x.key === t.listKey) : undefined;
    return l ? `${l.emoji ? `${l.emoji} ` : ''}${l.name}` : null;
  };

  function renderEvent(item: Extract<TodayItem, { kind: 'event' }>, first: boolean) {
    const e = item.event;
    const editable = e.isCustom && customEvents.some((x) => x.id === e.id);
    const a11y = `Event ${e.title}, ${formatTime(e.start)} to ${formatTime(e.end)}${editable ? '' : ', read only'}`;
    const inner = (
      <View style={s.row}>
        <View style={s.tick}>
          <View style={[s.eventBar, { backgroundColor: c.borderStrong }]} />
        </View>
        <View style={s.body}>
          <View style={s.line}>
            <Text style={s.time}>{formatTime(e.start)}</Text>
            <Text style={[s.title, s.eventTitle]} numberOfLines={2}>
              {e.icon ? `${e.icon} ` : ''}
              {e.title}
            </Text>
          </View>
          <Text style={[s.meta, { marginLeft: 64 }]}>until {formatTime(e.end)}</Text>
        </View>
      </View>
    );
    return (
      <View key={item.key} style={!first && s.rowSep} {...({ dataSet: { todayEvent: e.title } } as object)}>
        {editable ? (
          <PressRow onTap={() => openMenu(item)} a11y={a11y} hint="Tap to edit the event.">
            {inner}
          </PressRow>
        ) : (
          <View accessible accessibilityLabel={a11y}>
            {inner}
          </View>
        )}
      </View>
    );
  }

  function renderRow(item: TodayItem, first: boolean) {
    if (item.kind === 'event') return renderEvent(item, first);
    const open = expanded === item.key;
    const done = item.done;
    const t = item.kind === 'task' ? item.task : null;
    const projected = item.kind === 'task' && item.projected;
    const title = item.kind === 'task' ? `${item.task.emoji ? `${item.task.emoji} ` : ''}${item.task.title}` : item.routine.title;
    const lab = t ? label(t) : null;
    const lst = t ? listOf(t) : null;
    const steps = t?.subtasks ?? [];
    const count = counter(steps);
    const timeText = item.kind === 'task' && item.time ? formatTime(item.time) : null;
    return (
      <View key={item.key} style={!first && s.rowSep} {...({ dataSet: { todayRow: item.kind === 'task' ? item.task.title : item.routine.title, todayKey: item.key } } as object)}>
        <View style={s.row}>
          <PressRow onTap={() => void tick(item, !done)} a11y={done ? `Mark ${title} not done` : `Mark ${title} done`} style={s.tick} data={{ tick: item.key }}>
            <RoundCheck done={done} />
          </PressRow>
          <PressRow
            style={s.body}
            onTap={() => setExpanded(open ? null : item.key)}
            onHold={done ? undefined : () => openMenu(item)}
            a11y={`${title}${timeText ? `, ${timeText}` : ''}${done ? ', done' : ''}`}
            hint="Tap to open. Press and hold for more."
            data={{ todayBody: item.key }}
          >
            <View style={s.line}>
              {timeText ? <Text style={s.time}>{timeText}</Text> : null}
              <Text style={[s.title, done && s.titleDone]} numberOfLines={open ? undefined : 2}>
                {title}
              </Text>
              {t && isMustDo(t) ? <Text style={s.mark}>{MUST_DO_MARK}</Text> : null}
              {t?.recurrence || item.kind === 'routine' ? <Ionicons name="repeat" size={14} color={c.textSecondary} accessibilityLabel="Repeats" /> : null}
            </View>
            <View style={[s.metaRow, timeText ? { marginLeft: 64 } : null]}>
              {item.kind === 'routine' ? <Text style={s.meta}>{TIME_OF_DAY[item.routine.timeOfDay]} routine</Text> : null}
              {lab ? (
                <View style={s.detail}>
                  <LabelDot color={lab.color} />
                  <Text style={s.meta}>{lab.name}</Text>
                </View>
              ) : null}
              {lst ? <Text style={s.meta}>{lst}</Text> : null}
              {t?.durationMinutes ? <Text style={s.meta}>{formatDuration(t.durationMinutes)}</Text> : null}
              {count.total ? <Text style={s.meta}>{`${count.done}/${count.total} steps`}</Text> : null}
            </View>
          </PressRow>
        </View>
        {open && t ? (
          <View style={s.expanded} {...({ dataSet: { todayExpanded: item.key } } as object)}>
            {t.notes ? <Text style={s.notes}>{t.notes}</Text> : null}
            {steps.map((st) => (
              <PressRow key={st.id} onTap={() => void toggleSubtask(t, projected, st.id).then(load)} a11y={`Step ${st.title}${st.done ? ', done' : ''}`} style={s.step} data={{ step: st.title }}>
                <RoundCheck done={st.done} size={20} />
                <Text style={[s.stepText, st.done && s.titleDone]}>{st.title}</Text>
              </PressRow>
            ))}
            {timeText ? (
              <Text style={s.meta}>
                {timeText}
                {t.durationMinutes ? ` for ${formatDuration(t.durationMinutes)}` : ''}
              </Text>
            ) : null}
            {!lab && !lst && !t.notes && !steps.length ? <Text style={s.meta}>No notes, steps, label or list yet.</Text> : null}
            <View style={{ flexDirection: 'row' }}>
              <Button label="Edit" icon="create-outline" onPress={() => void openEdit(t, projected)} a11y={`Edit ${t.title}`} />
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  const today = new Date();
  const headerSub = `${DAYS[today.getDay()]} ${today.getDate()} ${MONTHS[today.getMonth()]}`;
  const until = (i: TodayItem) => (i.kind !== 'routine' && i.endMin !== undefined ? `, until ${formatTime(toHHMM(i.endMin))}` : '');
  const at = (i: TodayItem) => (i.kind !== 'routine' && i.startMin !== undefined ? ` at ${formatTime(toHHMM(i.startMin))}` : '');

  return (
    <View style={s.screen}>
      <ScreenHeader title="Today" sub={headerSub} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 4, gap: 2 }} {...({ dataSet: { nowNext: '1' } } as object)}>
        <Text style={s.nowLine} numberOfLines={1}>
          <Text style={s.nowStrong}>Now </Text>
          {view.now ? `${itemTitle(view.now)}${until(view.now)}` : 'Nothing planned'}
        </Text>
        {view.next ? (
          <Text style={s.nowLine} numberOfLines={1}>
            <Text style={s.nowStrong}>Next </Text>
            {`${itemTitle(view.next)}${at(view.next)}`}
          </Text>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.accent}
            onRefresh={() => {
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {view.timed.length > 0 ? (
          <>
            <SectionHeader>Planned</SectionHeader>
            <Card>{view.timed.map((i, n) => renderRow(i, n === 0))}</Card>
          </>
        ) : null}
        <SectionHeader>Anytime</SectionHeader>
        <Card>{view.anytime.length === 0 ? <Text style={s.empty}>Nothing without a time. Tap + to add a task for today.</Text> : view.anytime.map((i, n) => renderRow(i, n === 0))}</Card>
        {view.done.length > 0 ? (
          <Card style={{ marginTop: 18 }}>
            <PressRow onTap={() => setShowDone((v) => !v)} a11y={`Done today, ${view.done.length}. ${showDone ? 'Hide' : 'Show'}`} style={s.doneHead} data={{ doneToday: String(view.done.length) }}>
              <Text style={s.doneText}>{`Done today, ${view.done.length}`}</Text>
              <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={c.textSecondary} />
            </PressRow>
            {showDone ? view.done.map((i) => renderRow(i, false)) : null}
          </Card>
        ) : null}
      </ScrollView>
      <UndoBar message={undo} onDone={() => setUndo(null)} />
      <AddButton onPress={() => setAdding(true)} a11y="Add a task for today" />
      <QuickAdd visible={adding} where={{ dueDate: todayKey, label: 'Today' }} onClose={() => setAdding(false)} onAdded={() => void load()} />
      <ActionMenu visible={!!menu} title={menu?.title} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      <TaskFormModal
        visible={!!editTask}
        editTask={editTask}
        onClose={() => setEditTask(undefined)}
        onSaved={() => {
          setEditTask(undefined);
          void load();
        }}
      />
      <AddEventModal
        visible={!!editEvent}
        date={today}
        editEvent={editEvent}
        onClose={() => setEditEvent(undefined)}
        onSaved={() => {
          setEditEvent(undefined);
          void load();
        }}
      />
      <RoutineFormModal
        visible={!!editRoutine}
        editRoutine={editRoutine}
        onClose={() => setEditRoutine(undefined)}
        onSaved={() => {
          setEditRoutine(undefined);
          void load();
        }}
      />
    </View>
  );
}

function toHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
