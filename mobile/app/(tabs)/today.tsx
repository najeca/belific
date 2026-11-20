import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, RefreshControl, Text, View } from 'react-native';
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
  updateTask,
} from '../../lib/storage';
import { addDays, dateKey, parseDateKey } from '../../lib/kanban';
import { movedCaption, movedFrom } from '../../lib/series';
import { duringCaption, hostIndex, insidePill } from '../../lib/hosting';
import { buildToday, itemTitle, type TodayItem } from '../../lib/todayView';
import { formatDuration } from '../../lib/duration';
import { labelColor, tintFor } from '../../lib/labelColors';
import { hhmm, nowCard, type NowCardItem } from '../../lib/nowCard';
import { bubbleHeight, nowMarker, type TimelineSpan } from '../../lib/todayTimeline';
import { isQuickReminder } from '../../lib/quickReminder';
import { NowCard, type NowLabel } from '../../components/phone/NowCard';
import { BRAIN_DUMP_EMOJI } from '../../lib/emoji';
import { BRAIN_DUMP_NAME, liveLists } from '../../lib/lists';
import { counter } from '../../lib/subtasks';
import { deleteOne, deleteRepeating, duplicate, loadCutMin, moveToList, skipDay, tickRoutine, tickTask, toggleSubtask } from '../../lib/phoneActions';
import { shiftsOfDay, type ShiftRow } from '../../lib/shifts';
import { tickRow } from '../../lib/shiftActions';
import { plannedText } from '../../lib/taskTotals';
import { ShiftRows } from '../../components/phone/ShiftRows';
import { AddInside, type InsideTarget } from '../../components/phone/AddInside';
import type { CustomEvent, Project, Routine, ScheduleEvent, Task, TaskList } from '../../lib/types';
import { AddButton, ScreenHeader } from '../../components/phone/chrome';
import { StepAdd, type StepAddTarget } from '../../components/phone/StepAdd';
import { ActionMenu, type MenuItem } from '../../components/phone/menu';
import { HoldCard } from '../../components/phone/HoldCard';
import { PressRow, haptic } from '../../components/phone/touch';
import { PartRows } from '../../components/phone/PartRows';
import { partsFor, partsProgress, withParts } from '../../lib/parts';
import { setPartDone } from '../../lib/partActions';
import { UndoBar, type UndoMessage } from '../../components/phone/UndoBar';
import { EarlierPill, EarlierSheet, earlierCount } from '../../components/phone/EarlierSheet';
import { refreshTaskReminders } from '../../components/phone/reminderScheduler';
import { TaskDetails, type DetailsTarget } from '../../components/phone/TaskDetails';
import { useStyles, useTheme } from '../../components/phone/theme';
import { Button, Card, LabelDot, RoundCheck, SectionHeader } from '../../components/phone/ui';
import { inter, mono, type } from '../../components/phone/type';
import AddEventModal from '../components/AddEventModal';
import RoutineFormModal from '../components/RoutineForm';

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
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, minHeight: 56 },
  rowSep: { borderTopWidth: 1, borderTopColor: c.border },
  tick: { width: 52, minHeight: 56, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { flex: 1, minHeight: 56, paddingVertical: 10, paddingRight: 12, justifyContent: 'center' as const },
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  time: { ...mono(500), fontSize: 13, color: c.textSecondary, minWidth: 58 },
  // 3.15.2: the bold figure at the right of the title is the length; the start time is in the meta line.
  length: { ...mono(500), fontSize: 13, color: c.textPrimary, marginLeft: 'auto' as const, paddingLeft: 6 },
  title: { ...inter(500), fontSize: 16, lineHeight: 21, color: c.textPrimary, flexShrink: 1 },
  titleDone: { color: c.textSecondary, textDecorationLine: 'line-through' as const },
  eventTitle: { color: c.textSecondary },
  meta: { ...type.meta, color: c.textSecondary },
  // 3.10.0: a break's "2 inside" and a hosted task's "During Lunch".
  hostPill: { paddingHorizontal: 8, minHeight: 20, borderRadius: radius.full, backgroundColor: c.hostPill, justifyContent: 'center' as const },
  hostPillText: { ...type.meta, ...inter(600), color: c.onHostPill },
  hostCaption: { ...type.meta, ...inter(600), color: c.onHostPill },
  metaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 3, flexWrap: 'wrap' as const },
  expanded: { paddingLeft: 52, paddingRight: 12, paddingBottom: 12, gap: 8 },
  notes: { ...type.body, fontSize: 15, color: c.textPrimary },
  detail: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  step: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 44 },
  stepText: { ...type.body, fontSize: 15, color: c.textPrimary, flexShrink: 1 },
  eventBar: { width: 4, height: 28, borderRadius: radius.xs },
  empty: { ...type.meta, color: c.textSecondary, padding: 16 },
  doneHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 48, paddingHorizontal: 14 },
  doneText: { ...inter(600), fontSize: 15, color: c.textSecondary },
  // 3.60.0: the timeline. A rail (the line and the bubble), the title and time, the tick on the right.
  tlRow: { flexDirection: 'row' as const, alignItems: 'stretch' as const, position: 'relative' as const },
  rail: { width: 52, alignItems: 'center' as const },
  railLine: { position: 'absolute' as const, top: 0, bottom: 0, left: 25, width: 2, backgroundColor: c.border },
  bubble: { width: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center' as const, paddingTop: 9, marginVertical: 6 },
  bubbleEmoji: { fontSize: 18, lineHeight: 22 },
  tlBody: { flex: 1, minHeight: 56, paddingTop: 10, paddingBottom: 10, paddingLeft: 6, paddingRight: 4 },
  tlTitle: { ...inter(600), fontSize: 16, lineHeight: 21, color: c.textPrimary },
  tlTime: { ...mono(500), fontSize: 13, color: c.textSecondary, marginTop: 2 },
  tlTick: { width: 52, height: 56, alignItems: 'center' as const, justifyContent: 'center' as const },
  tlNested: { marginLeft: -4, position: 'relative' as const },
  gapRow: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 44 },
  gapText: { ...type.meta, color: c.textSecondary, fontStyle: 'italic' as const, flexShrink: 1, paddingLeft: 6 },
  markerLine: { flexDirection: 'row' as const, alignItems: 'center' as const, height: 22 },
  markerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.accent, borderWidth: 2, borderColor: c.background },
  markerRule: { flex: 1, height: 2, backgroundColor: c.accent, opacity: 0.6 },
  markerText: { ...mono(500), fontSize: 12, color: c.accent, paddingLeft: 8 },
  markerInside: { position: 'absolute' as const, left: 2, width: 60, height: 12, flexDirection: 'row' as const, alignItems: 'center' as const },
});

// 3.60.0: the round tick on the right of a timeline row, in the label's colour (ring, filled when done).
function LabelTick({ done, color, onColor }: { done: boolean; color: string; onColor: string }) {
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: color, backgroundColor: done ? color : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {done ? <Ionicons name="checkmark" size={16} color={onColor} /> : null}
    </View>
  );
}

export default function TodayScreen() {
  const s = useStyles(make);
  const { c, name: themeName } = useTheme();
  const [todayKey, setTodayKey] = useState(() => dateKey(new Date()));
  const [nowMin, setNowMin] = useState(nowMinutes);
  // R6: `tasks` is what the screen shows (a part is a row under its parent, never a task of its own); `all` is every row, where
  // the parts are looked up.
  const [tasks, setTasks] = useState<Task[]>([]);
  const [all, setAll] = useState<Task[]>([]);
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routinesDone, setRoutinesDone] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ title: string; items: MenuItem[] } | null>(null);
  // Phase 5: the centred card a press and hold on a task opens.
  const [hold, setHold] = useState<{ item: Extract<TodayItem, { kind: 'task' }> } | null>(null);
  const [undo, setUndo] = useState<UndoMessage | null>(null);
  // PLAN_phone_stepflow phase 1: the round + opens the step by step add flow (Today is the suggested day).
  const [stepAdd, setStepAdd] = useState<StepAddTarget | null>(null);
  const [showDone, setShowDone] = useState(false);
  // 3.59.1: one off tasks of earlier days that are not ticked wait in the Earlier pill (never on Today).
  const [earlier, setEarlier] = useState(0);
  const [earlierOpen, setEarlierOpen] = useState(false);
  // S5: the smallest piece free time may leave, and the shift whose Add inside form is open.
  const [cutMin, setCutMin] = useState(30);
  const [inside, setInside] = useState<InsideTarget | null>(null);
  const [details, setDetails] = useState<DetailsTarget | null>(null);
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
    setCutMin(await loadCutMin());
    setTasks(withParts(raw));
    setAll(raw);
    setEarlier(earlierCount(raw, key));
    // Any change made here (a tick, an edit) is followed by a load: the reminders follow it.
    refreshTaskReminders();
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
  // 3.60.0: a timer does not run while the phone sleeps, so coming back to the app redraws the Now card at once (and a
  // new day reloads).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setNowMin(nowMinutes());
      if (dateKey(new Date()) !== todayKey) load().catch(() => {});
    });
    return () => sub.remove();
  }, [load, todayKey]);

  const full = useMemo(() => buildToday({ tasks, todayKey, nowMin, events, routines, routinesDone }), [tasks, todayKey, nowMin, events, routines, routinesDone]);
  // S5: a block inside a shift is a row of the shift's card, not a row of its own (D2); the day's total counts the shift once.
  const ownTasks = useMemo(() => {
    const seen = new Map<string, Task>();
    for (const i of [...full.timed, ...full.anytime, ...full.done]) if (i.kind === 'task' && !seen.has(i.task.id)) seen.set(i.task.id, i.task);
    return [...seen.values()];
  }, [full]);
  const shifts = useMemo(() => shiftsOfDay(tasks, todayKey, todayKey, cutMin, new Set(ownTasks.map((t) => t.id))), [tasks, todayKey, cutMin, ownTasks]);
  const view = useMemo(() => {
    const keep = (i: TodayItem) => i.kind !== 'task' || !shifts.hidden.has(i.task.id);
    return { ...full, timed: full.timed.filter(keep), anytime: full.anytime.filter(keep), done: full.done.filter(keep) };
  }, [full, shifts]);
  const planned = useMemo(() => plannedText(ownTasks.filter((t) => t.dueDate === todayKey)), [ownTasks, todayKey]);
  const hosts = useMemo(() => hostIndex(tasks, [todayKey], todayKey), [tasks, todayKey]);
  const live = liveLists(lists);
  // 3.60.0: the Now card reads every timed item of today (a ticked one is left out by nowCard itself).
  const timedAll = useMemo(() => [...view.timed, ...view.done.filter((i) => i.kind !== 'routine' && i.startMin !== undefined)], [view]);
  const now = useMemo(() => {
    const items: NowCardItem[] = [];
    for (const i of timedAll) {
      if (i.kind === 'routine' || i.startMin === undefined) continue;
      const t = i.kind === 'task' ? i.task : null;
      items.push({ key: i.key, title: itemTitle(i), startMin: i.startMin, endMin: i.endMin ?? i.startMin, reminder: !!t && isQuickReminder(t), free: !!t?.cutsBelow, done: i.kind === 'task' && i.done });
    }
    return nowCard(items, nowMin);
  }, [timedAll, nowMin]);
  const nowItem = now.now ? timedAll.find((i) => i.key === now.now?.key) : undefined;
  // 3.60.0: the timeline is every timed item of today in time order, ticked ones kept (struck through).
  const timeline = useMemo(
    () =>
      timedAll
        .filter((i) => i.kind !== 'routine' && i.startMin !== undefined)
        .sort((a, b) => (a.kind === 'routine' || b.kind === 'routine' ? 0 : (a.startMin ?? 0) - (b.startMin ?? 0)) || itemTitle(a).localeCompare(itemTitle(b)))
        .map((item) => {
          const t = item.kind === 'task' ? item.task : null;
          const startMin = item.kind === 'routine' ? 0 : (item.startMin ?? 0);
          const span: TimelineSpan = { key: item.key, startMin, endMin: item.kind === 'routine' ? 0 : (item.endMin ?? startMin), reminder: !!t && isQuickReminder(t), free: !!t?.cutsBelow, done: item.kind === 'task' && item.done };
          return { item, span };
        }),
    [timedAll],
  );
  const doneUntimed = view.done.filter((i) => i.kind === 'routine' || i.startMin === undefined);

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

  // The details sheet edits a projected day's series (its date moves only that day), as on the desktop.
  async function openEdit(task: Task, projected: boolean) {
    setDetails({ task, projected });
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
    setHold({ item });
  }

  // Phase 5: what the centred hold card does. Move and More open as the next sheet once the card has closed.
  const holdActions = (item: Extract<TodayItem, { kind: 'task' }>) => {
    const { task, projected } = item;
    const after = (fn: () => Promise<unknown>) => () => {
      fn().then(load);
    };
    const tomorrowKey = dateKey(addDays(parseDateKey(todayKey), 1));
    const nextWeekKey = dateKey(addDays(parseDateKey(todayKey), 7));
    const toDay = (key: string, text: string) => () => {
      void updateTask({ ...task, dueDate: key }).then(load);
      setUndo({ id: Date.now(), text: `${text}: ${task.title}`, undo: () => void updateTask(task).then(load) });
    };
    const listItems: MenuItem[] = [
      { label: 'Brain Dump', icon: 'file-tray-outline', run: after(() => moveToList(task, projected, undefined)) },
      ...live.map((l) => ({ label: `${l.emoji ? `${l.emoji} ` : ''}${l.name}`, icon: 'list-outline' as const, run: after(() => moveToList(task, projected, l.key)) })),
    ];
    // A repeating task is never moved to a day this way (it has Skip today); it can change list.
    const moveItems: MenuItem[] = task.recurrence
      ? listItems
      : [
          { label: 'Tomorrow', icon: 'arrow-forward-outline', run: toDay(tomorrowKey, 'Moved to tomorrow') },
          { label: 'Next week', icon: 'calendar-outline', run: toDay(nextWeekKey, 'Moved to next week') },
          { label: 'Pick a day', icon: 'calendar-number-outline', run: () => void openEdit(task, projected) },
          ...listItems,
        ];
    const moreItems: MenuItem[] = [
      ...(task.startTime && !task.cutsBelow ? [{ label: 'Add inside', icon: 'add-circle-outline' as const, run: () => setInside({ task, projected }) }] : []),
      { label: 'Duplicate', icon: 'copy-outline', run: after(() => duplicate(task, projected)) },
    ];
    return {
      completed: task.completed,
      done: () => void tick(item, !task.completed),
      edit: () => void openEdit(task, projected),
      skip: after(() => skipDay(task)),
      deleteOne: after(() => (task.recurrence ? skipDay(task) : deleteOne(task))),
      deleteSeries: after(() => deleteRepeating(task)),
      move: () => setTimeout(() => setMenu({ title: 'Move to', items: moveItems }), 250),
      more: () => setTimeout(() => setMenu({ title: task.title, items: moreItems }), 250),
    };
  };

  // A tick on a row of a shift works in place (the round tick of an inside block or to do); Undo puts it back.
  async function tickInside(task: Task, projected: boolean, row: ShiftRow) {
    haptic(row.done ? 'light' : 'success');
    await tickRow(task, projected, row);
    await load();
    if (!row.done) setUndo({ id: Date.now(), text: `Done: ${row.title}`, undo: () => void tickRow(task, projected, { ...row, done: true }).then(load) });
  }

  // The label's colours for the Now card's edge and pill (the dark tint in dark mode).
  const nowLabel = (t: Task): NowLabel | null => {
    const p = t.projectKey ? projects.find((x) => x.key === t.projectKey && !x.deletedAt) : undefined;
    const col = p ? labelColor(p.colorKey) : undefined;
    return p ? { name: `${p.emoji ? `${p.emoji} ` : ''}${p.name}`, edge: col?.edge ?? c.textTertiary, tint: col ? tintFor(col, themeName === 'dark') : c.background } : null;
  };
  const label = (t: Task) => {
    const p = t.projectKey ? projects.find((x) => x.key === t.projectKey) : undefined;
    return p ? { name: `${p.emoji ? `${p.emoji} ` : ''}${p.name}`, color: labelColor(p.colorKey)?.edge ?? c.textTertiary } : null;
  };
  // The list a row is in, with its emoji (Brain Dump with its brain, 3.14.1).
  const listOf = (t: Task) => {
    const l = t.listKey ? live.find((x) => x.key === t.listKey) : undefined;
    return l ? `${l.emoji ? `${l.emoji} ` : ''}${l.name}` : `${BRAIN_DUMP_EMOJI} ${BRAIN_DUMP_NAME}`;
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
    const ps = t ? partsFor(all, t) : [];
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
            a11y={`${title}${timeText ? `, ${timeText}` : ''}${done ? ', done' : ''}${t && movedCaption(t) ? `, ${movedCaption(t)}` : ''}`}
            hint="Tap to open. Press and hold for more."
            data={{ todayBody: item.key }}
          >
            <View style={s.line}>
              <Text style={[s.title, done && s.titleDone]} numberOfLines={open ? undefined : 2}>
                {title}
              </Text>
              {t?.recurrence || item.kind === 'routine' ? <Ionicons name="repeat" size={14} color={c.textSecondary} accessibilityLabel="Repeats" /> : null}
              {t?.durationMinutes ? <Text style={s.length} accessibilityLabel={`Estimate ${formatDuration(t.durationMinutes)}`} {...({ dataSet: { todayLength: '1' } } as object)}>{formatDuration(t.durationMinutes)}</Text> : null}
            </View>
            {/* 3.23.0: two lines, the list and label first (the label's name never cut to a dot), then the time. */}
            {lab || lst ? (
              <View style={[s.metaRow, { gap: 8 }]} {...({ dataSet: { rowLabel: '1' } } as object)}>
                {lst ? <Text style={s.meta}>{lst}</Text> : null}
                {lab ? (
                  <View style={[s.detail, { flexShrink: 1 }]}>
                    <LabelDot color={lab.color} />
                    <Text style={[s.meta, { flexShrink: 1 }]}>{lab.name}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={s.metaRow} {...({ dataSet: { rowWhen: '1' } } as object)}>
              {timeText ? <Text style={[s.meta, { ...mono(500) }]} {...({ dataSet: { todayStart: '1' } } as object)}>{timeText}</Text> : null}
              {item.kind === 'routine' ? <Text style={s.meta}>{TIME_OF_DAY[item.routine.timeOfDay]} routine</Text> : null}
              {count.total ? <Text style={s.meta}>{`${count.done}/${count.total} steps`}</Text> : null}
              {ps.length ? <Text style={s.meta} {...({ dataSet: { rowParts: partsProgress(ps).text } } as object)}>{partsProgress(ps).text}</Text> : null}
              {t && movedCaption(t) ? <Text style={s.meta} {...({ dataSet: { movedFrom: movedFrom(t) } } as object)}>{`↪ ${movedCaption(t)}`}</Text> : null}
              {t && hosts.inside.get(t.id) ? (
                <View style={s.hostPill} {...({ dataSet: { hostPill: String(hosts.inside.get(t.id)) } } as object)}>
                  <Text style={s.hostPillText}>{insidePill(hosts.inside.get(t.id) ?? 0)}</Text>
                </View>
              ) : null}
              {t && hosts.during.get(t.id) ? <Text style={s.hostCaption} {...({ dataSet: { hostCaption: hosts.during.get(t.id) } } as object)}>{duringCaption(hosts.during.get(t.id) ?? '')}</Text> : null}
            </View>
          </PressRow>
        </View>
        {t && ps.length > 0 ? <PartRows parent={t} parts={ps} onTick={(p, d) => void setPartDone(t, p, d).then(load)} onMore={() => void openEdit(t, projected)} /> : null}
        {t && shifts.byTask.has(t.id) ? (
          <ShiftRows
            info={shifts.byTask.get(t.id)!}
            onTick={(row) => void tickInside(t, projected, row)}
            onOpen={(row) => row.full && void openEdit(row.full, !!row.projected)}
            onAdd={() => setInside({ task: t, projected })}
          />
        ) : null}
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
            {!lab && !lst && !t.notes && !steps.length && !ps.length ? <Text style={s.meta}>No notes, steps, label or list yet.</Text> : null}
            <View style={{ flexDirection: 'row' }}>
              <Button label="Edit" icon="create-outline" onPress={() => void openEdit(t, projected)} a11y={`Edit ${t.title}`} />
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  // 3.60.0: the bubble's colours: the label's tint and edge, or the neutral grey; an event is grey.
  const bubbleColors = (t: Task | null) => {
    const p = t?.projectKey ? projects.find((x) => x.key === t.projectKey && !x.deletedAt) : undefined;
    const col = p ? labelColor(p.colorKey) : undefined;
    return col ? { fill: tintFor(col, themeName === 'dark'), edge: col.edge } : { fill: c.plainBlock, edge: c.borderStrong };
  };
  const listEmojiOf = (t: Task) => {
    const l = t.listKey ? live.find((x) => x.key === t.listKey) : undefined;
    return l?.emoji || BRAIN_DUMP_EMOJI;
  };
  const marker = nowMarker(timeline.map((i) => i.span), nowMin);
  const markerLine = (
    <View key="now-marker" style={s.markerLine} accessible accessibilityLabel={`Now, ${formatTime(hhmm(nowMin))}`} {...({ dataSet: { nowMarker: 'line' } } as object)}>
      <View style={[s.rail, { height: 22, justifyContent: 'center' }]}>
        <View style={s.railLine} />
        <View style={s.markerDot} />
      </View>
      <View style={s.markerRule} />
      <Text style={s.markerText}>{`Now ${formatTime(hhmm(nowMin))}`}</Text>
    </View>
  );

  function renderTimed(row: (typeof timeline)[number]) {
    const item = row.item;
    if (item.kind === 'routine') return null;
    const start = formatTime(hhmm(item.startMin ?? 0));
    if (row.span.free && item.kind === 'task') {
      const t = item.task;
      const end = formatTime(hhmm(item.endMin ?? item.startMin ?? 0));
      return (
        <PressRow key={item.key} onTap={() => void openEdit(t, item.projected)} onHold={() => openMenu(item)} a11y={`${t.title}, free time, ${start} to ${end}`} hint="Tap to open." style={s.gapRow} data={{ todayGap: t.title }}>
          <View style={s.rail} />
          <Text style={s.gapText}>{`${t.title}, free time · ${start} to ${end}`}</Text>
        </PressRow>
      );
    }
    const t = item.kind === 'task' ? item.task : null;
    const reminder = !!t && isQuickReminder(t);
    const minutes = (item.endMin ?? 0) - (item.startMin ?? 0);
    const h = bubbleHeight(minutes, reminder);
    const col = t ? bubbleColors(t) : { fill: c.plainBlock, edge: c.border };
    const done = item.kind === 'task' && item.done;
    const title = itemTitle(item);
    const len = t?.durationMinutes ? formatDuration(t.durationMinutes) : '';
    const timeText = item.kind === 'event' ? `${start} to ${formatTime(item.event.end)}` : `${start}${len ? ` · ${len}` : ''}`;
    const emoji = t ? listEmojiOf(t) : item.kind === 'event' ? item.event.icon || '' : '';
    const ps = t ? partsFor(all, t) : [];
    const inside = marker.inside && marker.key === item.key ? marker.share : null;
    const editable = item.kind === 'event' && item.event.isCustom && customEvents.some((x) => x.id === item.event.id);
    const projected = item.kind === 'task' && item.projected;
    return (
      <View key={item.key} {...({ dataSet: item.kind === 'task' ? { todayRow: item.task.title, todayKey: item.key, tlRow: done ? 'done' : 'open' } : { todayEvent: item.event.title, tlRow: 'event' } } as object)}>
        <View style={s.tlRow}>
          <View style={s.rail}>
            <View style={s.railLine} />
            <View style={[s.bubble, { height: h, backgroundColor: col.fill, borderColor: col.edge }, reminder && { paddingTop: 0, justifyContent: 'center' }]} {...({ dataSet: { bubble: String(h), bubbleEdge: col.edge } } as object)}>
              <Text style={s.bubbleEmoji}>{emoji}</Text>
            </View>
          </View>
          <PressRow
            style={s.tlBody}
            onTap={() => (t ? void openEdit(t, projected) : editable ? openMenu(item) : undefined)}
            onHold={t && !done ? () => openMenu(item) : undefined}
            a11y={`${title}, ${timeText}${done ? ', done' : ''}`}
            hint={t ? 'Tap to open. Press and hold for more.' : undefined}
            data={{ todayBody: item.key }}
          >
            <Text style={[s.tlTitle, done && s.titleDone, item.kind === 'event' && s.eventTitle]} numberOfLines={2}>{title}</Text>
            <Text style={s.tlTime} {...({ dataSet: { todayStart: '1' } } as object)}>{timeText}</Text>
            {t && hosts.during.get(t.id) ? <Text style={[s.hostCaption, { marginTop: 3 }]} {...({ dataSet: { hostCaption: hosts.during.get(t.id) } } as object)}>{duringCaption(hosts.during.get(t.id) ?? '')}</Text> : null}
            {t && movedCaption(t) ? <Text style={s.meta} {...({ dataSet: { movedFrom: movedFrom(t) } } as object)}>{`↪ ${movedCaption(t)}`}</Text> : null}
          </PressRow>
          {item.kind === 'task' ? (
            <PressRow onTap={() => void tick(item, !done)} a11y={done ? `Mark ${title} not done` : `Mark ${title} done`} style={s.tlTick} data={{ tick: item.key }}>
              <LabelTick done={done} color={col.edge === c.borderStrong ? c.accent : col.edge} onColor={c.onAccent} />
            </PressRow>
          ) : (
            <View style={s.tlTick} />
          )}
          {inside !== null ? (
            <View pointerEvents="none" style={[s.markerInside, { top: 6 + Math.round(inside * h) - 6 }]} accessible accessibilityLabel={`Now, ${formatTime(hhmm(nowMin))}`} {...({ dataSet: { nowMarker: 'inside' } } as object)}>
              <View style={s.markerDot} />
              <View style={s.markerRule} />
            </View>
          ) : null}
        </View>
        {t && ps.length > 0 ? (
          <View style={s.tlNested}>
            <View style={[s.railLine, { left: 29 }]} />
            <PartRows parent={t} parts={ps} onTick={(p, d) => void setPartDone(t, p, d).then(load)} onMore={() => void openEdit(t, projected)} />
          </View>
        ) : null}
        {t && shifts.byTask.has(t.id) ? (
          <View style={s.tlNested}>
            <View style={[s.railLine, { left: 29 }]} />
            <ShiftRows
              info={shifts.byTask.get(t.id)!}
              onTick={(r) => void tickInside(t, projected, r)}
              onOpen={(r) => r.full && void openEdit(r.full, !!r.projected)}
              onAdd={() => setInside({ task: t, projected })}
            />
          </View>
        ) : null}
      </View>
    );
  }

  const timelineRows: React.ReactNode[] = [];
  timeline.forEach((row, n) => {
    if (!marker.inside && marker.index === n) timelineRows.push(markerLine);
    timelineRows.push(renderTimed(row));
  });
  if (!marker.inside && marker.index === timeline.length && timeline.length > 0) timelineRows.push(markerLine);

  const today = new Date();
  const headerSub = `${DAYS[today.getDay()]} ${today.getDate()} ${MONTHS[today.getMonth()]}`;

  return (
    <View style={s.screen}>
      <ScreenHeader title="Today" sub={headerSub} />
      {earlier > 0 ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <EarlierPill count={earlier} onPress={() => setEarlierOpen(true)} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 16, paddingBottom: 6, gap: 6 }}>
        <NowCard
          words={now}
          title={now.now?.title ?? ''}
          label={nowItem?.kind === 'task' ? nowLabel(nowItem.task) : null}
          onDone={nowItem?.kind === 'task' ? () => void tick(nowItem, true) : undefined}
        />
        {planned ? <Text style={s.nowLine} numberOfLines={1} {...({ dataSet: { todayPlanned: planned } } as object)}>{planned}</Text> : null}
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
        {timeline.length > 0 ? <View style={{ marginTop: 8 }} {...({ dataSet: { timeline: String(timeline.length) } } as object)}>{timelineRows}</View> : null}
        <SectionHeader>Anytime</SectionHeader>
        <Card>{view.anytime.length === 0 ? <Text style={s.empty}>Nothing without a time. Tap + to add a task for today.</Text> : view.anytime.map((i, n) => renderRow(i, n === 0))}</Card>
        {doneUntimed.length > 0 ? (
          <Card style={{ marginTop: 18 }}>
            <PressRow onTap={() => setShowDone((v) => !v)} a11y={`Done today, ${doneUntimed.length}. ${showDone ? 'Hide' : 'Show'}`} style={s.doneHead} data={{ doneToday: String(doneUntimed.length) }}>
              <Text style={s.doneText}>{`Done today, ${doneUntimed.length}`}</Text>
              <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={c.textSecondary} />
            </PressRow>
            {showDone ? doneUntimed.map((i) => renderRow(i, false)) : null}
          </Card>
        ) : null}
      </ScrollView>
      <UndoBar message={undo} onDone={() => setUndo(null)} />
      <AddInside target={inside} onClose={() => setInside(null)} onAdded={() => void load()} />
      <AddButton onPress={() => setStepAdd({ suggestDay: todayKey })} a11y="Add a task" />
      <StepAdd
        target={stepAdd}
        onClose={(note) => {
          setStepAdd(null);
          void load();
          if (note) setUndo({ id: Date.now(), text: note });
        }}
        onChanged={() => void load()}
      />
      <ActionMenu visible={!!menu} title={menu?.title} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      {hold ? <HoldCard task={hold.item.task} projected={hold.item.projected} labels={projects} lists={lists} todayKey={todayKey} actions={holdActions(hold.item)} onClose={() => setHold(null)} /> : null}
      <TaskDetails target={details} onClose={() => setDetails(null)} onChanged={() => void load()} />
      <EarlierSheet visible={earlierOpen} onClose={() => setEarlierOpen(false)} onChanged={() => void load()} />
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
