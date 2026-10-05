import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../../lib/theme';
import BrainDumpPane from './BrainDumpPane';
import KanbanPane from './KanbanPane';
import TimeboxPane from './TimeboxPane';
import TaskModal, { type TaskModalState } from './TaskModal';

// Decision 009: the three-pane workspace: Brain Dump, weekly kanban and
// Timebox. Panes share one refresh counter so a change in one (a promoted Brain Dump item, a moved
// task) shows up in the others without extra plumbing. The task modal is a
// centred overlay on this screen, never a new screen.
export default function DesktopHome() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState<TaskModalState | null>(null);
  const onChanged = useCallback(() => setRefreshKey((k) => k + 1), []);
  const closeModal = useCallback(() => setModal(null), []);
  const onSaved = useCallback(() => {
    setModal(null);
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <BrainDumpPane
            refreshKey={refreshKey}
            onChanged={onChanged}
            onMakeTask={(item) => setModal({ mode: 'new', title: item.title, dumpId: item.id })}
          />
        </View>
        <View style={{ flex: 2.2, minWidth: 0 }}>
          <KanbanPane
            refreshKey={refreshKey}
            onChanged={onChanged}
            onNewTask={(dueDate) => setModal({ mode: 'new', dueDate })}
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
      {modal && <TaskModal state={modal} onClose={closeModal} onSaved={onSaved} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, flexDirection: 'row', padding: 16, gap: 16 },
});
