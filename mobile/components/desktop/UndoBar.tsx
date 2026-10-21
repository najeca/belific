import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { clearNotice, clearUndo, notifyChanged, useNotice, useUndo } from './uiStore';

// The undo bar (2.27.0): after moving a day's tasks, "Moved 3 tasks to Mon 19
// Oct. Undo" at the bottom of the screen for 12 seconds. Undo writes the old
// days back (only for tasks still where they were moved to).
const SHOW_MS = 12000;

export default function UndoBar() {
  const offer = useUndo();
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, SHOW_MS);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!offer) return;
    const t = setTimeout(clearUndo, SHOW_MS);
    return () => clearTimeout(t);
  }, [offer]);
  if (!offer && notice) {
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.bar} accessibilityRole="alert" {...({ dataSet: { noticeBar: '1' } } as object)}>
          <Text style={styles.text}>{notice.text}</Text>
          <Pressable onPress={clearNotice} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss">
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!offer) return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar} accessibilityRole="alert" {...({ dataSet: { undoBar: '1' } } as object)}>
        <Text style={styles.text}>{offer.text}</Text>
        <Pressable
          onPress={async () => {
            if (busy) return;
            setBusy(true);
            await offer.run();
            setBusy(false);
            clearUndo();
            notifyChanged();
          }}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel="Undo"
        >
          <Text style={styles.btnText}>Undo</Text>
        </Pressable>
        <Pressable onPress={clearUndo} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center', zIndex: 70 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 8, height: 44, borderRadius: 14, backgroundColor: Colors.textPrimary, maxWidth: '90%', boxShadow: '0 4px 14px rgba(38,37,31,0.18)' } as object,
  text: { fontSize: 13, color: Colors.background, flexShrink: 1 },
  btn: { paddingHorizontal: 12, height: 30, borderRadius: 9, justifyContent: 'center', backgroundColor: Colors.background },
  btnText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, color: Colors.background },
});
