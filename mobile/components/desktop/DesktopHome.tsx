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
import { closePopover } from './Popover';
import { setHomeActive } from './viewActive';
import AccountChoiceModal from './AccountChoiceModal';
import { kv } from '../../lib/kv';
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
  const showView = useCallback((next: View_) => {
    // Never carry an open popover (or a half done drag) into another view.
    closePopover();
    setView((cur) => {
      previous.current = cur;
      return next;
    });
  }, []);
  const goBack = useCallback(() => {
    closePopover();
    setView((cur) => {
      const back = cur === 'labels' && previous.current === 'settings' ? 'settings' : 'home';
      previous.current = cur;
      return back;
    });
  }, []);
  useEffect(() => {
    setHomeActive(view === 'home');
    // display none already removes the panes from focus and pointer input; the
    // inert attribute makes it explicit for anything else (scripts, readers).
    const el = panes.current as unknown as HTMLElement | null;
    if (el && typeof el.toggleAttribute === 'function') el.toggleAttribute('inert', view !== 'home');
  }, [view]);
  // File, Settings in the app menu.
  useEffect(() => globalThis.belificDesktop?.menu?.onOpenSettings(() => showView('settings')), [showView]);
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
  useEffect(() => {
    const interval = setInterval(sendNotifyPayload, 60 * 1000);
    let lastSuccess: string | null = null;
    const unsubscribe = subscribeSyncStatus((s) => {
      if (s.lastSuccessAt !== lastSuccess) {
        lastSuccess = s.lastSuccessAt;
        sendNotifyPayload();
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
  }, []);
  const onChanged = useCallback(() => setRefreshKey((k) => k + 1), []);
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
        <ProfileMenu onOpenSettings={() => showView('settings')} />
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
      {view === 'settings' && <SettingsPage onOpenLabels={() => showView('labels')} labelCount={labelKeys?.length ?? 0} />}
      {view === 'labels' && <LabelsPage onChanged={onChanged} />}
      <AccountChoiceModal />
    </View>
    </DragProvider>
  );
}

type View_ = 'home' | 'settings' | 'labels';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  strip: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  wordmark: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary, textTransform: 'uppercase' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  backText: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  body: { flex: 1, flexDirection: 'row', padding: 16, paddingTop: 4, gap: 16 },
  hidden: { display: 'none' },
});
