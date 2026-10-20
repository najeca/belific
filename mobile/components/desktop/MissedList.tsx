import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { formatShortDate, isDateKey } from '../../lib/kanban';
import { MUST_DO_MARK, MUST_DO_TIP, isMustDo } from '../../lib/mustDo';
import { tipRef } from './tip';
import { labelColor } from '../../lib/labelColors';
import type { MissedItem } from '../../lib/missed';
import type { Project, Task } from '../../lib/types';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// The Missed list (2.27.0, item 6): one row per missed one off task or missed
// day of a repeating series, with its actions. The same list, rows and actions
// in the Missed panel (which writes at once) and in Daily Planning and Shutdown
// (where the actions are draft edits, written only on Finish). Quiet wording:
// no red, no "overdue", nothing counted against anyone.
export interface MissedActions {
  today(t: Task): void;
  tomorrow(t: Task): void;
  pickDay(t: Task, day: string): void;
  drop(t: Task): void;
  skip(occ: Task): void;
  doToday(occ: Task): void;
  allToday?: () => void;
  // Planning: a missed task can also be ticked as done.
  tick?: (t: Task) => void;
}

export default function MissedList({ items, labels, todayKey, actions, empty, rowLabel }: { items: MissedItem[]; labels: Project[]; todayKey: string; actions: MissedActions; empty: string; rowLabel?: (t: Task) => string }) {
  const oneOffs = items.filter((m) => m.kind === 'task');
  if (items.length === 0) return <Text style={styles.muted}>{empty}</Text>;
  return (
    <View style={styles.list} {...({ dataSet: { missedList: '1' } } as object)}>
      {actions.allToday && oneOffs.length > 1 && (
        <Pressable onPress={actions.allToday} style={styles.allBtn} accessibilityRole="button" accessibilityLabel={`Move all ${oneOffs.length} to today`}>
          <Text style={styles.allText}>Move all to today ({oneOffs.length})</Text>
        </Pressable>
      )}
      {items.map((m) => {
        const t = m.task;
        const label = labels.find((l) => l.key === t.projectKey);
        const color = labelColor(label?.colorKey);
        return (
          <View key={`${t.id}|${m.day}`} style={styles.row} accessibilityLabel={rowLabel ? rowLabel(t) : `Missed ${t.title}, ${formatShortDate(m.day)}`} {...({ dataSet: { missedRow: t.id, missedDay: m.day } } as object)}>
            <View style={styles.head}>
              {actions.tick && m.kind === 'task' && (
                <Pressable onPress={() => actions.tick?.(t)} style={[styles.box, t.completed && styles.boxOn]} accessibilityRole="button" accessibilityLabel={t.completed ? `Mark ${t.title} not done` : `Mark ${t.title} done`} />
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
              <Text style={styles.when}>
                {m.kind === 'occurrence' ? '🔁 ' : ''}
                {formatShortDate(m.day)}
              </Text>
            </View>
            <View style={styles.actions}>
              {m.kind === 'task' ? (
                <>
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
                </>
              ) : (
                <>
                  <Act text="Skip" a11y={`Skip ${t.title} on ${formatShortDate(m.day)}`} onPress={() => actions.skip(t)} />
                  <Act text="Do it today" a11y={`Do ${t.title} today`} onPress={() => actions.doToday(t)} />
                </>
              )}
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
  allBtn: { alignSelf: 'flex-start', paddingHorizontal: 12, height: 32, borderRadius: 10, backgroundColor: Colors.accent, justifyContent: 'center' },
  allText: { fontSize: 13, fontWeight: '700', color: Colors.onAccent },
  row: { padding: 10, borderRadius: 12, backgroundColor: Colors.surface, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: { width: 18, height: 18, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.textSecondary },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  done: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  must: { fontSize: 12, lineHeight: 16 },
  when: { fontSize: 12, color: Colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 2 },
  act: { paddingHorizontal: 10, height: 28, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  actText: { fontSize: 12, fontWeight: '600', color: Colors.accentText },
});
