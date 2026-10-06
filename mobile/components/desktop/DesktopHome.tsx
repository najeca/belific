import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import BrainDumpPane from './BrainDumpPane';
import KanbanPane from './KanbanPane';
import TimeboxPane from './TimeboxPane';
import TaskModal, { type TaskModalState } from './TaskModal';
import DragProvider from './DragProvider';
import SettingsModal from './SettingsModal';
import { listenForAuthCallbacks } from '../../lib/desktopAuth';
import { sendNotifyPayload } from '../../lib/desktopNotify';
import { runFullSync, subscribeSyncStatus } from '../../lib/sync';

// Decision 009: the three-pane workspace: Brain Dump, weekly kanban and
// Timebox. Panes share one refresh counter so a change in one (a promoted Brain Dump item, a moved
// task) shows up in the others without extra plumbing. The task modal is a
// centred overlay on this screen, never a new screen. DragProvider runs drag
// and drop between the three panes (checkpoint 4).
export default function DesktopHome() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState<TaskModalState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Validated sign in callbacks from the main process (decision 012).
  useEffect(() => listenForAuthCallbacks(), []);
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
  // Closing also refreshes: a label colour changed in the editor is saved
  // straight away, even when the task edit is cancelled.
  const closeModal = useCallback(() => {
    setModal(null);
    setRefreshKey((k) => k + 1);
  }, []);
  const onSaved = useCallback(() => {
    setModal(null);
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <DragProvider onChanged={onChanged}>
    <View style={styles.root}>
      <View style={styles.body}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <BrainDumpPane
            refreshKey={refreshKey}
            onChanged={onChanged}
            onEditTask={(task) => setModal({ mode: 'edit', task })}
            onEditDump={(item) => setModal({ mode: 'dump', item })}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </View>
        <View style={{ flex: 2.2, minWidth: 0 }}>
          <KanbanPane
            refreshKey={refreshKey}
            onChanged={onChanged}
            onEditTask={(task) => setModal({ mode: 'edit', task })}
          />
        </View>
        <View style={{ flex: 1.2, minWidth: 0 }}>
          <TimeboxPane
            refreshKey={refreshKey}
            onChanged={onChanged}
            onEditTask={(task) => setModal({ mode: 'edit', task })}
          />
        </View>
      </View>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {modal && <TaskModal state={modal} onClose={closeModal} onSaved={onSaved} />}
    </View>
    </DragProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, flexDirection: 'row', padding: 16, gap: 16 },
});
