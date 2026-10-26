import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { formatDuration } from '../../lib/duration';
import type { Task } from '../../lib/types';
import { opsForProjected, opsForTask } from './taskOps';
import { openDetail } from './uiStore';
import { tipRef } from './tip';

// A task during a break (3.6.0, lib/hosting.ts): the hosted task as a small rounded chip inside the
// break's block, light with dark text in both themes (tokens hostChip and onHostChip) so it reads on a
// plain, tinted or vibrant break. The dot is the task's label colour; pressing it ticks the task,
// pressing the rest of the chip opens the task. The task keeps everything of its own.
export interface HostedGuest {
  // The task's own block id (task:<id><suffix>).
  blockId: string;
  // The single-time copy (a task with several times); `full` is the real task.
  task: Task;
  full: Task;
  projected: boolean;
  time?: string;
  // The label colour, else a neutral.
  dot: string;
}

export function guestText(g: HostedGuest): string {
  const len = formatDuration(g.task.durationMinutes);
  return `${g.task.emoji ? `${g.task.emoji} ` : ''}${g.task.title}${len ? ` ${len}` : ''}${g.task.completed ? ' (done)' : ''}`;
}

// The break's tooltip line for everything it hosts.
export function hostedTip(guests: HostedGuest[]): string {
  return guests.length ? `During it: ${guests.map(guestText).join('; ')}` : '';
}

export function HostChip({ g, onChanged, inline }: { g: HostedGuest; onChanged: () => void; inline?: boolean }) {
  const t = g.task;
  const len = formatDuration(t.durationMinutes);
  const tick = async () => {
    const ops = g.projected ? opsForProjected(g.full) : opsForTask(g.full);
    await (g.time ? ops.setTimeDone(g.time, !t.completed) : ops.setCompleted(!t.completed));
    onChanged();
  };
  return (
    <Pressable
      onPress={() => openDetail(t.id)}
      style={[styles.chip, inline ? styles.chipInline : styles.chipStack]}
      accessibilityRole="button"
      accessibilityLabel={`${t.title}${len ? `, ${len}` : ''}, during the break${t.completed ? ', done' : ''}`}
      ref={tipRef(guestText(g)) as never}
      {...({ dataSet: { hostChip: g.blockId } } as object)}
    >
      <Pressable
        onPress={tick}
        hitSlop={4}
        style={styles.dotHit}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!t.completed }}
        accessibilityLabel={t.completed ? `Untick ${t.title}` : `Tick ${t.title}`}
        {...({ 'aria-checked': !!t.completed, dataSet: { hostTick: g.blockId } } as object)}
      >
        {t.completed ? <Text style={styles.check}>✓</Text> : <View style={[styles.dot, { backgroundColor: g.dot }]} />}
      </Pressable>
      <Text style={[styles.chipTitle, t.completed && styles.chipDone]} numberOfLines={1}>
        {t.emoji ? `${t.emoji} ` : ''}
        {t.title}
      </Text>
      {!!len && <Text style={styles.chipLen}>{len}</Text>}
    </Pressable>
  );
}

// "+N": the hosted tasks there is no room for. Its tooltip lists them all.
export function MoreBadge({ n, tip }: { n: number; tip: string }) {
  return (
    <View ref={tipRef(tip) as never} style={styles.more} accessibilityLabel={`${n} more during the break`} {...({ dataSet: { hostMore: String(n) } } as object)}>
      <Text style={styles.moreText}>+{n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 14,
    paddingLeft: 3,
    paddingRight: 6,
    borderRadius: 7,
    backgroundColor: Colors.hostChip,
    boxShadow: `inset 0 0 0 1px ${Colors.border}`,
    minWidth: 0,
    overflow: 'hidden',
  } as object,
  chipInline: { flexShrink: 1, maxWidth: '62%' },
  chipStack: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 2 },
  dotHit: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  check: { fontSize: 9, lineHeight: 10, fontWeight: '700', color: Colors.onHostChip },
  chipTitle: { flexShrink: 1, minWidth: 0, fontSize: 10, lineHeight: 14, fontWeight: '600', color: Colors.onHostChip },
  chipDone: { textDecorationLine: 'line-through' },
  chipLen: { flexShrink: 0, fontSize: 10, lineHeight: 14, color: Colors.onHostChip },
  more: { flexShrink: 0, height: 14, paddingHorizontal: 5, borderRadius: 7, backgroundColor: Colors.hostChip, justifyContent: 'center', boxShadow: `inset 0 0 0 1px ${Colors.border}` } as object,
  moreText: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: Colors.onHostChip },
});
