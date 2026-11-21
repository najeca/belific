// D3 of PLAN_desktop_parity (3.67.0): the desktop's Today, a third centre view beside Tasks and Calendar (the Timebox
// stays on the right). It draws what the phone's Today draws, from the same shared rules (lib/todayModel.ts): the Now
// card and the hours strip per label side by side at the top, then the timeline (one bubble per timed item, its height
// by length, the Now marker, free time as a gap) beside the Anytime cards and Done today. Wide, not the phone's column:
// under 760 px the two columns stack.
//   * Anytime cards are reordered by dragging with the mouse (a 4 px move starts it), or Alt+Up and Alt+Down on a
//     focused card; the order is the same synced user_settings row the phone writes (`today.order.<day>`,
//     lib/todayModelActions.ts). The Tasks board's today column does not follow it (Jethro, 2026-11-21).
//   * A tick is the usual write (lib/phoneActions.tickTask, recorded for Ctrl+Z) with the Undo bar; a click on a title
//     opens the details. Updates every minute, and at once when the window comes back (focus, wake, a new day).
//   * No red and no priority mark here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { dateKey } from '../../lib/kanban';
import { customToScheduleEvent, formatTime } from '../../lib/data';
import { loadCustomCategories, loadCustomEvents, loadListsRaw, loadProjects, loadRoutineCompletions, loadRoutines, loadTasksRaw } from '../../lib/storage';
import { itemTitle, type TodayItem } from '../../lib/todayView';
import { todayModel } from '../../lib/todayModel';
import { loadTodaySettings, saveAnytimeOrder } from '../../lib/todayModelActions';
import { hhmm } from '../../lib/nowCard';
import { bubbleHeight, nowMarker } from '../../lib/todayTimeline';
import { dropIndex, moveKey } from '../../lib/anytimeOrder';
import { isQuickReminder } from '../../lib/quickReminder';
import { formatDuration } from '../../lib/duration';
import { formatMinutes } from '../../lib/timebox';
import { labelColor } from '../../lib/labelColors';
import { BRAIN_DUMP_EMOJI } from '../../lib/emoji';
import { BRAIN_DUMP_NAME, liveLists } from '../../lib/lists';
import { withParts } from '../../lib/parts';
import { tickRoutine, tickTask } from '../../lib/phoneActions';
import type { CustomEvent, Project, Routine, ScheduleEvent, Task, TaskList } from '../../lib/types';
import { useCutMin } from './cutStore';
import { useHoursNonce } from './hoursStore';
import { useTint } from './themeStore';
import { offerUndo, openDetail } from './uiStore';
import { pressStyle } from './pressStyle';

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STACK_BELOW = 760;
const DRAG_START = 4;

export default function TodayPane({ refreshKey, onChanged, active }: { refreshKey: number; onChanged: () => void; active: boolean }) {
  const cutMin = useCutMin();
  const hoursNonce = useHoursNonce();
  const tint = useTint();
  const [todayKey, setTodayKey] = useState(() => dateKey(new Date()));
  const [nowMin, setNowMin] = useState(nowMinutes);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routinesDone, setRoutinesDone] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [hoursStored, setHoursStored] = useState<Map<string, string>>(new Map());
  const [width, setWidth] = useState(1000);
  const [showDone, setShowDone] = useState(false);
  const [drag, setDrag] = useState<{ key: string; dy: number } | null>(null);
  const cardsRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    const key = dateKey(new Date());
    const [raw, custom, categories, rs, comps, ps, ls] = await Promise.all([loadTasksRaw(), loadCustomEvents(), loadCustomCategories(), loadRoutines(), loadRoutineCompletions(), loadProjects(), loadListsRaw()]);
    setTodayKey(key);
    setNowMin(nowMinutes());
    setTasks(withParts(raw));
    setEvents(custom.filter((e: CustomEvent) => e.date === key).map((e) => customToScheduleEvent(e, categories)));
    setRoutines(rs);
    setRoutinesDone(new Set(comps.filter((x) => x.date === key).map((x) => x.routineId)));
    setProjects(ps);
    setLists(ls);
    const stored = await loadTodaySettings(key);
    setOrder(stored.order);
    setHoursStored(stored.hoursStored);
  }, []);

  useEffect(() => {
    if (active) load().catch(() => {});
  }, [active, refreshKey, hoursNonce, load]);

  // Every minute while shown; at once when the window comes back (a timer does not run while the computer sleeps).
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      setNowMin(nowMinutes());
      if (dateKey(new Date()) !== todayKey) load().catch(() => {});
    };
    const timer = setInterval(tick, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, todayKey, load]);

  const model = useMemo(
    () => todayModel({ tasks, todayKey, nowMin, cutMin, events, routines, routinesDone, order, labels: projects, hoursStored }),
    [tasks, todayKey, nowMin, cutMin, events, routines, routinesDone, order, projects, hoursStored],
  );
  const { now, nowItem, timeline, anytime, doneUntimed, hours, shifts } = model;
  const live = liveLists(lists);

  const labelOf = (t: Task | null) => (t?.projectKey ? projects.find((p) => p.key === t.projectKey && !p.deletedAt) : undefined);
  const colorsOf = (t: Task | null) => {
    const col = labelColor(labelOf(t)?.colorKey);
    return col ? { fill: tint(col), edge: col.edge } : { fill: Colors.plainBlock, edge: Colors.borderStrong };
  };
  const listOf = (t: Task) => {
    const l = t.listKey ? live.find((x) => x.key === t.listKey) : undefined;
    return l ? `${l.emoji ? `${l.emoji} ` : ''}${l.name}` : `${BRAIN_DUMP_EMOJI} ${BRAIN_DUMP_NAME}`;
  };
  const emojiOf = (t: Task) => (t.listKey ? live.find((x) => x.key === t.listKey)?.emoji : undefined) || BRAIN_DUMP_EMOJI;

  async function tick(item: TodayItem, done: boolean, withUndo = true) {
    if (item.kind === 'event') return;
    if (item.kind === 'routine') await tickRoutine(item.routine.id, todayKey, done);
    else await tickTask(item.task, item.projected && done, done, item.time, item.multi);
    onChanged();
    await load();
    if (done && withUndo) offerUndo(`Done: ${itemTitle(item)}`, () => tick(item, false, false));
  }
  const open = (item: TodayItem) => {
    if (item.kind === 'task') openDetail(item.task.id);
  };

  // ---- Anytime order ----
  function reorder(from: number, to: number) {
    const keys = anytime.map((i) => i.key);
    if (to === from || to < 0 || to >= keys.length) return;
    const next = moveKey(keys, from, to);
    setOrder(next);
    void saveAnytimeOrder(todayKey, next);
  }
  const places = () => {
    const nodes = cardsRef.current ? Array.from(cardsRef.current.querySelectorAll<HTMLElement>('[data-anytime-card]')) : [];
    const byKey = new Map(nodes.map((n) => [n.getAttribute('data-anytime-card') ?? '', n.getBoundingClientRect()]));
    const keys = anytime.map((i) => i.key);
    return { tops: keys.map((k) => byKey.get(k)?.top ?? 0), heights: keys.map((k) => byKey.get(k)?.height ?? 0) };
  };
  function startDrag(e: { nativeEvent: PointerEvent | MouseEvent }, index: number, key: string) {
    const ev = e.nativeEvent as PointerEvent;
    if (ev.button !== 0) return;
    const y0 = ev.clientY;
    // The places before the card moves (while dragging it is drawn shifted, which would count the move twice).
    const start = places();
    let moved = false;
    const move = (m: PointerEvent) => {
      const dy = m.clientY - y0;
      if (!moved && Math.abs(dy) < DRAG_START) return;
      moved = true;
      setDrag({ key, dy });
    };
    const up = (u: PointerEvent) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      if (!moved) return;
      // A drag is not a click on the title.
      const swallow = (c: Event) => {
        c.stopPropagation();
        c.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      setDrag(null);
      reorder(index, dropIndex(start.tops, start.heights, index, u.clientY - y0));
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  }
  const onCardKey = (index: number) => (e: { nativeEvent: KeyboardEvent; preventDefault: () => void }) => {
    const k = e.nativeEvent;
    if (!k.altKey || (k.key !== 'ArrowUp' && k.key !== 'ArrowDown')) return;
    e.preventDefault();
    const to = index + (k.key === 'ArrowUp' ? -1 : 1);
    reorder(index, to);
    const key = anytime[index]?.key;
    setTimeout(() => cardsRef.current?.querySelector<HTMLElement>(`[data-anytime-card="${key}"]`)?.focus(), 30);
  };

  // ---- drawing ----
  const date = new Date(`${todayKey}T12:00:00`);
  const stacked = width < STACK_BELOW;
  const nowTask = nowItem && nowItem.kind === 'task' ? nowItem.task : null;
  const nowLabel = labelOf(nowTask);
  const nowCol = labelColor(nowLabel?.colorKey);
  const pillText = now.free ? 'Free time' : nowLabel ? `${nowLabel.emoji ? `${nowLabel.emoji} ` : ''}${nowLabel.name}` : null;
  const marker = nowMarker(timeline.map((r) => r.span), nowMin);

  const markerLine = (
    <View key="now-marker" style={styles.markerLine} accessibilityLabel={`Now, ${formatTime(hhmm(nowMin))}`} {...({ dataSet: { nowMarker: 'line' } } as object)}>
      <View style={styles.markerDot} />
      <View style={styles.markerRule} />
      <Text style={styles.markerText}>{`Now ${formatTime(hhmm(nowMin))}`}</Text>
    </View>
  );

  function timedRow(row: (typeof timeline)[number]) {
    const item = row.item;
    if (item.kind === 'routine') return null;
    const start = formatTime(hhmm(item.startMin ?? 0));
    const t = item.kind === 'task' ? item.task : null;
    if (row.span.free && t) {
      const end = formatTime(hhmm(item.endMin ?? item.startMin ?? 0));
      return (
        <Pressable key={item.key} onPress={() => open(item)} style={styles.gap} accessibilityRole="button" accessibilityLabel={`${t.title}, free time, ${start} to ${end}`} {...({ dataSet: { todayGap: t.title } } as object)}>
          <Text style={styles.gapText}>{`${t.title}, free time · ${start} to ${end}`}</Text>
        </Pressable>
      );
    }
    const reminder = !!t && isQuickReminder(t);
    const h = bubbleHeight((item.endMin ?? 0) - (item.startMin ?? 0), reminder);
    const col = t ? colorsOf(t) : { fill: Colors.plainBlock, edge: Colors.border };
    const done = item.kind === 'task' && item.done;
    const title = itemTitle(item);
    const len = t?.durationMinutes ? formatDuration(t.durationMinutes) : '';
    const timeText = item.kind === 'event' ? `${start} to ${formatTime(item.event.end)}` : `${start}${len ? ` · ${len}` : ''}`;
    const inside = marker.inside && marker.key === item.key ? marker.share : null;
    const shift = t ? shifts.byTask.get(t.id) : undefined;
    return (
      <View key={item.key} style={styles.tlRow} {...({ dataSet: item.kind === 'task' ? { tlRow: done ? 'done' : 'open', todayKey: item.key, todayRow: title } : { tlRow: 'event', todayEvent: title } } as object)}>
        <View style={[styles.bubble, { height: h, backgroundColor: col.fill, borderColor: col.edge }, reminder && styles.round]} {...({ dataSet: { bubble: String(h), bubbleEdge: col.edge } } as object)}>
          <Text style={styles.bubbleEmoji}>{t ? emojiOf(t) : item.kind === 'event' ? item.event.icon || '' : ''}</Text>
          {inside !== null ? <View style={[styles.insideMark, { top: Math.round(h * inside) }]} {...({ dataSet: { nowMarker: 'inside' } } as object)} /> : null}
        </View>
        <Pressable onPress={() => open(item)} disabled={!t} style={pressStyle(({ hovered }) => [styles.tlBody, hovered && !!t && styles.hover])} accessibilityRole={t ? 'button' : undefined} accessibilityLabel={`${title}, ${timeText}${t ? `, ${listOf(t)}` : ''}${done ? ', done' : ''}`}>
          <Text style={[styles.tlTitle, done && styles.struck, item.kind === 'event' && styles.muted]} numberOfLines={2}>{title}</Text>
          <Text style={styles.tlTime}>{timeText}</Text>
          {shift && shift.rows.length > 0 ? (
            <View style={styles.inside} {...({ dataSet: { shiftRows: String(shift.rows.length) } } as object)}>
              {shift.rows.map((r) => (
                <Text key={r.key} style={[styles.insideRow, r.done && styles.struck]} numberOfLines={1}>{`· ${r.title}`}</Text>
              ))}
            </View>
          ) : null}
        </Pressable>
        {item.kind === 'task' ? <Check done={done} color={col.edge} label={`${done ? 'Not done' : 'Done'}: ${title}`} onPress={() => void tick(item, !done)} data={item.key} /> : null}
      </View>
    );
  }

  // The Now marker: inside the bubble running now, otherwise a line before the next item (lib/todayTimeline.ts).
  const tl: React.ReactNode[] = [];
  timeline.forEach((row, i) => {
    if (!marker.inside && marker.index === i) tl.push(markerLine);
    tl.push(timedRow(row));
  });
  if (!marker.inside && marker.index >= timeline.length && timeline.length > 0) tl.push(markerLine);

  return (
    <View style={styles.pane} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} {...({ dataSet: { todayPane: todayKey } } as object)}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.date}>{`${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`}</Text>
        <View style={[styles.top, stacked && styles.stack]}>
          <View style={[styles.nowCard, { flex: 3 }]} {...({ dataSet: { nowCard: now.now ? 'now' : now.freeBlock ? 'freeBlock' : now.next ? 'free' : 'empty' } } as object)}>
            <View style={[styles.edge, { backgroundColor: nowCol?.edge ?? (now.free ? Colors.borderStrong : Colors.accent) }]} />
            <View style={styles.nowBody}>
              <View style={styles.nowHead}>
                <Text style={styles.nowLabel}>{now.now ? `NOW · ${now.range}` : 'NOW'}</Text>
                {pillText ? (
                  <View style={[styles.pill, { backgroundColor: nowCol && !now.free ? tint(nowCol) : Colors.background, borderColor: nowCol && !now.free ? nowCol.edge : Colors.borderStrong }]} {...({ dataSet: { nowPill: pillText } } as object)}>
                    <Text style={styles.pillText}>{pillText}</Text>
                  </View>
                ) : null}
              </View>
              {now.now && nowItem ? (
                <View style={styles.nowTitleRow}>
                  <Text style={styles.nowTitle} numberOfLines={2} {...({ dataSet: { nowTitle: itemTitle(nowItem) } } as object)}>{itemTitle(nowItem)}</Text>
                  {nowItem.kind === 'task' ? <Check done={false} color={nowCol?.edge ?? Colors.borderStrong} label={`Mark ${itemTitle(nowItem)} done`} onPress={() => void tick(nowItem, true)} data="now" big /> : null}
                </View>
              ) : (
                <Text style={styles.quiet}>{now.freeBlock ? now.freeBlock.title : 'Nothing planned now'}</Text>
              )}
              {now.now ? <Text style={styles.left} {...({ dataSet: { nowLeft: now.left } } as object)}>{now.left}</Text> : null}
              <View style={styles.rule} />
              <Text style={styles.next} {...({ dataSet: { nowNext: now.nextLine } } as object)}>{now.nextLine}</Text>
            </View>
          </View>
          <View style={[styles.box, { flex: 2 }]} accessibilityLabel={`Hours today, ${formatMinutes(hours.total)}`} {...({ dataSet: { hoursStrip: String(hours.total) } } as object)}>
            <View style={styles.boxHead}>
              <Text style={styles.boxTitle}>Hours today</Text>
              <Text style={styles.boxTotal}>{hours.total > 0 ? formatMinutes(hours.total) : ''}</Text>
            </View>
            {hours.total > 0 ? (
              <>
                <View style={styles.bar}>
                  {hours.parts.map((p) => {
                    const color = p.key ? (labelColor(p.colorKey)?.edge ?? Colors.textTertiary) : Colors.borderStrong;
                    return <View key={p.key || 'none'} style={{ flex: p.minutes, backgroundColor: color }} {...({ dataSet: { hoursPart: p.key || 'none', hoursMinutes: String(p.minutes) } } as object)} />;
                  })}
                </View>
                <View style={styles.legend}>
                  {hours.parts.map((p) => (
                    <View key={p.key || 'none'} style={styles.legendItem}>
                      <View style={[styles.dot, { backgroundColor: p.key ? (labelColor(p.colorKey)?.edge ?? Colors.textTertiary) : Colors.borderStrong }]} />
                      <Text style={styles.legendText}>{`${p.emoji ? `${p.emoji} ` : ''}${p.name} ${formatMinutes(p.minutes)}`}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.quiet}>Nothing with a length planned today.</Text>
            )}
            <Text style={styles.hint}>Which labels count: Settings, Daily hours.</Text>
          </View>
        </View>

        <View style={[styles.cols, stacked && styles.stack]}>
          <View style={[styles.col, { flex: 3 }]} {...({ dataSet: { todayTimeline: String(timeline.length) } } as object)}>
            <Text style={styles.colTitle}>Timeline</Text>
            {timeline.length === 0 ? <Text style={styles.quiet}>Nothing with a time today.</Text> : tl}
          </View>
          <View style={[styles.col, { flex: 2 }]}>
            <Text style={styles.colTitle}>Anytime</Text>
            <View ref={cardsRef as never} style={{ gap: 10 }} {...({ dataSet: { anytimeList: String(anytime.length) } } as object)}>
              {anytime.length === 0 ? <Text style={styles.quiet}>Nothing without a time today.</Text> : null}
              {anytime.map((item, index) => {
                const t = item.kind === 'task' ? item.task : null;
                const col = colorsOf(t);
                const title = itemTitle(item);
                const dragging = drag?.key === item.key;
                return (
                  <View
                    key={item.key}
                    focusable
                    style={[styles.card, { borderLeftColor: col.edge }, dragging && { transform: [{ translateY: drag.dy }], zIndex: 5, boxShadow: Colors.shadowMd } as object]}
                    accessibilityLabel={`${title}${t ? `, ${listOf(t)}` : ''}. Drag, or Alt and the arrow keys, to change the order.`}
                    {...({ dataSet: { anytimeCard: item.key, anytimeTitle: title }, onPointerDown: (e: never) => startDrag(e, index, item.key), onKeyDown: onCardKey(index), tabIndex: 0 } as object)}
                  >
                    <Pressable onPress={() => open(item)} style={{ flex: 1 }} accessibilityRole={t ? 'button' : undefined} accessibilityLabel={`Open ${title}`}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>{t ? `${listOf(t)}${labelOf(t) ? ` · ${labelOf(t)!.name}` : ''}` : item.kind === 'routine' ? 'Routine' : ''}</Text>
                    </Pressable>
                    <Check done={false} color={col.edge} label={`Done: ${title}`} onPress={() => void tick(item, true)} data={item.key} />
                  </View>
                );
              })}
            </View>
            {doneUntimed.length > 0 ? (
              <View style={{ marginTop: 14 }} {...({ dataSet: { doneToday: String(doneUntimed.length) } } as object)}>
                <Pressable onPress={() => setShowDone((v) => !v)} style={styles.doneHead} accessibilityRole="button" accessibilityState={{ expanded: showDone }} accessibilityLabel={`Done today, ${doneUntimed.length}`}>
                  <Text style={styles.colTitle}>{`Done today · ${doneUntimed.length}`}</Text>
                </Pressable>
                {showDone
                  ? doneUntimed.map((item) => (
                      <View key={item.key} style={styles.doneRow}>
                        <Text style={[styles.cardTitle, styles.struck, { flex: 1 }]} numberOfLines={1}>{itemTitle(item)}</Text>
                        <Check done color={Colors.borderStrong} label={`Not done: ${itemTitle(item)}`} onPress={() => void tick(item, false)} data={item.key} />
                      </View>
                    ))
                  : null}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Check({ done, color, label, onPress, data, big }: { done: boolean; color: string; label: string; onPress: () => void; data: string; big?: boolean }) {
  const size = big ? 30 : 24;
  return (
    <Pressable onPress={onPress} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={label} {...({ dataSet: { todayTick: data } } as object)}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color, backgroundColor: done ? color : 'transparent' }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1, backgroundColor: Colors.surface, borderRadius: 16, overflow: 'hidden' },
  scroll: { padding: 20, gap: 16 },
  date: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  top: { flexDirection: 'row', gap: 16, alignItems: 'stretch' },
  stack: { flexDirection: 'column' },
  nowCard: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderStrong, overflow: 'hidden', minHeight: 150 },
  edge: { width: 6 },
  nowBody: { flex: 1, padding: 16, gap: 6 },
  nowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nowLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, color: Colors.textSecondary },
  pill: { paddingHorizontal: 10, height: 24, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  pillText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  nowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nowTitle: { flex: 1, fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  left: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  rule: { width: 48, height: 2, backgroundColor: Colors.border, marginVertical: 4 },
  next: { fontSize: 14, color: Colors.textSecondary },
  quiet: { fontSize: 14, color: Colors.textSecondary },
  hint: { fontSize: 12, color: Colors.textTertiary, marginTop: 'auto' as never },
  box: { backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10 },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between' },
  boxTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  boxTotal: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: Colors.border },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, color: Colors.textSecondary },
  cols: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  col: { gap: 8, minWidth: 0 },
  colTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, color: Colors.textSecondary, textTransform: 'uppercase' },
  tlRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bubble: { width: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', paddingTop: 10, position: 'relative' },
  round: { height: 44, paddingTop: 0, justifyContent: 'center' },
  bubbleEmoji: { fontSize: 18 },
  insideMark: { position: 'absolute', left: -6, right: -6, height: 2, backgroundColor: Colors.accent },
  tlBody: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 },
  hover: { backgroundColor: Colors.hover },
  tlTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  tlTime: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Roboto Mono, monospace' },
  struck: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  muted: { color: Colors.textSecondary },
  inside: { marginTop: 6, gap: 2, paddingLeft: 8 },
  insideRow: { fontSize: 13, color: Colors.textSecondary },
  gap: { paddingVertical: 8, paddingLeft: 56 },
  gapText: { fontSize: 13, color: Colors.textTertiary },
  markerLine: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 22 },
  markerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent, marginLeft: 16 },
  markerRule: { flex: 1, height: 2, backgroundColor: Colors.accent },
  markerText: { fontSize: 12, fontWeight: '700', color: Colors.accentText },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderStrong, borderLeftWidth: 4, paddingVertical: 10, paddingLeft: 12, paddingRight: 6, cursor: 'grab' as never },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  cardMeta: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  check: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  doneHead: { minHeight: 32, justifyContent: 'center' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
});
