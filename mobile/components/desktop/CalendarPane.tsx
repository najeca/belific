import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { domNode, useDrag } from './DragProvider';
import TimeBlock, { SlotPreview } from './TimeBlock';
import { tipRef } from './tip';
import PriorityMark from './PriorityMark';
import { isMustDo } from '../../lib/mustDo';
import { pieceTimeText, planCuts, type CutEntry, type CutPiece } from '../../lib/cuts';
import { timeViews } from '../../lib/times';
import { useCutMin } from './cutStore';
import { hostDay, type HostEntry } from '../../lib/hosting';
import { setDayBreaks, type DayBreak } from './breakStore';
import type { HostedGuest } from './HostChips';
import { useTint } from './themeStore';
import { useVibrant, vibrantLook, vibrantMeta, vibrantText } from './vibrantStore';
import { taskDuration } from '../../lib/drag';
import { dayAt, followToday, indexOfDay, leftDay, stripAround, visibleRange, weekRangeTitle } from '../../lib/dayStrip';
import { useAwayDays } from './awayStore';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { customToScheduleEvent, formatTime, getWeeklyEventsForDate } from '../../lib/data';
import { addDays, dateKey, parseDateKey, WEEKDAYS } from '../../lib/kanban';
import {
  GRID_END_HOUR,
  GRID_HEIGHT_PX,
  GRID_START_HOUR,
  PX_PER_HOUR,
  continuationOf,
  hourLabel,
  isCompactBlock,
  layoutItems,
  scrollOffsetFor,
  taskToItem,
  toMinutes,
  type TimeboxItem,
  toTime,
} from '../../lib/timebox';
import { openingMinutes } from '../../lib/dayStart';
import { formatDuration } from '../../lib/duration';
import { tasksForTimebox, type DayTask } from '../../lib/timeboxTasks';
import { movedCaption, movedCaptionLong, projectOccurrences } from '../../lib/series';
import { taskVisible, type TaskFilter } from '../../lib/taskFilter';
import { calendarTitle, minutesOfDay, monthGrid, nowLineTop, splitAllDay, stepAnchor, visibleDayKeys } from '../../lib/calendarView';
import type { CalendarView } from '../../lib/paneState';
import { formatTotals, isOverEstimate, totalsOf } from '../../lib/taskTotals';
import { labelColor } from '../../lib/labelColors';
import { listEmojiOf, listNameOf } from '../../lib/lists';
import ListEmoji from './ListEmoji';
import { loadLabels } from '../../lib/labels';
import { loadCustomCategories, loadCustomEvents, loadLists, loadTasksRaw } from '../../lib/storage';
import type { CustomCategory, CustomEvent, Project, ScheduleEvent, Task, TaskList } from '../../lib/types';
import { useDayStart } from './useDayStart';
import { openDetail } from './uiStore';
import { useTick } from './timerUi';
import FilterButton from './FilterButton';
import { importedOccurrences, loadIcs, useIcs, type ImportedOccurrence } from './icsStore';
import { minuteLabel, rangeOf, segmentsForDay, type DaySegment } from '../../lib/externalEvents';
import { outlinedBtn, outlinedBtnText, segBtn, segBtnOn, segLabel, segLabelOn, segTrack } from './ui';

// The Calendar (build plan phase 3): the centre of the home screen when it is
// switched from the Kanban board (V). Day, week and month views (D, W, M). The
// day and week views are the 24 hour grid, 00:00 to 24:00, with an all day row
// (tasks with a Day and no time) above it and a line at the current time; they
// open at "My day starts at", or about an hour before now when today is shown,
// and scroll through the whole day. The month view lists each day's tasks.
//
// It shows the same data as the board and the Timebox (stored tasks, the days of
// repeating series, overnight tasks continuing on the next day, events) and a
// block or chip opens the same task menu. "Show only today" shows today's day
// view.
// 2.26.0: the Calendar does everything the Timebox does, with the same code
// (TimeBlock, DragProvider, lib/drag.ts): drag a task to another time or day
// (30 minute steps), resize its bottom edge (the estimate), drop a task from
// the list or the board onto a time, drag an all day task onto the grid, drop
// a block on the all day row to take its time away, and move a block with the
// arrow keys. Phase 3 had left the Calendar read only (the drag layer and its
// drop zones belonged to the Timebox); the drop zones now accept any number of
// day columns. The week view is a rolling strip of days.
//
// Events from imported calendar subscriptions (build plan phase 8, Settings,
// Calendars) are drawn read only beside the tasks: a dashed outline, the 📅
// emoji and the calendar's name; nothing opens or moves them.
const GUTTER = 48;
const HEAD_H = 36;
const ALLDAY_H = 56;
const scopeOf = (dayKey: string) => `cal${dayKey}:`;

type ImportedSeg = DaySegment & { occ: ImportedOccurrence };

type Source =
  | { kind: 'event'; event: ScheduleEvent }
  | { kind: 'imported'; seg: ImportedSeg }
  | ({ kind: 'task'; task: Task; projected: boolean } & TimeInfo)
  | ({ kind: 'continuation'; task: Task; projected: boolean } & TimeInfo)
  // One piece of a task that a break cuts (lib/cuts.ts); `cont`: it is the rest of yesterday's task.
  | ({ kind: 'piece'; task: Task; projected: boolean; piece: CutPiece; cont: boolean } & TimeInfo);

// A task with several times a day is drawn once per time (Part C): `task` is the single-time copy that
// block shows, `full` the real task (what a drag or a resize writes), `time` the time of this block.
interface TimeInfo {
  full?: Task;
  time?: string;
  suffix?: string;
}

interface DayData {
  key: string;
  allDay: DayTask[];
  importedAllDay: ImportedSeg[];
  sources: Map<string, Source>;
  // Why a break could not cut, by the break's block id: the sentence and the short badge.
  notes: Map<string, string>;
  badges: Map<string, string>;
  blocks: ReturnType<typeof layoutItems>['blocks'];
  // 3.6.0: the tasks during each break (by the break's block id), and the day's breaks.
  hostedBy: Map<string, HostedGuest[]>;
  breaks: DayBreak[];
}

export default function CalendarPane({
  refreshKey,
  onChanged,
  filter,
  onFilterChange,
  view,
  onViewChange,
  onlyToday,
}: {
  refreshKey: number;
  onChanged: () => void;
  filter: TaskFilter;
  onFilterChange: (next: TaskFilter) => void;
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  onlyToday: boolean;
}) {
  const [anchor, setAnchor] = useState(() => dateKey(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CustomEvent[]>([]);
  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [labels, setLabels] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [viewH, setViewH] = useState(0);
  const [viewW, setViewW] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollerEl = useRef<HTMLDivElement | null>(null);
  const gridEl = useRef<HTMLDivElement | null>(null);
  const { drag, registerZone, registerScroller, registerBoard, sourceRef } = useDrag();
  const zoneRefs = useRef(new Map<string, (node: unknown) => void>());
  const dayStartMin = useDayStart();
  const now = useTick(30000);
  // Away days (2.27.0) are greyed in every view.
  const awayDays = useAwayDays(refreshKey);
  const cutMin = useCutMin();
  // "Vibrant task colours" (Settings): saturated chips and blocks with bold white text; off = as before.
  const vibrant = useVibrant();
  const tint = useTint();

  const reload = useCallback(() => {
    // Raw rows, tombstones included: a skipped day of a series blocks its projection.
    loadTasksRaw().then(setTasks);
    loadCustomEvents().then(setEvents);
    loadCustomCategories().then(setCategories);
    loadLabels().then(setLabels);
    loadLists().then(setLists);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const todayKey = dateKey(new Date(now));
  const effView: CalendarView = onlyToday ? 'day' : view;
  const key = onlyToday ? todayKey : anchor;
  // The week view is a rolling strip of days (2.26.0): seven columns fill the
  // width and it scrolls sideways to any day; the day view is one column.
  const strip = useMemo(() => stripAround(todayKey), [todayKey]);
  const colW = effView === 'week' ? Math.max(120, Math.floor((viewW - GUTTER) / 7)) : Math.max(200, viewW - GUTTER);
  const range = useMemo(() => visibleRange(scrollLeft, Math.max(1, viewW - GUTTER), colW, strip.total), [scrollLeft, viewW, colW, strip.total]);
  const keys = useMemo(() => {
    if (effView === 'month') return visibleDayKeys('month', key);
    if (effView === 'day') return [key];
    const out: string[] = [];
    for (let i = range.first; i <= range.last; i++) out.push(dayAt(strip, i));
    return out;
  }, [effView, key, range.first, range.last, strip]);
  const colLeft = (dayKey: string) => (effView === 'week' ? indexOfDay(strip, dayKey) * colW : 0);
  const contentW = effView === 'week' ? GUTTER + strip.total * colW : Math.max(GUTTER + colW, viewW);
  const weekLeft = effView === 'week' ? leftDay(strip, scrollLeft, colW) : key;

  // Imported calendars (read only, this computer only).
  const ics = useIcs();
  useEffect(() => {
    loadIcs();
  }, []);
  const imported = useMemo(() => {
    if (keys.length === 0) return [];
    const { fromMs, toMs } = rangeOf(keys[0], keys[keys.length - 1]);
    return importedOccurrences(ics, fromMs, toMs);
  }, [ics.version, ics.subs, keys]);
  const icsFailing = ics.subs.filter((s) => s.lastError).length;

  const days: DayData[] = useMemo(() => {
    if (effView === 'month') return [];
    return keys.map((dayKey) => {
      const sources = new Map<string, Source>();
      const items: TimeboxItem[] = [];
      for (const e of getWeeklyEventsForDate(parseDateKey(dayKey))) {
        const s = toMinutes(e.start);
        const en = toMinutes(e.end);
        if (s === null || en === null) continue;
        sources.set(`event:${e.id}`, { kind: 'event', event: e });
        items.push({ id: `event:${e.id}`, startMin: s, endMin: en });
      }
      for (const c of events) {
        if (c.date !== dayKey) continue;
        const e = customToScheduleEvent(c, categories);
        const s = toMinutes(e.start);
        const en = toMinutes(e.end);
        if (s === null || en === null) continue;
        sources.set(`event:${e.id}`, { kind: 'event', event: e });
        items.push({ id: `event:${e.id}`, startMin: s, endMin: en });
      }
      const { own, spill } = tasksForTimebox(tasks, dayKey, todayKey);
      const visibleOwn = own.filter((d) => taskVisible(d.task, filter));
      const { allDay, timed } = splitAllDay(visibleOwn);
      // The timed tasks and yesterday's overnight rest; a task with "Cut tasks underneath" cuts the
      // others they overlap into pieces (lib/cuts.ts, derived each time, nothing stored).
      const entries: Array<CutEntry & HostEntry> = [];
      const high = new Map<string, boolean>();
      for (const { task: t, projected } of timed) {
        for (const v of timeViews(t)) {
          const item = taskToItem(v.task);
          if (!item) continue;
          const bid = `task:${t.id}${v.suffix}`;
          sources.set(bid, { kind: 'task', task: v.task, projected, ...(v.multi ? { full: t, time: v.time, suffix: v.suffix } : {}) });
          entries.push({ id: bid, startMin: item.startMin, endMin: item.endMin, breaks: !!t.cutsBelow });
          high.set(bid, isMustDo(t));
        }
      }
      for (const { task: t, projected } of spill) {
        if (!taskVisible(t, filter)) continue;
        for (const v of timeViews(t)) {
          const rest = continuationOf(v.task);
          if (!rest) continue;
          const cid = `${rest.id}${v.suffix}`;
          sources.set(cid, { kind: 'continuation', task: v.task, projected, ...(v.multi ? { full: t, time: v.time, suffix: v.suffix } : {}) });
          entries.push({ id: cid, startMin: rest.startMin, endMin: rest.endMin, breaks: !!t.cutsBelow, cont: true });
          high.set(cid, isMustDo(t));
        }
      }
      const titleOf = (id: string) => {
        const s = sources.get(id);
        return s && (s.kind === 'task' || s.kind === 'continuation') ? s.task.title : id;
      };
      // 3.6.0: a task fully inside a break is a chip in it (lib/hosting.ts), not cut, not beside it.
      const host = hostDay(entries);
      const hostedBy = new Map<string, HostedGuest[]>();
      for (const [breakId, ids] of host.hosted) {
        const guests: HostedGuest[] = [];
        for (const id of ids) {
          const s = sources.get(id);
          if (!s || s.kind !== 'task') continue;
          const color = labelColor(labels.find((p) => p.key === s.task.projectKey)?.colorKey);
          guests.push({ blockId: id, task: s.task, full: s.full ?? s.task, projected: s.projected, ...(s.time ? { time: s.time } : {}), dot: color?.edge ?? Colors.textSecondary });
        }
        hostedBy.set(breakId, guests);
      }
      const breaks: DayBreak[] = entries.flatMap((e) => {
        const s = sources.get(e.id);
        return e.breaks && !e.cont && s && s.kind === 'task' ? [{ id: e.id, startMin: e.startMin, endMin: e.endMin, title: s.task.title, taskId: s.task.id }] : [];
      });
      const plan = planCuts(entries.filter((e) => !host.hostOf.has(e.id)), cutMin, titleOf);
      for (const it of plan.items) {
        if (it.piece) {
          const host = sources.get(it.piece.hostId);
          if (host && (host.kind === 'task' || host.kind === 'continuation')) {
            sources.set(it.id, { kind: 'piece', task: host.task, projected: host.projected, piece: it.piece, cont: host.kind === 'continuation', full: host.full, time: host.time, suffix: host.suffix });
          }
        }
        items.push({ id: it.id, startMin: it.startMin, endMin: it.endMin, high: high.get(it.piece?.hostId ?? it.id) });
      }
      const importedAllDay: ImportedSeg[] = [];
      for (const seg of segmentsForDay(imported, dayKey) as ImportedSeg[]) {
        if (seg.allDayRow) {
          importedAllDay.push(seg);
          continue;
        }
        const id = `ext:${seg.occ.id}`;
        sources.set(id, { kind: 'imported', seg });
        items.push({ id, startMin: seg.startMin, endMin: seg.endMin });
      }
      // 2.29.0: top priority first in the all day row (a stable sort; nothing stored).
      allDay.sort((a, b) => Number(isMustDo(b.task)) - Number(isMustDo(a.task)));
      return { key: dayKey, allDay, importedAllDay, sources, notes: plan.notes, badges: plan.badges, blocks: layoutItems(items).blocks, hostedBy, breaks };
    });
  }, [effView, keys, tasks, events, categories, filter, todayKey, imported, cutMin, labels]);
  // A drag over one of these breaks starts the task inside it (DragProvider).
  useEffect(() => {
    for (const d of days) setDayBreaks(d.key, d.breaks);
  }, [days]);

  // The scroller and the grid (plain elements: they scroll both ways and hold
  // sticky rows). The scroller is a drag scroller (top and bottom) and, in the
  // week view, a board (its edges scroll the days sideways).
  const setScroller = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerEl.current = node;
      registerScroller('calendar', node);
      if (node) {
        const measure = () => {
          setViewW(node.clientWidth);
          setViewH(node.clientHeight);
        };
        measure();
        new ResizeObserver(measure).observe(node);
      }
    },
    [registerScroller],
  );
  const setGrid = useCallback((node: HTMLDivElement | null) => {
    gridEl.current = node;
  }, []);
  useEffect(() => {
    const node = scrollerEl.current;
    registerBoard('calendar', effView === 'week' && node ? { node, atCurrentWeek: () => false, step: () => {} } : null);
    return () => registerBoard('calendar', null);
  }, [effView, registerBoard, viewW > 0]);
  // Where a drop can land: the scroller minus its sticky headers and hours.
  const gridClip = () => {
    const n = scrollerEl.current;
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { left: r.left + GUTTER, top: r.top + HEAD_H + ALLDAY_H, right: r.right, bottom: r.bottom };
  };
  const columnRef = (dayKey: string) => {
    const id = `calcol:${dayKey}`;
    let ref = zoneRefs.current.get(id);
    if (!ref) {
      ref = (node: unknown) => {
        const el = domNode(node);
        registerZone(id, el ? { kind: 'timebox', dayKey, node: el, gridNode: gridEl.current, clip: gridClip } : null);
      };
      zoneRefs.current.set(id, ref);
    }
    return ref;
  };
  const allDayRef = (dayKey: string) => {
    const id = `calday:${dayKey}`;
    let ref = zoneRefs.current.get(id);
    if (!ref) {
      ref = (node: unknown) => {
        const el = domNode(node);
        registerZone(id, el ? { kind: 'day', dayKey, node: el, clip: () => scrollerEl.current } : null);
      };
      zoneRefs.current.set(id, ref);
    }
    return ref;
  };
  const dropDay = drag && drag.mode === 'move' && drag.accepted && drag.target?.kind === 'day' ? drag.target.dayKey : null;

  // Puts a day at the left of the week strip.
  const showWeekAt = useCallback(
    (dayKey: string) => {
      const n = scrollerEl.current;
      if (!n || indexOfDay(strip, dayKey) < 0) return;
      const x = indexOfDay(strip, dayKey) * colW;
      n.scrollLeft = x;
      setScrollLeft(x);
    },
    [strip, colW],
  );
  // The week opens with the anchor (today at first) at the left edge.
  useEffect(() => {
    if (effView !== 'week' || viewW === 0) return;
    showWeekAt(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effView, viewW > 0, colW]);
  // Opens at the day start (or about an hour before now when today is shown).
  useEffect(() => {
    if (effView === 'month' || viewH === 0) return;
    const d = new Date();
    const at = openingMinutes({ isToday: keys.includes(dateKey(d)), nowMin: minutesOfDay(d), dayStartMin });
    const t = setTimeout(() => {
      if (scrollerEl.current) scrollerEl.current.scrollTop = scrollOffsetFor(at);
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effView, key, dayStartMin, viewH > 0]);
  const step = (delta: -1 | 1) => {
    if (effView === 'week') {
      const i = Math.min(strip.total - 1, Math.max(0, indexOfDay(strip, weekLeft) + 7 * delta));
      showWeekAt(dayAt(strip, i));
      setAnchor(dayAt(strip, i));
    } else setAnchor(stepAnchor(effView, key, delta));
  };
  // At midnight with the app open (2.27.0): a view on today moves on to the new
  // today, and a week the person scrolled elsewhere keeps its first day (the
  // strip is counted from today, so the same scroll would show the next day).
  const prevToday = useRef(todayKey);
  const lastWeekLeft = useRef(weekLeft);
  useEffect(() => {
    const prev = prevToday.current;
    prevToday.current = todayKey;
    if (prev === todayKey) return;
    setAnchor((a) => followToday(a, prev, todayKey));
    if (effView === 'week') showWeekAt(followToday(lastWeekLeft.current, prev, todayKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);
  useEffect(() => {
    lastWeekLeft.current = weekLeft;
  });
  const goToday = () => {
    setAnchor(todayKey);
    if (effView === 'week') showWeekAt(todayKey);
  };
  const atToday = effView === 'week' ? weekLeft === todayKey : key === todayKey;
  const title = effView === 'week' ? weekRangeTitle(weekLeft) : calendarTitle(effView, key);

  const monthTasks = useMemo(() => {
    if (effView !== 'month') return new Map<string, Task[]>();
    const map = new Map<string, Task[]>(keys.map((k) => [k, []]));
    for (const t of tasks) {
      if (t.deletedAt || !t.dueDate || !map.has(t.dueDate) || !taskVisible(t, filter)) continue;
      map.get(t.dueDate)!.push(t);
    }
    for (const t of projectOccurrences(tasks, keys, todayKey)) {
      if (!t.dueDate || !map.has(t.dueDate) || !taskVisible(t, filter)) continue;
      map.get(t.dueDate)!.push(t);
    }
    for (const list of map.values()) list.sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99') || a.title.localeCompare(b.title));
    return map;
  }, [effView, keys, tasks, filter, todayKey]);
  const monthImported = useMemo(() => {
    const map = new Map<string, ImportedOccurrence[]>();
    if (effView !== 'month') return map;
    for (const k of keys) map.set(k, segmentsForDay(imported, k).map((s) => s.occ as ImportedOccurrence));
    return map;
  }, [effView, keys, imported]);

  // Estimate against actual for what the view shows (the month: its own days only).
  const totalsText = useMemo(() => {
    const shown: Task[] = [];
    if (effView === 'month') {
      const inMonth = new Set(monthGrid(key, todayKey).flat().filter((c) => c.inMonth).map((c) => c.key));
      for (const [k, list] of monthTasks) if (inMonth.has(k)) shown.push(...list);
    } else {
      for (const d of days) {
        // A task a break splits stays in `sources` as itself AND as its pieces: count it once (the first piece).
        const cutHosts = new Set([...d.sources.values()].flatMap((s) => (s.kind === 'piece' ? [s.piece.hostId] : [])));
        shown.push(
          ...d.allDay.map((x) => x.task),
          ...[...d.sources.entries()].flatMap(([id, s]) => ((s.kind === 'task' && !cutHosts.has(id)) || (s.kind === 'piece' && !s.cont && s.piece.index === 0) ? [s.task] : [])),
        );
      }
    }
    const t = totalsOf(shown, now);
    return { text: formatTotals(t), over: isOverEstimate(t) };
  }, [effView, key, todayKey, monthTasks, days, now]);

  const labelOf = (t: Task) => labels.find((p) => p.key === t.projectKey);
  const hours: number[] = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) hours.push(h);
  const goTo = (view_: CalendarView, dayKey: string) => {
    setAnchor(dayKey);
    onViewChange(view_);
  };
  // Back to the week from a day: that day at the left.
  useEffect(() => {
    if (effView === 'week' && viewW > 0) showWeekAt(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effView]);

  const nowTop = nowLineTop(minutesOfDay(new Date(now)));

  return (
    <View style={styles.pane} accessibilityLabel="Calendar" {...({ dataSet: { calendar: effView } } as object)}>
      <View style={styles.nav}>
        <Pressable onPress={() => step(-1)} disabled={onlyToday} style={[styles.navBtn, onlyToday && styles.off]} accessibilityRole="button" accessibilityLabel={`Calendar previous ${effView}`}>
          <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header" accessibilityLabel={`Calendar ${title}`}>
          {title}
        </Text>
        <Pressable onPress={() => step(1)} disabled={onlyToday} style={[styles.navBtn, onlyToday && styles.off]} accessibilityRole="button" accessibilityLabel={`Calendar next ${effView}`}>
          <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {totalsText.text ? (
          <Text style={[styles.totals, totalsText.over && styles.totalsOver]} accessibilityLabel={`Actual against estimated: ${totalsText.text}`}>
            {totalsText.text}
          </Text>
        ) : null}
        <FilterButton filter={filter} labels={labels} onChange={onFilterChange} />
        <View style={styles.seg} accessibilityRole="radiogroup">
          {(['day', 'week', 'month'] as CalendarView[]).map((v) => (
            <Pressable
              key={v}
              onPress={() => onViewChange(v)}
              disabled={onlyToday}
              style={[styles.segBtn, effView === v && styles.segOn, onlyToday && styles.off]}
              accessibilityRole="radio"
              accessibilityState={{ selected: effView === v }}
              accessibilityLabel={`${v[0].toUpperCase()}${v.slice(1)} view`}
            >
              <Text style={[styles.segText, effView === v && styles.segTextOn]}>{v[0].toUpperCase()}{v.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={goToday}
          disabled={onlyToday || atToday}
          style={[styles.todayBtn, (onlyToday || atToday) && styles.off]}
          accessibilityRole="button"
          accessibilityLabel="Calendar go to today"
        >
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>
      {onlyToday && <Text style={styles.note}>📅 Showing only today (Shift+F to show everything).</Text>}
      {icsFailing > 0 && (
        <Text style={styles.note} accessibilityLabel="Imported calendar error">
          📅 {icsFailing === 1 ? 'An imported calendar' : `${icsFailing} imported calendars`} could not be refreshed. Settings, Calendars says why; the events shown are from the last refresh.
        </Text>
      )}

      {effView === 'month' ? (
        <View style={styles.month}>
          <View style={styles.monthHead}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => (
              <Text key={n} style={styles.monthHeadText}>
                {n}
              </Text>
            ))}
          </View>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {monthGrid(key, todayKey).map((row, ri) => (
              <View key={ri} style={styles.monthRow}>
                {row.map((cell) => {
                  const list = monthTasks.get(cell.key) ?? [];
                  const ext = monthImported.get(cell.key) ?? [];
                  const shown = list.slice(0, 3);
                  const extShown = ext.slice(0, Math.max(0, 3 - shown.length));
                  const more = list.length + ext.length - shown.length - extShown.length;
                  return (
                    <Pressable
                      key={cell.key}
                      onPress={() => goTo('day', cell.key)}
                      style={[styles.monthCell, !cell.inMonth && styles.monthOut, awayDays.has(cell.key) && styles.awayDay, cell.isToday && styles.monthToday]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${cell.key}${awayDays.has(cell.key) ? ', away' : ''}${list.length ? `, ${list.length} tasks` : ''}${ext.length ? `, ${ext.length} imported events` : ''}`}
                      {...({ dataSet: { calDay: cell.key, ...(awayDays.has(cell.key) ? { away: '1' } : {}) } } as object)}
                    >
                      <Text style={[styles.monthNum, cell.isToday && styles.monthNumToday]}>{parseDateKey(cell.key).getDate()}</Text>
                      {shown.map((t) => {
                        const color = labelColor(labelOf(t)?.colorKey);
                        const look = vibrantLook(vibrant, color);
                        const vt = look ? vibrantText : undefined;
                        return (
                          <Pressable
                            key={t.id + (t.dueDate ?? '')}
                            onPress={() => openDetail(t.id)}
                            style={[styles.chip, color && { backgroundColor: look?.bg ?? tint(color), borderLeftColor: look?.edge ?? color.edge, borderLeftWidth: 3 }]}
                            accessibilityRole="button"
                            accessibilityLabel={`Calendar task ${t.title}`}
                          >
                            <View style={styles.chipRow}>
                              <Text style={[styles.chipText, styles.chipTextFlex, t.completed && styles.chipDone, vt]} numberOfLines={1}>
                                {t.emoji ? `${t.emoji} ` : ''}
                                {t.title}
                              </Text>
                              <ListEmoji emoji={listEmojiOf(t, lists)} name={listNameOf(t, lists)} />
                              {isMustDo(t) && <PriorityMark chip={!!look} />}
                            </View>
                          </Pressable>
                        );
                      })}
                      {extShown.map((o) => (
                        <View key={o.id} style={[styles.chip, styles.imported]} accessibilityLabel={`Imported event ${o.title}, ${o.calendarName}`} {...({ dataSet: { extChip: o.id } } as object)}>
                          <Text style={styles.chipText} numberOfLines={1}>
                            📅 {o.allDay ? '' : `${minuteLabel(minutesOfDay(new Date(o.startMs)))} `}
                            {o.title || 'Busy'}
                          </Text>
                        </View>
                      ))}
                      {more > 0 && <Text style={styles.more}>+{more} more</Text>}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : (
        // Day and week (2.26.0): one scroller in both directions. The day
        // headers and the all day row stick to the top, the hours stick to the
        // left; the week is a rolling strip of days (lib/dayStrip.ts), seven to
        // the width, drawing only the columns near the screen.
        <div
          ref={setScroller}
          onScroll={(e) => setScrollLeft((e.currentTarget as HTMLDivElement).scrollLeft)}
          style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 0 }}
          data-cal-scroller={effView}
        >
          <div style={{ position: 'relative', width: contentW, minHeight: '100%' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 6, height: HEAD_H + ALLDAY_H, background: Colors.pane }}>
              <div style={{ position: 'sticky', left: 0, width: GUTTER, height: HEAD_H + ALLDAY_H, background: Colors.pane, zIndex: 7, display: 'flex', alignItems: 'flex-end' }}>
                <Text style={styles.allDayLabel}>all day</Text>
              </div>
              {days.map((d) => {
                const date = parseDateKey(d.key);
                const isToday = d.key === todayKey;
                const left = GUTTER + colLeft(d.key);
                const scope = scopeOf(d.key);
                return (
                  <React.Fragment key={d.key}>
                    <Pressable
                      onPress={() => effView === 'week' && goTo('day', d.key)}
                      disabled={effView === 'day'}
                      style={[styles.dayHead, awayDays.has(d.key) && styles.awayDay, { position: 'absolute', left, top: 0, width: colW, height: HEAD_H }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${WEEKDAYS[date.getDay()]} ${date.getDate()}${awayDays.has(d.key) ? ', away' : ''}`}
                      {...({ dataSet: { calHead: d.key, ...(awayDays.has(d.key) ? { away: '1' } : {}) } } as object)}
                    >
                      <Text style={[styles.dayHeadText, isToday && styles.dayHeadToday, d.key < todayKey && styles.past]}>
                        {WEEKDAYS[date.getDay()]} <Text style={styles.dayHeadDate}>{date.getDate()}</Text>
                        {awayDays.has(d.key) ? ' ✈️' : ''}
                      </Text>
                    </Pressable>
                    <View
                      ref={allDayRef(d.key) as never}
                      style={[styles.allDayCell, { position: 'absolute', left, top: HEAD_H, width: colW, height: ALLDAY_H }, dropDay === d.key && styles.cellTarget]}
                      accessibilityLabel={`All day row ${d.key}`}
                      {...({ dataSet: { allDayRow: '1', allDayCell: d.key } } as object)}
                    >
                      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        {d.importedAllDay.map((seg) => (
                          <View key={seg.occ.id} style={[styles.chip, styles.imported]} accessibilityLabel={`Imported all day event ${seg.occ.title}, ${seg.occ.calendarName}`} {...({ dataSet: { extChip: seg.occ.id } } as object)}>
                            <Text style={styles.chipText} numberOfLines={1}>
                              📅 {seg.occ.title || 'Busy'}
                            </Text>
                          </View>
                        ))}
                        {d.allDay.map(({ task: t, projected }) => {
                          const color = labelColor(labelOf(t)?.colorKey);
                          const look = vibrantLook(vibrant, color);
                          const vt = look ? vibrantText : undefined;
                          return (
                            <View key={t.id + d.key}>
                              <Pressable
                                ref={sourceRef(`calchip:${d.key}:${t.id}`, () => ({ kind: 'card', task: t, id: t.id, title: t.title, emoji: t.emoji, duration: taskDuration(t), projected })) as never}
                                onPress={() => openDetail(t.id)}
                                style={[styles.chip, { backgroundColor: look?.bg ?? (color ? tint(color) : Colors.plainBlock), borderLeftColor: look?.edge ?? color?.edge ?? Colors.accent, borderLeftWidth: 3 }, projected && styles.projected]}
                                accessibilityRole="button"
                                accessibilityLabel={`All day task ${t.title}${movedCaption(t) ? `, ${movedCaption(t)}` : ''}`}
                                {...({ dataSet: { calBlock: `${scope}${t.id}` } } as object)}
                              >
                                <View style={styles.chipRow}>
                                  <Text style={[styles.chipText, styles.chipTextFlex, t.completed && styles.chipDone, vt]} numberOfLines={1}>
                                    {t.emoji ? `${t.emoji} ` : ''}
                                    {t.title}
                                  </Text>
                                  {/* 3.3.0: a repeating day moved on its own (the whole sentence in the tooltip). */}
                                  {movedCaption(t) ? (
                                    <Text ref={tipRef(movedCaptionLong(t)) as never} style={[styles.chipText, vt]} {...({ dataSet: { movedIcon: '1' } } as object)}>
                                      ↪
                                    </Text>
                                  ) : null}
                                  <ListEmoji emoji={listEmojiOf(t, lists)} name={listNameOf(t, lists)} />
                                  {isMustDo(t) && <PriorityMark chip={!!look} />}
                                </View>
                              </Pressable>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </React.Fragment>
                );
              })}
            </div>

            <div ref={setGrid} style={{ position: 'relative', height: GRID_HEIGHT_PX + 16, marginTop: 8 }} data-calendar-grid="1">
              <div style={{ position: 'sticky', left: 0, width: GUTTER, height: '100%', background: Colors.pane, zIndex: 4 }}>
                {hours.map((h) => (
                  <Text key={h} style={[styles.hourLabel, { top: (h - GRID_START_HOUR) * PX_PER_HOUR - 7 }]} {...({ dataSet: { mono: '1' } } as object)}>
                    {hourLabel(h)}
                  </Text>
                ))}
              </div>
              {hours.map((h) => (
                <View key={h} pointerEvents="none" style={[styles.hourLine, { left: GUTTER, width: contentW - GUTTER, top: (h - GRID_START_HOUR) * PX_PER_HOUR }]} />
              ))}
              {hours.slice(0, -1).map((h) => (
                <View key={`half-${h}`} pointerEvents="none" style={[styles.halfLine, { left: GUTTER, width: contentW - GUTTER, top: (h - GRID_START_HOUR + 0.5) * PX_PER_HOUR }]} />
              ))}
              {days.map((d) => (
                <View
                  key={d.key}
                  ref={columnRef(d.key) as never}
                  style={[styles.dayCol, awayDays.has(d.key) && styles.awayDay, { left: GUTTER + colLeft(d.key), width: colW }]}
                  {...({ dataSet: { calCol: d.key } } as object)}
                >
                  {d.blocks.map((b) => {
                    const source = d.sources.get(b.id);
                    if (!source) return null;
                    const pos = { top: b.top, height: b.height, left: `${(b.col * 100) / b.cols}%` as const, width: `${100 / b.cols}%` as const, ...(b.high ? { zIndex: 2 } : {}) };
                    if (source.kind === 'imported') {
                      const { occ, startMin, endMin, continues } = source.seg;
                      return (
                        <View key={b.id} style={[styles.blockWrap, pos]}>
                          <View
                            style={[styles.block, styles.imported]}
                            accessibilityLabel={`Imported event ${occ.title}, ${minuteLabel(startMin)} to ${minuteLabel(endMin)}, ${occ.calendarName}${continues ? ', continues from the day before' : ''}`}
                            ref={tipRef(`${occ.title || 'Busy'}, ${minuteLabel(startMin)} to ${minuteLabel(endMin)}, ${occ.calendarName}`) as never}
                            {...({ dataSet: { extBlock: occ.id } } as object)}
                          >
                            <Text style={styles.blockTitle}>
                              📅 {occ.title || 'Busy'}
                            </Text>
                            {!isCompactBlock(b.height) && (
                              <Text style={styles.blockTime}>
                                {continues ? 'Continues' : minuteLabel(startMin)} to {minuteLabel(endMin)} · {occ.calendarName}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    }
                    if (source.kind === 'event') {
                      const e = source.event;
                      return (
                        <View key={b.id} style={[styles.blockWrap, pos]}>
                          <View style={[styles.block, { backgroundColor: `${e.color}26`, borderLeftColor: e.color, borderLeftWidth: 3 }]} accessibilityLabel={`Event ${e.title}`} ref={tipRef(`${e.icon ? `${e.icon} ` : ''}${e.title}, ${formatTime(e.start)} to ${formatTime(e.end)}`) as never}>
                            <Text style={styles.blockTitle}>
                              {e.icon ? `${e.icon} ` : ''}
                              {e.title}
                            </Text>
                            {!isCompactBlock(b.height) && (
                              <Text style={styles.blockTime}>
                                {formatTime(e.start)} to {formatTime(e.end)}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    }
                    const t = source.task;
                    const scope = scopeOf(d.key);
                    if (source.kind === 'continuation' || (source.kind === 'piece' && source.cont)) {
                      const color = labelColor(labelOf(t)?.colorKey);
                      const look = vibrantLook(vibrant, color, !!t.cutsBelow);
                      const vt = look ? vibrantText : undefined;
                      const pc = source.kind === 'piece' ? source.piece : undefined;
                      const note = d.notes.get(b.id);
                      const timeText = pc && !pc.head ? pieceTimeText(formatTime(toTime(pc.startMin)), undefined, formatDuration(pc.leftMin), false) : 'Continues from yesterday';
                      return (
                        <View key={b.id} style={[styles.blockWrap, pos]}>
                          <Pressable
                            onPress={() => openDetail(t.id)}
                            style={[styles.block, styles.taskBlock, { backgroundColor: look?.bg ?? (color ? tint(color) : Colors.plainBlock), borderLeftColor: look?.edge ?? color?.edge ?? Colors.accent }, styles.projected]}
                            accessibilityRole="button"
                            accessibilityLabel={`Calendar block, continues from yesterday: ${t.title}`}
                            ref={tipRef(`${t.emoji ? `${t.emoji} ` : ''}${t.title}, ${timeText.toLowerCase()}${note ? `, ${note}` : ''}`) as never}
                            {...({ dataSet: { calBlock: `${scope}${t.id}${source.suffix ?? ''}${pc && pc.index > 0 ? `~${pc.index + 1}` : ''}`, ...(pc ? { piece: String(pc.index + 1), pieceCount: String(pc.count) } : {}) } } as object)}
                          >
                            <View style={styles.chipRow}>
                              <Text style={[styles.blockTitle, styles.chipTextFlex, t.completed && styles.chipDone, vt]}>
                                {t.emoji ? `${t.emoji} ` : ''}
                                {t.title}
                              </Text>
                              {isMustDo(t) && <PriorityMark chip={!!look} />}
                            </View>
                            {!isCompactBlock(b.height) && (
                              <Text style={[styles.blockTime, look ? vibrantMeta : undefined]}>
                                {timeText}
                                {listEmojiOf(t, lists) ? ' ' : ''}
                                <ListEmoji emoji={listEmojiOf(t, lists)} name={listNameOf(t, lists)} />
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      );
                    }
                    return (
                      <TimeBlock
                        key={b.id}
                        task={t}
                        listEmoji={listEmojiOf(t, lists)}
                        listName={listNameOf(t, lists)}
                        label={labelOf(t)}
                        color={labelColor(labelOf(t)?.colorKey)}
                        projected={source.projected}
                        positioned={pos}
                        height={b.height}
                        continues={b.continues}
                        scope={scope}
                        a11y={`Calendar block ${t.title}`}
                        piece={source.kind === 'piece' ? source.piece : undefined}
                        fullTask={source.full}
                        time={source.time}
                        blockSuffix={source.suffix}
                        note={d.notes.get(b.id)}
                        badge={d.badges.get(b.id)}
                        hosted={d.hostedBy.get(b.id)}
                        fullText
                        gridNode={() => gridEl.current}
                        onChanged={onChanged}
                      />
                    );
                  })}
                  {d.key === todayKey && (
                    <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]} accessibilityLabel="Current time" {...({ dataSet: { nowLine: '1' } } as object)}>
                      <View style={styles.nowDot} />
                    </View>
                  )}
                  {drag?.mode === 'move' && drag.accepted && drag.target?.kind === 'slot' && drag.target.dayKey === d.key && (
                    <SlotPreview startMin={drag.target.startMin} duration={drag.item.duration} top={((drag.target.startMin - GRID_START_HOUR * 60) / 60) * PX_PER_HOUR} />
                  )}
                </View>
              ))}
            </div>
            <div style={{ height: Math.max(0, viewH - 120) }} />
          </div>
        </div>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Inside the centre pane (2.26.0), which draws the frame.
  pane: { flex: 1, minWidth: 0 },
  paneLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 6, flexWrap: 'wrap' },
  navBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, minWidth: 0, flexShrink: 1 },
  totals: { fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  totalsOver: { color: Colors.accentText, fontWeight: '700' },
  seg: { ...segTrack } as object,
  segBtn: { ...segBtn, paddingHorizontal: 10 } as object,
  segOn: { ...segBtnOn },
  segText: { ...segLabel, fontSize: 12 },
  segTextOn: { ...segLabelOn },
  todayBtn: { ...outlinedBtn, height: 32, justifyContent: 'center' } as object,
  todayText: { ...outlinedBtnText, fontSize: 12 },
  note: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  headRow: { flexDirection: 'row' },
  dayHead: { alignItems: 'center', justifyContent: 'center' },
  awayDay: { backgroundColor: Colors.surfaceRaised },
  dayHeadDate: { fontWeight: '700' },
  past: { opacity: 0.55 },
  cellTarget: { backgroundColor: Colors.accentSoft },
  dayHeadText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  dayHeadToday: { color: Colors.accentText, fontWeight: '700' },
  allDayRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, minHeight: 28 },
  allDayLabel: { fontSize: 10, color: Colors.textSecondary, paddingTop: 7 },
  allDayCell: { padding: 2, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: Colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  scroll: { flex: 1 },
  gridRow: { flexDirection: 'row' },
  hourLabel: { position: 'absolute', right: 6, fontSize: 10, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  dayCol: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: Colors.border },
  hourLine: { position: 'absolute', height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  halfLine: { position: 'absolute', height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, opacity: 0.45 },
  blockWrap: { position: 'absolute', padding: 1 },
  block: { flex: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', justifyContent: 'flex-start' },
  taskBlock: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  projected: { opacity: 0.82 },
  // Imported, read only: a dashed outline on the plain background, never a label colour.
  imported: { backgroundColor: Colors.background, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.textSecondary },
  // Lines break at spaces only (2.28.2): a word wider than its lane is clipped, never split.
  blockTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, minWidth: 0, overflowWrap: 'normal', wordBreak: 'normal', wordWrap: 'normal' } as object,
  blockTime: { fontSize: 10, color: Colors.textSecondary, minWidth: 0, overflowWrap: 'normal', wordBreak: 'normal', wordWrap: 'normal' } as object,
  chip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginVertical: 1, backgroundColor: Colors.background, minHeight: 20, justifyContent: 'center' },
  chipText: { fontSize: 11, color: Colors.textPrimary },
  chipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  chipTextFlex: { flexShrink: 1, minWidth: 0 },
  chipDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  // The current time: a thin red line with a small red triangle at its start (red is only ever the time).
  nowLine: { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: Colors.now },
  nowDot: { position: 'absolute', left: -1, top: -4, width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 7, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: Colors.now },
  month: { flex: 1 },
  monthHead: { flexDirection: 'row', paddingVertical: 6 },
  monthHeadText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  monthRow: { flexDirection: 'row', minHeight: 104 },
  monthCell: { flex: 1, minWidth: 0, padding: 4, gap: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  monthOut: { opacity: 0.5 },
  monthToday: { backgroundColor: Colors.background },
  monthNum: { fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  monthNumToday: { color: Colors.accentText, fontWeight: '700' },
  more: { fontSize: 10, color: Colors.textSecondary },
});
