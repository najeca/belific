import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import BrainDumpPane from './BrainDumpPane';
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
import TaskDetailPanel from './TaskDetailPanel';
import ShortcutHelp from './ShortcutHelp';
import { useHomeShortcuts } from './useHomeShortcuts';
import CalendarPane from './CalendarPane';
import QuickCapture from './QuickCapture';
import SearchPalette from './SearchPalette';
import { usePaneState } from './usePaneState';
import { refreshFeatures, useFeatures } from './featureStore';
import { restorePomodoro } from './pomodoroStore';
import { startIcsRefresh } from './icsStore';
import { closeOverlay, isOverlayOpen, openDetail, openOverlay, requestGoToday, restoreSelectedList, selectList, setChangeNotifier, useOverlay, useReveal } from './uiStore';
import { dateKey as todayDateKey } from '../../lib/kanban';
import { RAIL_WIDTH, paneLayout, showCalendar, toggleCenter, toggleLeft, toggleOnlyToday, toggleRight, type CalendarView } from '../../lib/paneState';
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
// Timebox. Panes share one refresh counter so a change in one (a promoted Brain Dump item, a moved
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
  }, []);
  const overlay = useOverlay();
  const features = useFeatures();
  // The power feature toggles (user_settings) are read again whenever data changes.
  useEffect(() => {
    refreshFeatures();
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
  const layout = paneLayout(paneState);
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
    toggleLeftPane: () => updatePanes(toggleLeft),
    toggleRightPane: () => updatePanes(toggleRight),
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
      if (overlay.kind === 'labels') return;
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

  return (
    <DragProvider onChanged={onChanged}>
    <View style={styles.root}>
      <View style={styles.strip}>
        {view === 'home' ? (
          <Text style={styles.wordmark}>Belific</Text>
        ) : (
          <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Ionicons name="arrow-back" size={16} color={Colors.accentText} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        )}
        {view === 'home' && (
          <View style={styles.stripMid}>
            <Pressable
              onPress={() => updatePanes(toggleLeft)}
              style={styles.stripBtn}
              accessibilityRole="button"
              accessibilityState={{ expanded: !paneState.leftCollapsed }}
              accessibilityLabel={paneState.leftCollapsed ? 'Show the left pane' : 'Hide the left pane'}
            >
              <Text style={styles.stripEmoji}>🧠</Text>
              <Ionicons name={paneState.leftCollapsed ? 'chevron-forward' : 'chevron-back'} size={14} color={Colors.textSecondary} />
            </Pressable>
            <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel="Centre view">
              {([['kanban', '🗓️ Kanban', 'Show the Kanban board'], ['calendar', '📆 Calendar', 'Show the Calendar']] as const).map(([v, text, label]) => (
                <Pressable
                  key={v}
                  onPress={() => updatePanes((s) => (s.center === v ? s : toggleCenter(s)))}
                  style={[styles.segBtn, paneState.center === v && styles.segOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: paneState.center === v }}
                  accessibilityLabel={label}
                >
                  <Text style={[styles.segText, paneState.center === v && styles.segTextOn]}>{text}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => updatePanes(toggleOnlyToday)}
              style={[styles.stripBtn, paneState.onlyToday && styles.stripBtnOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: paneState.onlyToday }}
              accessibilityLabel="Show only today"
              {...({ 'aria-pressed': paneState.onlyToday } as object)}
            >
              <Text style={styles.stripEmoji}>📅</Text>
              <Text style={[styles.segText, paneState.onlyToday && styles.segTextOn]}>Only today</Text>
            </Pressable>
            {features.planning && (
              <>
                <Pressable onPress={() => openOverlay({ kind: 'flow', mode: 'planning' })} style={styles.stripBtn} accessibilityRole="button" accessibilityLabel="Daily Planning">
                  <Text style={styles.stripEmoji}>🌅</Text>
                </Pressable>
                <Pressable onPress={() => openOverlay({ kind: 'flow', mode: 'shutdown' })} style={styles.stripBtn} accessibilityRole="button" accessibilityLabel="Daily Shutdown">
                  <Text style={styles.stripEmoji}>🌙</Text>
                </Pressable>
              </>
            )}
            <Pressable onPress={() => showView('quests')} style={styles.stripBtn} accessibilityRole="button" accessibilityLabel="Quests">
              <Text style={styles.stripEmoji}>🎯</Text>
              <Text style={styles.segText}>Quests</Text>
            </Pressable>
            <Pressable onPress={() => openOverlay({ kind: 'search' })} style={styles.stripBtn} accessibilityRole="button" accessibilityLabel="Search tasks">
              <Text style={styles.stripEmoji}>🔎</Text>
            </Pressable>
            <Pressable onPress={() => openOverlay({ kind: 'capture', mode: 'list' })} style={styles.stripBtn} accessibilityRole="button" accessibilityLabel="Quick capture">
              <Text style={styles.stripEmoji}>⚡</Text>
            </Pressable>
            <Pressable
              onPress={() => updatePanes(toggleRight)}
              style={styles.stripBtn}
              accessibilityRole="button"
              accessibilityState={{ expanded: !paneState.rightCollapsed }}
              accessibilityLabel={paneState.rightCollapsed ? 'Show the right pane' : 'Hide the right pane'}
            >
              <Ionicons name={paneState.rightCollapsed ? 'chevron-back' : 'chevron-forward'} size={14} color={Colors.textSecondary} />
              <Text style={styles.stripEmoji}>🕐</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.stripRight}>
          <Pressable
            onPress={() => openOverlay({ kind: 'help' })}
            style={styles.keysBtn}
            accessibilityRole="button"
            accessibilityLabel="Keyboard shortcuts"
          >
            <Text style={styles.keysText}>⌨️</Text>
          </Pressable>
        <ProfileMenu onOpenSettings={() => showView('settings')} onOpenProgress={() => showView('progress')} onOpenSignIn={() => showView('signin')} onOpenAnalytics={() => showView('analytics')} onOpenTrash={() => showView('trash')} />
        </View>
      </View>
      <View ref={panes} style={[styles.body, view !== 'home' && styles.hidden]} accessibilityElementsHidden={view !== 'home'}>
        {/* A collapsed pane stays mounted (hidden), so its list, week and scroll are
            still there when it comes back; a narrow rail takes its place. */}
        {layout.left.collapsed && <Rail side="left" emoji="🧠" label="Show the left pane" onPress={() => updatePanes(toggleLeft)} />}
        <View style={[{ flex: layout.left.flex, minWidth: 0 }, layout.left.collapsed && styles.hidden]} {...({ dataSet: { pane: 'left' } } as object)}>
          <BrainDumpPane refreshKey={refreshKey} onChanged={onChanged} filter={effectiveFilter} />
        </View>
        <View style={{ flex: layout.center.flex, minWidth: 0 }} {...({ dataSet: { pane: 'center' } } as object)}>
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
        <View style={[{ flex: layout.right.flex, minWidth: 0 }, layout.right.collapsed && styles.hidden]} {...({ dataSet: { pane: 'right' } } as object)}>
          <TimeboxPane refreshKey={refreshKey} onChanged={onChanged} filter={effectiveFilter} onlyToday={paneState.onlyToday} />
        </View>
        {layout.right.collapsed && <Rail side="right" emoji="🕐" label="Show the right pane" onPress={() => updatePanes(toggleRight)} />}
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
      <TimerWidget refreshKey={refreshKey} />
      <AccountChoiceModal />
    </View>
    </DragProvider>
  );
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

// A hidden pane's place on the screen: a narrow rail with the pane's emoji and a
// button that brings the pane back.
function Rail({ side, emoji, label, onPress }: { side: 'left' | 'right'; emoji: string; label: string; onPress: () => void }) {
  return (
    <View style={styles.rail} {...({ dataSet: { rail: side } } as object)}>
      <Pressable onPress={onPress} style={styles.railBtn} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name={side === 'left' ? 'chevron-forward' : 'chevron-back'} size={16} color={Colors.textSecondary} />
        <Text style={styles.railEmoji}>{emoji}</Text>
      </Pressable>
    </View>
  );
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
  strip: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  stripMid: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  stripBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  stripBtnOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  stripEmoji: { fontSize: 14 },
  seg: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 12, height: 32, justifyContent: 'center', backgroundColor: Colors.surface },
  segOn: { backgroundColor: Colors.accent },
  segText: { fontSize: 12, color: Colors.textPrimary },
  segTextOn: { color: Colors.onAccent, fontWeight: '700' },
  rail: { width: RAIL_WIDTH, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', paddingTop: 12 },
  railBtn: { alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10 },
  railEmoji: { fontSize: 18 },
  stripRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keysBtn: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  keysText: { fontSize: 14 },
  wordmark: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary, textTransform: 'uppercase' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  backText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  body: { flex: 1, flexDirection: 'row', padding: 16, paddingTop: 4, gap: 16 },
  hidden: { display: 'none' },
});
