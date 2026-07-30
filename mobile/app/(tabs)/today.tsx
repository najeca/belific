import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import {
  getWeeklyEventsForDate,
  getStarterEventsForDate,
  getDayTypeForDate,
  computeCategoryStats,
  customToScheduleEvent,
  timeToMinutes,
  formatDateKey,
  type CategoryStat,
} from '../../lib/data';
import {
  loadCustomEventsForDate,
  loadCustomEvents,
  loadCustomCategories,
  loadNotificationsEnabled,
  shouldShowStarterRoutine,
} from '../../lib/storage';
import { scheduleEventNotifications } from '../../lib/notifications';
import AddEventModal from '../components/AddEventModal';
import type { ScheduleEvent, CustomEvent, CustomCategory } from '../../lib/types';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function formatHeaderDate(d: Date): string {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function currentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function findCurrentEvent(events: ScheduleEvent[], nowMins: number): ScheduleEvent | null {
  return events.find(
    (e) => timeToMinutes(e.start) <= nowMins && nowMins < timeToMinutes(e.end),
  ) ?? null;
}

function findNextEvent(events: ScheduleEvent[], nowMins: number): ScheduleEvent | null {
  return events.find((e) => timeToMinutes(e.start) > nowMins) ?? null;
}

function formatCountdown(endHHMM: string, nowMins: number): string {
  const remaining = timeToMinutes(endHHMM) - nowMins;
  if (remaining <= 0) return 'ending';
  if (remaining < 60) return `${remaining}m remaining`;
  const h = Math.floor(remaining / 60);
  const m = remaining % 60;
  return m === 0 ? `${h}h remaining` : `${h}h ${m}m remaining`;
}

function formatStartsIn(startHHMM: string, nowMins: number): string {
  const diff = timeToMinutes(startHHMM) - nowMins;
  if (diff <= 0) return 'now';
  if (diff < 60) return `Starts in ${diff}m`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `Starts in ${h}h` : `Starts in ${h}h ${m}m`;
}

function EventRow({
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
        <Ionicons name="ellipsis-horizontal" size={14} color={Colors.textSecondary} style={styles.editHint} />
      )}
    </>
  );

  if (onLongPress) {
    return (
      <Pressable
        style={({ pressed }) => [...rowStyle, pressed && { opacity: 0.85 }]}
        onPress={onLongPress}
        onLongPress={onLongPress}
        delayLongPress={500}
        accessibilityLabel={event.title}
        accessibilityHint="Tap to edit"
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={rowStyle}>{inner}</View>;
}

function StatCard({ stat }: { stat: CategoryStat }) {
  const hours = (stat.totalMinutes / 60).toFixed(1);
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{stat.icon}</Text>
      <Text style={styles.statHours}>{hours}h</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{stat.name}</Text>
    </View>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const dateKey = formatDateKey(today);

  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [customEventsList, setCustomEventsList] = useState<CustomEvent[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [nowMins, setNowMins] = useState(currentMinutes);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editEvent, setEditEvent] = useState<CustomEvent | undefined>(undefined);

  async function loadEvents() {
    const [starterMode, allCustom, categories, enabled] = await Promise.all([
      shouldShowStarterRoutine(),
      loadCustomEvents(),
      loadCustomCategories(),
      loadNotificationsEnabled(),
    ]);

    const todayCustom = allCustom.filter((e) => e.date === dateKey);
    setCustomEventsList(allCustom);
    setCustomCategories(categories);

    const template = starterMode
      ? getStarterEventsForDate(today)
      : getWeeklyEventsForDate(today);
    const customResolved = todayCustom.map((e) => customToScheduleEvent(e, categories));
    const merged = [...template, ...customResolved].sort(
      (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
    );
    setEvents(merged);

    if (enabled) {
      const dayEntries: Array<{ events: typeof merged; date: Date }> = [
        { events: merged, date: today },
      ];
      for (let i = 1; i < 7; i++) {
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + i);
        dayEntries.push({
          events: starterMode
            ? getStarterEventsForDate(futureDate)
            : getWeeklyEventsForDate(futureDate),
          date: futureDate,
        });
      }
      scheduleEventNotifications(dayEntries).catch(() => {});
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadEvents();
      const timer = setInterval(() => setNowMins(currentMinutes()), 60_000);
      return () => clearInterval(timer);
    }, []),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadEvents();
    setNowMins(currentMinutes());
    setRefreshing(false);
  }

  function handleEventSaved(_event: CustomEvent) {
    setModalVisible(false);
    setEditEvent(undefined);
    loadEvents();
  }

  function handleModalClose() {
    setModalVisible(false);
    setEditEvent(undefined);
  }

  function openEditModal(scheduleEvent: ScheduleEvent) {
    const found = customEventsList.find((c) => c.id === scheduleEvent.id);
    if (!found) return;
    setEditEvent(found);
    setModalVisible(true);
  }

  const dayType = getDayTypeForDate(today);
  const currentEvent = findCurrentEvent(events, nowMins);
  const nextEvent = findNextEvent(events, nowMins);
  const stats = computeCategoryStats(events, customCategories);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Today</Text>
            <Text style={styles.subtitle}>{formatHeaderDate(today)}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: dayType.color + '33' }]}>
            <Text style={[styles.statusText, { color: dayType.color }]}>{dayType.name}</Text>
          </View>
        </View>

        {/* NOW card */}
        {currentEvent ? (
          <View style={styles.nowCard}>
            <View style={styles.nowBorder} />
            <View style={styles.nowContent}>
              <Text style={styles.nowLabel}>Now</Text>
              <Text style={styles.nowTitle}>{currentEvent.icon} {currentEvent.title}</Text>
              <Text style={styles.nowTime}>{currentEvent.start} – {currentEvent.end}</Text>
              <Text style={styles.nowCountdown}>{formatCountdown(currentEvent.end, nowMins)}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.nowCard, styles.emptyNowCard]}>
            <View style={[styles.nowBorder, { backgroundColor: Colors.textSecondary }]} />
            <View style={styles.nowContent}>
              <Text style={styles.nowLabel}>Now</Text>
              <Text style={[styles.nowTitle, { color: Colors.textSecondary }]}>No current event</Text>
            </View>
          </View>
        )}

        {/* NEXT UP card */}
        {nextEvent && (
          <View style={styles.nextCard}>
            <View style={[styles.nowBorder, { backgroundColor: Colors.border }]} />
            <View style={styles.nowContent}>
              <Text style={styles.nextLabel}>Next up</Text>
              <Text style={styles.nextTitle}>{nextEvent.icon} {nextEvent.title}</Text>
              <Text style={styles.nextTime}>{formatStartsIn(nextEvent.start, nowMins)}</Text>
            </View>
          </View>
        )}

        {/* Summary row */}
        {stats.length > 0 && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Today's breakdown</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
              {stats.map((s) => (
                <StatCard key={s.category} stat={s} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Full Schedule */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>Full schedule</Text>
          {events.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No events scheduled</Text>
              <Text style={styles.emptyStateSubtext}>Tap + to add your first event</Text>
            </View>
          ) : (
            <View style={styles.eventListContainer}>
              {events.map((e, i) => (
                <EventRow
                  key={e.id}
                  event={e}
                  onLongPress={e.isCustom ? () => openEditModal(e) : undefined}
                  isLast={i === events.length - 1}
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
        accessibilityLabel="Add event"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color={Colors.onAccent} />
      </TouchableOpacity>

      <AddEventModal
        visible={modalVisible}
        date={today}
        onClose={handleModalClose}
        onSaved={handleEventSaved}
        editEvent={editEvent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  nowCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 10,
    minHeight: 90,
  },
  emptyNowCard: {
    opacity: 0.6,
  },
  nowBorder: {
    width: 4,
    backgroundColor: Colors.accent,
  },
  nowContent: {
    flex: 1,
    padding: 16,
  },
  nowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accentText,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  nowTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  nowTime: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  nowCountdown: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.accentText,
  },
  nextCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 20,
    minHeight: 72,
  },
  nextLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  nextTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  nextTime: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  statsScroll: {
    flexDirection: 'row',
  },
  statCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  statIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  statHours: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    maxWidth: 70,
    textAlign: 'center',
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
    alignItems: 'flex-start',
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
  editHint: {
    paddingRight: 12,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 40,
    alignItems: 'center',
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
});
