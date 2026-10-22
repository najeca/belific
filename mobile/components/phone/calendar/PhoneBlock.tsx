import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../../lib/tokens';
import { blockPlan } from '../../../lib/blockLayout';
import { formatTime } from '../../../lib/data';
import { formatDuration } from '../../../lib/duration';
import { toTime } from '../../../lib/timebox';
import { pieceTimeText } from '../../../lib/cuts';
import { isMustDo, MUST_DO_MARK } from '../../../lib/mustDo';
import type { DaySource } from '../../../lib/phoneDay';
import { useStyles, useTheme } from '../theme';
import { inter, mono } from '../type';

// One block on the phone's Day timeline (PLAN_phone P8): the desktop's TimeBlock rules for a small
// screen (lib/blockLayout.ts, 2.47.0): one line under 36 px, two to 55 px, the full layout from 56 px;
// every line is one line with an ellipsis, so text never runs over text or out of the block. Tasks
// take their label's tint and edge; old events are grey and read only; the iPhone's own events show
// their calendar's colour on the edge.
export interface BlockLook {
  bg: string;
  edge: string;
  listEmoji?: string;
}

const make = (c: ColorTokens) => ({
  block: { flex: 1, borderRadius: radius.xs, borderLeftWidth: 3, overflow: 'hidden' as const, paddingHorizontal: 6, borderWidth: 1, borderColor: c.border },
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, minWidth: 0, overflow: 'hidden' as const },
  title: { ...inter(600), fontSize: 13, lineHeight: 17, color: c.textPrimary, flexShrink: 1, minWidth: 0 },
  done: { color: c.textSecondary, textDecorationLine: 'line-through' as const },
  meta: { ...mono(400), fontSize: 11, lineHeight: 15, color: c.textSecondary, flexShrink: 1, minWidth: 0 },
  right: { ...mono(400), fontSize: 11, lineHeight: 17, color: c.textSecondary, marginLeft: 'auto' as const, flexShrink: 0 },
  mark: { fontSize: 11, color: c.danger, flexShrink: 0 },
  grey: { color: c.textSecondary },
});

export function PhoneBlock({ source, height, look }: { source: DaySource; height: number; look: BlockLook }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const tier = blockPlan(height).tier;
  const pad = tier === 1 ? 1 : 3;
  let title = '';
  let timeText = '';
  let lengthText = '';
  let done = false;
  let high = false;
  let repeats = false;
  let grey = false;
  if (source.kind === 'task') {
    const t = source.task;
    title = `${t.emoji ? `${t.emoji} ` : ''}${t.title}`;
    done = t.completed;
    high = isMustDo(t);
    repeats = !!t.recurrence;
    const piece = source.piece;
    if (piece && !piece.head) {
      timeText = pieceTimeText(formatTime(toTime(piece.startMin)), undefined, formatDuration(piece.leftMin), false);
    } else {
      timeText = formatTime(source.continuation ? '00:00' : (t.startTime ?? ''));
      lengthText = formatDuration(t.durationMinutes) ?? '';
    }
  } else if (source.kind === 'event') {
    title = `${source.event.icon ? `${source.event.icon} ` : ''}${source.event.title}`;
    timeText = `${formatTime(source.event.start)} to ${formatTime(source.event.end)}`;
    grey = true;
  } else {
    title = source.seg.occ.title;
    const occ = source.seg.occ as typeof source.seg.occ & { calendarName?: string };
    timeText = `${toTime(source.seg.startMin)} ${occ.calendarName ?? ''}`.trim();
  }
  const right = tier === 1 ? (lengthText || timeText) : '';
  return (
    <View style={[s.block, { backgroundColor: look.bg, borderLeftColor: look.edge, paddingVertical: pad, justifyContent: tier === 1 ? 'center' : 'flex-start' }]}>
      <View style={s.line}>
        <Text style={[s.title, grey && s.grey, done && s.done]} numberOfLines={tier === 3 ? 2 : 1}>
          {title}
        </Text>
        {high ? <Text style={s.mark}>{MUST_DO_MARK}</Text> : null}
        {repeats && tier !== 1 ? <Ionicons name="repeat" size={11} color={c.textSecondary} /> : null}
        {right ? (
          <Text style={s.right} numberOfLines={1}>
            {right}
          </Text>
        ) : null}
      </View>
      {tier !== 1 ? (
        <Text style={s.meta} numberOfLines={1}>
          {[timeText, lengthText, tier === 3 ? (look.listEmoji ?? '') : ''].filter(Boolean).join(' ')}
        </Text>
      ) : null}
    </View>
  );
}
