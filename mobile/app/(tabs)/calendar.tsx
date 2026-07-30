import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import {
  getWeeklyEventsForDate,
  customToScheduleEvent,
  timeToMinutes,
  formatDateKey,
} from '../../lib/data';
import { loadCustomEvents, loadCustomCategories } from '../../lib/storage';
import { EventForm } from '../components/AddEventModal';
import type { ScheduleEvent, CustomEvent, CustomCategory } from '../../lib/types';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function buildCalendarWeeks(year: number, month: number): (number | null)[][] {
  const firstDayJS = new Date(year, month, 1).getDay();
  const firstDayMon = (firstDayJS + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(firstDayMon).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function EventRowCompact({
  event,
  onLongPress,
  isLast,
}: {
  event: ScheduleEvent;
  onLongPress?: () => void;
  isLast?: boolean;
}) {
  const rowStyle = [styles.eventRow, isLast && styles.eventRowLast];
  const inner = (
    <>
      <View style={[styles.eventBar, { backgroundColor: event.color }]} />
      <View style={styles.eventTimes}>
        <Text style={styles.eventStart}>{event.start}</Text>
        <Text style={styles.eventEnd}>{event.end}</Text>
      </View>
      <Text style={styles.eventIcon}>{event.icon}</Text>
      {event.priority === 'high' && (
        <Ionicons name="flag" size={12} color={Colors.accentText} style={styles.priorityFlag} />
      )}
      <Text
        style={[
          styles.eventTitle,
          event.priority === 'high' && styles.eventTitleHigh,
          event.priority === 'low' && styles.eventTitleLow,
        ]}
        numberOfLines={2}
      >
        {event.title}
      </Text>
      {event.isCustom && (
        <Ionicons name="ellipsis-horizontal" size={14} color={Colors.textSecondary} style={{ paddingRight: 12 }} />
      )}
    </>
  );

  if (onLongPress) {
    return (
      <Pressable
        style={({ pressed }) => [...rowStyle, pressed && { opacity: 0.85 }]}
        onPress={onLongPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        accessibilityLabel={event.title}
        accessibilityHint="Tap to edit"
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={rowStyle}>{inner}</View>;
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const realToday = new Date();
  const [viewYear, setViewYear] = useState(realToday.getFullYear());
  const [viewMonth, setViewMonth] = useState(realToday.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(realToday.getDate());
  const [allCustomEvents, setAllCustomEvents] = useState<CustomEvent[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  // One Modal, one visibility flag. `mode` picks which content it shows —
  // switching between them just swaps the rendered child, no separate
  // Modal instances to close/reopen (that chaining is what onDetailDismiss
  // used to exist for).
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<'detail' | 'edit' | 'add' | null>(null);
  const [activeEvent, setActiveEvent] = useState<CustomEvent | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      loadCustomEvents().then(setAllCustomEvents);
      loadCustomCategories().then(setCustomCategories);
    }, []),
  );

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function hasEvents(day: number): boolean {
    const date = new Date(viewYear, viewMonth, day);
    const key = formatDateKey(date);
    return allCustomEvents.some(e => e.date === key);
  }

  function getEventsForDay(day: number): ScheduleEvent[] {
    const date = new Date(viewYear, viewMonth, day);
    const key = formatDateKey(date);
    const weekly = getWeeklyEventsForDate(date);
    const custom = allCustomEvents
      .filter(e => e.date === key)
      .map(e => customToScheduleEvent(e, customCategories));
    return [...weekly, ...custom].sort(
      (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
    );
  }

  const weeks = buildCalendarWeeks(viewYear, viewMonth);

  const isToday = (day: number) =>
    day === realToday.getDate() &&
    viewMonth === realToday.getMonth() &&
    viewYear === realToday.getFullYear();

  const selectedDate = selectedDay != null
    ? new Date(viewYear, viewMonth, selectedDay)
    : realToday;

  const detailEvents = selectedDay != null ? getEventsForDay(selectedDay) : [];

  function formatDetailHeader(d: Date): string {
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  // Called after a successful save or delete from the form. Editing an
  // existing event drops back to the day list (decision: multi-edit in one
  // sitting is a normal flow, don't force a reopen). Adding a brand-new
  // event closes the sheet entirely, matching the FAB's old standalone
  // behavior — there's no prior detail view to return to in that path.
  function handleEventSaved() {
    loadCustomEvents().then(setAllCustomEvents);
    if (mode === 'edit') {
      setActiveEvent(undefined);
      setMode('detail');
    } else {
      setModalVisible(false);
      setMode(null);
      setActiveEvent(undefined);
    }
  }

  // Cancel / close-X from within the form. Same detail-vs-close split as
  // handleEventSaved above.
  function handleFormClose() {
    if (mode === 'edit') {
      setActiveEvent(undefined);
      setMode('detail');
    } else {
      setModalVisible(false);
      setMode(null);
      setActiveEvent(undefined);
    }
  }

  function openDetail(day: number) {
    setSelectedDay(day);
    setMode('detail');
    setModalVisible(true);
  }

  // Swaps the sheet's content from the day list to the edit form — no
  // Modal close/reopen, so no iOS pageSheet dismiss-animation race to work
  // around.
  function openEditModal(scheduleEvent: ScheduleEvent) {
    const found = allCustomEvents.find(c => c.id === scheduleEvent.id);
    if (!found) return;
    setActiveEvent(found);
    setMode('edit');
  }

  function openAddModal() {
    setActiveEvent(undefined);
    setMode('add');
    setModalVisible(true);
  }

  // The only place that fires when the sheet is actually, fully gone —
  // whether closed via the X button, Android back, or an iOS swipe-down
  // the code above never initiated. Runs unconditionally, independent of
  // whatever handler (or lack of one) already tried to close it, so state
  // can never drift out of sync with what's really on screen.
  function handleModalDismiss() {
    setModalVisible(false);
    setMode(null);
    setActiveEvent(undefined);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
      </View>

      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity
          onPress={prevMonth}
          style={styles.navBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Previous month"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity
          onPress={nextMonth}
          style={styles.navBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Next month"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={styles.weekRow}>
        {DAY_HEADERS.map(d => (
          <Text key={d} style={styles.dayHeader}>{d}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => (
              <TouchableOpacity
                key={di}
                style={styles.dayCell}
                onPress={() => {
                  if (day != null) {
                    openDetail(day);
                  }
                }}
                disabled={day == null}
                activeOpacity={0.7}
              >
                {day != null ? (
                  <View style={[
                    styles.dayCellInner,
                    isToday(day) && styles.todayCellInner,
                    selectedDay === day && !isToday(day) && styles.selectedCellInner,
                  ]}>
                    <Text style={[
                      styles.dayText,
                      isToday(day) && styles.todayText,
                    ]}>
                      {day}
                    </Text>
                    {hasEvents(day) && (
                      <View style={[
                        styles.dot,
                        isToday(day) && styles.dotOnToday,
                      ]} />
                    )}
                  </View>
                ) : (
                  <View style={styles.dayCellInner} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={openAddModal}
        activeOpacity={0.85}
        accessibilityLabel="Add event"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color={Colors.onAccent} />
      </TouchableOpacity>

      {/* Unified day-detail / edit / add sheet — one Modal, content swaps by mode */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
        onDismiss={handleModalDismiss}
      >
        {mode === 'detail' && (
          <View style={[styles.detailContainer, { paddingTop: insets.top + 16 }]}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>{formatDetailHeader(selectedDate)}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.detailScroll}
              contentContainerStyle={styles.detailContent}
              showsVerticalScrollIndicator={false}
            >
              {detailEvents.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateTitle}>No events scheduled</Text>
                  <Text style={styles.emptyStateSubtext}>Tap + to add your first event</Text>
                </View>
              ) : (
                <View style={styles.eventListContainer}>
                  {detailEvents.map((e, i) => (
                    <EventRowCompact
                      key={e.id}
                      event={e}
                      onLongPress={e.isCustom ? () => openEditModal(e) : undefined}
                      isLast={i === detailEvents.length - 1}
                    />
                  ))}
                </View>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        )}
        {(mode === 'edit' || mode === 'add') && (
          <EventForm
            date={selectedDate}
            onClose={handleFormClose}
            onSaved={handleEventSaved}
            editEvent={activeEvent}
          />
        )}
      </Modal>
    </View>
  );
}

const CELL_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  grid: {
    paddingHorizontal: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayHeader: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    paddingBottom: 8,
  },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellInner: {
    width: CELL_SIZE - 4,
    height: CELL_SIZE - 4,
    borderRadius: (CELL_SIZE - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCellInner: {
    backgroundColor: Colors.accent,
  },
  selectedCellInner: {
    backgroundColor: Colors.surface,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  todayText: {
    color: Colors.onAccent,
    fontWeight: '700',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
    marginTop: 2,
  },
  dotOnToday: {
    backgroundColor: Colors.onAccent,
  },
  fab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailScroll: { flex: 1 },
  detailContent: { paddingBottom: 20 },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 40,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    opacity: 0.7,
  },
  eventListContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  eventRowLast: {
    borderBottomWidth: 0,
  },
  eventBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  eventTimes: {
    width: 52,
    paddingVertical: 12,
    paddingLeft: 10,
  },
  eventStart: {
    fontSize: 11,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  eventEnd: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  eventIcon: {
    fontSize: 16,
    marginHorizontal: 8,
  },
  eventTitle: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    paddingRight: 4,
    paddingVertical: 12,
  },
  eventTitleHigh: {
    fontWeight: '700',
  },
  eventTitleLow: {
    color: Colors.textSecondary,
  },
  priorityFlag: {
    marginRight: 4,
  },
});
