import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey, formatShortDate, parseDateKey } from '../../lib/kanban';
import { formatTime } from '../../lib/data';
import { formatMinutes } from '../../lib/timebox';
import { taskDuration } from '../../lib/drag';
import { listTitle } from '../../lib/lists';
import { loadLists } from '../../lib/storage';
import { dayItems, earlierItems, type WrapChoice, type WrapItem } from '../../lib/wrapUp';
import { addRows, earlierLine, insideText, plannedText, repeatingNotToday } from '../../lib/planDay';
import { addToday, notToday } from '../../lib/wrapActions';
import type { Task, TaskList } from '../../lib/types';
import { useCutMin } from './cutStore';
import { useDrag } from './DragProvider';
import { useAwayDays } from './awayStore';
import { tomorrowOf } from '../../lib/rollover';
import { closeOverlay, openOverlay } from './uiStore';
import { WrapRow, useWrapRows, styles as wrap, type ShownRow } from './WrapUp';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// F4 of PLAN_daily_flow: Plan my day on ONE screen (it replaces the four steps and their draft). It takes the place of
// the left pane and the centre while it is open; the real Timebox stays on the right, on today, so a task dragged from
// here onto it gets a time there (the usual drag and drop). A task left alone stays untimed.
//   * On today: the day's tasks (a shift is one item; what is inside it is part of it). Unticking one means "not today":
//     a one off task goes back to its list, a repeating day is skipped for today.
//   * Add to today: one picker (Brain Dump, then each list) and the repeating tasks whose next day is not today. Earlier
//     days are one folded line that opens the Earlier panel (closing it comes back here).
// Every button saves at once (D1) and folds its row with its own Undo; Ctrl+Z works here too. Done only closes.
export default function PlanMyDay({ refreshKey }: { refreshKey: number }) {
  const cutMin = useCutMin();
  // The day planned, fixed when it opens.
  const todayKey = useRef(dateKey(new Date())).current;
  const list = useCallback((raw: Task[]) => dayItems(raw, todayKey, dateKey(new Date()), cutMin), [todayKey, cutMin]);
  const { raw, rows, act, undoRow } = useWrapRows(list, refreshKey);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [listKey, setListKey] = useState('');
  useEffect(() => {
    loadLists().then(setLists);
  }, [refreshKey]);
  const day = parseDateKey(todayKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const earlier = raw ? earlierItems(raw, todayKey).length : 0;
  // Away days (2.27.0): one line when today or tomorrow is one.
  const away = useAwayDays(refreshKey);
  const awayNote = [away.has(todayKey) && 'Today', away.has(tomorrowOf(todayKey)) && 'Tomorrow'].filter(Boolean).join(' and ');
  const choose = (item: WrapItem) => void act(item, item.series ? 'skipToday' : 'notToday', () => notToday(item));

  return (
    <View style={styles.screen} accessibilityLabel="Plan my day" {...({ role: 'region', dataSet: { flow: 'planning', planDay: '1' } } as object)}>
      <View style={wrap.bar}>
        <Text style={wrap.heading} accessibilityRole="header">
          Plan my day · {day}
        </Text>
        <Pressable onPress={closeOverlay} style={wrap.primary} accessibilityRole="button" accessibilityLabel="Done" {...({ dataSet: { planDone: '1' } } as object)}>
          <Text style={wrap.primaryText}>Done</Text>
        </Pressable>
      </View>
      <Text style={[wrap.hint, styles.pad]}>Changes save as you go: Undo on a row, or Ctrl+Z, puts one back. Drag a task onto the Timebox to give it a time, or leave it untimed.</Text>
      {awayNote ? (
        <Text style={[wrap.hint, styles.pad]} {...({ dataSet: { flowAway: '1' } } as object)}>
          {awayNote} {awayNote.includes(' and ') ? 'are away days' : 'is an away day'}. Tasks can still go there.
        </Text>
      ) : null}
      <View style={styles.columns}>
        <View style={styles.column} {...({ dataSet: { planColumn: 'today' } } as object)}>
          <Text style={styles.colTitle}>On today</Text>
          <Text style={wrap.hint}>Untick a task to leave it for another day.</Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>
            {!rows ? (
              <Text style={wrap.hint}>Loading…</Text>
            ) : rows.length === 0 ? (
              <Text style={wrap.hint}>Nothing on today yet. Add a task from the right.</Text>
            ) : (
              rows.map((r) => <TodayRow key={r.item.key} row={r} onUntick={choose} onUndo={undoRow} />)
            )}
          </ScrollView>
          {raw ? (
            <Text style={styles.figure} {...({ dataSet: { planFigure: '1' } } as object)}>
              {plannedText(raw, todayKey, cutMin, Date.now())}
            </Text>
          ) : null}
        </View>
        <View style={styles.column} {...({ dataSet: { planColumn: 'add' } } as object)}>
          <Text style={styles.colTitle}>Add to today</Text>
          <select value={listKey} aria-label="List to add from" onChange={(e) => setListKey(e.target.value)} style={selectStyle} data-plan-list="1">
            <option value="">{listTitle(undefined)}</option>
            {lists
              .filter((l) => !l.deletedAt)
              .map((l) => (
                <option key={l.key} value={l.key}>
                  {listTitle(l)}
                </option>
              ))}
          </select>
          <AddColumn key={listKey} listKey={listKey} lists={lists} todayKey={todayKey} refreshKey={refreshKey} />
          {earlier > 0 && (
            <Pressable
              onPress={() => openOverlay({ kind: 'missed', back: 'planning' })}
              style={[wrap.row, styles.earlier]}
              accessibilityRole="button"
              accessibilityLabel={`Open Earlier: ${earlierLine(earlier)}`}
              {...({ dataSet: { planEarlier: String(earlier) } } as object)}
            >
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
              <Text style={styles.earlierText}>{earlierLine(earlier)}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export function metaOf(item: WrapItem, todayKey: string): string {
  const t = item.task;
  return [
    t.dueDate && t.dueDate !== todayKey ? `next: ${formatShortDate(t.dueDate)}` : '',
    t.startTime ? formatTime(t.startTime) : '',
    t.durationMinutes ? formatMinutes(t.durationMinutes) : '',
    item.series ? '↻ repeats' : '',
    item.inside && item.inside.length > 0 ? insideText(item) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// The row is a drag source (onto the Timebox); its buttons stay clicks.
export function useRowDrag(item: WrapItem, kind: 'card' | 'row') {
  const { sourceRef } = useDrag();
  return sourceRef(`plan:${item.key}`, () => ({ kind, task: item.task, id: item.task.id, title: item.task.title, emoji: item.task.emoji, duration: taskDuration(item.task), projected: item.projected }));
}

function TodayRow({ row, onUntick, onUndo }: { row: ShownRow; onUntick: (item: WrapItem) => void; onUndo: React.ComponentProps<typeof WrapRow>['onUndo'] }) {
  const { item, decision } = row;
  const dragRef = useRowDrag(item, 'card');
  if (decision) return <WrapRow item={item} decision={decision} onTick={() => {}} onChoose={() => {}} onUndo={onUndo} />;
  const t = item.task;
  const meta = metaOf(item, t.dueDate ?? '');
  return (
    <View ref={item.done ? undefined : (dragRef as never)} style={[wrap.row, styles.line]} accessibilityLabel={`Plan ${t.title}`} {...({ dataSet: { planRow: item.key } } as object)}>
      {item.done ? (
        <Ionicons name="checkmark-circle" size={22} color={Colors.accentText} accessibilityLabel={`${t.title} is done`} />
      ) : (
        <Pressable onPress={() => onUntick(item)} style={styles.box} accessibilityRole="checkbox" accessibilityState={{ checked: true }} accessibilityLabel={item.series ? `Skip ${t.title} today` : `Take ${t.title} off today`} {...({ dataSet: { planUntick: item.key } } as object)}>
          <Ionicons name="checkmark" size={16} color={Colors.onAccent} />
        </Pressable>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[wrap.title, item.done && wrap.done]} numberOfLines={2}>
          {t.emoji ? `${t.emoji} ` : ''}
          {t.title}
        </Text>
        <Text style={wrap.meta}>{meta || 'Untimed'}</Text>
      </View>
    </View>
  );
}

function AddColumn({ listKey, lists, todayKey, refreshKey }: { listKey: string; lists: TaskList[]; todayKey: string; refreshKey: number }) {
  const list = useCallback((raw: Task[]) => [...addRows(raw, listKey || undefined, lists), ...repeatingNotToday(raw, todayKey)], [listKey, lists, todayKey]);
  // On today's list handles Ctrl+Z for the screen.
  const { rows, act, undoRow } = useWrapRows(list, refreshKey, false);
  const add = (item: WrapItem) => void act(item, 'addToday' as WrapChoice, () => addToday(item, todayKey));
  const plain = (rows ?? []).filter((r) => !r.item.series);
  const repeating = (rows ?? []).filter((r) => r.item.series);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6, paddingBottom: 12, paddingTop: 8 }}>
      {rows && plain.length === 0 && <Text style={wrap.hint}>Nothing waiting in this list.</Text>}
      {plain.map((r) => (
        <AddRow key={r.item.key} row={r} todayKey={todayKey} onAdd={add} onUndo={undoRow} />
      ))}
      {repeating.length > 0 && <Text style={[styles.colTitle, { marginTop: 10 }]}>Repeating, not on today</Text>}
      {repeating.map((r) => (
        <AddRow key={r.item.key} row={r} todayKey={todayKey} onAdd={add} onUndo={undoRow} />
      ))}
    </ScrollView>
  );
}

function AddRow({ row, todayKey, onAdd, onUndo }: { row: ShownRow; todayKey: string; onAdd: (item: WrapItem) => void; onUndo: React.ComponentProps<typeof WrapRow>['onUndo'] }) {
  const { item, decision } = row;
  const dragRef = useRowDrag(item, item.series ? 'card' : 'row');
  if (decision) return <WrapRow item={item} decision={decision} onTick={() => {}} onChoose={() => {}} onUndo={onUndo} />;
  const t = item.task;
  const meta = metaOf(item, todayKey);
  return (
    <View ref={dragRef as never} style={[wrap.row, styles.line]} accessibilityLabel={`Add ${t.title}`} {...({ dataSet: { planAdd: item.key } } as object)}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={wrap.title} numberOfLines={2}>
          {t.emoji ? `${t.emoji} ` : ''}
          {t.title}
        </Text>
        {meta ? <Text style={wrap.meta}>{meta}</Text> : null}
      </View>
      <Pressable onPress={() => onAdd(item)} style={wrap.btn} accessibilityRole="button" accessibilityLabel={`Add ${t.title} to today`} {...({ dataSet: { planToday: item.key } } as object)}>
        <Text style={wrap.btnText}>Today</Text>
      </Pressable>
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
  columns: { flex: 1, flexDirection: 'row', gap: 16, paddingHorizontal: 24, paddingBottom: 16 },
  column: { flex: 1, minWidth: 0, gap: 8, padding: 14, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  colTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 24, height: 24, borderRadius: 6, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  figure: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  earlier: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  earlierText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
});
