import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey, parseDateKey } from '../../lib/kanban';
import { formatTime } from '../../lib/data';
import { listTitle } from '../../lib/lists';
import { loadLists } from '../../lib/storage';
import { weekToPlan } from '../../lib/planEntry';
import { dayItems, type WrapItem } from '../../lib/wrapUp';
import { addRows, dayOpen, dayTotalText, lastWeekCount, lastWeekLine } from '../../lib/planDay';
import { addToday } from '../../lib/wrapActions';
import type { Task, TaskList } from '../../lib/types';
import { useCutMin } from './cutStore';
import { domNode, useDrag } from './DragProvider';
import { useAwayDays } from './awayStore';
import { closeOverlay, openOverlay } from './uiStore';
import { WrapRow, useWrapRows, styles as wrap } from './WrapUp';
import { metaOf, useRowDrag } from './PlanMyDay';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// F5 of PLAN_daily_flow: Plan week on ONE screen, the same way Plan my day is one (it takes the place of the left pane and
// the centre, and has all the width). Left: the Brain Dump and the lists through one picker, and one folded line, "4 from
// last week", that opens the Earlier panel. Right: the seven days of the week with each day's planned total (a shift
// counts once, at its own length). Put a task on a day by clicking the task and then the day's button, or by dragging it
// onto the day: it keeps any time it has (a task from a list has none, so it stays untimed). Every placing saves at once
// (D1) and folds the row with its own Undo; Ctrl+Z works. Done only closes.
export default function PlanWeek({ refreshKey }: { refreshKey: number }) {
  const cutMin = useCutMin();
  // The days and "today", fixed when it opens: on Sunday from 16:00 the week is next week.
  const opened = useRef(new Date()).current;
  const todayKey = useRef(dateKey(opened)).current;
  const days = useRef(weekToPlan(opened)).current;
  const [lists, setLists] = useState<TaskList[]>([]);
  const [listKey, setListKey] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    loadLists().then(setLists);
  }, [refreshKey]);
  const list = useCallback((raw: Task[]) => addRows(raw, listKey || undefined, lists), [listKey, lists]);
  const { raw, rows, act, undoRow } = useWrapRows(list, refreshKey, true, listKey);
  const away = useAwayDays(refreshKey);
  const start = parseDateKey(days[0]);
  const end = parseDateKey(days[6]);
  const sameMonth = start.getMonth() === end.getMonth();
  const heading = `Plan week · ${start.getDate()}${sameMonth ? '' : ` ${start.toLocaleDateString('en-GB', { month: 'long' })}`} to ${end.getDate()} ${end.toLocaleDateString('en-GB', { month: 'long' })}`;
  const leftover = raw ? lastWeekCount(raw, todayKey) : 0;
  const scroller = useRef<HTMLElement | null>(null);

  const put = (day: string) => {
    const item = rows?.find((r) => r.item.key === chosen && !r.decision)?.item;
    if (!item || !dayOpen(day, todayKey)) return;
    setChosen(null);
    void act(item, 'put', () => addToday(item, day));
  };

  return (
    <View style={styles.screen} accessibilityLabel="Plan week" {...({ role: 'region', dataSet: { flow: 'week', planWeek: '1' } } as object)}>
      <View style={wrap.bar}>
        <Text style={wrap.heading} accessibilityRole="header">
          {heading}
        </Text>
        <Pressable onPress={closeOverlay} style={wrap.primary} accessibilityRole="button" accessibilityLabel="Done" {...({ dataSet: { planDone: '1' } } as object)}>
          <Text style={wrap.primaryText}>Done</Text>
        </Pressable>
      </View>
      <Text style={[wrap.hint, styles.pad]} {...({ dataSet: { weekHint: '1' } } as object)}>
        {chosen ? 'Choose a day for it.' : 'Click a task, then a day, or drag the task onto a day. It keeps any time it has; otherwise it stays untimed. Changes save as you go.'}
      </Text>
      <View style={styles.body}>
        <View style={styles.left} {...({ dataSet: { weekColumn: 'lists' } } as object)}>
          <Text style={styles.colTitle}>This week's lists</Text>
          <select value={listKey} aria-label="List to plan from" onChange={(e) => (setChosen(null), setListKey(e.target.value))} style={selectStyle} data-plan-list="1">
            <option value="">{listTitle(undefined)}</option>
            {lists
              .filter((l) => !l.deletedAt)
              .map((l) => (
                <option key={l.key} value={l.key}>
                  {listTitle(l)}
                </option>
              ))}
          </select>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6, paddingBottom: 12, paddingTop: 8 }}>
            {rows && rows.length === 0 && <Text style={wrap.hint}>Nothing waiting in this list.</Text>}
            {rows?.map((r) => (
              <ListRow key={r.item.key} item={r.item} decision={r.decision} chosen={chosen === r.item.key} onChoose={() => setChosen((c) => (c === r.item.key ? null : r.item.key))} onUndo={undoRow} />
            ))}
          </ScrollView>
          {leftover > 0 && (
            <Pressable
              onPress={() => openOverlay({ kind: 'missed', back: 'week' })}
              style={[wrap.row, styles.leftover]}
              accessibilityRole="button"
              accessibilityLabel={`Open Earlier: ${lastWeekLine(leftover)}`}
              {...({ dataSet: { weekEarlier: String(leftover) } } as object)}
            >
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
              <Text style={styles.leftoverText}>{lastWeekLine(leftover)}</Text>
            </Pressable>
          )}
        </View>
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={styles.days} ref={((n: unknown) => (scroller.current = domNode(n))) as never}>
          {days.map((day) => (
            <DayColumn key={day} day={day} raw={raw} todayKey={todayKey} cutMin={cutMin} away={away.has(day)} choosing={!!chosen} onPut={() => put(day)} clip={() => scroller.current} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// A task of the list: click it to choose it (then a day), or drag it onto a day.
function ListRow({ item, decision, chosen, onChoose, onUndo }: { item: WrapItem; decision?: React.ComponentProps<typeof WrapRow>['decision']; chosen: boolean; onChoose: () => void; onUndo: React.ComponentProps<typeof WrapRow>['onUndo'] }) {
  const dragRef = useRowDrag(item, 'row');
  if (decision) return <WrapRow item={item} decision={decision} onTick={() => {}} onChoose={() => {}} onUndo={onUndo} />;
  const t = item.task;
  const meta = metaOf(item, '');
  return (
    <Pressable
      ref={dragRef as never}
      onPress={onChoose}
      style={[wrap.row, styles.line, chosen && styles.chosen]}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={`Choose ${t.title}`}
      {...({ dataSet: { weekTask: item.key, ...(chosen ? { weekChosen: '1' } : {}) } } as object)}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={wrap.title} numberOfLines={2}>
          {t.emoji ? `${t.emoji} ` : ''}
          {t.title}
        </Text>
        {meta || chosen ? <Text style={wrap.meta}>{chosen ? 'Choose a day' : meta}</Text> : null}
      </View>
    </Pressable>
  );
}

function DayColumn({ day, raw, todayKey, cutMin, away, choosing, onPut, clip }: { day: string; raw: Task[] | null; todayKey: string; cutMin: number; away: boolean; choosing: boolean; onPut: () => void; clip: () => HTMLElement | null }) {
  const { registerZone } = useDrag();
  const open = dayOpen(day, todayKey);
  const ref = useCallback(
    (node: unknown) => {
      const el = domNode(node);
      registerZone(`week:${day}`, el && open ? { kind: 'day', dayKey: day, node: el, clip } : null);
    },
    [registerZone, day, open, clip],
  );
  const items = raw ? dayItems(raw, day, todayKey, cutMin) : [];
  const d = parseDateKey(day);
  const name = d.toLocaleDateString('en-GB', { weekday: 'short' });
  return (
    <View ref={ref as never} style={[styles.day, day === todayKey && styles.dayToday, !open && styles.dayPast]} accessibilityLabel={`${name} ${d.getDate()}`} {...({ dataSet: { weekDay: day } } as object)}>
      <Text style={styles.dayName}>
        {name} {d.getDate()}
      </Text>
      <Text style={styles.total} {...({ dataSet: { weekTotal: day } } as object)}>
        {raw ? dayTotalText(raw, day, todayKey, cutMin, Date.now()) : ''}
      </Text>
      {away ? <Text style={wrap.meta}>Away day</Text> : null}
      {choosing && open && (
        <Pressable onPress={onPut} style={wrap.btn} accessibilityRole="button" accessibilityLabel={`Put it on ${name} ${d.getDate()}`} {...({ dataSet: { weekPut: day } } as object)}>
          <Text style={wrap.btnText}>Put here</Text>
        </Pressable>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4, paddingBottom: 8 }}>
        {items.map((it) => (
          <DayItem key={it.key} item={it} />
        ))}
      </ScrollView>
    </View>
  );
}

// One line on a day: a shift is one line (what is inside it is not listed); a not done task can be dragged to another day.
function DayItem({ item }: { item: WrapItem }) {
  const dragRef = useRowDrag(item, 'card');
  const t = item.task;
  const time = t.startTime ? formatTime(t.startTime) : '';
  return (
    <View ref={item.done ? undefined : (dragRef as never)} style={styles.item} accessibilityLabel={`On the day: ${t.title}`} {...({ dataSet: { weekItem: item.key } } as object)}>
      <Text style={[styles.itemTitle, item.done && wrap.done]} numberOfLines={2}>
        {t.emoji ? `${t.emoji} ` : ''}
        {t.title}
        {item.series ? ' ↻' : ''}
      </Text>
      {time ? <Text style={wrap.meta}>{time}</Text> : null}
    </View>
  );
}

const selectStyle: React.CSSProperties = {
  height: 40,
  padding: '0 10px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.surface,
  color: Colors.textPrimary,
  fontSize: 14,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const styles = StyleSheet.create({
  screen: { flex: 1, minWidth: 0, backgroundColor: Colors.background },
  pad: { paddingHorizontal: 24, paddingTop: 12 },
  body: { flex: 1, flexDirection: 'row', gap: 16, paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
  left: { width: 300, gap: 8, padding: 14, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  colTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chosen: { borderColor: Colors.accent, borderWidth: 2 },
  leftover: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leftoverText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  days: { gap: 10, flexGrow: 1 },
  day: { flex: 1, minWidth: 150, gap: 6, padding: 10, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  dayToday: { borderColor: Colors.accent, borderWidth: 2 },
  dayPast: { backgroundColor: Colors.background },
  dayName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  total: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  item: { padding: 8, borderRadius: 8, backgroundColor: Colors.background, gap: 2 },
  itemTitle: { fontSize: 14, color: Colors.textPrimary },
});
