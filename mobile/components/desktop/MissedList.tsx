import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { formatShortDate, isDateKey } from '../../lib/kanban';
import { MUST_DO_MARK, MUST_DO_TIP, isMustDo } from '../../lib/mustDo';
import { tipRef } from './tip';
import { labelColor } from '../../lib/labelColors';
import type { MissedItem } from '../../lib/missed';
import type { Project, Task } from '../../lib/types';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import { checkRing, checkRingDone } from './ui';

// The Missed list (2.27.0, item 6): one row per missed one off task, with its actions. The same list, rows and actions
// in the Missed panel (which writes at once) and in Daily Planning and Shutdown
// (where the actions are draft edits, written only on Finish). Quiet wording:
// no red, no "overdue", nothing counted against anyone.
// 3.25.0: no repeating days (they are never listed); "Skip all" and a per row "Done" mark a task done on its own day.
export interface MissedActions {
  today(t: Task): void;
  tomorrow(t: Task): void;
  pickDay(t: Task, day: string): void;
  drop(t: Task): void;
  // Done on its own day (3.25.0): this task, or every task of the list (Skip all).
  done(t: Task): void;
  skipAll?: () => void;
  allToday?: () => void;
  // Planning: a missed task can also be ticked as done.
  tick?: (t: Task) => void;
}

export default function MissedList({ items, labels, todayKey, actions, empty, rowLabel }: { items: MissedItem[]; labels: Project[]; todayKey: string; actions: MissedActions; empty: string; rowLabel?: (t: Task) => string }) {
  const open = items.filter((m) => !m.task.completed);
  if (items.length === 0) return <Text style={styles.muted}>{empty}</Text>;
  return (
    <View style={styles.list} {...({ dataSet: { missedList: '1' } } as object)}>
      {(actions.skipAll || actions.allToday) && open.length > 1 && (
        <View style={styles.allRow}>
          {actions.skipAll && (
            <Pressable onPress={actions.skipAll} style={styles.allBtn} accessibilityRole="button" accessibilityLabel={`Skip all ${open.length}: mark them done on their own days`} {...({ dataSet: { missedSkipAll: '1' }, title: 'Mark them all done on their own days. Nothing is deleted.' } as object)}>
              <Text style={styles.allText}>Skip all ({open.length})</Text>
            </Pressable>
          )}
          {actions.allToday && (
            <Pressable onPress={actions.allToday} style={styles.allBtn} accessibilityRole="button" accessibilityLabel={`Move all ${open.length} to today`} {...({ dataSet: { missedAllToday: '1' } } as object)}>
              <Text style={styles.allText}>Move all to today ({open.length})</Text>
            </Pressable>
          )}
        </View>
      )}
      {items.map((m) => {
        const t = m.task;
        const label = labels.find((l) => l.key === t.projectKey);
        const color = labelColor(label?.colorKey);
        return (
          <View key={`${t.id}|${m.day}`} style={styles.row} accessibilityLabel={rowLabel ? rowLabel(t) : `Missed ${t.title}, ${formatShortDate(m.day)}`} {...({ dataSet: { missedRow: t.id, missedDay: m.day } } as object)}>
            <View style={styles.head}>
              {actions.tick && m.kind === 'task' && (
                <Pressable onPress={() => actions.tick?.(t)} style={[styles.box, t.completed && styles.boxOn]} accessibilityRole="button" accessibilityLabel={t.completed ? `Mark ${t.title} not done` : `Mark ${t.title} done`}>
                  {t.completed && <Ionicons name="checkmark" size={13} color={Colors.success} />}
                </Pressable>
              )}
              {label && <View style={[styles.dot, { backgroundColor: color?.edge ?? Colors.textSecondary }]} />}
              <Text style={[styles.title, t.completed && styles.done]} numberOfLines={2}>
                {t.emoji ? `${t.emoji} ` : ''}
                {t.title}
              </Text>
              {isMustDo(t) && (
                <Text ref={tipRef(MUST_DO_TIP) as never} style={styles.must} accessibilityLabel={MUST_DO_TIP} {...({ 'aria-label': MUST_DO_TIP } as object)}>
                  {MUST_DO_MARK}
                </Text>
              )}
              <Text style={styles.when}>{formatShortDate(m.day)}</Text>
            </View>
            <View style={styles.actions}>
              {!t.completed && <Act text="Done" a11y={`Mark ${t.title} done on ${formatShortDate(m.day)}`} onPress={() => actions.done(t)} />}
              <Act text="Today" a11y={`Move ${t.title} to today`} onPress={() => actions.today(t)} />
              <Act text="Tomorrow" a11y={`Move ${t.title} to tomorrow`} onPress={() => actions.tomorrow(t)} />
              <input
                type="date"
                min={todayKey}
                value=""
                aria-label={`Pick a day for ${t.title}`}
                title="Pick a day"
                onChange={(e) => {
                  const v = e.target.value;
                  if (isDateKey(v) && v >= todayKey) actions.pickDay(t, v);
                }}
                style={dateStyle}
              />
              <Act text="Drop" a11y={`Drop the day of ${t.title}`} onPress={() => actions.drop(t)} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Act({ text, a11y, onPress }: { text: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.act} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={styles.actText}>{text}</Text>
    </Pressable>
  );
}

const dateStyle: React.CSSProperties = {
  height: 28,
  padding: '0 6px',
  borderRadius: 8,
  border: `1px solid ${Colors.border}`,
  background: Colors.surface,
  color: Colors.textPrimary,
  fontSize: 12,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const styles = StyleSheet.create({
  list: { gap: 8 },
  muted: { fontSize: 13, color: Colors.textSecondary },
  allRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allBtn: { alignSelf: 'flex-start', paddingHorizontal: 12, height: 32, borderRadius: 10, backgroundColor: Colors.accent, justifyContent: 'center' },
  allText: { fontSize: 13, fontWeight: '700', color: Colors.onAccent },
  row: { padding: 10, borderRadius: 10, backgroundColor: Colors.surface, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: { ...checkRing(18) } as object,
  boxOn: { ...checkRingDone },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  done: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  must: { fontSize: 12, lineHeight: 16, color: Colors.textPrimary },
  when: { fontSize: 12, color: Colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 2 },
  act: { paddingHorizontal: 10, height: 28, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  actText: { fontSize: 12, fontWeight: '600', color: Colors.accentText },
});
