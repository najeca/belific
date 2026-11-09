import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Colors } from '../../lib/theme';
import { breakLineText, breakRowSub } from '../../lib/breakLine';
import { timesOf } from '../../lib/times';
import type { Task } from '../../lib/types';
import Popover, { Row, closePopover, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { openDetail } from './uiStore';

// The quiet line at the foot of a day column (PLAN_breaks_as_gaps, P1, D1): "☕ 3 breaks · 1h 40m". A Break with a time is
// a gap on the Calendar and the Timebox, not a card. Pressing the line lists the day's breaks; each opens its details.
export default function BreakLine({ dayKey, breaks }: { dayKey: string; breaks: Task[] }) {
  const id = `day:${dayKey}:breaks`;
  const { ref, get } = usePopoverAnchor();
  const open = useIsOpen(id);
  const sorted = [...breaks].sort((a, b) => (timesOf(a)[0] ?? '').localeCompare(timesOf(b)[0] ?? '') || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const text = breakLineText(breaks);
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.line, open && styles.lineOpen]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Breaks on ${dayKey}: ${text.replace('☕ ', '')}`}
        {...({ dataSet: { breakLine: dayKey } } as object)}
      >
        <Text style={styles.text} numberOfLines={1}>
          {text}
        </Text>
      </Pressable>
      {open && (
        <Popover id={id} anchor={get} width={264} label={`Breaks on ${dayKey}`}>
          {sorted.map((b) => (
            <Row
              key={b.id}
              label={b.title}
              sub={breakRowSub(b)}
              a11y={`Open ${b.title}`}
              onPress={() => {
                closePopover(true);
                openDetail(b.id, 'title');
              }}
            />
          ))}
        </Popover>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  line: { alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 6, justifyContent: 'center' },
  lineOpen: { backgroundColor: Colors.surface },
  text: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
});
