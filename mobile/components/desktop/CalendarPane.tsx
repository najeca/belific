import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
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
} from '../../lib/timebox';
import { openingMinutes } from '../../lib/dayStart';
import { formatDuration } from '../../lib/duration';
import { tasksForTimebox, type DayTask } from '../../lib/timeboxTasks';
import { projectOccurrences } from '../../lib/series';
import { taskVisible, type TaskFilter } from '../../lib/taskFilter';
import { calendarTitle, minutesOfDay, monthGrid, nowLineTop, splitAllDay, stepAnchor, visibleDayKeys } from '../../lib/calendarView';
import type { CalendarView } from '../../lib/paneState';
import { formatTotals, isOverEstimate, totalsOf } from '../../lib/taskTotals';
import { labelColor } from '../../lib/labelColors';
import { loadLabels } from '../../lib/labels';
import { loadCustomCategories, loadCustomEvents, loadTasksRaw } from '../../lib/storage';
import type { CustomCategory, CustomEvent, Project, ScheduleEvent, Task } from '../../lib/types';
import { useDayStart } from './useDayStart';
import TaskBlockPopover, { toggleBlockPopover } from './TaskBlockPopover';
import { openDetail } from './uiStore';
import { useTick } from './timerUi';
import FilterButton from './FilterButton';

// The Calendar (build plan phase 3): the centre of the home screen when it is
// switched from the Kanban board (V). Day, week and month views (D, W, M). The
// day and week views are the 24 hour grid, 00:00 to 24:00, with an all day row
// (tasks with a Day and no time) above it and a line at the current time; they
// open at "My day starts at", or about an hour before now when today is shown,
// and scroll through the whole day. The month view lists each day's tasks.
//
// It shows the same data as the board and the Timebox (stored tasks, the days of
// repeating series, overnight tasks continuing on the next day, events) and a
// block or chip opens the same task menu. Dragging stays on the Timebox on the
// right: that is where a task is given a time, so the Calendar draws nothing a
// drop could land on. "Show only today" shows today's day view.
const GUTTER = 48;
const scopeOf = (dayKey: string) => `cal${dayKey}:`;

type Source =
  | { kind: 'event'; event: ScheduleEvent }
  | { kind: 'task'; task: Task; projected: boolean }
  | { kind: 'continuation'; task: Task; projected: boolean };

interface DayData {
  key: string;
  allDay: DayTask[];
  sources: Map<string, Source>;
  blocks: ReturnType<typeof layoutItems>['blocks'];
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
  const [viewH, setViewH] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dayStartMin = useDayStart();
  const now = useTick(30000);

  const reload = useCallback(() => {
    // Raw rows, tombstones included: a skipped day of a series blocks its projection.
    loadTasksRaw().then(setTasks);
    loadCustomEvents().then(setEvents);
    loadCustomCategories().then(setCategories);
    loadLabels().then(setLabels);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const todayKey = dateKey(new Date(now));
  const effView: CalendarView = onlyToday ? 'day' : view;
  const key = onlyToday ? todayKey : anchor;
  const keys = useMemo(() => visibleDayKeys(effView, key), [effView, key]);

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
      for (const { task: t, projected } of timed) {
        const item = taskToItem(t);
        if (!item) continue;
        sources.set(`task:${t.id}`, { kind: 'task', task: t, projected });
        items.push({ ...item, id: `task:${t.id}` });
      }
      for (const { task: t, projected } of spill) {
        if (!taskVisible(t, filter)) continue;
        const rest = continuationOf(t);
        if (!rest) continue;
        sources.set(rest.id, { kind: 'continuation', task: t, projected });
        items.push(rest);
      }
      return { key: dayKey, allDay, sources, blocks: layoutItems(items).blocks };
    });
  }, [effView, keys, tasks, events, categories, filter, todayKey]);

  // Opens at the day start (or about an hour before now when today is shown).
  useEffect(() => {
    if (effView === 'month' || viewH === 0) return;
    const d = new Date();
    const at = openingMinutes({ isToday: keys.includes(dateKey(d)), nowMin: minutesOfDay(d), dayStartMin });
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: scrollOffsetFor(at), animated: false }), 50);
    return () => clearTimeout(t);
  }, [effView, key, dayStartMin, viewH > 0]);

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

  // Estimate against actual for what the view shows (the month: its own days only).
  const totalsText = useMemo(() => {
    const shown: Task[] = [];
    if (effView === 'month') {
      const inMonth = new Set(monthGrid(key, todayKey).flat().filter((c) => c.inMonth).map((c) => c.key));
      for (const [k, list] of monthTasks) if (inMonth.has(k)) shown.push(...list);
    } else {
      for (const d of days) shown.push(...d.allDay.map((x) => x.task), ...[...d.sources.values()].flatMap((s) => (s.kind === 'task' ? [s.task] : [])));
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

  const nowTop = nowLineTop(minutesOfDay(new Date(now)));

  return (
    <View style={styles.pane} accessibilityLabel="Calendar" {...({ dataSet: { calendar: effView } } as object)}>
      <Text style={styles.paneLabel}>📆 CALENDAR</Text>
      <View style={styles.nav}>
        <Pressable onPress={() => setAnchor(stepAnchor(effView, key, -1))} disabled={onlyToday} style={[styles.navBtn, onlyToday && styles.off]} accessibilityRole="button" accessibilityLabel={`Calendar previous ${effView}`}>
          <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header" accessibilityLabel={`Calendar ${calendarTitle(effView, key)}`}>
          {calendarTitle(effView, key)}
        </Text>
        <Pressable onPress={() => setAnchor(stepAnchor(effView, key, 1))} disabled={onlyToday} style={[styles.navBtn, onlyToday && styles.off]} accessibilityRole="button" accessibilityLabel={`Calendar next ${effView}`}>
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
          onPress={() => setAnchor(todayKey)}
          disabled={onlyToday || key === todayKey}
          style={[styles.todayBtn, (onlyToday || key === todayKey) && styles.off]}
          accessibilityRole="button"
          accessibilityLabel="Calendar go to today"
        >
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>
      {onlyToday && <Text style={styles.note}>📅 Showing only today (Shift+F to show everything).</Text>}

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
                  const shown = list.slice(0, 3);
                  return (
                    <Pressable
                      key={cell.key}
                      onPress={() => goTo('day', cell.key)}
                      style={[styles.monthCell, !cell.inMonth && styles.monthOut, cell.isToday && styles.monthToday]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${cell.key}${list.length ? `, ${list.length} tasks` : ''}`}
                      {...({ dataSet: { calDay: cell.key } } as object)}
                    >
                      <Text style={[styles.monthNum, cell.isToday && styles.monthNumToday]}>{parseDateKey(cell.key).getDate()}</Text>
                      {shown.map((t) => {
                        const color = labelColor(labelOf(t)?.colorKey);
                        return (
                          <Pressable
                            key={t.id + (t.dueDate ?? '')}
                            onPress={() => (t.id.includes(':') && t.recurrence ? goTo('day', cell.key) : openDetail(t.id))}
                            style={[styles.chip, color && { backgroundColor: color.tint, borderLeftColor: color.edge, borderLeftWidth: 3 }]}
                            accessibilityRole="button"
                            accessibilityLabel={`Calendar task ${t.title}`}
                          >
                            <Text style={[styles.chipText, t.completed && styles.chipDone]} numberOfLines={1}>
                              {t.emoji ? `${t.emoji} ` : ''}
                              {t.title}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {list.length > shown.length && <Text style={styles.more}>+{list.length - shown.length} more</Text>}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : (
        <>
          <View style={styles.headRow}>
            <View style={{ width: GUTTER }} />
            {days.map((d) => {
              const date = parseDateKey(d.key);
              const isToday = d.key === todayKey;
              return (
                <Pressable
                  key={d.key}
                  onPress={() => effView === 'week' && goTo('day', d.key)}
                  disabled={effView === 'day'}
                  style={styles.dayHead}
                  accessibilityRole="button"
                  accessibilityLabel={`${WEEKDAYS[date.getDay()]} ${date.getDate()}`}
                >
                  <Text style={[styles.dayHeadText, isToday && styles.dayHeadToday]}>
                    {WEEKDAYS[date.getDay()]} {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.allDayRow} accessibilityLabel="All day row" {...({ dataSet: { allDayRow: '1' } } as object)}>
            <View style={{ width: GUTTER }}>
              <Text style={styles.allDayLabel}>all day</Text>
            </View>
            {days.map((d) => (
              <View key={d.key} style={styles.allDayCell}>
                {d.allDay.length === 0 ? null : (
                  <ScrollView style={{ maxHeight: 92 }} showsVerticalScrollIndicator={false}>
                    {d.allDay.map(({ task: t, projected }) => {
                      const color = labelColor(labelOf(t)?.colorKey);
                      const scope = scopeOf(d.key);
                      return (
                        <View key={t.id + d.key}>
                          <Pressable
                            onPress={() => toggleBlockPopover(t.id, scope)}
                            style={[styles.chip, color && { backgroundColor: color.tint, borderLeftColor: color.edge, borderLeftWidth: 3 }, projected && styles.projected]}
                            accessibilityRole="button"
                            accessibilityLabel={`All day task ${t.title}`}
                            {...({ dataSet: { calBlock: `${scope}${t.id}` } } as object)}
                          >
                            <Text style={[styles.chipText, t.completed && styles.chipDone]} numberOfLines={1}>
                              {t.emoji ? `${t.emoji} ` : ''}
                              {t.title}
                            </Text>
                          </Pressable>
                          <TaskBlockPopover task={t} label={labelOf(t)} onChanged={onChanged} projected={projected} scope={scope} />
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            ))}
          </View>

          <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false} onLayout={(e) => setViewH(Math.round(e.nativeEvent.layout.height))}>
            <View style={{ height: 8 }} />
            <View style={[styles.gridRow, { height: GRID_HEIGHT_PX + 16 }]} {...({ dataSet: { calendarGrid: '1' } } as object)}>
              <View style={{ width: GUTTER }}>
                {hours.map((h) => (
                  <Text key={h} style={[styles.hourLabel, { top: (h - GRID_START_HOUR) * PX_PER_HOUR - 7 }]}>
                    {hourLabel(h)}
                  </Text>
                ))}
              </View>
              {days.map((d) => (
                <View key={d.key} style={styles.dayCol}>
                  {hours.map((h) => (
                    <View key={h} style={[styles.hourLine, { top: (h - GRID_START_HOUR) * PX_PER_HOUR }]} />
                  ))}
                  {hours.slice(0, -1).map((h) => (
                    <View key={`half-${h}`} style={[styles.halfLine, { top: (h - GRID_START_HOUR + 0.5) * PX_PER_HOUR }]} />
                  ))}
                  {d.blocks.map((b) => {
                    const source = d.sources.get(b.id);
                    if (!source) return null;
                    const pos = { top: b.top, height: b.height, left: `${(b.col * 100) / b.cols}%` as const, width: `${100 / b.cols}%` as const };
                    if (source.kind === 'event') {
                      const e = source.event;
                      return (
                        <View key={b.id} style={[styles.blockWrap, pos]}>
                          <View style={[styles.block, { backgroundColor: `${e.color}26`, borderLeftColor: e.color, borderLeftWidth: 3 }]} accessibilityLabel={`Event ${e.title}`}>
                            <Text style={styles.blockTitle} numberOfLines={1}>
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
                    const color = labelColor(labelOf(t)?.colorKey);
                    const scope = scopeOf(d.key);
                    const cont = source.kind === 'continuation';
                    return (
                      <View key={b.id} style={[styles.blockWrap, pos]}>
                        <Pressable
                          onPress={() => toggleBlockPopover(t.id, scope)}
                          style={[
                            styles.block,
                            styles.taskBlock,
                            color && { backgroundColor: color.tint, borderLeftColor: color.edge, borderLeftWidth: 4 },
                            (source.projected || cont) && styles.projected,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={cont ? `Calendar block, continues from yesterday: ${t.title}` : `Calendar block ${t.title}`}
                          {...({ dataSet: { calBlock: `${scope}${t.id}` } } as object)}
                        >
                          <Text style={[styles.blockTitle, t.completed && styles.chipDone]} numberOfLines={1}>
                            {t.emoji ? `${t.emoji} ` : ''}
                            {t.title}
                          </Text>
                          {!isCompactBlock(b.height) && (
                            <Text style={styles.blockTime}>
                              {cont ? 'Continues from yesterday' : `${formatTime(t.startTime ?? '')} ${formatDuration(t.durationMinutes) ?? ''}`}
                            </Text>
                          )}
                        </Pressable>
                        <TaskBlockPopover task={t} label={labelOf(t)} onChanged={onChanged} projected={source.projected} scope={scope} />
                      </View>
                    );
                  })}
                  {d.key === todayKey && (
                    <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]} accessibilityLabel="Current time" {...({ dataSet: { nowLine: '1' } } as object)}>
                      <View style={styles.nowDot} />
                    </View>
                  )}
                </View>
              ))}
            </View>
            <View style={{ height: Math.max(0, viewH - 28) }} />
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, minWidth: 0 },
  paneLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 6, flexWrap: 'wrap' },
  navBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, minWidth: 0, flexShrink: 1 },
  totals: { fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  totalsOver: { color: Colors.accentText, fontWeight: '700' },
  seg: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 10, height: 32, justifyContent: 'center', backgroundColor: Colors.background },
  segOn: { backgroundColor: Colors.accent },
  segText: { fontSize: 12, color: Colors.textPrimary },
  segTextOn: { color: Colors.onAccent, fontWeight: '700' },
  todayBtn: { paddingHorizontal: 12, height: 32, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  todayText: { fontSize: 12, fontWeight: '600', color: Colors.accentText },
  note: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  headRow: { flexDirection: 'row' },
  dayHead: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 6 },
  dayHeadText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  dayHeadToday: { color: Colors.accentText, fontWeight: '700' },
  allDayRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, minHeight: 28 },
  allDayLabel: { fontSize: 10, color: Colors.textSecondary, paddingTop: 7 },
  allDayCell: { flex: 1, minWidth: 0, padding: 2, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: Colors.border },
  scroll: { flex: 1 },
  gridRow: { flexDirection: 'row' },
  hourLabel: { position: 'absolute', right: 6, fontSize: 10, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  dayCol: { flex: 1, minWidth: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: Colors.border },
  hourLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  halfLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, opacity: 0.45 },
  blockWrap: { position: 'absolute', padding: 1 },
  block: { flex: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', justifyContent: 'flex-start' },
  taskBlock: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  projected: { opacity: 0.82 },
  blockTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  blockTime: { fontSize: 10, color: Colors.textSecondary },
  chip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginVertical: 1, backgroundColor: Colors.background, minHeight: 20, justifyContent: 'center' },
  chipText: { fontSize: 11, color: Colors.textPrimary },
  chipDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: Colors.accentText },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accentText },
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
