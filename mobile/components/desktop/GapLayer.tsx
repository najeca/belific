import React, { useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { GRID_START_HOUR, PX_PER_HOUR, toMinutes } from '../../lib/timebox';
import { slotLabel, taskDuration, yToMinutes } from '../../lib/drag';
import { gapTip, type GapSpan } from '../../lib/gaps';
import type { Task } from '../../lib/types';
import { domNode, useDrag } from './DragProvider';
import { openDetail } from './uiStore';
import { tipRef } from './tip';

// A Break drawn as a free gap (PLAN_breaks_as_gaps P2 and P3, 3.34.0; lib/gaps.ts). The Calendar's Day and Week
// columns and the Timebox draw the same thing:
//  * GapLayer, UNDER the blocks: each break at its real times, full column width, light 45 degree hatching and a
//    1 px dashed outline; no fill, no ☕, no text. The tasks in it are ordinary blocks drawn over it, so only its
//    free part shows. Hover: "Short break · 20 min". A press opens the break's details; a drag on its body moves
//    it (as a block moves: 30 minute steps, this day only on a repeating break).
//  * GapEdges, ABOVE the blocks: a thin strip at the top and bottom edge of each gap that resizes it (5 minute
//    steps), and, for a cut that was refused, the gap's outline over the task drawn whole (no pointer events).
// The rest of yesterday's overnight break is drawn but not moved or resized here (it is edited on its own day).
export interface DrawnGap extends GapSpan {
  // The single-time copy the gap shows, the real task (what a drag or resize writes), its time of several.
  task: Task;
  full: Task;
  projected: boolean;
  time?: string;
  suffix?: string;
}

const EDGE_PX = 6;
const EDGE_SMALL_PX = 4;
export const GAP_SNAP_MIN = 5;
const topOf = (min: number) => ((min - GRID_START_HOUR * 60) / 60) * PX_PER_HOUR;
const heightOf = (min: number) => Math.max(4, (min / 60) * PX_PER_HOUR);

function blockKeyOf(g: DrawnGap): string {
  return `${g.task.id}${g.suffix ?? ''}`;
}

export function GapLayer({ gaps, scope = '', gridNode, dimmed }: { gaps: DrawnGap[]; scope?: string; gridNode: () => HTMLElement | null; dimmed?: boolean }) {
  return (
    <>
      {gaps.map((g) => (
        <Gap key={g.id} g={g} scope={scope} gridNode={gridNode} dimmed={dimmed} />
      ))}
    </>
  );
}

function Gap({ g, scope, gridNode, dimmed }: { g: DrawnGap; scope: string; gridNode: () => HTMLElement | null; dimmed?: boolean }) {
  const { drag, sourceRef } = useDrag();
  const live = useRef(g);
  live.current = g;
  const dragRef = sourceRef(`gap:${scope}${blockKeyOf(g)}`, (e) => {
    const cur = live.current;
    const grid = gridNode();
    const start = toMinutes(cur.task.startTime);
    if (cur.cont || !grid || start === null) return null;
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
      grabOffsetMin: Math.max(0, yToMinutes(e.clientY, grid.getBoundingClientRect().top) - start),
    };
  });
  const len = Math.min(1440, g.endMin) - g.startMin;
  const tip = gapTip(g.task.title, g.endMin - g.startMin, g.note);
  const nodeRef = useCallback(
    (instance: unknown) => {
      dragRef(instance);
      tipRef(tip)(instance);
    },
    [dragRef, tip],
  );
  // While its edge is dragged the gap shows its new span and the snapped time.
  const resizing = drag?.mode === 'resize' && drag.item.id === g.task.id && drag.item.scope === scope && drag.item.time === g.time ? drag : null;
  const lifted = drag?.mode === 'move' && drag.item.id === g.task.id && drag.item.time === g.time;
  const start = resizing?.resizeStart ?? g.startMin;
  const length = resizing?.resizeDuration ?? len;
  const key = blockKeyOf(g);
  const data = {
    gap: g.task.id,
    ...(scope ? { calBlock: `${scope}${key}` } : { blockId: key }),
    blockTask: g.task.id,
    cuts: '1',
    ...(g.time ? { blockTime: g.time } : {}),
    ...(g.cont ? { continuation: '1' } : {}),
    ...(g.refused ? { gapRefused: '1' } : {}),
  };
  return (
    <Pressable
      ref={nodeRef as never}
      onPress={() => openDetail(g.task.id)}
      style={[styles.gap, { top: topOf(start), height: heightOf(Math.min(length, 1440 - start)) }, lifted && styles.lifted, dimmed && styles.dimmed, resizing && styles.active]}
      accessibilityRole="button"
      accessibilityLabel={`Break ${tip}`}
      {...({ dataSet: data } as object)}
    >
      {resizing ? (
        <Text style={styles.snap} numberOfLines={1}>
          {slotLabel(start, length)}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function GapEdges({ gaps, scope = '', gridNode, off }: { gaps: DrawnGap[]; scope?: string; gridNode: () => HTMLElement | null; off?: boolean }) {
  return (
    <>
      {gaps.map((g) => (
        <React.Fragment key={g.id}>
          {g.refused && <View pointerEvents="none" style={[styles.refused, { top: topOf(g.startMin), height: heightOf(Math.min(1440, g.endMin) - g.startMin) }]} {...({ dataSet: { gapOutline: g.task.id } } as object)} />}
          {!g.cont && !off && !g.time && <Edge g={g} edge="top" scope={scope} gridNode={gridNode} />}
          {!g.cont && !off && <Edge g={g} edge="bottom" scope={scope} gridNode={gridNode} />}
        </React.Fragment>
      ))}
    </>
  );
}

function Edge({ g, edge, scope, gridNode }: { g: DrawnGap; edge: 'top' | 'bottom'; scope: string; gridNode: () => HTMLElement | null }) {
  const { startResize } = useDrag();
  const live = useRef(g);
  live.current = g;
  const cleanup = useRef<(() => void) | null>(null);
  const ref = useCallback(
    (instance: unknown) => {
      cleanup.current?.();
      cleanup.current = null;
      const el = domNode(instance);
      if (!el) return;
      const down = (e: PointerEvent) => {
        const cur = live.current;
        const grid = gridNode();
        const start = toMinutes(cur.task.startTime);
        if (!grid || start === null) return;
        startResize(e, cur.full, start, grid, cur.projected, scope, { edge, snap: GAP_SNAP_MIN, ...(cur.time ? { time: cur.time } : {}), length: taskDuration(cur.task) });
      };
      el.style.cursor = 'ns-resize';
      el.addEventListener('pointerdown', down);
      cleanup.current = () => el.removeEventListener('pointerdown', down);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startResize, scope, edge],
  );
  const h = heightOf(Math.min(1440, g.endMin) - g.startMin);
  const px = h >= 24 ? EDGE_PX : EDGE_SMALL_PX;
  const top = edge === 'top' ? topOf(g.startMin) : topOf(g.startMin) + h - px;
  return (
    <View
      ref={ref as never}
      style={[styles.edge, { top, height: px }]}
      accessibilityLabel={`${edge === 'top' ? 'Move the start of' : 'Move the end of'} ${g.task.title}`}
      {...({ dataSet: { gapEdge: `${edge}:${g.task.id}${g.suffix ?? ''}` } } as object)}
    />
  );
}

const styles = StyleSheet.create({
  gap: {
    position: 'absolute',
    left: 0,
    right: 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.gapLine,
    backgroundImage: `repeating-linear-gradient(45deg, ${Colors.gapHatch} 0px, ${Colors.gapHatch} 1px, transparent 1px, transparent 6px)`,
    paddingHorizontal: 6,
    overflow: 'hidden',
  } as object,
  lifted: { opacity: 0.35 },
  dimmed: { opacity: 0.5 },
  active: { borderColor: Colors.accent, borderStyle: 'solid' },
  snap: { fontSize: 11, fontWeight: '700', color: Colors.accentText, alignSelf: 'flex-end' },
  // A refused cut: the gap's outline over the task that is drawn whole.
  refused: { position: 'absolute', left: 0, right: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.gapLine, zIndex: 3 },
  edge: { position: 'absolute', left: 0, right: 2, zIndex: 3 },
});
