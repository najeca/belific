import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../../lib/theme';

// Checkpoint 1 shell: three placeholder panes (decision 009). Real
// content and the top bar land in checkpoint 2.
function Pane({ title, note, flex }: { title: string; note: string; flex: number }) {
  return (
    <View style={[styles.pane, { flex }]}>
      <Text style={styles.paneLabel}>{title}</Text>
      <Text style={styles.paneNote}>{note}</Text>
    </View>
  );
}

export default function DesktopHome() {
  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <Pane title="BRAIN DUMP" note="Capture pane placeholder" flex={1} />
        <Pane title="WEEK" note="Kanban pane placeholder" flex={2.2} />
        <Pane title="TIMEBOX" note="Timebox pane placeholder" flex={1.2} />
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
