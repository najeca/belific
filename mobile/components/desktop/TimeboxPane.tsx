import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { customToScheduleEvent, getWeeklyEventsForDate, formatTime } from '../../lib/data';
import { addDays, dateKey, formatDayLabel, isDateKey, parseDateKey } from '../../lib/kanban';
import {
  GRID_END_HOUR,
  GRID_HEIGHT_PX,
  GRID_START_HOUR,
  blockHeightPx,
  isCompactBlock,
  PX_PER_HOUR,
  formatMinutes,
  layoutItems,
  scrollOffsetFor,
  taskToItem,
  toMinutes,
  totalScheduledMinutes,
  type TimeboxItem,
} from '../../lib/timebox';
import { domNode, useDrag } from './DragProvider';
import usePaneScroll from './usePaneScroll';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import { formatDuration } from '../../lib/duration';
import { slotLabel, taskDuration, yToMinutes } from '../../lib/drag';
import { loadLabels } from '../../lib/labels';
import { labelColor } from '../../lib/labelColors';
import {
  loadCustomCategories,
  loadCustomEvents,
  loadTasks,
  updateCustomEvent,
  deleteCustomEvent,
} from '../../lib/storage';
import type { CustomCategory, CustomEvent, Project, ScheduleEvent, Task } from '../../lib/types';

// Desktop Timebox (decision 009): an hourly grid for one day, 06:00 to 23:00.
// It draws that day's CustomEvents (category colours, same sources the
// Calendar tab reads) AND placed Tasks (a Task with this Day and a
// startTime, decision 015). One row per task: nothing is copied. Tasks are
// placed ONLY by dragging them here (checkpoint 4; the card's "Schedule at"
// was removed in 4.2, so a time is never typed): the
// grid is a drop target (30 minute slots), a task block can be dragged to a
// new time, onto a day column or back to the Brain Dump list, and its bottom
// edge resizes it in 30 minute steps. Events are not draggable.
const GUTTER = 48;

type Source =
  | { kind: 'event'; event: ScheduleEvent; custom?: CustomEvent }
  | { kind: 'task'; task: Task };

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

export default function TimeboxPane({
  refreshKey,
  onChanged,
  onEditTask,
}: {
  refreshKey: number;
  onChanged: () => void;
  onEditTask: (task: Task) => void;
}) {
  const [day, setDay] = useState(() => parseDateKey(dateKey(new Date())));
  const [events, setEvents] = useState<CustomEvent[]>([]);
  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Project[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<CustomEvent | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { drag, registerZone, sourceRef, startResize } = useDrag();
  const paneScroll = usePaneScroll();
  const scrollNode = useRef<HTMLElement | null>(null);
  const gridNode = useRef<HTMLElement | null>(null);
  const tasksById = useRef(new Map<string, Task>());
  const handleRefs = useRef(new Map<string, (node: unknown) => void>());
  const setScrollRef = useCallback(
    (instance: unknown) => {
      scrollRef.current = instance as ScrollView | null;
      paneScroll('timebox', (node) => {
        scrollNode.current = node;
      })(instance);
    },
    [paneScroll],
  );
  const setGridRef = useCallback((instance: unknown) => {
    gridNode.current = domNode(instance);
  }, []);

  const reload = useCallback(() => {
    loadCustomEvents().then(setEvents);
    loadCustomCategories().then(setCategories);
    loadTasks().then(setTasks);
    loadLabels().then(setLabels);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  // Scroll to the current hour once, when the pane opens.
  useEffect(() => {
    const now = new Date();
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollOffsetFor(now.getHours() * 60 + now.getMinutes()), animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const key = dateKey(day);
  const todayKey = dateKey(new Date());

  // The visible grid is the drop target for the displayed day.
  useEffect(() => {
    if (scrollNode.current) {
      registerZone('timebox', { kind: 'timebox', dayKey: key, node: scrollNode.current, gridNode: gridNode.current });
    }
    return () => registerZone('timebox', null);
  }, [key, registerZone]);

  // The bottom edge of a task block: dragging it changes the duration.
  const handleRef = (id: string) => {
    let ref = handleRefs.current.get(id);
    if (!ref) {
      let cleanup: (() => void) | null = null;
      ref = (instance: unknown) => {
        cleanup?.();
        cleanup = null;
        const el = domNode(instance);
        if (!el) return;
        const down = (e: PointerEvent) => {
          const task = tasksById.current.get(id);
          const start = toMinutes(task?.startTime);
          if (!task || start === null || !gridNode.current) return;
          startResize(e, task, start, gridNode.current);
        };
        // RN's cursor type has no ns-resize; set it on the DOM node.
        el.style.cursor = 'ns-resize';
        el.addEventListener('pointerdown', down);
        cleanup = () => el.removeEventListener('pointerdown', down);
      };
      handleRefs.current.set(id, ref);
    }
    return ref;
  };

  const { sources, items } = useMemo(() => {
    const map = new Map<string, Source>();
    const list: TimeboxItem[] = [];
    for (const e of getWeeklyEventsForDate(day)) {
      const s = toMinutes(e.start);
      const en = toMinutes(e.end);
      if (s === null || en === null) continue;
      map.set(`event:${e.id}`, { kind: 'event', event: e });
      list.push({ id: `event:${e.id}`, startMin: s, endMin: en });
    }
    for (const c of events) {
      if (c.date !== key) continue;
      const e = customToScheduleEvent(c, categories);
      const s = toMinutes(e.start);
      const en = toMinutes(e.end);
      if (s === null || en === null) continue;
      map.set(`event:${e.id}`, { kind: 'event', event: e, custom: c });
      list.push({ id: `event:${e.id}`, startMin: s, endMin: en });
    }
    for (const t of tasks) {
      if (t.deletedAt || t.dueDate !== key) continue;
      const item = taskToItem(t);
      if (!item) continue;
      map.set(`task:${t.id}`, { kind: 'task', task: t });
      tasksById.current.set(t.id, t);
      list.push({ ...item, id: `task:${t.id}` });
    }
    return { sources: map, items: list };
  }, [day, key, events, categories, tasks]);

  const layout = useMemo(() => layoutItems(items), [items]);
  const total = totalScheduledMinutes(items);

  function go(delta: number) {
    setPickerOpen(false);
    setDay((d) => addDays(d, delta));
  }

  function openSource(source: Source) {
    if (source.kind === 'task') onEditTask(source.task);
    else if (source.custom) setEditing(source.custom);
  }

  const hours: number[] = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) hours.push(h);

  return (
    <View style={styles.pane}>
      <Text style={styles.paneLabel}>TIMEBOX</Text>

      <View style={styles.nav}>
        <Pressable onPress={() => go(-1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous day">
          <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => setPickerOpen((o) => !o)}
          style={styles.dateBtn}
          accessibilityRole="button"
          accessibilityLabel="Choose a date"
        >
          <Text style={styles.dateText}>{formatDayLabel(key)}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
        </Pressable>
        <Pressable onPress={() => go(1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Next day">
          <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            setPickerOpen(false);
            setDay(parseDateKey(todayKey));
          }}
          disabled={key === todayKey}
          style={[styles.todayBtn, key === todayKey && styles.todayBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
        >
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>

      {pickerOpen && (
        <View style={styles.picker}>
          <input
            type="date"
            value={key}
            onChange={(e) => {
              if (isDateKey(e.target.value)) {
                setDay(parseDateKey(e.target.value));
                setPickerOpen(false);
              }
            }}
            style={domTimeStyle}
            aria-label="Jump to date"
          />
        </View>
      )}

      <Text style={styles.total}>{total > 0 ? `Scheduled ${formatMinutes(total)}` : 'Nothing scheduled'}</Text>

      {layout.outside.length > 0 && (
        <Text style={styles.outside} numberOfLines={2}>
          Outside {String(GRID_START_HOUR).padStart(2, '0')}:00 to {GRID_END_HOUR}:00:{' '}
          {layout.outside
            .map((id) => {
              const s = sources.get(id);
              if (!s) return '';
              return s.kind === 'task'
                ? `${s.task.title} ${s.task.startTime ?? ''}`
                : `${s.event.title} ${s.event.start}`;
            })
            .join(', ')}
        </Text>
      )}

      <ScrollView ref={setScrollRef as never} style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View ref={setGridRef as never} style={[styles.grid, { height: GRID_HEIGHT_PX + 16 }]}>
          {hours.map((h) => (
            <View key={h} style={[styles.hourRow, { top: (h - GRID_START_HOUR) * PX_PER_HOUR }]}>
              <Text style={styles.hourLabel}>{String(h).padStart(2, '0')}:00</Text>
              <View style={styles.hourLine} />
            </View>
          ))}
          {hours.slice(0, -1).map((h) => (
            <View key={`half-${h}`} style={[styles.halfLine, { top: (h - GRID_START_HOUR + 0.5) * PX_PER_HOUR }]} />
          ))}

          <View style={styles.blocks}>
            {layout.blocks.map((b) => {
              const source = sources.get(b.id);
              if (!source) return null;
              const positioned = {
                top: b.top,
                height: b.height,
                left: `${(b.col * 100) / b.cols}%` as const,
                width: `${100 / b.cols}%` as const,
              };
              if (source.kind === 'task') {
                const t = source.task;
                const color = labelColor(labels.find((p) => p.key === t.projectKey)?.colorKey);
                const resizing = drag?.mode === 'resize' && drag.item.id === t.id ? drag.resizeDuration : undefined;
                const startMin = toMinutes(t.startTime) ?? b.startMin;
                const sized = resizing
                  ? { ...positioned, height: blockHeightPx(resizing) }
                  : positioned;
                return (
                  <View
                    key={b.id}
                    style={[styles.blockWrap, sized, drag?.mode === 'move' && drag.item.id === t.id && styles.dragging]}
                  >
                    <View style={styles.blockBase}>
                    <Pressable
                      ref={sourceRef(`block:${t.id}`, (e) => {
                        const grid = gridNode.current;
                        const start = toMinutes(t.startTime);
                        if (!grid || start === null) return null;
                        return {
                          kind: 'block',
                          task: t,
                          id: t.id,
                          title: t.title,
                          duration: taskDuration(t),
                          grabOffsetMin: yToMinutes(e.clientY, grid.getBoundingClientRect().top) - start,
                        };
                      }) as never}
                      onPress={() => openSource(source)}
                      style={[
                        styles.block,
                        styles.taskBlock,
                        color && [styles.taskBlockLabelled, { backgroundColor: color.tint, borderLeftColor: color.edge }],
                        b.continues && styles.blockContinues,
                        resizing !== undefined && styles.taskBlockActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Task ${t.title}`}
                    >
                      <View style={styles.blockTitleRow}>
                        <Text style={[styles.blockTitle, styles.blockTitleFlex, t.completed && styles.blockTitleDone]} numberOfLines={1}>
                          {t.title}
                        </Text>
                        {/* A short block shows one line: title and its true duration ("10m"). */}
                        {isCompactBlock(b.height) && resizing === undefined && formatDuration(t.durationMinutes) && (
                          <Text style={styles.blockTimeInline}>{formatDuration(t.durationMinutes)}</Text>
                        )}
                        {t.recurrence && <Ionicons name="repeat" size={12} color={Colors.textSecondary} accessibilityLabel="Repeats" />}
                      </View>
                      {resizing !== undefined ? (
                        <Text style={styles.blockSnap}>{slotLabel(startMin, resizing)}</Text>
                      ) : (
                        !isCompactBlock(b.height) && (
                          <Text style={styles.blockTime}>
                            {formatTime(t.startTime ?? '')} {formatDuration(t.durationMinutes) ?? ''} {t.completed ? 'done' : ''}
                          </Text>
                        )
                      )}
                    </Pressable>
                    {b.continues && <Continues />}
                    <View ref={handleRef(t.id) as never} style={styles.resizeHandle} accessibilityLabel={`Resize ${t.title}`} />
                    </View>
                  </View>
                );
              }
              const e = source.event;
              return (
                <View key={b.id} style={[styles.blockWrap, positioned]}>
                  <View style={styles.blockBase}>
                  <Pressable
                    onPress={() => openSource(source)}
                    disabled={!source.custom}
                    style={[styles.block, { backgroundColor: `${e.color}26`, borderLeftColor: e.color, borderLeftWidth: 3 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Event ${e.title}`}
                  >
                    <Text style={styles.blockTitle} numberOfLines={1}>
                      {e.icon ? `${e.icon} ` : ''}
                      {e.title}
                    </Text>
                    {!isCompactBlock(b.height) && (
                      <Text style={styles.blockTime}>
                        {formatTime(e.start)} to {formatTime(e.end)}
                      </Text>
                    )}
                  </Pressable>
                  {b.continues && <Continues />}
                  </View>
                </View>
              );
            })}
            {drag?.mode === 'move' && drag.accepted && drag.target?.kind === 'slot' && drag.target.dayKey === key && (
              <View
                pointerEvents="none"
                style={[
                  styles.slotPreview,
                  {
                    top: ((drag.target.startMin - GRID_START_HOUR * 60) / 60) * PX_PER_HOUR,
                    height: blockHeightPx(drag.item.duration),
                  },
                ]}
              >
                <Text style={styles.blockSnap}>{slotLabel(drag.target.startMin, drag.item.duration)}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {editing && (
        <EventPopover
          event={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </View>
  );
}

// Quiet marker on a block that runs past 23:00: the grid ends but the task or
// event does not. The stored duration is untouched.
function Continues() {
  return (
    <View pointerEvents="none" style={styles.continues} accessibilityLabel="Continues after 23:00">
      <Text style={styles.continuesText}>continues</Text>
      <Ionicons name="arrow-down" size={10} color={Colors.textSecondary} />
    </View>
  );
}

// Small inline editor for one event: title and start/end as web time inputs,
// delete with an inline confirm (no Alert.alert on web). Edits this one
// occurrence only, including for a recurring series.
function EventPopover({
  event,
  onClose,
  onDone,
}: {
  event: CustomEvent;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [start, setStart] = useState(event.start);
  const [end, setEnd] = useState(event.end);
  const [confirming, setConfirming] = useState(false);

  const s = toMinutes(start);
  const e = toMinutes(end);
  const rangeOk = s !== null && e !== null && e > s;
  const canSave = title.trim().length > 0 && rangeOk;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    // Capture phase: a focused TextInput stops key events from bubbling.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  async function save() {
    if (!canSave) return;
    await updateCustomEvent({ ...event, title: title.trim(), start, end });
    onDone();
  }

  async function remove() {
    await deleteCustomEvent(event.id);
    onDone();
  }

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.popover}>
        <Text style={styles.popoverHeading}>Edit event</Text>
        <TextInput
          style={styles.popoverInput}
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={save}
          autoFocus
          accessibilityLabel="Event title"
        />
        <View style={styles.timeRow}>
          <View>
            <Text style={styles.fieldLabel}>Start</Text>
            <input type="time" value={start} onChange={(ev) => setStart(ev.target.value)} style={domTimeStyle} aria-label="Start time" />
          </View>
          <View>
            <Text style={styles.fieldLabel}>End</Text>
            <input type="time" value={end} onChange={(ev) => setEnd(ev.target.value)} style={domTimeStyle} aria-label="End time" />
          </View>
        </View>
        {!rangeOk && <Text style={styles.error}>End must be after start.</Text>}
        <View style={styles.popoverFooter}>
          <View style={{ flex: 1 }}>
            {confirming ? (
              <View style={styles.confirm}>
                <Text style={styles.muted}>Delete?</Text>
                <Pressable onPress={remove} accessibilityRole="button" accessibilityLabel="Confirm delete event">
                  <Text style={styles.confirmYes}>Yes</Text>
                </Pressable>
                <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Cancel delete event">
                  <Text style={styles.confirmNo}>No</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel="Delete event">
                <Text style={styles.danger}>Delete</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={onClose} style={styles.cancelBtn} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Save event"
          >
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    minWidth: 0,
  },
  paneLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 32 },
  dateText: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  todayBtn: {
    paddingHorizontal: 12,
    height: 28,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  todayBtnDisabled: { opacity: 0.4 },
  todayText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  picker: {
    position: 'absolute',
    top: 84,
    left: 16,
    zIndex: 20,
    padding: 10,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  total: { marginTop: 8, fontSize: 12, color: Colors.textSecondary },
  outside: { marginTop: 4, fontSize: 12, color: Colors.textSecondary },
  scroll: { flex: 1, marginTop: 8 },
  grid: { position: 'relative' },
  hourRow: { position: 'absolute', left: 0, right: 0, height: 0, flexDirection: 'row', alignItems: 'center' },
  // 12/500 with tabular figures so the hours line up in a column.
  hourLabel: { width: GUTTER, fontSize: 12, fontWeight: '500', color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  halfLine: { position: 'absolute', left: GUTTER, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, opacity: 0.5 },
  dragging: { opacity: 0.35 },
  taskBlockActive: { backgroundColor: Colors.background },
  taskBlockLabelled: { borderWidth: 0, borderLeftWidth: 4 },
  blockContinues: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  continues: { position: 'absolute', right: 6, bottom: 2, flexDirection: 'row', alignItems: 'center', gap: 2 },
  continuesText: { fontSize: 10, color: Colors.textSecondary },
  blockSnap: { fontSize: 11, fontWeight: '700', color: Colors.accentText },
  resizeHandle: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 6 },
  slotPreview: {
    position: 'absolute',
    left: 0,
    right: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  blocks: { position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: 0 },
  blockWrap: { position: 'absolute', paddingRight: 2, paddingBottom: 1 },
  blockBase: { flex: 1, borderRadius: 8, backgroundColor: Colors.surface, overflow: 'hidden' },
  block: { flex: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  taskBlock: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent },
  blockTitle: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: Colors.textPrimary },
  blockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockTitleFlex: { flexShrink: 1 },
  blockTitleDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  blockTime: { fontSize: 11, color: Colors.textSecondary },
  blockTimeInline: { fontSize: 11, lineHeight: 16, color: Colors.textSecondary, flexShrink: 0 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(38, 37, 31, 0.2)',
    borderRadius: 16,
  },
  popover: {
    width: 280,
    maxWidth: '92%',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  popoverHeading: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  popoverInput: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: 14,
    outlineColor: Colors.accent,
  },
  timeRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary, marginBottom: 4 },
  error: { marginTop: 8, fontSize: 12, color: Colors.danger },
  popoverFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  muted: { fontSize: 13, color: Colors.textSecondary },
  danger: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmYes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  confirmNo: { fontSize: 13, fontWeight: '700', color: Colors.accentText },
  cancelBtn: { paddingHorizontal: 10, height: 34, justifyContent: 'center' },
  cancelText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  saveBtn: { paddingHorizontal: 16, height: 34, justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.accent },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { fontSize: 13, fontWeight: '700', color: Colors.onAccent },
});
