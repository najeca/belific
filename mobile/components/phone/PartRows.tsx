// R6 of PLAN_repeat_end_and_parts: a task's parts as rows under it on the phone (Today, a list), the desktop's wording: a bar
// and "2 of 5 done", then up to five rows, each with a tick that works in place (44pt), its name and its estimate; more than
// five reads "3 more", which opens the details. Parts are never rows of their own. Text 14 px or more, nothing red.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Task } from '../../lib/types';
import { partsProgress } from '../../lib/parts';
import { formatMinutes } from '../../lib/timebox';
import { radius, type ColorTokens } from '../../lib/tokens';
import { useStyles } from './theme';
import { inter } from './type';
import { PressRow } from './touch';
import { RoundCheck } from './ui';

export const PHONE_PART_ROWS_SHOWN = 5;

const make = (c: ColorTokens) => ({
  box: { paddingLeft: 56, paddingRight: 16, paddingBottom: 10, gap: 2 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 28 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.borderStrong, overflow: 'hidden' as const },
  fill: { height: 6, borderRadius: 3, backgroundColor: c.accent },
  text: { ...inter(500), fontSize: 14, color: c.textSecondary },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 44 },
  title: { flex: 1, ...inter(500), fontSize: 16, color: c.textPrimary },
  done: { color: c.textSecondary, textDecorationLine: 'line-through' as const },
  more: { minHeight: 44, justifyContent: 'center' as const, alignSelf: 'flex-start' as const, paddingHorizontal: 4, borderRadius: radius.md },
  moreText: { ...inter(600), fontSize: 14, color: c.textPrimary, textDecorationLine: 'underline' as const },
});

export function PartRows({ parent, parts, onTick, onMore }: { parent: Task; parts: Task[]; onTick: (part: Task, done: boolean) => void; onMore: () => void }) {
  const s = useStyles(make);
  if (parts.length === 0) return null;
  const progress = partsProgress(parts);
  const shown = parts.slice(0, PHONE_PART_ROWS_SHOWN);
  const more = parts.length - shown.length;
  return (
    <View style={s.box} {...({ dataSet: { cardParts: parent.title } } as object)}>
      <View style={s.head}>
        <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: progress.total, now: progress.done }} {...({ dataSet: { cardPartsBar: `${progress.done}/${progress.total}` } } as object)}>
          <View style={[s.fill, { width: `${Math.round((progress.done / progress.total) * 100)}%` }]} />
        </View>
        <Text style={s.text} {...({ dataSet: { cardPartsDone: progress.text } } as object)}>
          {progress.text}
        </Text>
      </View>
      {shown.map((p) => (
        <View key={p.id} style={s.row} {...({ dataSet: { cardPart: p.title } } as object)}>
          <PressRow onTap={() => onTick(p, !p.completed)} a11y={p.completed ? `Untick ${p.title}` : `Tick ${p.title}`} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} data={{ partTick: p.title }}>
            <RoundCheck done={p.completed} size={22} />
          </PressRow>
          <Text style={[s.title, p.completed && s.done]} numberOfLines={1}>
            {p.title}
          </Text>
          {p.durationMinutes ? <Text style={s.text}>{formatMinutes(p.durationMinutes)}</Text> : null}
        </View>
      ))}
      {more > 0 ? (
        <Pressable onPress={onMore} style={s.more} accessibilityRole="button" accessibilityLabel={`${more} more parts of ${parent.title}`} {...({ dataSet: { cardPartsMore: String(more) } } as object)}>
          <Text style={s.moreText}>{more} more</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
