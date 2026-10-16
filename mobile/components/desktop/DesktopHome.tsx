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
import LabelsPage from './LabelsPage';
import ProgressPage from './ProgressPage';
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
import { openOverlay, restoreSelectedList, setChangeNotifier, useOverlay } from './uiStore';
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
      const back = (cur === 'labels' || cur === 'signin') && previous.current === 'settings' ? 'settings' : 'home';
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
      if (isPopoverOpen() || isTextEntryTarget(e.target)) return;
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
  // The keyboard shortcuts of the home screen (lib/shortcuts.ts). Only while the
  // three panes are the page showing; the registry keeps them out of every field.
  useHomeShortcuts(view === 'home', {
    help: () => openOverlay({ kind: 'help' }),
    // Q: go to the capture box of the left pane.
    quickCapture: () => {
      const box = document.querySelector<HTMLElement>('input[aria-label="Capture a thought"]');
      if (!box) return false;
      box.focus();
      return true;
    },
  });
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
        <View style={styles.stripRight}>
          <Pressable
            onPress={() => openOverlay({ kind: 'help' })}
            style={styles.keysBtn}
            accessibilityRole="button"
            accessibilityLabel="Keyboard shortcuts"
          >
            <Text style={styles.keysText}>⌨️</Text>
          </Pressable>
        <ProfileMenu onOpenSettings={() => showView('settings')} onOpenProgress={() => showView('progress')} onOpenSignIn={() => showView('signin')} />
        </View>
      </View>
      <View ref={panes} style={[styles.body, view !== 'home' && styles.hidden]} accessibilityElementsHidden={view !== 'home'}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <BrainDumpPane refreshKey={refreshKey} onChanged={onChanged} filter={effectiveFilter} />
        </View>
        <View style={{ flex: 2.2, minWidth: 0 }}>
          <KanbanPane refreshKey={refreshKey} onChanged={onChanged} filter={effectiveFilter} onFilterChange={setFilter} />
        </View>
        <View style={{ flex: 1.2, minWidth: 0 }}>
          <TimeboxPane refreshKey={refreshKey} onChanged={onChanged} filter={effectiveFilter} />
        </View>
      </View>
      {view === 'settings' && <SettingsPage onOpenLabels={() => showView('labels')} onOpenSignIn={() => showView('signin')} labelCount={labelKeys?.length ?? 0} onChanged={onChanged} />}
      {view === 'labels' && <LabelsPage onChanged={onChanged} />}
      {view === 'progress' && <ProgressPage />}
      {view === 'signin' && <SignInPage onDone={goBack} />}
      {view === 'home' && <TaskDetailPanel refreshKey={refreshKey} />}
      {view === 'home' && overlay?.kind === 'help' && <ShortcutHelp />}
      <TimerWidget refreshKey={refreshKey} />
      <AccountChoiceModal />
    </View>
    </DragProvider>
  );
}

type View_ = 'home' | 'settings' | 'labels' | 'progress' | 'signin';

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
  stripRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keysBtn: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  keysText: { fontSize: 14 },
  wordmark: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary, textTransform: 'uppercase' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  backText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  body: { flex: 1, flexDirection: 'row', padding: 16, paddingTop: 4, gap: 16 },
  hidden: { display: 'none' },
});
