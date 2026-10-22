import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type ColorTokens } from '../../lib/tokens';
import { formatTime } from '../../lib/data';
import { addTimeFields, isTimeDone, MAX_TIMES, moveTimeFields, removeTimeFields, suggestNextTime, timesOf, type TimeEdit, type TimeRefusal } from '../../lib/times';
import type { Task } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { TimeField } from './TimeField';
import { type } from './type';

// Extra times in the phone's task details (PLAN_phone P7): one task at several times a day (Part C),
// with the desktop's rules (lib/times.ts): up to MAX_TIMES, never overlapping, the new one suggested
// after the last. Each later time can be changed or removed; the first is the task's own Time row.
const make = (c: ColorTokens) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 48 },
  label: { ...type.label, color: c.textPrimary, flex: 1 },
  done: { ...type.small, color: c.success },
  note: { ...type.meta, color: c.textSecondary },
  warn: { ...type.meta, color: c.danger },
  add: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 44 },
  addText: { ...type.label, color: c.accentText },
});

export function TimesEditor({ task, onWrite }: { task: Task; onWrite: (fields: Partial<Task>) => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const [note, setNote] = useState<string | null>(null);
  const times = timesOf(task);
  if (times.length === 0) return <Text style={s.note}>Give the task a time first.</Text>;
  const apply = (res: TimeEdit | TimeRefusal) => {
    if (!res.ok) {
      setNote(res.note);
      return;
    }
    setNote(null);
    onWrite(res.fields);
  };
  const next = suggestNextTime(task);
  return (
    <View style={{ gap: 4 }} {...({ dataSet: { timesEditor: '1' } } as object)}>
      {times.slice(1).map((t) => (
        <View key={t} style={s.row} {...({ dataSet: { extraTime: t } } as object)}>
          <TimeField value={t} onChange={(to) => apply(moveTimeFields(task, t, to))} a11y={`Time ${formatTime(t)}`} />
          <View style={{ flex: 1 }} />
          {isTimeDone(task, t) ? <Text style={s.done}>done</Text> : null}
          <Pressable onPress={() => apply(removeTimeFields(task, t))} accessibilityRole="button" accessibilityLabel={`Remove the time ${formatTime(t)}`} hitSlop={10}>
            <Ionicons name="close" size={20} color={c.textSecondary} />
          </Pressable>
        </View>
      ))}
      {times.length < MAX_TIMES && next ? (
        <Pressable style={s.add} onPress={() => apply(addTimeFields(task, next))} accessibilityRole="button" accessibilityLabel="Add another time" {...({ dataSet: { addTime: '1' } } as object)}>
          <Ionicons name="add" size={20} color={c.accentText} />
          <Text style={s.addText}>{`Add another time (${formatTime(next)})`}</Text>
        </Pressable>
      ) : (
        <Text style={s.note}>{times.length >= MAX_TIMES ? `Up to ${MAX_TIMES} times a day.` : 'No free time left after the last one today.'}</Text>
      )}
      {note ? <Text style={s.warn}>{note}</Text> : null}
    </View>
  );
}
