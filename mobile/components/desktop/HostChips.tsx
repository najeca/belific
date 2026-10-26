import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { formatDuration } from '../../lib/duration';
import { toMinutes } from '../../lib/timebox';
import { taskDuration, yToMinutes } from '../../lib/drag';
import { moveOutOfBreak, removeTimeInBreak, type OutResult } from '../../lib/hostActions';
import type { Task } from '../../lib/types';
import { opsForProjected, opsForTask } from './taskOps';
import { notifyChanged, offerUndo, openDetail, showNotice } from './uiStore';
import { tipRef } from './tip';
import { domNode, useDrag } from './DragProvider';
import Popover, { Row, closePopover, openPopover, togglePopover, usePopoverAnchor } from './Popover';

// A task during a break (3.6.0, lib/hosting.ts): the hosted task as a small rounded chip inside the
// break's block, light with dark text in both themes (tokens hostChip and onHostChip) so it reads on a
// plain, tinted or vibrant break. The dot is the task's label colour; pressing it ticks the task,
// pressing the rest of the chip opens the task. The task keeps everything of its own.
export interface HostedGuest {
  // The task's own block id (task:<id><suffix>).
  blockId: string;
  // The single-time copy (a task with several times); `full` is the real task.
  task: Task;
  full: Task;
  projected: boolean;
  time?: string;
  // The label colour, else a neutral.
  dot: string;
}

export function guestText(g: HostedGuest): string {
  const len = formatDuration(g.task.durationMinutes);
  return `${g.task.emoji ? `${g.task.emoji} ` : ''}${g.task.title}${len ? ` ${len}` : ''}${g.task.completed ? ' (done)' : ''}`;
}

// 3.9.0: the chip's menu ("Move out of break", "Remove time") and the details' Move out: the result
// is a 5 second Undo, or the note why nothing changed.
export const OUT_UNDO_MS = 5000;
export const MOVE_OUT = 'Move out of break';
export async function showOutResult(r: OutResult): Promise<void> {
  if (r.ok) offerUndo(r.text, r.undo, OUT_UNDO_MS);
  else showNotice(r.note);
  notifyChanged();
}
export const moveOut = (g: HostedGuest, brk: HostBreak) => moveOutOfBreak(g, brk).then(showOutResult);
export const removeTime = (g: HostedGuest) => removeTimeInBreak(g).then(showOutResult);
// Ticks (or reopens) a hosted task: only its time inside the break, for a task with several times.
export function tickGuest(g: HostedGuest): Promise<void> {
  const ops = g.projected ? opsForProjected(g.full) : opsForTask(g.full);
  return g.time ? ops.setTimeDone(g.time, !g.task.completed) : ops.setCompleted(!g.task.completed);
}

// The break a chip sits in: where "Move out" puts the task.
export interface HostBreak {
  endMin: number;
  title: string;
}

// The break's tooltip line for everything it hosts.
export function hostedTip(guests: HostedGuest[]): string {
  return guests.length ? `During it: ${guests.map(guestText).join('; ')}` : '';
}

export function HostChip({
  g,
  onChanged,
  inline,
  brk,
  scope = '',
  gridNode,
}: {
  g: HostedGuest;
  onChanged: () => void;
  inline?: boolean;
  brk: HostBreak;
  scope?: string;
  gridNode: () => HTMLElement | null;
}) {
  const t = g.task;
  const len = formatDuration(t.durationMinutes);
  const menuId = `hostchip:${scope}${g.blockId}`;
  const { ref: anchorRef, get: anchor } = usePopoverAnchor();
  const { sourceRef } = useDrag();
  const live = useRef(g);
  live.current = g;
  // 3.9.0: a chip drags like a block: dropped anywhere it is a normal move (and so ends the hosting).
  const dragRef = sourceRef(`chip:${scope}${g.blockId}`, (e) => {
    const grid = gridNode();
    const cur = live.current;
    const start = toMinutes(cur.task.startTime);
    if (!grid || start === null) return null;
    return {
      kind: 'block',
      task: cur.full,
      ...(cur.time ? { time: cur.time } : {}),
      id: cur.task.id,
      title: cur.task.title,
      emoji: cur.task.emoji,
      duration: taskDuration(cur.task),
      projected: cur.projected,
      scope,
      grabOffsetMin: Math.max(0, Math.min(taskDuration(cur.task), yToMinutes(e.clientY, grid.getBoundingClientRect().top) - start)),
    };
  });
  // A right click opens the same menu as the small button.
  const menuCleanup = useRef<(() => void) | null>(null);
  const chipRef = useCallback(
    (instance: unknown) => {
      dragRef(instance);
      tipRef(guestText(live.current))(instance);
      menuCleanup.current?.();
      menuCleanup.current = null;
      const el = domNode(instance);
      if (!el) return;
      const onMenu = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openPopover(menuId, anchor);
      };
      el.addEventListener('contextmenu', onMenu);
      menuCleanup.current = () => el.removeEventListener('contextmenu', onMenu);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragRef, menuId, anchor],
  );
  useEffect(() => {
    tipRef(guestText(g))(anchor()?.parentElement ?? null);
  });
  const tick = async () => {
    await tickGuest(g);
    onChanged();
  };
  return (
    <Pressable
      onPress={() => openDetail(t.id)}
      style={[styles.chip, inline ? styles.chipInline : styles.chipStack]}
      accessibilityRole="button"
      accessibilityLabel={`${t.title}${len ? `, ${len}` : ''}, during the break${t.completed ? ', done' : ''}`}
      ref={chipRef as never}
      {...({ dataSet: { hostChip: g.blockId } } as object)}
    >
      <Pressable
        onPress={tick}
        hitSlop={4}
        style={styles.dotHit}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!t.completed }}
        accessibilityLabel={t.completed ? `Untick ${t.title}` : `Tick ${t.title}`}
        {...({ 'aria-checked': !!t.completed, dataSet: { hostTick: g.blockId } } as object)}
      >
        {t.completed ? <Text style={styles.check}>✓</Text> : <View style={[styles.dot, { backgroundColor: g.dot }]} />}
      </Pressable>
      <Text style={[styles.chipTitle, t.completed && styles.chipDone]} numberOfLines={1}>
        {t.emoji ? `${t.emoji} ` : ''}
        {t.title}
      </Text>
      {!!len && <Text style={styles.chipLen}>{len}</Text>}
      <Pressable
        ref={anchorRef as never}
        onPress={() => togglePopover(menuId, anchor)}
        hitSlop={4}
        style={styles.menuBtn}
        accessibilityRole="button"
        accessibilityLabel={`More for ${t.title}`}
        {...({ dataSet: { hostMenu: g.blockId } } as object)}
      >
        <Text style={styles.menuGlyph}>⋯</Text>
      </Pressable>
      <Popover id={menuId} anchor={anchor} width={220} label={`${t.title} during ${brk.title}`}>
        <View style={styles.menu} {...({ dataSet: { hostChipMenu: g.blockId } } as object)}>
          <Row
            label="Open"
            onPress={() => {
              closePopover();
              openDetail(t.id);
            }}
            a11y={`Open ${t.title}`}
          />
          <Row
            label={MOVE_OUT}
            sub={`After ${brk.title}`}
            onPress={() => {
              closePopover();
              void moveOut(g, brk);
            }}
            a11y={MOVE_OUT}
          />
          <Row
            label="Remove time"
            sub="Anytime that day"
            onPress={() => {
              closePopover();
              void removeTime(g);
            }}
            a11y="Remove time"
          />
        </View>
      </Popover>
    </Pressable>
  );
}

// "+N": the hosted tasks there is no room for. Its tooltip lists them all.
export function MoreBadge({ n, tip }: { n: number; tip: string }) {
  return (
    <View ref={tipRef(tip) as never} style={styles.more} accessibilityLabel={`${n} more during the break`} {...({ dataSet: { hostMore: String(n) } } as object)}>
      <Text style={styles.moreText}>+{n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 14,
    paddingLeft: 3,
    paddingRight: 6,
    borderRadius: 7,
    backgroundColor: Colors.hostChip,
    boxShadow: `inset 0 0 0 1px ${Colors.border}`,
    minWidth: 0,
    overflow: 'hidden',
  } as object,
  chipInline: { flexShrink: 1, maxWidth: '62%' },
  chipStack: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 2 },
  dotHit: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  check: { fontSize: 9, lineHeight: 10, fontWeight: '700', color: Colors.onHostChip },
  chipTitle: { flexShrink: 1, minWidth: 0, fontSize: 10, lineHeight: 14, fontWeight: '600', color: Colors.onHostChip },
  chipDone: { textDecorationLine: 'line-through' },
  chipLen: { flexShrink: 0, fontSize: 10, lineHeight: 14, color: Colors.onHostChip },
  menuBtn: { width: 12, height: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: -2, marginRight: -4 },
  menuGlyph: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: Colors.onHostChip },
  menu: { paddingVertical: 4 },
  more: { flexShrink: 0, height: 14, paddingHorizontal: 5, borderRadius: 7, backgroundColor: Colors.hostChip, justifyContent: 'center', boxShadow: `inset 0 0 0 1px ${Colors.border}` } as object,
  moreText: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: Colors.onHostChip },
});
