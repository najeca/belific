import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../lib/theme';
import { customToScheduleEvent, getWeeklyEventsForDate, formatTime } from '../../../lib/data';
import { addDays, dateKey, formatDayLabel, isDateKey, parseDateKey } from '../../../lib/kanban';
import {
  GRID_END_HOUR,
  GRID_HEIGHT_PX,
  GRID_START_HOUR,
  PX_PER_HOUR,
  formatMinutes,
  layoutItems,
  scrollOffsetFor,
  taskToItem,
  toMinutes,
  totalScheduledMinutes,
  type TimeboxItem,
} from '../../../lib/timebox';
import {
  loadCustomCategories,
  loadCustomEvents,
  loadTasks,
  updateCustomEvent,
  deleteCustomEvent,
} from '../../../lib/storage';
import type { CustomCategory, CustomEvent, ScheduleEvent, Task } from '../../../lib/types';

// Desktop Timebox (decision 009): an hourly grid for one day, 06:00 to 23:00.
// It draws that day's CustomEvents (category colours, same sources the
// Calendar tab reads) AND placed Tasks (a Task with this Day and a
// startTime, decision 015). One row per task: nothing is copied. No drag
// yet (checkpoint 4): tasks are placed from the kanban card's "Schedule at".
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
  fontFamily: 'inherit',
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<CustomEvent | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const reload = useCallback(() => {
    loadCustomEvents().then(setEvents);
    loadCustomCategories().then(setCategories);
    loadTasks().then(setTasks);
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

      <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.grid, { height: GRID_HEIGHT_PX + 16 }]}>
          {hours.map((h) => (
            <View key={h} style={[styles.hourRow, { top: (h - GRID_START_HOUR) * PX_PER_HOUR }]}>
              <Text style={styles.hourLabel}>{String(h).padStart(2, '0')}:00</Text>
              <View style={styles.hourLine} />
            </View>
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
                return (
                  <View key={b.id} style={[styles.blockWrap, positioned]}>
                    <View style={styles.blockBase}>
                    <Pressable
                      onPress={() => openSource(source)}
                      style={[styles.block, styles.taskBlock]}
                      accessibilityRole="button"
                      accessibilityLabel={`Task ${t.title}`}
                    >
                      <Text style={[styles.blockTitle, t.completed && styles.blockTitleDone]} numberOfLines={1}>
                        {t.title}
                      </Text>
                      {b.height >= 36 && (
                        <Text style={styles.blockTime}>
                          {formatTime(t.startTime ?? '')} {t.completed ? 'done' : 'task'}
                        </Text>
                      )}
                    </Pressable>
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
                    {b.height >= 36 && (
                      <Text style={styles.blockTime}>
                        {formatTime(e.start)} to {formatTime(e.end)}
                      </Text>
                    )}
                  </Pressable>
                  </View>
                </View>
              );
            })}
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
  hourLabel: { width: GUTTER, fontSize: 11, color: Colors.textSecondary },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  blocks: { position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: 0 },
  blockWrap: { position: 'absolute', paddingRight: 2, paddingBottom: 1 },
  blockBase: { flex: 1, borderRadius: 8, backgroundColor: Colors.surface, overflow: 'hidden' },
  block: { flex: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  taskBlock: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent },
  blockTitle: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: Colors.textPrimary },
  blockTitleDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  blockTime: { fontSize: 11, color: Colors.textSecondary },
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
