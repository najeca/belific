import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../../lib/theme';
import BrainDumpPane from './BrainDumpPane';

// Decision 009: the three-pane workspace. Brain Dump is real; the kanban
// and Timebox panes are placeholders until their checkpoints land. Panes
// share one refresh counter so a change in one (a promoted Brain Dump
// item, a moved task) shows up in the others without extra plumbing.
function Placeholder({ title, note, flex }: { title: string; note: string; flex: number }) {
  return (
    <View style={[styles.pane, { flex }]}>
      <Text style={styles.paneLabel}>{title}</Text>
      <Text style={styles.paneNote}>{note}</Text>
    </View>
  );
}

export default function DesktopHome() {
  const [refreshKey, setRefreshKey] = useState(0);
  const onChanged = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <BrainDumpPane refreshKey={refreshKey} onChanged={onChanged} />
        </View>
        <Placeholder title="WEEK" note="Kanban pane placeholder" flex={2.2} />
        <Placeholder title="TIMEBOX" note="Timebox pane placeholder" flex={1.2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, flexDirection: 'row', padding: 16, gap: 16 },
  pane: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  paneLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.textSecondary,
  },
  paneNote: { marginTop: 8, fontSize: 14, color: Colors.textSecondary },
});
