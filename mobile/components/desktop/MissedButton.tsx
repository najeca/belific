import React, { useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { dateKey } from '../../lib/kanban';
import { missedItems } from '../../lib/missed';
import { loadTasksRaw } from '../../lib/storage';
import { useTick } from './timerUi';
import { pressStyle } from './pressStyle';
import { openOverlay } from './uiStore';

// The Missed button in the left pane (2.27.0, item 6): opens the Missed panel,
// with how many are waiting. Worked out afresh on every change and every minute
// (so it updates at midnight); nothing is stored for it.
export default function MissedButton({ refreshKey }: { refreshKey: number }) {
  const [count, setCount] = useState(0);
  const tick = useTick(60000);
  useEffect(() => {
    let live = true;
    // Raw rows, tombstones included: a skipped day of a series is not missed.
    loadTasksRaw().then((t) => live && setCount(missedItems(t, dateKey(new Date())).length));
    return () => {
      live = false;
    };
  }, [refreshKey, tick]);
  return (
    <Pressable
      onPress={() => openOverlay({ kind: 'missed' })}
      style={pressStyle(({ hovered }) => [styles.btn, hovered && styles.hover])}
      accessibilityRole="button"
      accessibilityLabel={count === 0 ? 'Missed: nothing missed' : `Missed: ${count} to look at`}
      {...({ dataSet: { missedButton: String(count) }, title: 'Planned for an earlier day and not done' } as object)}
    >
      <Text style={styles.text}>🕓 Missed</Text>
      {count > 0 && (
        <Text style={styles.badge} {...({ dataSet: { missedCount: '1' } } as object)}>
          {count}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 10 },
  hover: { backgroundColor: Colors.surface },
  text: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: Colors.accent, color: Colors.onAccent, fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
});
