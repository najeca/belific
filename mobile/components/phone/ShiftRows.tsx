// Shifts S5 (PLAN_shifts): what a placed task with things inside it shows on the phone, the desktop's card in a finger's size: the
// summary ("5h of 10h planned, 5h free"), a bar with "2 of 7 done", its rows (the blocks inside it and its to dos, each with a
// tick that works in place, 44 pt) and a labelled "Add inside" button. Inner blocks are rows, never rows of their own on the
// list (D2). More than six rows shows "Show N more". Text 14 px or more, nothing red. The rules are lib/shifts.ts.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, type ColorTokens } from '../../lib/tokens';
import { ADD_INSIDE, doneText, rowMeta, shiftText, type ShiftInfo, type ShiftRow } from '../../lib/shifts';
import { useStyles } from './theme';
import { inter, mono } from './type';
import { PressRow } from './touch';
import { RoundCheck } from './ui';

export const PHONE_SHIFT_ROWS_SHOWN = 6;

const make = (c: ColorTokens) => ({
  box: { paddingLeft: 56, paddingRight: 16, paddingBottom: 10, gap: 2 },
  summary: { ...inter(700), fontSize: 14, lineHeight: 19, color: c.textPrimary },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 28 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.borderStrong, overflow: 'hidden' as const },
  fill: { height: 6, borderRadius: 3, backgroundColor: c.accent },
  text: { ...inter(500), fontSize: 14, color: c.textSecondary },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44 },
  tick: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  title: { flex: 1, ...inter(500), fontSize: 16, color: c.textPrimary },
  done: { color: c.textSecondary, textDecorationLine: 'line-through' as const },
  meta: { ...mono(500), fontSize: 14, color: c.textSecondary },
  btn: { minHeight: 44, alignSelf: 'flex-start' as const, justifyContent: 'center' as const, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong },
  btnText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  more: { minHeight: 44, justifyContent: 'center' as const, alignSelf: 'flex-start' as const, paddingHorizontal: 4 },
  moreText: { ...inter(600), fontSize: 14, color: c.textPrimary, textDecorationLine: 'underline' as const },
});

export function ShiftRows({ info, onTick, onOpen, onAdd, flush }: { info: ShiftInfo; onTick: (row: ShiftRow) => void; onOpen: (row: ShiftRow) => void; onAdd: () => void; flush?: boolean }) {
  const s = useStyles(make);
  const [all, setAll] = useState(false);
  const rows = all ? info.rows : info.rows.slice(0, PHONE_SHIFT_ROWS_SHOWN);
  const more = info.rows.length - rows.length;
  const summary = shiftText(info);
  const pct = info.count > 0 ? Math.round((info.done / info.count) * 100) : 0;
  return (
    <View style={[s.box, flush && { paddingLeft: 0, paddingRight: 0 }]} {...({ dataSet: { shiftBody: info.task.title } } as object)}>
      {summary ? (
        <Text style={s.summary} {...({ dataSet: { shiftSummary: summary } } as object)}>
          {summary}
        </Text>
      ) : null}
      {info.count > 0 ? (
        <View style={s.head} {...({ dataSet: { shiftProgress: `${info.done}/${info.count}` } } as object)}>
          <View style={s.bar} accessibilityRole="progressbar" accessibilityLabel={doneText(info.done, info.count)} accessibilityValue={{ min: 0, max: info.count, now: info.done }}>
            <View style={[s.fill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.text}>{doneText(info.done, info.count)}</Text>
        </View>
      ) : null}
      {rows.map((r) => {
        const meta = rowMeta(r);
        return (
          <View key={r.key} style={s.row} {...({ dataSet: { insideRow: r.title, insideDone: r.done ? '1' : '0' } } as object)}>
            <PressRow onTap={() => onTick(r)} a11y={r.done ? `Untick ${r.title}` : `Tick ${r.title}`} style={s.tick} data={{ insideTick: r.title }}>
              <RoundCheck done={r.done} size={22} />
            </PressRow>
            {r.kind === 'timed' && r.full ? (
              <Pressable onPress={() => onOpen(r)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`Open ${r.title}`} {...({ dataSet: { insideOpen: r.title } } as object)}>
                <Text style={[s.title, r.done && s.done]} numberOfLines={2}>
                  {r.title}
                </Text>
              </Pressable>
            ) : (
              <Text style={[s.title, r.done && s.done]} numberOfLines={2}>
                {r.title}
              </Text>
            )}
            {meta ? <Text style={s.meta}>{meta}</Text> : null}
          </View>
        );
      })}
      {more > 0 ? (
        <Pressable onPress={() => setAll(true)} style={s.more} accessibilityRole="button" accessibilityLabel={`Show ${more} more`} {...({ dataSet: { shiftMore: String(more) } } as object)}>
          <Text style={s.moreText}>{`Show ${more} more`}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onAdd} style={s.btn} accessibilityRole="button" accessibilityLabel={`${ADD_INSIDE} ${info.task.title}`} {...({ dataSet: { addInside: info.task.title } } as object)}>
        <Text style={s.btnText}>{`+ ${ADD_INSIDE}`}</Text>
      </Pressable>
    </View>
  );
}
