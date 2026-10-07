import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { streakLine } from '../../lib/seriesStreak';
import type { Task } from '../../lib/types';
import { useSeriesStreak, useShowStreaks, useStreakDay } from './streakStore';

// One quiet line on TODAY's card of a repeating task (a run belongs to today, not
// to the days ahead), and in its block popover, only when the run is 2 or more and "Show streaks" is on (decision 007). It reads
// the same whether or not today is done: no icon, no colour change, no warning.
export default function StreakLine({ task, inset = false }: { task: Pick<Task, 'id' | 'recurrence' | 'dueDate'>; inset?: boolean }) {
  const show = useShowStreaks();
  const streak = useSeriesStreak(task);
  const today = useStreakDay();
  const line = show && streak && task.dueDate === today ? streakLine(streak) : null;
  if (!line) return null;
  return (
    <Text style={[styles.line, inset && styles.inset]} accessibilityLabel={`Streak: ${line}`}>
      {line}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: 12, color: Colors.textSecondary },
  inset: { paddingHorizontal: 12, paddingVertical: 4 },
});
