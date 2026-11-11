// "Task or Break" (3.27.0): the words of the two option control that replaced the Split switch, on the
// desktop's details and the phone's. Pure: NO runtime imports; see taskKind.test.ts.
//
// The stored value is unchanged: a Break is a task with `cutsBelow` true (Part B), a Task has it unset.
// Only the words shown to the person changed (Split became Break); internal names stay.
import type { Task } from './types.ts';

export type TaskKind = 'task' | 'break';

export const KIND_LABEL = 'Task or Break';
export const TASK_HINT = 'A normal task. If you place it inside a break it shows as a chip in that break.';
export const BREAK_HINT = 'Cuts the tasks it overlaps into pieces and can hold other tasks inside it.';
// 3.35.0: the desktop's words since a break is drawn as a gap (PLAN_breaks_as_gaps P2). The phone keeps TASK_HINT until P5.
export const TASK_HINT_DESKTOP = "A normal task. If you place it inside a break it shows as a block in that break's gap.";
// Shifts S2: the desktop details no longer offer Task or Break. Free time keeps one plain way back.
export const FREE_TIME_TEXT = 'Free time is not counted as planned. Blocks inside it count in full.';
export const MAKE_NORMAL = 'Make it a normal block';
// The small tag on a Break's card, and the cup before a Break's title on its Calendar and Timebox block.
export const BREAK_TAG = 'Break';
export const BREAK_CUP = '☕';
// A Task placed over a Break (it is hosted): the details say where it shows.
export const showsInside = (breakTitle: string): string => `Shows inside ${breakTitle}`;
// A Break placed inside another Break: its own Break is ignored while it is there.
export const breakIgnored = (breakTitle: string): string => `Its Break is ignored while it is inside ${breakTitle}.`;

export function kindOf(task: Pick<Task, 'cutsBelow'>): TaskKind {
  return task.cutsBelow ? 'break' : 'task';
}

// Breaks are free gaps, not work (PLAN_breaks_as_gaps, P1): every planned total and estimate, Analytics and Missed
// leave them out, and they have no tick box.
export function isBreak(task: Pick<Task, 'cutsBelow'>): boolean {
  return !!task.cutsBelow;
}

// The patch for a choice: Break stores cutsBelow true, Task clears it (as the old switch did).
export function kindPatch(kind: TaskKind): Pick<Task, 'cutsBelow'> {
  return { cutsBelow: kind === 'break' ? true : undefined };
}
