import React from 'react';
import { View, StyleSheet } from 'react-native';
import { moveOutOfBreak, removeTimeInBreak, type OutResult } from '../../lib/hostActions';
import type { Task } from '../../lib/types';
import { opsForProjected, opsForTask } from './taskOps';
import { notifyChanged, offerUndo, openDetail, showNotice } from './uiStore';
import Popover, { Row, closePopover } from './Popover';

// A task during a break (3.6.0, lib/hosting.ts). Until 3.33.0 it was a small chip inside the break's block; since
// 3.34.0 (PLAN_breaks_as_gaps P2) a break is a gap and the task is an ordinary block in it (lib/gaps.ts). What is
// left here is shared by that block's menu and the details ("Inside this break", "Shows inside"): moving the task
// out, removing its time, ticking it.
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

// 3.9.0: "Move out of break" and "Remove time": the result is a 5 second Undo, or the note why nothing changed.
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
  // A Break inside a break has no tick either (PLAN_breaks_as_gaps, P1).
  if (g.full.cutsBelow) return Promise.resolve();
  const ops = g.projected ? opsForProjected(g.full) : opsForTask(g.full);
  return g.time ? ops.setTimeDone(g.time, !g.task.completed) : ops.setCompleted(!g.task.completed);
}

// The break a task sits in: where "Move out" puts the task.
export interface HostBreak {
  endMin: number;
  title: string;
}

// 3.34.0: the menu of a block in a gap (a right click on the block): Open, Move out of break, Remove time.
export function HostMenu({ id, anchor, g, brk }: { id: string; anchor: () => HTMLElement | null; g: HostedGuest; brk: HostBreak }) {
  const t = g.task;
  return (
    <Popover id={id} anchor={anchor} width={220} label={`${t.title} during ${brk.title}`}>
      <View style={styles.menu} {...({ dataSet: { hostBlockMenu: g.blockId } } as object)}>
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
  );
}

const styles = StyleSheet.create({
  menu: { paddingVertical: 4 },
});
