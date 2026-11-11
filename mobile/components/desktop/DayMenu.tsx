import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatShortDate, parseDateKey, WEEKDAYS } from '../../lib/kanban';
import { canShift, freeDaysAfter, planAwayMoves, planPushWeek, planShiftDay, tasksWord, weekEndOf, type DayMove } from '../../lib/dayShift';
import { applyMoves } from '../../lib/dayShiftActions';
import type { Task } from '../../lib/types';
import Popover, { PopoverHeading, Row, closePopover, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { markAway } from './awayStore';
import { offerUndo } from './uiStore';
import { ClearBody } from './ClearTools';
import { loadTasksRaw } from '../../lib/storage';
import { carryToDay } from '../../lib/breakCarry';
import { runUndo } from './useUndoRedo';

// The day header menu on the Tasks board (2.27.0): ⋮ beside a day's name, for
// today and later days. Mark as away (item 8): a day with unfinished one off
// tasks asks what to do with them first (move them all to the next free day,
// spread them one per free day, or leave them). Moves can be undone straight
// after; done tasks and repeating days never move. Shift (item 10): "Shift
// unfinished to next day" and "Push rest of week by a week", each saying how
// many will move, keeping each task's time of day and order, with an undo.
export const dayName = (day: string) => `${WEEKDAYS[parseDateKey(day).getDay()]} ${formatShortDate(day)}`;

// F2 of PLAN_daily_flow: a shift moved this way takes what is inside it along (breakCarry.carryToDay), and the Undo is
// the undo stack's (one gesture), so it puts the carried items back too.
export async function moveWithUndo(moves: DayMove[], text: (n: number) => string, onChanged: () => void): Promise<number> {
  const before = new Map((await loadTasksRaw()).map((t) => [t.id, t]));
  const done = await applyMoves(moves);
  for (const m of done) {
    const t = before.get(m.id);
    if (t) await carryToDay(t, m.to);
  }
  onChanged();
  if (done.length > 0) offerUndo(text(done.length), runUndo);
  return done.length;
}

export default function DayMenu({ dayKey, tasks, away, awayDays, onChanged }: { dayKey: string; tasks: Task[]; away: boolean; awayDays: ReadonlySet<string>; onChanged: () => void }) {
  const id = `day:${dayKey}:menu`;
  const { ref, get } = usePopoverAnchor();
  const open = useIsOpen(id);
  const [asking, setAsking] = useState(false);
  // F2 of PLAN_daily_flow: Clear day asks in this same popover.
  const [clearing, setClearing] = useState(false);
  useEffect(() => {
    if (!open) {
      setAsking(false);
      setClearing(false);
    }
  }, [open]);
  const movable = tasks.filter((t) => canShift(t) && t.dueDate === dayKey);
  const name = dayName(dayKey);

  async function markAwayAs(mode: 'next' | 'spread' | 'leave') {
    closePopover(true);
    await markAway(dayKey, true);
    if (mode !== 'leave') {
      const moves = planAwayMoves(tasks, dayKey, mode, awayDays);
      await moveWithUndo(moves, (n) => `${name} is away. Moved ${tasksWord(n)} ${mode === 'next' ? `to ${dayName(moves[0].to)}` : 'across the next days'}.`, onChanged);
    } else onChanged();
  }

  const nextFree = freeDaysAfter(dayKey, new Set([...awayDays, dayKey]), 1)[0];
  const shiftDay = planShiftDay(tasks, dayKey);
  const pushWeek = planPushWeek(tasks, dayKey);
  const willMove = (n: number) => (n === 0 ? 'Nothing to move' : `${tasksWord(n)} will move`);
  async function shift(moves: DayMove[], text: (n: number) => string) {
    closePopover(true);
    await moveWithUndo(moves, text, onChanged);
  }
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.btn, open && styles.btnOpen]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Day menu for ${name}`}
        {...({ dataSet: { dayMenu: dayKey } } as object)}
      >
        <Ionicons name="ellipsis-horizontal" size={16} color={Colors.textSecondary} />
      </Pressable>
      {open && (
        <Popover id={id} anchor={get} width={clearing ? 360 : 276} maxHeight={560} label={`Menu for ${name}`}>
          {clearing ? (
            <ClearBody target={{ kind: 'day', dayKey }} onDone={() => closePopover(true)} />
          ) : asking ? (
            <>
              <PopoverHeading>{`${tasksWord(movable.length)} on ${name}`}</PopoverHeading>
              <Row label="Move them to the next free day" sub={nextFree ? dayName(nextFree) : undefined} onPress={() => markAwayAs('next')} a11y="Move them to the next free day" />
              <Row label="Spread them across the next days" sub="One a day, skipping away days" onPress={() => markAwayAs('spread')} a11y="Spread them across the next days" />
              <Row label="Leave them here" onPress={() => markAwayAs('leave')} a11y="Leave them here" />
              <Row label="Cancel" onPress={() => setAsking(false)} a11y="Cancel marking away" />
            </>
          ) : (
            <>
              {away ? (
                <Row
                  label="Not away any more"
                  leading={<Ionicons name="sunny-outline" size={14} color={Colors.textSecondary} />}
                  onPress={async () => {
                    closePopover(true);
                    await markAway(dayKey, false);
                    onChanged();
                  }}
                  a11y={`Not away on ${name}`}
                />
              ) : (
                <Row
                  label="Mark as away"
                  sub={movable.length > 0 ? `${tasksWord(movable.length)} on this day` : undefined}
                  leading={<Ionicons name="airplane-outline" size={14} color={Colors.textSecondary} />}
                  onPress={() => (movable.length > 0 ? setAsking(true) : markAwayAs('leave'))}
                  a11y={`Mark ${name} as away`}
                />
              )}
              <Row
                label="Shift unfinished to next day"
                sub={willMove(shiftDay.length)}
                disabled={shiftDay.length === 0}
                leading={<Ionicons name="arrow-forward" size={14} color={Colors.textSecondary} />}
                onPress={() => shift(shiftDay, (n) => `Moved ${tasksWord(n)} from ${name} to ${dayName(shiftDay[0].to)}.`)}
                a11y={`Shift unfinished to next day, ${willMove(shiftDay.length)}`}
              />
              <Row
                label="Push rest of week by a week"
                sub={`${willMove(pushWeek.length)}, up to ${dayName(weekEndOf(dayKey))}`}
                disabled={pushWeek.length === 0}
                leading={<Ionicons name="play-forward" size={14} color={Colors.textSecondary} />}
                onPress={() => shift(pushWeek, (n) => `Pushed ${tasksWord(n)} a week on.`)}
                a11y={`Push rest of week by a week, ${willMove(pushWeek.length)}`}
              />
              <Row label="Clear day" sub="Back to their lists" leading={<Ionicons name="close-circle-outline" size={14} color={Colors.textSecondary} />} onPress={() => setClearing(true)} a11y={`Clear ${name}`} />
            </>
          )}
        </Popover>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  btn: { marginLeft: 'auto', width: 28, height: 28, borderRadius: 0, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  btnOpen: { backgroundColor: Colors.surface },
});
