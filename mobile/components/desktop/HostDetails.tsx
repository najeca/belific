import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatTime } from '../../lib/data';
import { formatDuration } from '../../lib/duration';
import { toTime } from '../../lib/timebox';
import type { HostLink } from '../../lib/hosting';
import { labelColor } from '../../lib/labelColors';
import type { Project } from '../../lib/types';
import { moveOut, tickGuest, MOVE_OUT, type HostedGuest } from './HostChips';
import { notifyChanged, openDetail } from './uiStore';

// The details of a task during a break (3.10.0): a break lists "Inside this break" (each task's tick,
// title (Open), length and Move out); a hosted task says "During: Lunch" with Move out.
const guestOf = (l: HostLink, labels: Project[]): HostedGuest => ({
  blockId: l.guest.id,
  task: l.guest.task,
  full: l.guest.full,
  projected: l.guest.projected,
  ...(l.guest.time ? { time: l.guest.time } : {}),
  dot: labelColor(labels.find((p) => p.key === l.guest.task.projectKey)?.colorKey)?.edge ?? Colors.textSecondary,
});
const breakOf = (l: HostLink) => ({ endMin: l.brk.endMin, title: l.brk.task.title });

export function InsideBreak({ links, labels }: { links: HostLink[]; labels: Project[] }) {
  if (links.length === 0) return null;
  return (
    <View style={styles.box} {...({ dataSet: { insideBreak: String(links.length) } } as object)}>
      <Text style={styles.head} accessibilityRole="header">
        Inside this break
      </Text>
      {links.map((l) => {
        const g = guestOf(l, labels);
        const t = l.guest.task;
        return (
          <View key={l.guest.id} style={styles.row} {...({ dataSet: { insideRow: l.guest.id } } as object)}>
            <Pressable
              onPress={() => void tickGuest(g).then(notifyChanged)}
              style={[styles.check, t.completed && styles.checkOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!t.completed }}
              accessibilityLabel={t.completed ? `Untick ${t.title}` : `Tick ${t.title}`}
              {...({ 'aria-checked': !!t.completed, dataSet: { insideTick: l.guest.id } } as object)}
            >
              {t.completed ? <Ionicons name="checkmark" size={11} color={Colors.onAccent} /> : null}
            </Pressable>
            <View style={[styles.dot, { backgroundColor: g.dot }]} />
            <Pressable onPress={() => openDetail(t.id)} style={styles.titleBtn} accessibilityRole="button" accessibilityLabel={`Open ${t.title}`} {...({ dataSet: { insideOpen: l.guest.id } } as object)}>
              <Text style={[styles.title, t.completed && styles.done]} numberOfLines={1}>
                {t.title}
              </Text>
            </Pressable>
            <Text style={styles.meta}>{[formatTime(toTime(l.guest.startMin)), formatDuration(t.durationMinutes)].filter(Boolean).join(' ')}</Text>
            <Pressable onPress={() => void moveOut(g, breakOf(l))} style={styles.btn} accessibilityRole="button" accessibilityLabel={`Move ${t.title} out`} {...({ dataSet: { insideOut: l.guest.id } } as object)}>
              <Text style={styles.btnText}>Move out</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function DuringBreak({ links, labels }: { links: HostLink[]; labels: Project[] }) {
  if (links.length === 0) return null;
  return (
    <View style={styles.box} {...({ dataSet: { duringBreak: links.map((l) => l.brk.task.title).join('|') } } as object)}>
      {links.map((l) => (
        <View key={l.guest.id} style={styles.row}>
          <Ionicons name="cafe-outline" size={14} color={Colors.onHostPill} />
          <Text style={styles.during} numberOfLines={1}>
            {`During: ${l.brk.task.title}`}
            {links.length > 1 ? ` (${formatTime(toTime(l.guest.startMin))})` : ''}
          </Text>
          <Pressable
            onPress={() => void moveOut(guestOf(l, labels), breakOf(l))}
            style={styles.btn}
            accessibilityRole="button"
            accessibilityLabel={MOVE_OUT}
            {...({ dataSet: { duringOut: l.guest.id } } as object)}
          >
            <Text style={styles.btnText}>Move out</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, padding: 10, marginBottom: 6, borderRadius: 10, backgroundColor: Colors.hostPill },
  head: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: Colors.onHostPill },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  check: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.onHostPill, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dot: { width: 8, height: 8, borderRadius: 4 },
  titleBtn: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '600', color: Colors.onHostPill },
  done: { textDecorationLine: 'line-through' },
  meta: { fontSize: 12, color: Colors.onHostPill },
  during: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.onHostPill },
  btn: { paddingHorizontal: 10, height: 26, borderRadius: 8, borderWidth: 1, borderColor: Colors.onHostPill, justifyContent: 'center' },
  btnText: { fontSize: 12, fontWeight: '600', color: Colors.onHostPill },
});
