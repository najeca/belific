// R4 of PLAN_repeat_end_and_parts: a task's parts as rows inside its card on the board, never as cards of their own.
// A bar and "2 of 5 done", then up to five rows, each with a tick that works in place, its name and its estimate; more
// than five reads "3 more", which opens the details. Text 14 px or more, nothing red.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import type { Task } from '../../lib/types';
import { partsProgress } from '../../lib/parts';
import { formatMinutes } from '../../lib/timebox';
import { setPartDone } from '../../lib/partActions';
import { RoundCheck } from './ui';
import { notifyChanged, openDetail } from './uiStore';

export const PART_ROWS_SHOWN = 5;

export default function PartRows({ parent, parts }: { parent: Task; parts: Task[] }) {
  if (parts.length === 0) return null;
  const progress = partsProgress(parts);
  const pct = Math.round((progress.done / progress.total) * 100);
  const shown = parts.slice(0, PART_ROWS_SHOWN);
  const more = parts.length - shown.length;
  return (
    <View style={styles.box} {...({ dataSet: { cardParts: parent.id } } as object)}>
      <View style={styles.head}>
        <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: progress.total, now: progress.done }} {...({ dataSet: { cardPartsBar: `${progress.done}/${progress.total}` } } as object)}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.text} {...({ dataSet: { cardPartsDone: progress.text } } as object)}>
          {progress.text}
        </Text>
      </View>
      {shown.map((p) => (
        <View key={p.id} style={styles.row} {...({ dataSet: { cardPart: p.id } } as object)}>
          <Pressable
            onPress={() => void setPartDone(parent, p, !p.completed).then(() => notifyChanged())}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: p.completed }}
            accessibilityLabel={p.completed ? `Untick ${p.title}` : `Tick ${p.title}`}
            {...({ dataSet: { cardPartTick: p.id } } as object)}
          >
            <RoundCheck done={p.completed} size={16} />
          </Pressable>
          <Text style={[styles.title, p.completed && styles.done]} numberOfLines={1}>
            {p.title}
          </Text>
          {p.durationMinutes ? <Text style={styles.text}>{formatMinutes(p.durationMinutes)}</Text> : null}
        </View>
      ))}
      {more > 0 ? (
        <Pressable onPress={() => openDetail(parent.id)} style={styles.more} accessibilityRole="button" accessibilityLabel={`${more} more parts of ${parent.title}`} {...({ dataSet: { cardPartsMore: String(more) } } as object)}>
          <Text style={styles.moreText}>{more} more</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 6, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.borderStrong, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  title: { flex: 1, minWidth: 0, fontSize: 14, color: Colors.textPrimary },
  done: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  text: { fontSize: 14, color: Colors.textSecondary },
  more: { alignSelf: 'flex-start', paddingVertical: 2 },
  moreText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textDecorationLine: 'underline' },
});
