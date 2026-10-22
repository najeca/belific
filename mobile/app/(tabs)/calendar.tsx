import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { radius, type ColorTokens } from '../../lib/tokens';
import { customToScheduleEvent, formatTime, getStarterEventsForDate, getWeeklyEventsForDate } from '../../lib/data';
import { loadCustomCategories, loadCustomEvents, loadListsRaw, loadProjects, loadTasksRaw, shouldShowStarterRoutine } from '../../lib/storage';
import { dateKey, formatDayLabel, parseDateKey } from '../../lib/kanban';
import { calendarTitle, minutesOfDay, stepAnchor, visibleDayKeys } from '../../lib/calendarView';
import type { CalendarView } from '../../lib/paneState';
import { toTime } from '../../lib/timebox';
import { kv } from '../../lib/kv';
import { askCalendarAccess, calendarAccess, loadDeviceEvents, openPhoneSettings, DEVICE_CALENDAR_TEXT, type CalendarAccess, type DeviceOccurrence } from '../../lib/deviceCalendar';
import type { DaySource } from '../../lib/phoneDay';
import type { CustomCategory, CustomEvent, ScheduleEvent } from '../../lib/types';
import { AddButton, ScreenHeader, Segmented } from '../../components/phone/chrome';
import { QuickAdd, type QuickAddWhere } from '../../components/phone/QuickAdd';
import { TaskDetails, type DetailsTarget } from '../../components/phone/TaskDetails';
import { refreshTaskReminders } from '../../components/phone/reminderScheduler';
import { DayView, type DayData } from '../../components/phone/calendar/DayView';
import { MonthView, WeekView } from '../../components/phone/calendar/WeekMonth';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { dayItems } from '../../lib/phoneWeek';
import { PAGE_ACTIVE_X, PAGE_FAIL_Y, pageTurn } from '../../lib/touchRules';
import { haptic } from '../../components/phone/touch';
import { useStyles, useTheme } from '../../components/phone/theme';
import { Button, IconButton } from '../../components/phone/ui';
import { inter, type } from '../../components/phone/type';
import AddEventModal from '../components/AddEventModal';

// The Calendar on the iPhone (PLAN_phone P8, P9): Day, Week and Month at the top; a sideways swipe (or
// the arrows) moves to the next or previous day, week or month, Today comes back. A vertical scroll
// always wins over the swipe (it needs a clearly sideways move first, lib/touchRules.ts). Day is a touch timeline
// (components/phone/calendar/DayView.tsx); a tap on an empty slot adds a task at that time (Cancel is
// one tap). The iPhone's own calendars are read only, asked for in context as before.
const CALENDAR_PROMPT_KEY = 'belific_calendar_prompt_dismissed';

const make = (c: ColorTokens) => ({
  screen: { flex: 1, backgroundColor: c.background },
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  title: { ...inter(600), fontSize: 15, color: c.textPrimary, flex: 1, textAlign: 'center' as const },
  todayBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, justifyContent: 'center' as const },
  todayText: { ...inter(600), fontSize: 13, color: c.textPrimary },
  card: { marginHorizontal: 12, marginBottom: 8, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, gap: 8 },
  cardTitle: { ...inter(600), fontSize: 15, color: c.textPrimary },
  cardBody: { ...type.meta, color: c.textSecondary },
});

export default function CalendarScreen() {
  const s = useStyles(make);
  const { c } = useTheme();
  const [view, setView] = useState<CalendarView>('day');
  const [todayKey, setTodayKey] = useState(() => dateKey(new Date()));
  const [anchor, setAnchor] = useState(todayKey);
  const [nowMin, setNowMin] = useState(() => minutesOfDay(new Date()));
  const [data, setData] = useState<DayData>({ tasks: [], events: [], device: [], projects: [], lists: [] });
  const [custom, setCustom] = useState<CustomEvent[]>([]);
  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [starter, setStarter] = useState(false);
  const [device, setDevice] = useState<DeviceOccurrence[]>([]);
  const [access, setAccess] = useState<CalendarAccess | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(true);
  const [details, setDetails] = useState<DetailsTarget | null>(null);
  const [adding, setAdding] = useState<QuickAddWhere | null>(null);
  const [editEvent, setEditEvent] = useState<CustomEvent | undefined>();

  const load = useCallback(async () => {
    const [tasks, ev, cats, st, projects, lists] = await Promise.all([loadTasksRaw(), loadCustomEvents(), loadCustomCategories(), shouldShowStarterRoutine(), loadProjects(), loadListsRaw()]);
    setTodayKey(dateKey(new Date()));
    setNowMin(minutesOfDay(new Date()));
    setCustom(ev);
    setCategories(cats);
    setStarter(st);
    setData((d) => ({ ...d, tasks, projects, lists }));
    refreshTaskReminders();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
      calendarAccess().then(setAccess);
      kv.getItem(CALENDAR_PROMPT_KEY)
        .then((v) => setPromptDismissed(v === '1'))
        .catch(() => setPromptDismissed(false));
      const timer = setInterval(() => setNowMin(minutesOfDay(new Date())), 60_000);
      return () => clearInterval(timer);
    }, [load]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') calendarAccess().then(setAccess);
    });
    return () => sub.remove();
  }, []);

  const keys = useMemo(() => visibleDayKeys(view, anchor), [view, anchor]);
  // The iPhone's own events for what is on screen (read only, in memory only).
  useEffect(() => {
    if (access !== 'granted') {
      setDevice([]);
      return;
    }
    let live = true;
    loadDeviceEvents(keys[0], keys[keys.length - 1])
      .then((list) => live && setDevice(list))
      .catch(() => live && setDevice([]));
    return () => {
      live = false;
    };
  }, [access, keys]);

  // The old events of one day (decision 4: kept, read only): the weekly template and the phone's own.
  const eventsOn = useCallback(
    (key: string): ScheduleEvent[] => {
      const d = parseDateKey(key);
      const template = starter ? getStarterEventsForDate(d) : getWeeklyEventsForDate(d);
      return [...template, ...custom.filter((e) => e.date === key).map((e) => customToScheduleEvent(e, categories))];
    },
    [starter, custom, categories],
  );
  const dayData = useMemo<DayData>(() => ({ ...data, events: eventsOn(anchor), device }), [data, eventsOn, anchor, device]);

  function open(src: DaySource) {
    if (src.kind === 'task') setDetails({ task: src.task, projected: src.projected });
    else if (src.kind === 'event' && src.event.isCustom) {
      const ev = custom.find((e) => e.id === src.event.id);
      if (ev) setEditEvent(ev);
    }
  }

  const step = (delta: number) => setAnchor((a) => stepAnchor(view, a, delta));
  const [pageWidth, setPageWidth] = useState(390);
  const swipe = Gesture.Pan()
    .activeOffsetX([-PAGE_ACTIVE_X, PAGE_ACTIVE_X])
    .failOffsetY([-PAGE_FAIL_Y, PAGE_FAIL_Y])
    .runOnJS(true)
    .onEnd((e) => {
      const turn = pageTurn(e.translationX, e.velocityX, pageWidth);
      if (turn !== 0) {
        haptic('light');
        step(turn);
      }
    });
  const itemsOf = useCallback((key: string) => dayItems({ tasks: data.tasks, dayKey: key, todayKey, events: eventsOn(key), device }), [data.tasks, todayKey, eventsOn, device]);
  const openDay = (key: string) => {
    setAnchor(key);
    setView('day');
  };
  const viewName = view === 'day' ? 'day' : view === 'week' ? 'week' : 'month';
  const dismiss = () => {
    setPromptDismissed(true);
    kv.setItem(CALENDAR_PROMPT_KEY, '1').catch(() => {});
  };

  return (
    <View style={s.screen}>
      <ScreenHeader title="Calendar" />
      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
        <Segmented
          a11y="Calendar view"
          value={view}
          onChange={setView}
          options={[
            { key: 'day', label: 'Day' },
            { key: 'week', label: 'Week' },
            { key: 'month', label: 'Month' },
          ]}
        />
      </View>
      <View style={s.bar}>
        <IconButton name="chevron-back" onPress={() => step(-1)} a11y={`Previous ${viewName}`} color={c.textSecondary} />
        <Text style={s.title} numberOfLines={1} {...({ dataSet: { calTitle: anchor } } as object)}>
          {calendarTitle(view, anchor)}
        </Text>
        <IconButton name="chevron-forward" onPress={() => step(1)} a11y={`Next ${viewName}`} color={c.textSecondary} />
        <Pressable style={s.todayBtn} onPress={() => setAnchor(todayKey)} accessibilityRole="button" accessibilityLabel="Go to today">
          <Text style={s.todayText}>Today</Text>
        </Pressable>
      </View>
      {(access === 'undetermined' || access === 'denied') && !promptDismissed ? (
        <View style={s.card} accessibilityLabel="iPhone calendars">
          <Text style={s.cardTitle}>{access === 'denied' ? DEVICE_CALENDAR_TEXT.deniedTitle : DEVICE_CALENDAR_TEXT.askTitle}</Text>
          <Text style={s.cardBody}>{access === 'denied' ? DEVICE_CALENDAR_TEXT.deniedBody : DEVICE_CALENDAR_TEXT.askBody}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {access === 'denied' ? (
              <Button label={DEVICE_CALENDAR_TEXT.openSettings} kind="primary" onPress={openPhoneSettings} />
            ) : (
              <Button label={DEVICE_CALENDAR_TEXT.askButton} kind="primary" onPress={() => void askCalendarAccess().then(setAccess)} />
            )}
            <Button label={DEVICE_CALENDAR_TEXT.notNow} onPress={dismiss} />
          </View>
        </View>
      ) : null}
      <GestureDetector gesture={swipe} touchAction="pan-y">
        <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.pane }} onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)} {...({ dataSet: { calPage: view } } as object)}>
          {view === 'day' ? (
            <DayView
              dayKey={anchor}
              todayKey={todayKey}
              nowMin={nowMin}
              data={dayData}
              onOpen={open}
              onAddAt={(m) => setAdding({ dueDate: anchor, startTime: toTime(m), durationMinutes: 30, label: `${formatDayLabel(anchor)} at ${formatTime(toTime(m))}` })}
            />
          ) : view === 'week' ? (
            <WeekView anchor={anchor} todayKey={todayKey} itemsOf={itemsOf} onPick={openDay} />
          ) : (
            <MonthView anchor={anchor} todayKey={todayKey} itemsOf={itemsOf} onPick={openDay} />
          )}
        </View>
      </GestureDetector>
      <AddButton onPress={() => setAdding({ dueDate: anchor, label: anchor === todayKey ? 'Today' : formatDayLabel(anchor) })} a11y="Add a task on this day" />
      <QuickAdd visible={!!adding} where={adding ?? { label: '' }} onClose={() => setAdding(null)} onAdded={() => void load()} />
      <TaskDetails target={details} onClose={() => setDetails(null)} onChanged={() => void load()} />
      <AddEventModal
        visible={!!editEvent}
        date={parseDateKey(anchor)}
        editEvent={editEvent}
        onClose={() => setEditEvent(undefined)}
        onSaved={() => {
          setEditEvent(undefined);
          void load();
        }}
      />
    </View>
  );
}
