import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { radius, type ColorTokens } from '../../lib/tokens';
import { dateKey, isDateKey } from '../../lib/kanban';
import {
  ANNUAL_CONFIRM,
  ANNUAL_WARNING,
  REPEAT_CHOICES,
  WEEK_ORDER,
  WEEKDAY_SET,
  WEEKEND_SET,
  allSeven,
  defaultMonthDay,
  initialDays,
  parseMonthDay,
  repeatKindOf,
  repeatLabel,
  repeatSummary,
  resolveRepeat,
  sameDays,
  switchedKind,
  toggleDay,
  weekdayOf,
  type RepeatKind,
} from '../../lib/repeat';
import type { Task, WeekDay } from '../../lib/types';
import { useStyles } from './theme';
import { inter, type } from './type';
import { Button } from './ui';

// Repeat in the phone's task details (PLAN_phone P7): the desktop's Repeat control (TaskPopovers
// RepeatBody) for a finger, with the same pure rules (lib/repeat.ts): Daily, Weekly with days,
// Every 2 weeks, Monthly on a date, Every year (after the "every device is updated" tick), and a line
// that says exactly what will happen. Apply writes the same fields the desktop writes.
const make = (c: ColorTokens) => ({
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: { minHeight: 40, minWidth: 44, paddingHorizontal: 12, borderRadius: radius.full, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  chipTextOn: { color: c.onAccent },
  summary: { ...type.meta, color: c.textSecondary },
  warn: { ...type.meta, color: c.danger },
  input: { ...inter(500), fontSize: 16, color: c.textPrimary, minHeight: 44, width: 72, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.pane, textAlign: 'center' as const },
  link: { ...inter(600), fontSize: 14, color: c.accentText, paddingVertical: 8 },
});

export function RepeatEditor({ task, onApply }: { task: Task; onApply: (fields: Partial<Task>) => void }) {
  const s = useStyles(make);
  const todayKey = dateKey(new Date());
  const [repeat, setRepeat] = useState<RepeatKind>(repeatKindOf(task.recurrence));
  const [days, setDays] = useState<WeekDay[]>(() => initialDays(task, todayKey));
  const [monthText, setMonthText] = useState(() => String(defaultMonthDay(task)));
  const [annualOk, setAnnualOk] = useState(false);
  const day = isDateKey(task.dueDate) ? task.dueDate : undefined;
  const monthDay = parseMonthDay(monthText);
  const resolved = resolveRepeat(repeat, days, day, monthDay, todayKey);
  const summary = repeatSummary(repeat, days, day, monthDay);
  const needsAnnualOk = repeat === 'annual' && task.recurrence !== 'annual' && !annualOk;

  const chip = (label: string, on: boolean, onPress: () => void, a11y = label) => (
    <Pressable key={a11y} style={[s.chip, on && s.chipOn]} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: on }}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  function choose(kind: RepeatKind) {
    setRepeat(kind);
    if ((kind === 'weekly' || kind === 'biweekly') && (days.length === 0 || (kind === 'weekly' && allSeven(days))) && day) setDays([weekdayOf(day)]);
  }

  return (
    <View style={{ gap: 10 }} {...({ dataSet: { repeatEditor: '1' } } as object)}>
      <View style={s.chips}>{REPEAT_CHOICES.map((r) => chip(repeat === r.kind ? repeatLabel(r.kind, days) : r.label, repeat === r.kind, () => choose(r.kind), `Repeat ${r.label}`))}</View>
      {repeat === 'weekly' || repeat === 'biweekly' ? (
        <>
          <View style={s.chips}>
            {WEEK_ORDER.map((w) =>
              chip(w, days.includes(w), () => {
                const next = toggleDay(days, w);
                setDays(next);
                setRepeat(switchedKind(repeat, next));
              }),
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <Pressable onPress={() => setDays(WEEKDAY_SET)} accessibilityRole="button" accessibilityLabel="Weekdays">
              <Text style={s.link}>{sameDays(days, WEEKDAY_SET) ? '✓ Weekdays' : 'Weekdays'}</Text>
            </Pressable>
            <Pressable onPress={() => setDays(WEEKEND_SET)} accessibilityRole="button" accessibilityLabel="Weekends">
              <Text style={s.link}>{sameDays(days, WEEKEND_SET) ? '✓ Weekends' : 'Weekends'}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
      {repeat === 'monthly' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={s.summary}>Day of the month</Text>
          <TextInput style={s.input} value={monthText} onChangeText={setMonthText} keyboardType="number-pad" accessibilityLabel="Day of the month" />
        </View>
      ) : null}
      {repeat === 'annual' && task.recurrence !== 'annual' ? (
        <View style={{ gap: 8 }} accessibilityLabel="Every year warning">
          <Text style={s.warn}>{`⚠️ ${ANNUAL_WARNING}`}</Text>
          <View style={s.chips}>{chip(ANNUAL_CONFIRM, annualOk, () => setAnnualOk((v) => !v))}</View>
        </View>
      ) : null}
      <Text style={resolved === null ? s.warn : s.summary} accessibilityLabel="Repeat summary">
        {summary}
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <Button
          label="Apply"
          kind="primary"
          disabled={!resolved || needsAnnualOk}
          onPress={() => {
            if (!resolved || needsAnnualOk) return;
            onApply({ dueDate: resolved.dueDate, recurrence: resolved.recurrence, recurrenceDays: resolved.recurrenceDays, recurrenceMonthDay: resolved.recurrenceMonthDay });
          }}
          a11y="Apply repeat"
        />
      </View>
    </View>
  );
}
