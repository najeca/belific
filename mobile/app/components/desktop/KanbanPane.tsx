import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../lib/theme';
import {
  addDays,
  addWeeks,
  bucketTasks,
  clampToToday,
  dateKey,
  formatDayLabel,
  formatDayTitle,
  formatDuration,
  formatShortDate,
  formatWeekLabel,
  isDateKey,
  isDayInView,
  parseDateKey,
  weekDays,
  weekStartOf,
  type ColumnItem,
} from '../../../lib/kanban';
import { DEFAULT_TASK_MINUTES, formatMinutes, toMinutes } from '../../../lib/timebox';
import { loadTasks, loadProjects, updateTask } from '../../../lib/storage';
import type { Project, Task } from '../../../lib/types';

// Desktop week board (decision 009, "Plan"), forward only: a pinned
// Unscheduled column plus the days of the displayed week. The current week
// shows today to Sunday (past days are hidden); future weeks show Monday to
// Sunday; the past cannot be browsed. Day columns scroll horizontally and each
// column scrolls vertically on its own. A task sits in the column of its
// planned Day (Task.dueDate, decision 015). In the current week, unfinished
// tasks from past days are surfaced first in Today with a muted "from <date>"
// tag; the stored date is left alone until the user moves the task. This
// pane never creates tasks (they are created in the Brain Dump pane).
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
const COLUMN_WIDTH = 224;
const NAV_SIZE = 44;

interface BoardColumn {
  id: string;
  title: string;
  items: ColumnItem[];
  isToday?: boolean;
}

export default function KanbanPane({
  refreshKey,
  onChanged,
  onEditTask,
}: {
  refreshKey: number;
  onChanged: () => void;
  onEditTask: (task: Task) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  const [scheduling, setScheduling] = useState<Task | null>(null);
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [jumpOpen, setJumpOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadTasks().then(setTasks);
    loadProjects().then(setProjects);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const todayKey = dateKey(new Date());
  const currentWeekStart = weekStartOf(parseDateKey(todayKey));
  // Never earlier than this week, even if the app stays open past Sunday.
  const shownWeekStart = weekStart.getTime() < currentWeekStart.getTime() ? currentWeekStart : weekStart;
  const atCurrentWeek = shownWeekStart.getTime() === currentWeekStart.getTime();
  const days = useMemo(() => weekDays(shownWeekStart, todayKey), [shownWeekStart.getTime(), todayKey]);
  const columns = useMemo(() => bucketTasks(tasks, days, todayKey), [tasks, days, todayKey]);
  const weekLabel = formatWeekLabel(days, new Date().getFullYear());
  const tomorrowKey = dateKey(addDays(parseDateKey(todayKey), 1));

  // The "Moved to ..." line clears itself.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  function changeWeek(delta: number) {
    setJumpOpen(false);
    if (delta < 0 && atCurrentWeek) return;
    setWeekStart(addWeeks(shownWeekStart, delta));
  }
  const projectName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.key, p.name);
    return map;
  }, [projects]);

  async function toggleComplete(task: Task) {
    await updateTask({
      ...task,
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : undefined,
    });
    onChanged();
  }

  async function moveTo(task: Task, requested: string | undefined) {
    setMoving(null);
    // Nothing earlier than today can be chosen.
    const day = requested ? clampToToday(requested, todayKey) : undefined;
    if (day === task.dueDate) return;
    // A time slot belongs to a day: Unscheduled drops it.
    await updateTask({ ...task, dueDate: day, startTime: day ? task.startTime : undefined });
    // A day outside the displayed week would look like the task vanished.
    if (day && !isDayInView(day, days)) setNotice(`Moved to ${formatDayLabel(day)}`);
    onChanged();
  }

  // "Schedule at": writes Task.startTime (decision 015). The block length is
  // durationMinutes, defaulting to 30 when the task has none yet.
  async function scheduleAt(task: Task, time: string) {
    setScheduling(null);
    await updateTask({ ...task, startTime: time, durationMinutes: task.durationMinutes ?? DEFAULT_TASK_MINUTES });
    onChanged();
  }

  async function unschedule(task: Task) {
    setScheduling(null);
    await updateTask({ ...task, startTime: undefined });
    onChanged();
  }

  const unscheduledColumn: BoardColumn = { id: 'unscheduled', title: 'Unscheduled', items: columns.unscheduled };
  const dayColumns: BoardColumn[] = days.map((d) => ({
    id: d.key,
    title: formatDayTitle(d.key, todayKey),
    items: columns.days[d.key] ?? [],
    isToday: d.key === todayKey,
  }));

  const renderColumn = (col: BoardColumn) => (
          <View key={col.id} style={styles.column}>
            <View style={styles.columnHeader}>
              <Text style={[styles.columnTitle, col.isToday && styles.columnTitleToday]} numberOfLines={1}>
                {col.title}
              </Text>
              <Text style={styles.count}>{col.items.length > 0 ? col.items.length : ''}</Text>
            </View>

            <ScrollView style={styles.columnList} showsVerticalScrollIndicator={false}>
              {col.items.map((item, index) => {
                const { task, overdueFrom } = item;
                const hovered = hoveredId === task.id;
                const duration = formatDuration(task.durationMinutes);
                const label = task.projectKey ? projectName.get(task.projectKey) : undefined;
                return (
                  <Pressable
                    key={task.id}
                    onHoverIn={() => setHoveredId(task.id)}
                    onHoverOut={() => setHoveredId((id) => (id === task.id ? null : id))}
                    style={[styles.card, index > 0 && styles.cardDivider, hovered && styles.cardHover]}
                  >
                    <Pressable
                      onPress={() => toggleComplete(task)}
                      style={styles.check}
                      accessibilityRole="button"
                      accessibilityLabel={task.completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
                    >
                      <Ionicons
                        name={task.completed ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={task.completed ? Colors.accent : Colors.textSecondary}
                      />
                    </Pressable>

                    <View style={styles.cardBody}>
                      <Pressable onPress={() => onEditTask(task)} accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`}>
                        <Text
                          style={[
                            styles.cardTitle,
                            task.completed && styles.cardTitleDone,
                            !task.completed && task.priority === 'low' && styles.cardTitleLow,
                          ]}
                        >
                          {task.title}
                        </Text>
                      </Pressable>
                      {(overdueFrom || label || duration || task.startTime || (!task.completed && task.priority === 'high')) && (
                        <View style={styles.meta}>
                          {overdueFrom && <Text style={styles.metaText}>from {formatShortDate(overdueFrom)}</Text>}
                          {!task.completed && task.priority === 'high' && (
                            <Ionicons name="flag" size={11} color={Colors.accentText} />
                          )}
                          {task.dueDate && task.startTime && <Text style={styles.metaText}>{task.startTime}</Text>}
                          {label && <Text style={styles.metaText}>{label}</Text>}
                          {duration && <Text style={styles.chip}>{duration}</Text>}
                        </View>
                      )}
                    </View>

                    {hovered && (
                      <View style={styles.actions}>
                        <Pressable
                          onPress={() => setScheduling(task)}
                          style={styles.moveBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Schedule ${task.title} at a time`}
                        >
                          <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => setMoving(task)}
                          style={styles.moveBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Move ${task.title} to day`}
                        >
                          <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                );
              })}
              {col.items.length === 0 && <Text style={styles.emptyColumn}>Nothing here</Text>}
            </ScrollView>
          </View>
  );

  return (
    <View style={styles.pane}>
      <Text style={styles.paneLabel}>WEEK</Text>

      <View style={styles.weekNav}>
        <Pressable
          onPress={() => changeWeek(-1)}
          disabled={atCurrentWeek}
          style={[styles.navBtn, atCurrentWeek && styles.navBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          accessibilityState={{ disabled: atCurrentWeek }}
        >
          <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => setJumpOpen((o) => !o)}
          style={styles.weekLabelBtn}
          accessibilityRole="button"
          accessibilityLabel="Jump to week"
        >
          <Text style={styles.weekLabel} numberOfLines={1}>
            {weekLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={() => changeWeek(1)}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="Next week"
        >
          <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            setJumpOpen(false);
            setWeekStart(currentWeekStart);
          }}
          disabled={atCurrentWeek}
          style={[styles.thisWeekBtn, atCurrentWeek && styles.navBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Go to this week"
          accessibilityState={{ disabled: atCurrentWeek }}
        >
          <Text style={styles.thisWeekText}>This week</Text>
        </Pressable>
      </View>

      {jumpOpen && (
        <View style={styles.jump}>
          <Text style={styles.menuHeading}>Jump to week containing</Text>
          <input
            type="date"
            min={todayKey}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (isDateKey(v) && v >= todayKey) {
                setWeekStart(weekStartOf(parseDateKey(v)));
                setJumpOpen(false);
              }
            }}
            style={domTimeStyle}
            aria-label="Jump to week containing"
          />
        </View>
      )}

      {notice && <Text style={styles.notice}>{notice}</Text>}

      <View style={styles.boardRow}>
        {renderColumn(unscheduledColumn)}
        <ScrollView horizontal style={styles.board} contentContainerStyle={styles.boardContent}>
          {dayColumns.map((col) => renderColumn(col))}
        </ScrollView>
      </View>

      {moving && (
        <View style={styles.menuOverlay}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMoving(null)} accessibilityLabel="Close menu" />
          <View style={styles.menu}>
            <Text style={styles.menuHeading} numberOfLines={1}>
              Move to
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <MenuRow label="Unscheduled" selected={!moving.dueDate} onPress={() => moveTo(moving, undefined)} />
              <MenuRow
                label="Today"
                detail={formatShortDate(todayKey)}
                selected={moving.dueDate === todayKey}
                onPress={() => moveTo(moving, todayKey)}
              />
              <MenuRow
                label="Tomorrow"
                detail={formatShortDate(tomorrowKey)}
                selected={moving.dueDate === tomorrowKey}
                onPress={() => moveTo(moving, tomorrowKey)}
              />
              <View style={styles.menuDate}>
                <Text style={styles.menuRowText}>Pick a date</Text>
                <input
                  type="date"
                  min={todayKey}
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isDateKey(v) && v >= todayKey) moveTo(moving, v);
                  }}
                  style={domTimeStyle}
                  aria-label="Move to date"
                />
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {scheduling && (
        <SchedulePopover
          key={scheduling.id}
          task={scheduling}
          onClose={() => setScheduling(null)}
          onSchedule={(time) => scheduleAt(scheduling, time)}
          onUnschedule={() => unschedule(scheduling)}
        />
      )}
    </View>
  );
}

// "Schedule at" popover: a time input for a task that already has a Day;
// "Choose a day first" for one that does not. Web <input type="time">, never
// DateTimePicker.
function SchedulePopover({
  task,
  onClose,
  onSchedule,
  onUnschedule,
}: {
  task: Task;
  onClose: () => void;
  onSchedule: (time: string) => void;
  onUnschedule: () => void;
}) {
  const [time, setTime] = useState(task.startTime ?? '09:00');
  const valid = toMinutes(time) !== null;
  const hasDay = !!task.dueDate;

  return (
    <View style={styles.menuOverlay}>
      <Pressable style={styles.menuBackdrop} onPress={onClose} accessibilityLabel="Close schedule" />
      <View style={styles.schedule}>
        <Text style={styles.menuHeading} numberOfLines={1}>
          Schedule at
        </Text>
        <Text style={styles.scheduleTask} numberOfLines={2}>
          {task.title}
        </Text>
        {hasDay ? (
          <>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={domTimeStyle}
              aria-label="Start time"
            />
            <Text style={styles.scheduleHint}>
              Block length {formatMinutes(task.durationMinutes ?? DEFAULT_TASK_MINUTES)}
              {task.durationMinutes ? '' : ' (default; set a duration on the task to change it)'}
            </Text>
            <View style={styles.scheduleFooter}>
              {task.startTime ? (
                <Pressable onPress={onUnschedule} accessibilityRole="button" accessibilityLabel="Unschedule">
                  <Text style={styles.scheduleDanger}>Unschedule</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <View style={{ flex: 1 }} />
              <Pressable onPress={onClose} style={styles.scheduleCancel} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={styles.scheduleCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => valid && onSchedule(time)}
                disabled={!valid}
                style={[styles.scheduleSave, !valid && styles.scheduleSaveDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Save schedule"
              >
                <Text style={styles.scheduleSaveText}>Save</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.scheduleHint}>Choose a day first. Use the calendar icon to move this task onto a day.</Text>
            <View style={styles.scheduleFooter}>
              <View style={{ flex: 1 }} />
              <Pressable onPress={onClose} style={styles.scheduleCancel} accessibilityRole="button" accessibilityLabel="Close">
                <Text style={styles.scheduleCancelText}>Close</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function MenuRow({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuRow} accessibilityRole="button" accessibilityLabel={`Move to ${label}`}>
      <Text style={[styles.menuRowText, selected && styles.menuRowTextSelected]}>{label}</Text>
      {detail && <Text style={styles.menuRowDetail}>{detail}</Text>}
      {selected && <Ionicons name="checkmark" size={16} color={Colors.accentText} />}
    </Pressable>
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
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  navBtn: { width: NAV_SIZE, height: NAV_SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  navBtnDisabled: { opacity: 0.35 },
  weekLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: NAV_SIZE, flexShrink: 1 },
  weekLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  thisWeekBtn: {
    paddingHorizontal: 14,
    height: NAV_SIZE,
    justifyContent: 'center',
    borderRadius: 14,
  },
  thisWeekText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  jump: {
    position: 'absolute',
    top: 92,
    left: 16,
    zIndex: 30,
    padding: 12,
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notice: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  boardRow: { flex: 1, flexDirection: 'row', marginTop: 4 },
  board: { flex: 1 },
  boardContent: { flexGrow: 1 },
  menuDate: { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  column: {
    width: COLUMN_WIDTH,
    paddingRight: 12,
    marginRight: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  columnTitle: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  columnTitleToday: { color: Colors.accentText },
  count: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  columnList: { flex: 1 },
  emptyColumn: { paddingVertical: 12, fontSize: 12, color: Colors.textSecondary },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, paddingHorizontal: 4 },
  cardDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  cardHover: { backgroundColor: Colors.background },
  check: { paddingTop: 1 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 14, color: Colors.textPrimary },
  cardTitleDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  cardTitleLow: { color: Colors.textSecondary },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  chip: {
    fontSize: 11,
    color: Colors.textSecondary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  actions: { flexDirection: 'row', alignItems: 'center' },
  moveBtn: { padding: 4 },
  schedule: {
    width: 260,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scheduleTask: { fontSize: 14, color: Colors.textPrimary, marginBottom: 10 },
  scheduleHint: { marginTop: 8, fontSize: 12, color: Colors.textSecondary },
  scheduleFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  scheduleDanger: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  scheduleCancel: { paddingHorizontal: 10, height: 34, justifyContent: 'center' },
  scheduleCancelText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  scheduleSave: { paddingHorizontal: 16, height: 34, justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.accent },
  scheduleSaveDisabled: { opacity: 0.4 },
  scheduleSaveText: { fontSize: 13, fontWeight: '700', color: Colors.onAccent },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(38, 37, 31, 0.2)',
    borderRadius: 16,
  },
  menu: {
    width: 240,
    maxHeight: '80%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
  },
  menuHeading: {
    paddingHorizontal: 14,
    paddingBottom: 6,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 36 },
  menuRowText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  menuRowTextSelected: { fontWeight: '700', color: Colors.accentText },
  menuRowDetail: { fontSize: 12, color: Colors.textSecondary },
});
