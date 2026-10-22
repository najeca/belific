import React from 'react';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { radius, type ColorTokens } from '../../../lib/tokens';
import { parseDateKey, WEEKDAYS } from '../../../lib/kanban';
import { monthGrid, visibleDayKeys } from '../../../lib/calendarView';
import { shortTitle, type DayItem } from '../../../lib/phoneWeek';
import { useStyles, useTheme } from '../theme';
import { PressRow } from '../touch';
import { inter, type } from '../type';

// The Calendar's Week and Month on the phone (PLAN_phone P9). Week: seven narrow columns with short
// titles only; Month: the weeks of the month with a count and a few marks per day. In both, a tap on a
// day opens that day in Day view; neither ever creates a task.
const MAX_IN_COLUMN = 8;

const make = (c: ColorTokens) => ({
  weekRow: { flexDirection: 'row' as const, paddingHorizontal: 4, gap: 2 },
  col: { flex: 1, minHeight: 420, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 2, gap: 3 },
  colToday: { backgroundColor: c.accentSoft },
  head: { alignItems: 'center' as const, paddingBottom: 4 },
  dow: { ...inter(600), fontSize: 11, color: c.textSecondary },
  num: { ...inter(700), fontSize: 16, color: c.textPrimary },
  numToday: { color: c.accentText },
  chip: { borderRadius: radius.xs, paddingHorizontal: 3, paddingVertical: 2, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  chipText: { ...inter(500), fontSize: 10, lineHeight: 13, color: c.textPrimary },
  chipGrey: { color: c.textSecondary },
  chipDone: { color: c.textSecondary, textDecorationLine: 'line-through' as const },
  more: { ...inter(500), fontSize: 10, color: c.textSecondary, textAlign: 'center' as const },
  monthHead: { flexDirection: 'row' as const, paddingHorizontal: 6, paddingTop: 6 },
  monthDow: { flex: 1, textAlign: 'center' as const, ...inter(600), fontSize: 11, color: c.textSecondary },
  monthRow: { flexDirection: 'row' as const, paddingHorizontal: 6 },
  cell: { flex: 1, minHeight: 64, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 4, alignItems: 'center' as const, gap: 3 },
  cellNum: { ...inter(600), fontSize: 14, color: c.textPrimary, width: 28, height: 28, lineHeight: 28, textAlign: 'center' as const, borderRadius: 14, overflow: 'hidden' as const },
  cellToday: { backgroundColor: c.accent, color: c.onAccent },
  cellOut: { color: c.textSecondary, ...inter(400) },
  dots: { flexDirection: 'row' as const, gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  count: { ...type.small, fontSize: 11, color: c.textSecondary },
});

export function WeekView({ anchor, todayKey, itemsOf, onPick }: { anchor: string; todayKey: string; itemsOf: (key: string) => DayItem[]; onPick: (key: string) => void }) {
  const s = useStyles(make);
  const keys = visibleDayKeys('week', anchor);
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 120 }} {...({ dataSet: { weekView: keys[0] } } as object)}>
      <View style={s.weekRow}>
        {keys.map((k) => {
          const d = parseDateKey(k);
          const items = itemsOf(k);
          const today = k === todayKey;
          return (
            <PressRow key={k} onTap={() => onPick(k)} a11y={`${WEEKDAYS[d.getDay()]} ${d.getDate()}, ${items.length} items. Open the day`} style={[s.col, today && s.colToday]} data={{ weekDay: k }}>
              <View style={s.head}>
                <Text style={s.dow}>{WEEKDAYS[d.getDay()].slice(0, 2)}</Text>
                <Text style={[s.num, today && s.numToday]}>{d.getDate()}</Text>
              </View>
              {items.slice(0, MAX_IN_COLUMN).map((it) => (
                <View key={it.key} style={s.chip} {...({ dataSet: { weekItem: it.key } } as object)}>
                  <Text style={[s.chipText, it.kind !== 'task' && s.chipGrey, it.done && s.chipDone]} numberOfLines={1}>
                    {shortTitle(it.title)}
                  </Text>
                </View>
              ))}
              {items.length > MAX_IN_COLUMN ? <Text style={s.more}>{`+${items.length - MAX_IN_COLUMN}`}</Text> : null}
            </PressRow>
          );
        })}
      </View>
    </ScrollView>
  );
}

export function MonthView({ anchor, todayKey, itemsOf, onPick }: { anchor: string; todayKey: string; itemsOf: (key: string) => DayItem[]; onPick: (key: string) => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const weeks = monthGrid(anchor, todayKey);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }} {...({ dataSet: { monthView: anchor.slice(0, 7) } } as object)}>
      <View style={s.monthHead}>
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <Text key={d} style={s.monthDow}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((row) => (
        <View key={row[0].key} style={s.monthRow}>
          {row.map((cell) => {
            const items = itemsOf(cell.key);
            const open = items.filter((i) => !i.done);
            return (
              <PressRow key={cell.key} onTap={() => onPick(cell.key)} a11y={`${cell.key}, ${items.length} items. Open the day`} style={s.cell} data={{ monthDay: cell.key }}>
                <Text style={[s.cellNum, !cell.inMonth && s.cellOut, cell.isToday && s.cellToday]}>{parseDateKey(cell.key).getDate()}</Text>
                {items.length ? (
                  <>
                    <View style={s.dots}>
                      {open.slice(0, 3).map((i) => (
                        <View key={i.key} style={[s.dot, { backgroundColor: i.kind === 'task' ? (i.high ? c.danger : c.accent) : c.borderStrong }]} />
                      ))}
                    </View>
                    {items.length > 3 ? <Text style={s.count}>{items.length}</Text> : null}
                  </>
                ) : null}
              </PressRow>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}
