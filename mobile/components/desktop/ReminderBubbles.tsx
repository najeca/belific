import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { GRID_START_HOUR, PX_PER_HOUR, toMinutes } from '../../lib/timebox';
import { labelFits, reminderText, REMINDER_ICON } from '../../lib/quickReminder';
import { formatTime } from '../../lib/data';
import { opsForProjected, opsForTask } from './taskOps';
import { notifyChanged, openDetail } from './uiStore';
import { pressStyle } from './pressStyle';
import { compactBtnText, outlinedBtn, outlinedBtnHover, outlinedBtnOn, outlinedBtnTextOn, RoundCheck } from './ui';
import type { Task } from '../../lib/types';

// F6 of PLAN_daily_flow: a day's quick reminders on the Timebox and the Calendar (lib/quickReminder.ts). Each is a small
// round bubble at its time on the left edge of the day, drawn over the grid: it takes no lane and the blocks are laid out
// as if it were not there. Its text shows beside it at 14 px when no block covers that time, and always on hover and
// in its small card. A click opens the card: Done (the tick: the bubble goes, Ctrl+Z puts it back), Edit, Close.
// A ticked reminder has no bubble.
const SIZE = 22;

export interface DayReminder {
  task: Task;
  projected: boolean;
}

// `labelWidth`: the most the 14 px text may take (a narrow Week column).
export default function ReminderBubbles({ dayKey, reminders, spans, labelWidth = 220 }: { dayKey: string; reminders: DayReminder[]; spans: Array<[number, number]>; labelWidth?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(null);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open]);

  const live = reminders.filter((r) => !r.task.completed);
  if (live.length === 0) return null;
  return (
    <>
      {live.map(({ task, projected }) => {
        const at = toMinutes(task.startTime);
        if (at === null) return null;
        const top = ((at - GRID_START_HOUR * 60) / 60) * PX_PER_HOUR;
        const text = reminderText(task);
        const isOpen = open === task.id;
        return (
          <View key={task.id} pointerEvents="box-none" style={[styles.anchor, { top: top - SIZE / 2 }, isOpen && styles.anchorOpen]} {...({ dataSet: { reminderAt: dayKey } } as object)}>
            <Pressable
              onPress={() => setOpen(isOpen ? null : task.id)}
              style={pressStyle(({ hovered }) => [styles.bubble, hovered && styles.bubbleHover])}
              accessibilityRole="button"
              accessibilityLabel={`Reminder at ${formatTime(task.startTime as string)}: ${task.title}`}
              {...({ title: text, dataSet: { reminderBubble: task.id } } as object)}
            >
              <Ionicons name={REMINDER_ICON} size={13} color={Colors.accent} />
            </Pressable>
            {!isOpen && labelFits(at, spans) && (
              <Text pointerEvents="none" numberOfLines={1} style={[styles.label, { maxWidth: Math.max(60, labelWidth) }]} {...({ dataSet: { reminderLabel: task.id } } as object)}>
                {formatTime(task.startTime as string)} {task.title}
              </Text>
            )}
            {isOpen && (
              <View style={styles.card} accessibilityLabel="Reminder" {...({ role: 'dialog', dataSet: { reminderCard: task.id } } as object)}>
                <View style={styles.cardHead}>
                  <Ionicons name={REMINDER_ICON} size={16} color={Colors.accent} />
                  <Text style={styles.cardText}>{text}</Text>
                </View>
                <View style={styles.row}>
                  <Pressable
                    onPress={async () => {
                      setOpen(null);
                      await (projected ? opsForProjected(task) : opsForTask(task)).setCompleted(true);
                      notifyChanged();
                    }}
                    style={pressStyle(({ hovered }) => [styles.btn, outlinedBtnOn, hovered && styles.mainHover])}
                    accessibilityRole="button"
                    accessibilityLabel={`Done: ${task.title}`}
                    {...({ dataSet: { reminderDone: task.id } } as object)}
                  >
                    <Text style={[compactBtnText, outlinedBtnTextOn]}>Done</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setOpen(null);
                      openDetail(task.id);
                    }}
                    style={pressStyle(({ hovered }) => [styles.btn, hovered && outlinedBtnHover])}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit reminder: ${task.title}`}
                  >
                    <Text style={compactBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => setOpen(null)} style={pressStyle(({ hovered }) => [styles.btn, hovered && outlinedBtnHover])} accessibilityRole="button" accessibilityLabel="Close">
                    <Text style={compactBtnText}>Close</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

// The Tasks board (F6): a reminder is a one line row at the top of its day column, never a card and never in the day's
// total: the tick at the left, the alarm icon, then "11:15am Ring the pharmacy". The text opens its details.
export function ReminderRow({ task, projected }: DayReminder) {
  const done = !!task.completed;
  return (
    <View style={styles.boardRow} {...({ dataSet: { reminderRow: task.id } } as object)}>
      <Pressable
        onPress={async () => {
          await (projected ? opsForProjected(task) : opsForTask(task)).setCompleted(!done);
          notifyChanged();
        }}
        style={styles.tick}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${done ? 'Untick' : 'Tick'} reminder: ${task.title}`}
        {...({ dataSet: { reminderTick: task.id } } as object)}
      >
        <RoundCheck done={done} />
      </Pressable>
      <Ionicons name={REMINDER_ICON} size={15} color={done ? Colors.textSecondary : Colors.accent} />
      <Pressable onPress={() => openDetail(task.id)} style={styles.boardTextBtn} accessibilityRole="button" accessibilityLabel={`Open reminder: ${task.title}`}>
        <Text numberOfLines={1} style={[styles.boardText, done && styles.boardTextDone]}>
          {reminderText(task)}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 6, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tick: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  boardTextBtn: { flex: 1, minWidth: 0, minHeight: 32, justifyContent: 'center' },
  boardText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  boardTextDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  // Centred on the day's left edge, over the blocks (they keep all their width).
  anchor: { position: 'absolute', left: -SIZE / 2, height: SIZE, flexDirection: 'row', alignItems: 'center', zIndex: 6 },
  anchorOpen: { zIndex: 40 },
  bubble: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    boxShadow: Colors.shadowMd,
  } as object,
  bubbleHover: { backgroundColor: Colors.accentSoft },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  card: {
    position: 'absolute',
    left: SIZE + 6,
    top: -6,
    width: 260,
    padding: 12,
    gap: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    boxShadow: Colors.shadowMd,
  } as object,
  cardText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { ...outlinedBtn, height: 36, paddingHorizontal: 12, justifyContent: 'center' } as object,
  mainHover: { opacity: 0.9 },
});
