import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import BrainDumpPane from './BrainDumpPane';
import KanbanPane from './KanbanPane';
import TimeboxPane from './TimeboxPane';
import DragProvider from './DragProvider';
import SettingsModal from './SettingsModal';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      <View style={styles.body}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <BrainDumpPane
            refreshKey={refreshKey}
            onChanged={onChanged}
            onOpenSettings={() => setSettingsOpen(true)}
            filter={effectiveFilter}
          />
        </View>
        <View style={{ flex: 2.2, minWidth: 0 }}>
          <KanbanPane refreshKey={refreshKey} onChanged={onChanged} filter={effectiveFilter} onFilterChange={setFilter} />
        </View>
        <View style={{ flex: 1.2, minWidth: 0 }}>
          <TimeboxPane
            refreshKey={refreshKey}
            onChanged={onChanged}
            filter={effectiveFilter}
          />
        </View>
      </View>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <AccountChoiceModal />
    </View>
    </DragProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, flexDirection: 'row', padding: 16, gap: 16 },
});
