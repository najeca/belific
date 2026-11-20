// The Now card at the top of the phone's Today (PLAN_phone_stepflow section 2, 3.60.0). The words come from
// lib/nowCard.ts; the label colour edge on the left and the pill at the top right (the label's name, or "Free time").
import React from 'react';
import { Text, View } from 'react-native';
import { radius, type ColorTokens } from '../../lib/tokens';
import type { NowCard as NowCardWords } from '../../lib/nowCard';
import { useStyles, useTheme } from './theme';
import { inter, mono, type } from './type';
import { PressRow } from './touch';
import { RoundCheck } from './ui';

export interface NowLabel {
  name: string;
  edge: string;
  tint: string;
}

const make = (c: ColorTokens) => ({
  card: { flexDirection: 'row' as const, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' as const },
  edge: { width: 6 },
  body: { flex: 1, paddingVertical: 12, paddingLeft: 12, paddingRight: 12, gap: 4 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 28 },
  head: { ...mono(500), fontSize: 13, color: c.textSecondary, flexShrink: 1 },
  pill: { marginLeft: 'auto' as const, flexShrink: 1, maxWidth: '55%' as const, paddingHorizontal: 10, minHeight: 26, borderRadius: radius.full, borderWidth: 1, justifyContent: 'center' as const },
  pillText: { ...inter(600), fontSize: 13, color: c.textPrimary },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  title: { ...inter(800), fontSize: 24, lineHeight: 30, color: c.textPrimary, flexShrink: 1, flex: 1 },
  quiet: { ...inter(500), fontSize: 17, lineHeight: 23, color: c.textSecondary, flex: 1 },
  left: { ...type.meta, ...inter(500), color: c.textSecondary },
  rule: { width: 48, height: 1, backgroundColor: c.borderStrong, marginVertical: 6 },
  next: { ...inter(500), fontSize: 15, lineHeight: 20, color: c.textPrimary },
  done: { width: 48, height: 48, alignItems: 'center' as const, justifyContent: 'center' as const },
});

export function NowCard({ words, title, label, onDone }: { words: NowCardWords; title: string; label: NowLabel | null; onDone?: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const now = words.now;
  const pill = now && label ? label : null;
  const pillText = words.free ? 'Free time' : pill ? pill.name : null;
  return (
    <View style={s.card} {...({ dataSet: { nowCard: now ? 'now' : words.free && words.freeBlock ? 'freeBlock' : words.next ? 'free' : 'empty' } } as object)}>
      <View style={[s.edge, { backgroundColor: pill?.edge ?? (words.free ? c.borderStrong : c.accent) }]} {...({ dataSet: { nowEdge: pill?.edge ?? '' } } as object)} />
      <View style={s.body}>
        <View style={s.top}>
          <Text style={s.head} numberOfLines={1}>{now ? `NOW · ${words.range}` : 'NOW'}</Text>
          {pillText ? (
            <View style={[s.pill, { backgroundColor: pill?.tint ?? c.background, borderColor: pill?.edge ?? c.borderStrong }]} {...({ dataSet: { nowPill: pillText } } as object)}>
              <Text style={s.pillText} numberOfLines={1}>{pillText}</Text>
            </View>
          ) : null}
        </View>
        {now ? (
          <View style={s.titleRow}>
            <Text style={s.title} numberOfLines={2} {...({ dataSet: { nowTitle: title } } as object)}>{title}</Text>
            {onDone ? (
              <PressRow onTap={onDone} a11y={`Mark ${title} done`} style={s.done} data={{ nowDone: '1' }}>
                <RoundCheck done={false} size={30} />
              </PressRow>
            ) : null}
          </View>
        ) : (
          <Text style={s.quiet} numberOfLines={2}>{words.freeBlock ? words.freeBlock.title : 'Nothing planned now'}</Text>
        )}
        {now ? <Text style={s.left} {...({ dataSet: { nowLeft: words.left } } as object)}>{words.left}</Text> : null}
        <View style={s.rule} />
        <Text style={s.next} {...({ dataSet: { nowNext: words.nextLine } } as object)}>{words.nextLine}</Text>
      </View>
    </View>
  );
}
