import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { bucketTasks, dateKey, isDateKey, parseDateKey, type ColumnDay } from '../../lib/kanban';
import { columnHeading, dayAt, indexOfDay, leftDay, offsetOfDay, pageOffset, rangeTitle, stripAround, visibleRange } from '../../lib/dayStrip';
import TaskCard from './TaskCard';
import AddTaskBox from './AddTaskBox';
import FilterButton from './FilterButton';
import { filterTasks, type TaskFilter } from '../../lib/taskFilter';
import { opsForProjected, opsForTask } from './taskOps';
import { projectOccurrences } from '../../lib/series';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import { domNode, useDrag } from './DragProvider';
import usePaneScroll from './usePaneScroll';
import { taskDuration } from '../../lib/drag';
import { loadLists, loadTasksRaw } from '../../lib/storage';
import { listEmojiOf } from '../../lib/lists';
import { AWAY_ADD_WARNING } from '../../lib/awayDays';
import DayMenu from './DayMenu';
import { useAwayDays } from './awayStore';
import { createTaskIn } from '../../lib/taskCommands';
import { formatTotals, isOverEstimate, totalsOf } from '../../lib/taskTotals';
import { useTick } from './timerUi';
import { useGoToday, useReveal } from './uiStore';
import { loadLabels } from '../../lib/labels';
import { labelColor } from '../../lib/labelColors';
import { pressStyle } from './pressStyle';
import type { Project, Task, TaskList } from '../../lib/types';

// The Tasks board (desktop): day columns in one continuous sideways strip
// (2.26.0, lib/dayStrip.ts). It opens with today at the left edge and scrolls
// back to earlier days and forward without any week boundary; only the
// columns on screen (and a few either side) are drawn. Today, the arrows (one
// screen at a time) and Jump to date move the strip. Tasks with no Day are the
// list in the left pane, so there is no Unscheduled column. A task sits in the
// column of its planned Day (Task.dueDate, decision 015) and nowhere else:
// nothing is carried over from earlier days. Each day from today on has an
// "Add a task" box with the day's actual against estimated time.
// Drag (checkpoint 4): each day column is a drop target (today or later),
// every card is a drag source, and holding a drag near the board's left or
// right edge scrolls the strip. The column a drag would land in shows a
// dashed placeholder.
const domTimeStyle: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 14,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

export const COLUMN_WIDTH = 272;
const COLUMN_GAP = 16;
const STEP = COLUMN_WIDTH + COLUMN_GAP;

// "0:25 / 1:30": actual against estimated for the day (build plan phase 2).
// Nothing planned and nothing spent shows nothing.
function DayTotals({ items, now }: { items: Task[]; now: number }) {
  const totals = totalsOf(items, now);
  const text = formatTotals(totals);
  if (!text) return null;
  return (
    <Text style={[styles.totals, isOverEstimate(totals) && styles.totalsOver]} accessibilityLabel={`Actual against estimated for the day: ${text}`}>
      {text}
    </Text>
  );
}

// The day's "Add a task" box (AddTaskBox.tsx): Enter adds a task on that Day
// (like T for today), with the time and label chosen in the box.
function DayAddBox({ dayKey, items, now, onChanged, away }: { dayKey: string; items: Task[]; now: number; onChanged: () => void; away?: boolean }) {
  return (
    <AddTaskBox
      id={dayKey}
      a11y={`Add a task on ${dayKey}`}
      withTime
      // An away day (2.27.0): adding is allowed, with a quiet warning.
      warning={away ? AWAY_ADD_WARNING : null}
      trailing={<DayTotals items={items} now={now} />}
      onAdd={async (title, extra) => {
        await createTaskIn(title, { dueDate: dayKey, ...extra });
        onChanged();
      }}
    />
  );
}

export default function KanbanPane({
  refreshKey,
  onChanged,
  filter,
  onFilterChange,
  onlyToday,
}: {
  refreshKey: number;
  onChanged: () => void;
  filter: TaskFilter;
  onFilterChange: (next: TaskFilter) => void;
  // "Show only today" (Shift+F, build plan phase 3): just today's column.
  onlyToday?: boolean;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewW, setViewW] = useState(0);
  const { drag, registerZone, registerBoard, sourceRef } = useDrag();
  const scrollRef = usePaneScroll();
  const scroller = useRef<ScrollView | null>(null);
  const boardNode = useRef<HTMLElement | null>(null);
  const columnRefs = useRef(new Map<string, (node: unknown) => void>());
  const opened = useRef(false);

  const reload = useCallback(() => {
    // Raw rows, tombstones included: a skipped day is a tombstone and must
    // block its projection (lib/series.ts). The board never shows a tombstone.
    loadTasksRaw().then(setTasks);
    loadLabels().then(setProjects);
    loadLists().then(setLists);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const todayKey = dateKey(new Date());
  const strip = useMemo(() => stripAround(todayKey), [todayKey]);

  // Puts a day at the left edge.
  const goTo = useCallback(
    (key: string) => {
      if (indexOfDay(strip, key) < 0) return;
      const x = offsetOfDay(strip, key, STEP);
      setJumpOpen(false);
      setScrollLeft(x);
      scroller.current?.scrollTo({ x, animated: false });
      if (boardNode.current) boardNode.current.scrollLeft = x;
    },
    [strip],
  );
  // Opens on today once the board has a width (and again if the day changes).
  // The strip's content can be laid out after its width is known; a scroll set
  // before that is clamped to 0 (five years back) and the scroll event then
  // reports 0, so the jump is tried again until it lands. Timers, not animation
  // frames: a window behind another one gets no frames but still runs timers.
  // 2.27.0: it no longer waits for the width either. A window that opens behind
  // another one gets no layout callbacks, so the width stayed 0, the jump never
  // ran and the strip showed five years back (found by cp8c to cp8e in a full
  // run); it keeps trying, more slowly, for up to a minute.
  useEffect(() => {
    opened.current = true;
    // Only while the strip is still at 0 (the clamped jump): once anything has
    // scrolled it elsewhere, the person is using it and it is left alone.
    let tries = 240;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const want = offsetOfDay(strip, todayKey, STEP);
    const stuck = () => !!boardNode.current && boardNode.current.scrollLeft < 1 && want > 0;
    const attempt = () => {
      goTo(todayKey);
      if (stuck() && --tries > 0) timer = setTimeout(attempt, tries > 220 ? 50 : 250);
      // The scroll event of the clamped jump can arrive after it landed: check once more.
      else if (tries > 0) timer = setTimeout(() => stuck() && --tries > 0 && attempt(), 300);
    };
    attempt();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewW > 0, todayKey]);
  // Back from "only today": land on today.
  useEffect(() => {
    if (!onlyToday && opened.current) setTimeout(() => goTo(todayKey), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyToday]);
  // Shift+T: today.
  const goToday = useGoToday();
  useEffect(() => {
    if (goToday) goTo(todayKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goToday]);
  // Search results ask the board to show the day of a task.
  const reveal = useReveal();
  useEffect(() => {
    if (reveal && isDateKey(reveal.dueDate)) goTo(reveal.dueDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.nonce]);

  const range = useMemo(() => visibleRange(scrollLeft, viewW || 1200, STEP, strip.total), [scrollLeft, viewW, strip.total]);
  const days: ColumnDay[] = useMemo(() => {
    if (onlyToday) return [{ key: todayKey, date: parseDateKey(todayKey) }];
    const out: ColumnDay[] = [];
    for (let i = range.first; i <= range.last; i++) {
      const key = dayAt(strip, i);
      out.push({ key, date: parseDateKey(key) });
    }
    return out;
  }, [onlyToday, range.first, range.last, strip, todayKey]);
  // The filter (labels, no label, show complete) applies to tasks only.
  const shownTasks = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);
  // Repeating series show on every matching day from today forward without
  // storing anything (decision 023).
  const projected = useMemo(() => filterTasks(projectOccurrences(tasks, days.map((d) => d.key), todayKey), filter), [tasks, days, todayKey, filter]);
  const columns = useMemo(() => bucketTasks(shownTasks, days, todayKey, { projected }), [shownTasks, days, todayKey, projected]);
  const now = useTick(30000);
  const awayDays = useAwayDays(refreshKey);

  const firstShown = onlyToday ? todayKey : leftDay(strip, scrollLeft, STEP);
  const lastShown = onlyToday ? todayKey : dayAt(strip, Math.min(strip.total - 1, indexOfDay(strip, firstShown) + Math.max(0, Math.floor((viewW || STEP) / STEP) - 1)));
  const title = onlyToday ? 'Today' : rangeTitle(firstShown, lastShown);
  const atToday = onlyToday || firstShown === todayKey;

  // The drag layer scrolls the strip at its edges; there are no weeks to step.
  const boardRef = useCallback(
    (instance: unknown) => {
      scroller.current = instance as ScrollView | null;
      const node = domNode(instance);
      boardNode.current = node;
      registerBoard('tasks', node ? { node, atCurrentWeek: () => false, step: () => {} } : null);
    },
    [registerBoard],
  );
  // One cached ref per day column, registering it as a drop zone clipped to
  // the visible board.
  const columnRef = (key: string) => {
    let ref = columnRefs.current.get(key);
    if (!ref) {
      ref = (node: unknown) =>
        registerZone(`day:${key}`, node ? { kind: 'day', dayKey: key, node: node as HTMLElement, clip: () => boardNode.current } : null);
      columnRefs.current.set(key, ref);
    }
    return ref;
  };
  const dropDay = drag && drag.mode === 'move' && drag.accepted && drag.target?.kind === 'day' ? drag.target.dayKey : null;

  const renderColumn = (day: ColumnDay, left: number | null) => {
    const items = columns.days[day.key] ?? [];
    const head = columnHeading(day.key, todayKey);
    const isTarget = dropDay === day.key;
    const away = awayDays.has(day.key);
    return (
      <View
        key={day.key}
        ref={columnRef(day.key) as never}
        style={[styles.column, left !== null && { position: 'absolute', left, top: 0, bottom: 0 }, away && styles.awayColumn, isTarget && styles.columnTarget]}
        {...({ dataSet: { dayCol: day.key, when: head.when, ...(away ? { away: '1' } : {}) } } as object)}
      >
        <View style={styles.columnHeader}>
          <Text style={[styles.weekday, head.when === 'past' && styles.past]} accessibilityRole="header">
            {head.weekday}
          </Text>
          <Text style={[styles.date, head.when === 'past' && styles.past]}>{head.date}</Text>
          {head.when === 'today' && <Text style={styles.todayTag}>Today</Text>}
          {away && <Text style={styles.awayTag}>✈️ Away</Text>}
          {head.when !== 'past' && <DayMenu dayKey={day.key} tasks={tasks} away={away} awayDays={awayDays} onChanged={onChanged} />}
        </View>
        {head.when === 'past' ? (
          <View style={styles.pastTotals}>
            <DayTotals items={items.map((i) => i.task)} now={now} />
          </View>
        ) : (
          <DayAddBox dayKey={day.key} items={items.map((i) => i.task)} now={now} onChanged={onChanged} away={away} />
        )}
        <ScrollView ref={scrollRef(`day:${day.key}`) as never} style={styles.columnList} contentContainerStyle={styles.columnListContent} showsVerticalScrollIndicator={false}>
          {items.map((item) => {
            const { task, projected: isProjected } = item;
            const proj = projects.find((p) => p.key === task.projectKey);
            return (
              <TaskCard
                key={task.id}
                task={task}
                ops={isProjected ? opsForProjected(task) : opsForTask(task)}
                projected={isProjected}
                label={proj}
                color={labelColor(proj?.colorKey)}
                listEmoji={listEmojiOf(task, lists)}
                variant="card"
                todayKey={todayKey}
                onChanged={onChanged}
                divider={false}
                dragging={drag?.item.id === task.id}
                nodeRef={sourceRef(`card:${task.id}`, () => ({
                  kind: 'card',
                  task,
                  id: task.id,
                  title: task.title,
                  emoji: task.emoji,
                  duration: taskDuration(task),
                  projected: isProjected,
                }))}
              />
            );
          })}
          {isTarget && drag && (
            <View style={styles.placeholder} pointerEvents="none" accessibilityLabel="Drop here" {...({ dataSet: { dropPlaceholder: day.key } } as object)}>
              <Text style={styles.placeholderText} numberOfLines={1}>
                {drag.item.title}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.pane}>
      <View style={styles.nav}>
        <Pressable
          onPress={() => {
            const x = pageOffset(scrollLeft, viewW, STEP, -1, strip.total);
            setScrollLeft(x);
            scroller.current?.scrollTo({ x, animated: false });
          }}
          disabled={onlyToday}
          style={pressStyle(({ hovered }) => [styles.navBtn, hovered && styles.navHover, onlyToday && styles.off])}
          accessibilityRole="button"
          accessibilityLabel="Earlier days"
        >
          <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => {
            const x = pageOffset(scrollLeft, viewW, STEP, 1, strip.total);
            setScrollLeft(x);
            scroller.current?.scrollTo({ x, animated: false });
          }}
          disabled={onlyToday}
          style={pressStyle(({ hovered }) => [styles.navBtn, hovered && styles.navHover, onlyToday && styles.off])}
          accessibilityRole="button"
          accessibilityLabel="Later days"
        >
          <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
        </Pressable>
        <Pressable onPress={() => setJumpOpen((o) => !o)} style={styles.titleBtn} accessibilityRole="button" accessibilityLabel="Jump to date">
          <Text style={styles.title} numberOfLines={1} {...({ dataSet: { stripTitle: '1' } } as object)}>
            {title}
          </Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <FilterButton filter={filter} labels={projects} onChange={onFilterChange} />
        <Pressable
          onPress={() => goTo(todayKey)}
          disabled={atToday}
          style={pressStyle(({ hovered }) => [styles.todayBtn, hovered && !atToday && styles.navHover, atToday && styles.off])}
          accessibilityRole="button"
          accessibilityLabel="Show today in Tasks"
          accessibilityState={{ disabled: atToday }}
        >
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>

      {jumpOpen && (
        <View style={styles.jump}>
          <Text style={styles.menuHeading}>Jump to date</Text>
          <input
            type="date"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (isDateKey(v)) goTo(v);
            }}
            style={domTimeStyle}
            aria-label="Jump to date"
          />
        </View>
      )}

      {onlyToday ? (
        <View style={styles.board}>{renderColumn(days[0], null)}</View>
      ) : (
        <ScrollView
          ref={boardRef as never}
          horizontal
          style={styles.board}
          contentContainerStyle={{ width: strip.total * STEP, height: '100%' }}
          onLayout={(e) => setViewW(Math.round(e.nativeEvent.layout.width))}
          onScroll={(e) => setScrollLeft(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator
          {...({ dataSet: { strip: '1' } } as object)}
        >
          {days.map((d) => renderColumn(d, indexOfDay(strip, d.key) * STEP))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Inside the centre pane (2.26.0), which draws the frame.
  pane: { flex: 1, minWidth: 0 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  navHover: { backgroundColor: Colors.background },
  off: { opacity: 0.35 },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 32, flexShrink: 1 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  todayBtn: { paddingHorizontal: 14, height: 32, justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.background },
  todayText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  jump: { position: 'absolute', top: 40, left: 72, zIndex: 30, padding: 12, gap: 6, backgroundColor: Colors.surface, borderRadius: 14, boxShadow: Colors.shadowMd } as object,
  menuHeading: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  board: { flex: 1 },
  column: { width: COLUMN_WIDTH, borderRadius: 12 },
  columnTarget: { backgroundColor: Colors.accentSoft },
  columnHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 2, paddingTop: 4, paddingBottom: 10 },
  weekday: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  date: { fontSize: 20, fontWeight: '500', color: Colors.textSecondary },
  past: { opacity: 0.6 },
  todayTag: { marginLeft: 4, fontSize: 12, fontWeight: '700', color: Colors.accentText },
  // An away day (2.27.0): greyed, with a small tag.
  awayColumn: { backgroundColor: Colors.surfaceRaised },
  awayTag: { marginLeft: 4, fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  addBox: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 10, paddingRight: 8, borderRadius: 10, backgroundColor: Colors.background, marginBottom: 10 },
  addPlus: { fontSize: 14, color: Colors.textSecondary, width: 16, textAlign: 'center' },
  addInput: { flex: 1, minWidth: 0, height: 40, fontSize: 14, color: Colors.textPrimary, outlineStyle: 'none' } as object,
  pastTotals: { minHeight: 20, marginBottom: 10, paddingHorizontal: 2, flexDirection: 'row' },
  totals: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, backgroundColor: Colors.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontVariant: ['tabular-nums'] },
  totalsOver: { color: Colors.accentText, fontWeight: '700' },
  columnList: { flex: 1 },
  columnListContent: { gap: 10, padding: 2, paddingBottom: 16 },
  placeholder: { height: 52, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.accent, backgroundColor: Colors.accentSoft, justifyContent: 'center', paddingHorizontal: 12 },
  placeholderText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
});
