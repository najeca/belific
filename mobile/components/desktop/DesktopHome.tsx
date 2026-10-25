import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { pressStyle } from './pressStyle';
import BrainDumpPane from './BrainDumpPane';
import MissedPanel from './MissedPanel';
import UndoBar from './UndoBar';
import KanbanPane from './KanbanPane';
import TimeboxPane from './TimeboxPane';
import DragProvider from './DragProvider';
import ProfileMenu from './ProfileMenu';
import SettingsPage from './SettingsPage';
import LabelsOverlay from './LabelsOverlay';
import ProgressPage from './ProgressPage';
import QuestsPage from './QuestsPage';
import AnalyticsPage from './AnalyticsPage';
import TrashPage from './TrashPage';
import PlanningFlow from './PlanningFlow';
import SignInPage from './SignInPage';
import { DAY_START_EVENT } from './useDayStart';
import { setShowStreaks, setStreaks } from './streakStore';
import { closePopover, isPopoverOpen } from './Popover';
import { setHomeActive } from './viewActive';
import AccountChoiceModal from './AccountChoiceModal';
import TimerWidget from './TimerWidget';
import ScopePrompt from './ScopePrompt';
import TaskDetailPanel from './TaskDetailPanel';
import ShortcutHelp from './ShortcutHelp';
import { useHomeShortcuts } from './useHomeShortcuts';
import CalendarPane from './CalendarPane';
import Sidebar from './Sidebar';
import QuickCapture from './QuickCapture';
import SearchPalette from './SearchPalette';
import { usePaneState } from './usePaneState';
import { refreshFeatures, useFeatures } from './featureStore';
import { refreshCutMin } from './cutStore';
import { refreshDefaultReminders } from './reminderStore';
import { refreshVibrant } from './vibrantStore';
import { refreshTheme } from './themeStore';
import { outlinedBtn, outlinedBtnOn, outlinedBtnText, segBtn, segBtnHover, segBtnOn, segLabel, segLabelOn, segTrack } from './ui';
import { restorePomodoro } from './pomodoroStore';
import { startIcsRefresh } from './icsStore';
import { closeOverlay, isOverlayOpen, openDetail, openOverlay, requestGoToday, restoreNewColorsOk, restoreSelectedList, selectList, setChangeNotifier, useOverlay, useReveal } from './uiStore';
import { dateKey as todayDateKey } from '../../lib/kanban';
import { SIDEBAR_DOCK_MIN, SIDEBAR_WIDTH, TIMEBOX_WIDTH, responsiveLayout, showCalendar, sidebarToggle, timeboxToggle, toggleCenter, toggleOnlyToday, type CalendarView } from '../../lib/paneState';
import { kv } from '../../lib/kv';
import { isTextEntryTarget } from '../../lib/editable';
import { dateKey } from '../../lib/kanban';
import { computeStreaks } from '../../lib/seriesStreak';
import { loadRoutineCompletions, loadTasksRaw } from '../../lib/storage';
import { loadLabels } from '../../lib/labels';
import { EMPTY_FILTER, FILTER_KEY, parseFilter, pruneFilter, serializeFilter, type TaskFilter } from '../../lib/taskFilter';
import { listenForAuthCallbacks, refreshRevokePending, restoreAccountChoice, retryPendingRevoke } from '../../lib/desktopAuth';
import { sendNotifyPayload } from '../../lib/desktopNotify';
import { runFullSync, subscribeSyncStatus } from '../../lib/sync';

// Decision 009: the three-pane workspace: Brain Dump, weekly kanban and
// Timebox. Since 2.26.0 they are three full height columns with nothing across
// the top of the window: the left pane (logo and hide button over the list),
// the centre pane (its own top row: Tasks or Calendar, Only today, Quests and
// the profile, then the board or the Calendar) and the right pane (only the
// Timebox, with its hide button). lib/paneState.ts responsiveLayout decides what
// each window width shows. The day actions are in the profile menu. Panes share one refresh counter so a change in one (a promoted Brain Dump item, a moved
// task) shows up in the others without extra plumbing. The task modal is a
// centred overlay on this screen, never a new screen. DragProvider runs drag
// and drop between the three panes (checkpoint 4).
export default function DesktopHome() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilterState] = useState<TaskFilter>(EMPTY_FILTER);
  const [labelKeys, setLabelKeys] = useState<string[] | null>(null);
  // Home (the three panes), or the Settings or Labels page (checkpoint 9,
  // decision 025). The panes stay mounted but hidden and inert, so the week,
  // the filter and the notification payload (sent from this component) carry on.
  const [view, setView] = useState<View_>('home');
  const previous = useRef<View_>('home');
  const panes = useRef<View>(null);
  // Where focus was when a page was opened, so Back and Escape can return it
  // there (the profile icon when it was opened from the profile menu).
  const viewRef = useRef<View_>('home');
  viewRef.current = view;
  const openers = useRef<Opener[]>([]);
  const restore = useRef<Opener | null>(null);
  const showView = useCallback((next: View_) => {
    // The control that opened the page, taken before the popover closes. A
    // control inside a popover goes away with it, so the profile icon stands in.
    if (next !== viewRef.current) openers.current.push(captureOpener());
    // Never carry an open popover (or a half done drag) into another view.
    closePopover();
    setView((cur) => {
      previous.current = cur;
      return next;
    });
  }, []);
  const goBack = useCallback(() => {
    closePopover();
    restore.current = openers.current.pop() ?? null;
    setView((cur) => {
      // Labels and Sign in go back to Settings when that is where they were opened.
      const back = cur === 'signin' && previous.current === 'settings' ? 'settings' : 'home';
      previous.current = cur;
      return back;
    });
  }, []);
  // After the view changes back, focus returns to where it came from.
  useEffect(() => {
    const o = restore.current;
    if (!o) return;
    restore.current = null;
    const id = setTimeout(() => focusOpener(o), 0);
    return () => clearTimeout(id);
  }, [view]);
  // Escape leaves a page (Settings, Labels, Progress, Sign in), unless a popover has it or
  // the key is going to a field.
  useEffect(() => {
    if (view === 'home') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isPopoverOpen() || isOverlayOpen() || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      goBack();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [view, goBack]);
  useEffect(() => {
    setHomeActive(view === 'home');
    // display none already removes the panes from focus and pointer input; the
    // inert attribute makes it explicit for anything else (scripts, readers).
    const el = panes.current as unknown as HTMLElement | null;
    if (el && typeof el.toggleAttribute === 'function') el.toggleAttribute('inert', view !== 'home');
  }, [view]);
  // File, Settings in the app menu.
  useEffect(() => globalThis.belificDesktop?.menu?.onOpenSettings(() => showView('settings')), [showView]);
  // File, Progress.
  useEffect(() => globalThis.belificDesktop?.menu?.onOpenProgress?.(() => showView('progress')), [showView]);
  // Validated sign in callbacks from the main process (decision 012).
  useEffect(() => listenForAuthCallbacks(), []);
  // An unanswered account choice survives a relaunch, and a sign out whose
  // server revoke failed is retried on launch and when the network returns.
  useEffect(() => {
    restoreAccountChoice();
    refreshRevokePending().then(() => retryPendingRevoke());
    const online = () => retryPendingRevoke();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);
  // Notifications (decision 017): tell the main process what is coming up in
  // the next 48 hours whenever data changes, after a sync, and every minute
  // (so a day change is picked up). While the window is hidden in the tray the
  // main process asks for a sync and a resend now and then.
  useEffect(() => {
    sendNotifyPayload();
  }, [refreshKey]);
  // Streaks (checkpoint 11) are worked out from the stored rows, never stored:
  // again whenever data changes, after a sync, and when the day changes.
  const refreshStreaks = useCallback(async () => {
    try {
      const [tasks, completions] = await Promise.all([loadTasksRaw(), loadRoutineCompletions()]);
      const today = dateKey(new Date());
      setStreaks(computeStreaks(tasks, completions, today), today);
    } catch {
      // keep the last result
    }
  }, []);
  useEffect(() => {
    refreshStreaks();
  }, [refreshKey, refreshStreaks]);
  // "Show streaks" (desktop setting), refreshed when Settings changes it.
  useEffect(() => {
    let alive = true;
    const load = () => {
      globalThis.belificDesktop?.settings
        .get()
        .then((s) => alive && setShowStreaks(s.showStreaks !== false))
        .catch(() => {});
    };
    load();
    window.addEventListener(DAY_START_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(DAY_START_EVENT, load);
    };
  }, []);
  useEffect(() => {
    const interval = setInterval(() => {
      sendNotifyPayload();
      refreshStreaks();
    }, 60 * 1000);
    let lastSuccess: string | null = null;
    const unsubscribe = subscribeSyncStatus((s) => {
      if (s.lastSuccessAt !== lastSuccess) {
        lastSuccess = s.lastSuccessAt;
        sendNotifyPayload();
        refreshStreaks();
      }
    });
    const offTick = globalThis.belificDesktop?.notify.onTick(() => {
      runFullSync().catch(() => {});
      sendNotifyPayload();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
      offTick?.();
    };
  }, [refreshStreaks]);
  const onChanged = useCallback(() => setRefreshKey((k) => k + 1), []);
  // Modules that are not components (the timer, the commands) ask the panes to
  // reload through this.
  useEffect(() => {
    setChangeNotifier(onChanged);
    return () => setChangeNotifier(null);
  }, [onChanged]);
  // The list the left pane showed last time (local UI state).
  useEffect(() => {
    restoreSelectedList();
    restoreNewColorsOk();
  }, []);
  const overlay = useOverlay();
  const features = useFeatures();
  // The power feature toggles (user_settings) are read again whenever data changes.
  useEffect(() => {
    refreshFeatures();
    refreshCutMin();
    refreshDefaultReminders();
    refreshVibrant();
    refreshTheme();
  }, [refreshKey]);
  useEffect(() => {
    restorePomodoro();
  }, []);
  // Imported calendar subscriptions (build plan phase 8): refreshed when due,
  // checked every minute while the window is visible.
  useEffect(() => startIcsRefresh(), []);
  // The layout (panes open or hidden, Kanban or Calendar, the Calendar view, show
  // only today), remembered in user_settings with a local fallback.
  const [paneState, updatePanes] = usePaneState();
  const windowWidth = useWindowWidth();
  // Opened over the centre for the moment on a narrow window; never remembered.
  const [overlayOpen, setOverlayOpen] = useState({ sidebar: false, timebox: false });
  const layout = responsiveLayout(paneState, windowWidth, overlayOpen);
  const toggleSidebar = useCallback(() => {
    const r = sidebarToggle(paneState, windowWidth, overlayOpen.sidebar);
    if (r.state !== paneState) updatePanes(() => r.state);
    setOverlayOpen((o) => ({ ...o, sidebar: r.overlayOpen }));
  }, [paneState, windowWidth, overlayOpen.sidebar, updatePanes]);
  const toggleTimebox = useCallback(() => {
    const r = timeboxToggle(paneState, windowWidth, overlayOpen.timebox);
    if (r.state !== paneState) updatePanes(() => r.state);
    setOverlayOpen((o) => ({ ...o, timebox: r.overlayOpen }));
  }, [paneState, windowWidth, overlayOpen.timebox, updatePanes]);
  // An overlay flag never outlives its panel being docked (it would reappear
  // when the window narrows again).
  useEffect(() => {
    if ((layout.sidebar === 'docked' && overlayOpen.sidebar) || (layout.timebox === 'docked' && overlayOpen.timebox)) {
      setOverlayOpen((o) => ({ sidebar: layout.sidebar === 'docked' ? false : o.sidebar, timebox: layout.timebox === 'docked' ? false : o.timebox }));
    }
  }, [layout.sidebar, layout.timebox, overlayOpen.sidebar, overlayOpen.timebox]);
  // An overlay closes when the window becomes wide enough to dock it, and with Escape.
  useEffect(() => {
    if (!overlayOpen.sidebar && !overlayOpen.timebox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isPopoverOpen() || isOverlayOpen()) return;
      setOverlayOpen({ sidebar: false, timebox: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen]);
  const [calendarShown, setCalendarShown] = useState(false);
  useEffect(() => {
    if (paneState.center === 'calendar') setCalendarShown(true);
  }, [paneState.center]);
  // The keyboard shortcuts of the home screen (lib/shortcuts.ts). Only while the
  // panes are the page showing; the registry keeps them out of every field.
  useHomeShortcuts(view === 'home', {
    help: () => openOverlay({ kind: 'help' }),
    search: () => openOverlay({ kind: 'search' }),
    quickCapture: () => openOverlay({ kind: 'capture', mode: 'list' }),
    newTaskToday: () => openOverlay({ kind: 'capture', mode: 'today' }),
    onlyToday: () => updatePanes(toggleOnlyToday),
    toggleLeftPane: toggleSidebar,
    toggleRightPane: toggleTimebox,
    toggleCenter: () => updatePanes(toggleCenter),
    dayView: () => updatePanes((s) => showCalendar(s, 'day')),
    weekView: () => updatePanes((s) => showCalendar(s, 'week')),
    monthView: () => updatePanes((s) => showCalendar(s, 'month')),
    dailyPlanning: () => {
      if (!features.planning) return false;
      openOverlay({ kind: 'flow', mode: 'planning' });
    },
    // Shift+T: the board on this week, the keyboard on today's first task.
    goToday: () => {
      updatePanes((s) => ({ ...s, center: 'kanban' }));
      requestGoToday();
      focusFirst(`[data-day-col="${todayDateKey(new Date())}"] [data-card-focus]`);
    },
    // Shift+B: the left pane on Brain Dump, the keyboard on its first task.
    firstBrainDump: () => {
      updatePanes((s) => ({ ...s, leftCollapsed: false }));
      if (windowWidth < SIDEBAR_DOCK_MIN) setOverlayOpen((o) => ({ ...o, sidebar: true }));
      selectList(null);
      focusFirst('[data-pane="left"] [data-card-focus]');
    },
  });
  // Escape closes an open overlay (help, search, quick capture) wherever the
  // keyboard focus is; the overlays that have a field also handle it themselves.
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // The Labels overlay has fields of its own that use Escape; it closes itself.
      if (overlay.kind === 'labels' || overlay.kind === 'missed') return;
      e.preventDefault();
      closeOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay]);
  // Search results: show the task where it lives, then put the keyboard on its
  // card. A dated task is on the board (its week); a task without a day is in the
  // left pane, in its list. A card that is not there (hidden by the filter, or
  // finished) opens its details instead, so a search never ends with nothing.
  const reveal = useReveal();
  useEffect(() => {
    if (!reveal) return;
    updatePanes((s) => (reveal.dueDate ? { ...s, center: 'kanban', onlyToday: false } : { ...s, leftCollapsed: false }));
    // A narrow window shows the list over the centre for the moment.
    if (!reveal.dueDate && windowWidth < SIDEBAR_DOCK_MIN) setOverlayOpen((o) => ({ ...o, sidebar: true }));
    if (!reveal.dueDate) selectList(reveal.listKey ?? null);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let found = false;
    const delays = [150, 400, 800, 1400];
    delays.forEach((ms, i) => {
      timers.push(
        setTimeout(() => {
          if (found) return;
          const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-task-card="${reveal.taskId.replace(/"/g, '')}"]`)).find((e) => e.getBoundingClientRect().width > 0);
          if (el) {
            found = true;
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            el.focus();
          } else if (i === delays.length - 1) {
            openDetail(reveal.taskId);
          }
        }, ms),
      );
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.nonce]);
  // The filter is UI state, never synced: remembered while the app runs and, in
  // the main process store (kv), across relaunch.
  useEffect(() => {
    kv.getItem(FILTER_KEY)
      .then((raw) => setFilterState(parseFilter(raw)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadLabels()
      .then((l) => setLabelKeys(l.map((p) => p.key)))
      .catch(() => {});
  }, [refreshKey]);
  const setFilter = useCallback((next: TaskFilter) => {
    setFilterState(next);
    kv.setItem(FILTER_KEY, serializeFilter(next)).catch(() => {});
  }, []);
  // A label that was deleted since no longer counts.
  const effectiveFilter = useMemo(() => (labelKeys ? pruneFilter(filter, labelKeys) : filter), [filter, labelKeys]);

  // From a page (Settings, Quests...), the day actions go back to the home
  // screen first: their overlays live there.
  const onHome = (fn: () => void) => () => {
    if (viewRef.current !== 'home') setView('home');
    fn();
  };
  const profileActions = {
    planning: features.planning ? onHome(() => openOverlay({ kind: 'flow', mode: 'planning' })) : undefined,
    shutdown: features.planning ? onHome(() => openOverlay({ kind: 'flow', mode: 'shutdown' })) : undefined,
    capture: onHome(() => openOverlay({ kind: 'capture', mode: 'list' })),
    search: onHome(() => openOverlay({ kind: 'search' })),
    shortcuts: onHome(() => openOverlay({ kind: 'help' })),
  };
  const profile = (
    <ProfileMenu
      onOpenSettings={() => showView('settings')}
      onOpenProgress={() => showView('progress')}
      onOpenSignIn={() => showView('signin')}
      onOpenAnalytics={() => showView('analytics')}
      onOpenTrash={() => showView('trash')}
      actions={profileActions}
    />
  );

  return (
    <DragProvider onChanged={onChanged}>
    <View style={styles.root}>
      {view !== 'home' && (
        <View style={styles.strip}>
          <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Ionicons name="arrow-back" size={16} color={Colors.accentText} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={styles.stripRight}>{profile}</View>
        </View>
      )}
      <View ref={panes} style={[styles.body, view !== 'home' && styles.hidden]} accessibilityElementsHidden={view !== 'home'}>
        {/* The sidebar and the Timebox stay mounted while hidden (display none),
            so the list, the day and the scroll are there when they come back. */}
        <View
          style={[layout.sidebar === 'docked' ? { width: SIDEBAR_WIDTH } : layout.sidebar === 'overlay' ? styles.sidebarOverlay : styles.hidden]}
          {...({ dataSet: { pane: 'left' } } as object)}
        >
          <Sidebar onHide={toggleSidebar} overlay={layout.sidebar === 'overlay'}>
            <BrainDumpPane refreshKey={refreshKey} onChanged={onChanged} filter={effectiveFilter} />
          </Sidebar>
        </View>
        <View style={styles.centre} {...({ dataSet: { pane: 'center' } } as object)}>
          <View style={styles.topRow} accessibilityLabel="Centre controls">
            {layout.sidebar === 'hidden' && (
              <Pressable onPress={toggleSidebar} style={pressStyle(({ hovered }) => [styles.edgeBtn, hovered && styles.edgeHover])} accessibilityRole="button" accessibilityLabel="Show sidebar">
                <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
              </Pressable>
            )}
            <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel="Centre view">
              {([['kanban', 'checkbox-outline', 'Tasks', 'Show Tasks'], ['calendar', 'calendar-outline', 'Calendar', 'Show the Calendar']] as const).map(([v, icon, text, label]) => (
                <Pressable
                  key={v}
                  onPress={() => updatePanes((s) => (s.center === v ? s : toggleCenter(s)))}
                  style={pressStyle(({ hovered }) => [styles.segBtn, paneState.center === v ? styles.segOn : hovered && styles.segHover])}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: paneState.center === v }}
                  accessibilityLabel={label}
                >
                  <View style={styles.segInner}>
                    <Ionicons name={icon} size={15} color={paneState.center === v ? Colors.onAccent : Colors.textSecondary} />
                    <Text style={[styles.segText, paneState.center === v && styles.segTextOn]}>{text}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => updatePanes(toggleOnlyToday)}
              style={pressStyle(({ hovered }) => [styles.rowBtn, paneState.onlyToday ? styles.rowBtnOn : hovered && styles.segHover])}
              accessibilityRole="button"
              accessibilityState={{ selected: paneState.onlyToday }}
              accessibilityLabel="Show only today"
              {...({ 'aria-pressed': paneState.onlyToday } as object)}
            >
              <Ionicons name="today-outline" size={15} color={paneState.onlyToday ? Colors.accentText : Colors.textSecondary} />
              <Text style={[styles.rowText, paneState.onlyToday && styles.rowTextOn]}>Only today</Text>
            </Pressable>
            <Pressable onPress={() => showView('quests')} style={pressStyle(({ hovered }) => [styles.rowBtn, hovered && styles.segHover])} accessibilityRole="button" accessibilityLabel="Quests">
              <Ionicons name="trophy-outline" size={15} color={Colors.textSecondary} />
              <Text style={styles.rowText}>Quests</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {/* One profile menu at a time: here on the home screen, in the page
                strip otherwise (two share a popover id and would close each other). */}
            {view === 'home' && profile}
            {layout.timeboxAvailable && layout.timebox === 'hidden' && (
              <Pressable onPress={toggleTimebox} style={pressStyle(({ hovered }) => [styles.edgeBtn, hovered && styles.edgeHover])} accessibilityRole="button" accessibilityLabel="Show Timebox">
                <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
              </Pressable>
            )}
          </View>
          <View style={[{ flex: 1 }, paneState.center !== 'kanban' && styles.hidden]}>
            <KanbanPane refreshKey={refreshKey} onChanged={onChanged} filter={effectiveFilter} onFilterChange={setFilter} onlyToday={paneState.onlyToday} />
          </View>
          {calendarShown && (
            <View style={[{ flex: 1 }, paneState.center !== 'calendar' && styles.hidden]}>
              <CalendarPane
                refreshKey={refreshKey}
                onChanged={onChanged}
                filter={effectiveFilter}
                onFilterChange={setFilter}
                view={paneState.calendar}
                onViewChange={(v: CalendarView) => updatePanes((s) => showCalendar(s, v))}
                onlyToday={paneState.onlyToday}
              />
            </View>
          )}
        </View>
        <View
          style={[layout.timebox === 'docked' ? { width: TIMEBOX_WIDTH } : layout.timebox === 'overlay' ? styles.timeboxOverlay : styles.hidden]}
          {...({ dataSet: { pane: 'right' } } as object)}
        >
          <TimeboxPane refreshKey={refreshKey} onChanged={onChanged} filter={effectiveFilter} onlyToday={paneState.onlyToday} onHide={toggleTimebox} />
        </View>
        {(layout.sidebar === 'overlay' || layout.timebox === 'overlay') && (
          <Pressable style={styles.scrim} onPress={() => setOverlayOpen({ sidebar: false, timebox: false })} accessibilityLabel="Close the panel" />
        )}
      </View>
      {view === 'settings' && <SettingsPage onOpenLabels={() => openOverlay({ kind: 'labels' })} onOpenSignIn={() => showView('signin')} labelCount={labelKeys?.length ?? 0} onChanged={onChanged} refreshKey={refreshKey} />}
      {view === 'progress' && <ProgressPage />}
      {view === 'quests' && <QuestsPage refreshKey={refreshKey} />}
      {view === 'analytics' && <AnalyticsPage refreshKey={refreshKey} />}
      {view === 'trash' && <TrashPage refreshKey={refreshKey} />}
      {view === 'signin' && <SignInPage onDone={goBack} />}
      {view === 'home' && <TaskDetailPanel refreshKey={refreshKey} />}
      {view === 'home' && overlay?.kind === 'help' && <ShortcutHelp />}
      {view === 'home' && overlay?.kind === 'capture' && <QuickCapture key={overlay.mode} mode={overlay.mode} />}
      {view === 'home' && overlay?.kind === 'search' && <SearchPalette />}
      {overlay?.kind === 'labels' && <LabelsOverlay onChanged={onChanged} />}
      {view === 'home' && overlay?.kind === 'flow' && <PlanningFlow key={overlay.mode} mode={overlay.mode} />}
      {view === 'home' && overlay?.kind === 'missed' && <MissedPanel refreshKey={refreshKey} />}
      {view === 'home' && <UndoBar />}
      <TimerWidget refreshKey={refreshKey} />
      <ScopePrompt />
      <AccountChoiceModal />
    </View>
    </DragProvider>
  );
}

// The page width, read on every resize. react-native-web's useWindowDimensions
// was seen to keep a stale width after the window was made narrower (real
// check p3), so the panes would not fold away.
function useWindowWidth(): number {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    on();
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

type View_ = 'home' | 'settings' | 'progress' | 'signin' | 'quests' | 'analytics' | 'trash';

// Puts the keyboard on the first visible match, once the panes have drawn.
function focusFirst(selector: string): void {
  let tries = 0;
  const attempt = () => {
    const el = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((e) => e.getBoundingClientRect().width > 0);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (++tries < 6) setTimeout(attempt, 150);
  };
  setTimeout(attempt, 60);
}

interface Opener {
  el: HTMLElement | null;
  label: string | null;
}

const PROFILE_ICON = '[aria-label="Profile and account"], [aria-label="Profile, not signed in"]';

function captureOpener(): Opener {
  const a = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  const usable = a && a !== document.body && a.isConnected && !a.closest('[role="dialog"]') ? a : null;
  return { el: usable, label: usable?.getAttribute('aria-label') ?? null };
}

// The element if it is still there, else the one with the same name (a page that
// was rebuilt), else the profile icon.
function focusOpener(o: Opener): void {
  const visible = (el: Element | null | undefined): el is HTMLElement => !!el && (el as HTMLElement).getBoundingClientRect().width > 0;
  const named = o.label ? Array.from(document.querySelectorAll('[aria-label]')).find((e) => e.getAttribute('aria-label') === o.label && visible(e)) : undefined;
  const icon = Array.from(document.querySelectorAll(PROFILE_ICON)).find((e) => visible(e));
  const target = (o.el && o.el.isConnected && visible(o.el) ? o.el : null) ?? (named as HTMLElement | undefined) ?? (icon as HTMLElement | undefined);
  target?.focus();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  strip: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 12 },
  stripRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { ...outlinedBtn, height: 36 } as object,
  backText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  body: { flex: 1, flexDirection: 'row', padding: 16, gap: 16 },
  centre: { flex: 1, minWidth: 0, backgroundColor: Colors.pane, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 } as object,
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, marginBottom: 8 },
  edgeBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  edgeHover: { backgroundColor: Colors.hover },
  seg: { ...segTrack } as object,
  segBtn: { ...segBtn, transitionDuration: '120ms', transitionProperty: 'background-color' } as object,
  segInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segHover: { ...segBtnHover },
  segOn: { ...segBtnOn },
  segText: { ...segLabel },
  segTextOn: { ...segLabelOn },
  rowBtn: { ...outlinedBtn, height: 36, transitionDuration: '120ms', transitionProperty: 'background-color' } as object,
  rowBtnOn: { ...outlinedBtnOn },
  rowText: { ...outlinedBtnText },
  rowTextOn: { color: Colors.accentText },
  sidebarOverlay: { position: 'absolute', left: 16, top: 16, bottom: 16, width: SIDEBAR_WIDTH, zIndex: 20 },
  timeboxOverlay: { position: 'absolute', right: 16, top: 16, bottom: 16, width: TIMEBOX_WIDTH, zIndex: 20 },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 19, backgroundColor: Colors.scrimSoft },
  hidden: { display: 'none' },
});
