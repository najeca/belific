import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addDays, dateKey, MONTHS, parseDateKey, weekStartOf } from '../../lib/kanban';
import { radius, type ColorTokens } from '../../lib/tokens';
import { useStyles, useTheme } from './theme';
import { inter } from './type';
import { IconButton } from './ui';

// A month of days to pick from (PLAN_phone P6), weeks starting Monday as on the desktop. Each day is a
// 44 pt target; today is outlined, the chosen day filled.
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const make = (c: ColorTokens) => ({
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  month: { ...inter(600), fontSize: 16, color: c.textPrimary },
  row: { flexDirection: 'row' as const },
  dow: { flex: 1, textAlign: 'center' as const, ...inter(600), fontSize: 11, color: c.textSecondary, paddingVertical: 4 },
  cell: { flex: 1, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  dot: { width: 38, height: 38, borderRadius: radius.full, alignItems: 'center' as const, justifyContent: 'center' as const },
  today: { borderWidth: 1, borderColor: c.accentText },
  on: { backgroundColor: c.accent },
  day: { ...inter(500), fontSize: 15, color: c.textPrimary },
  other: { color: c.textTertiary },
  dayOn: { color: c.onAccent, ...inter(700) },
});

export function MonthGrid({ value, todayKey, onPick }: { value?: string; todayKey: string; onPick: (key: string) => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const start = parseDateKey(value ?? todayKey);
  const [month, setMonth] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const first = new Date(month.y, month.m, 1);
  const gridStart = weekStartOf(first);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row = Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d));
    if (w > 3 && row[0].getMonth() !== month.m) break;
    weeks.push(row);
  }
  const shift = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  return (
    <View {...({ dataSet: { monthGrid: `${month.y}-${month.m + 1}` } } as object)}>
      <View style={s.head}>
        <IconButton name="chevron-back" onPress={() => shift(-1)} a11y="Previous month" color={c.textSecondary} />
        <Text style={s.month}>{`${MONTHS[month.m]} ${month.y}`}</Text>
        <IconButton name="chevron-forward" onPress={() => shift(1)} a11y="Next month" color={c.textSecondary} />
      </View>
      <View style={s.row}>
        {WEEK.map((d) => (
          <Text key={d} style={s.dow}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((row) => (
        <View key={dateKey(row[0])} style={s.row}>
          {row.map((d) => {
            const key = dateKey(d);
            const on = key === value;
            const inMonth = d.getMonth() === month.m;
            return (
              <Pressable key={key} style={s.cell} onPress={() => onPick(key)} accessibilityRole="button" accessibilityLabel={key} accessibilityState={{ selected: on }} {...({ dataSet: { day: key } } as object)}>
                <View style={[s.dot, key === todayKey && s.today, on && s.on]}>
                  <Text style={[s.day, !inMonth && s.other, on && s.dayOn]}>{d.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
