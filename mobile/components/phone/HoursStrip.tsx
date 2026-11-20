// The hours strip under the Now card on the phone's Today (PLAN_phone_stepflow section 2, 3.60.0): one thin bar, one
// part per label in its colour (longest first, from lib/labelHours.ts), and a short legend under it. Not drawn when
// nothing is planned.
import React from 'react';
import { Text, View } from 'react-native';
import { radius, type ColorTokens } from '../../lib/tokens';
import { labelColor } from '../../lib/labelColors';
import { formatMinutes } from '../../lib/timebox';
import type { HoursPart } from '../../lib/labelHours';
import { useStyles, useTheme } from './theme';
import { inter, mono } from './type';

const make = (c: ColorTokens) => ({
  box: { gap: 6, paddingTop: 2 },
  head: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  headText: { ...inter(600), fontSize: 13, color: c.textSecondary },
  total: { ...mono(500), fontSize: 13, color: c.textPrimary },
  bar: { flexDirection: 'row' as const, height: 10, borderRadius: radius.full, overflow: 'hidden' as const, backgroundColor: c.border, gap: 2 },
  legend: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, columnGap: 12, rowGap: 2 },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  itemText: { ...inter(500), fontSize: 13, color: c.textSecondary },
});

export function HoursStrip({ parts, total }: { parts: HoursPart[]; total: number }) {
  const s = useStyles(make);
  const { c } = useTheme();
  if (total <= 0) return null;
  const colorOf = (p: HoursPart) => (p.key ? (labelColor(p.colorKey)?.edge ?? c.textTertiary) : c.borderStrong);
  const words = parts.map((p) => `${p.emoji ? `${p.emoji} ` : ''}${p.name} ${formatMinutes(p.minutes)}`);
  return (
    <View style={s.box} accessible accessibilityLabel={`Hours today, ${formatMinutes(total)}: ${words.join(', ')}`} {...({ dataSet: { hoursStrip: String(total) } } as object)}>
      <View style={s.head}>
        <Text style={s.headText}>Hours today</Text>
        <Text style={s.total}>{formatMinutes(total)}</Text>
      </View>
      <View style={s.bar}>
        {parts.map((p) => (
          <View key={p.key || 'none'} style={{ flex: p.minutes, backgroundColor: colorOf(p) }} {...({ dataSet: { hoursPart: p.key || 'none', hoursMinutes: String(p.minutes), hoursColor: colorOf(p) } } as object)} />
        ))}
      </View>
      <View style={s.legend}>
        {parts.map((p, i) => (
          <View key={p.key || 'none'} style={s.item}>
            <View style={[s.dot, { backgroundColor: colorOf(p) }]} />
            <Text style={s.itemText}>{words[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
