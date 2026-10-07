// Pure drag and drop logic for the desktop workspace (checkpoint 4, decision
// 019). NO react-native, DOM or storage imports so `node --test` can run it;
// see drag.test.ts. The DOM side (pointer listeners, measuring the panes, the
// lifted card) lives in components/desktop/DragProvider.tsx, which only feeds
// plain numbers and rectangles in here.
import type { Task } from './types.ts';
import { isDateKey } from './kanban.ts';
import { MAX_DURATION } from './duration.ts';
import {
  DEFAULT_TASK_MINUTES,
  GRID_END_HOUR,
  GRID_START_HOUR,
  PX_PER_HOUR,
  toMinutes,
  toTime,
} from './timebox.ts';

// Every Timebox move, drop and resize snaps to this.
export const SNAP_MINUTES = 30;
// A press only becomes a drag after the pointer travels this far, so a click
// still opens the editor.
export const DRAG_THRESHOLD_PX = 5;
// Holding a dragged item this close to the left or right edge of the week
// board for EDGE_DWELL_MS changes the week.
export const EDGE_ZONE_PX = 48;
export const EDGE_DWELL_MS = 600;
// Near the top or bottom of a scrollable pane, a drag scrolls it.
export const AUTO_SCROLL_ZONE_PX = 40;
export const AUTO_SCROLL_MAX_PX = 14;

const GRID_START_MIN = GRID_START_HOUR * 60;
const GRID_END_MIN = GRID_END_HOUR * 60;

// What is being dragged. A left row is a task with no Day or a legacy Brain
// Dump item; a card is on the week board; a block is a placed task on the
// Timebox.
export type DragSourceKind = 'row' | 'card' | 'block';

export type DropTarget =
  | { kind: 'left' }
  | { kind: 'day'; dayKey: string }
  | { kind: 'slot'; dayKey: string; startMin: number };

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// One measured drop zone. `clip` is the visible area of its scroll container
// (a day column scrolled out of the board is not a target). For the Timebox,
// `gridTop` is the client y of 06:00, which moves as the grid scrolls.
export type Zone =
  | { kind: 'left'; rect: Rect }
  | { kind: 'day'; dayKey: string; rect: Rect; clip?: Rect }
  | { kind: 'timebox'; dayKey: string; rect: Rect; gridTop: number };

export function inside(x: number, y: number, r: Rect): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

export function passedThreshold(dx: number, dy: number): boolean {
  return dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
}

// --- Timebox maths ---

// Client y on the grid to minutes since midnight (unsnapped).
export function yToMinutes(y: number, gridTop: number): number {
  return GRID_START_MIN + ((y - gridTop) / PX_PER_HOUR) * 60;
}

// Keeps a block's start on the day: 00:00 to 23:30, on a 30 minute boundary.
// The length does not matter: a block dropped near the bottom of the day may
// run past midnight (its rest shows on the next day, decision 024).
export function clampStart(startMin: number, _duration: number): number {
  const latest = GRID_END_MIN - SNAP_MINUTES;
  return Math.max(GRID_START_MIN, Math.min(startMin, latest));
}

// The 30 minute slot under the pointer ("10:47" is in the 10:30 slot), clamped
// so the whole block fits on the grid. Used when a row or card is dropped.
export function slotUnderPointer(rawMin: number, duration: number): number {
  return clampStart(Math.floor(rawMin / SNAP_MINUTES) * SNAP_MINUTES, duration);
}

// A moved block keeps the point it was grabbed by: its new start is the
// pointer minus that offset, rounded to the nearest 30 minutes and clamped.
export function movedBlockStart(rawPointerMin: number, grabOffsetMin: number, duration: number): number {
  const raw = rawPointerMin - grabOffsetMin;
  return clampStart(Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES, duration);
}

// Dragging a block's bottom edge: the duration changes in 30 minute steps,
// never below 30 and never past the 24 hour limit. It may extend past
// midnight (the rest shows on the next day).
export function resizedDuration(startMin: number, rawEndMin: number): number {
  const steps = Math.round((rawEndMin - startMin) / SNAP_MINUTES);
  const maxSteps = MAX_DURATION / SNAP_MINUTES;
  return Math.min(maxSteps, Math.max(1, steps)) * SNAP_MINUTES;
}

export function taskDuration(task: Pick<Task, 'durationMinutes'>): number {
  return task.durationMinutes && task.durationMinutes > 0 ? task.durationMinutes : DEFAULT_TASK_MINUTES;
}

// --- Drop resolution ---

// Which zone, if any, is under the pointer. For the Timebox the slot depends
// on the source: a block keeps its grab offset, anything else uses the slot
// under the pointer.
export function resolveDrop(
  x: number,
  y: number,
  zones: Zone[],
  source: { kind: DragSourceKind; duration: number; grabOffsetMin?: number },
): DropTarget | null {
  for (const zone of zones) {
    if (!inside(x, y, zone.rect)) continue;
    if (zone.kind === 'left') return { kind: 'left' };
    if (zone.kind === 'day') {
      if (zone.clip && !inside(x, y, zone.clip)) continue;
      return { kind: 'day', dayKey: zone.dayKey };
    }
    const raw = yToMinutes(y, zone.gridTop);
    const startMin =
      source.kind === 'block' && source.grabOffsetMin !== undefined
        ? movedBlockStart(raw, source.grabOffsetMin, source.duration)
        : slotUnderPointer(raw, source.duration);
    return { kind: 'slot', dayKey: zone.dayKey, startMin };
  }
  return null;
}

// A Day can take a drop only if it is a real date that is today or later.
export function canDayAcceptDrop(dayKey: string, todayKey: string): boolean {
  return isDateKey(dayKey) && dayKey >= todayKey;
}

export function canDrop(target: DropTarget, todayKey: string): boolean {
  if (target.kind === 'left') return true;
  return canDayAcceptDrop(target.dayKey, todayKey);
}

// Clearing a Day always clears the time too: a time slot belongs to a day.
export function clearDayPatch(): Pick<Task, 'dueDate' | 'startTime'> {
  return { dueDate: undefined, startTime: undefined };
}

// The fields a drop changes, or null when the drop is rejected or changes
// nothing (the item then stays where it was).
//  - left: clear Day and time.
//  - day: set the Day. A block dropped on a day leaves the Timebox, so its
//    time is cleared; a card keeps its time (as "Move to day" does).
//  - slot: set Day and startTime; a task with no duration gets 30 minutes.
export function dropPatch(
  task: Pick<Task, 'dueDate' | 'startTime' | 'durationMinutes'>,
  sourceKind: DragSourceKind,
  target: DropTarget,
  todayKey: string,
): Partial<Task> | null {
  if (!canDrop(target, todayKey)) return null;
  if (target.kind === 'left') {
    if (!task.dueDate && !task.startTime) return null;
    return clearDayPatch();
  }
  if (target.kind === 'day') {
    if (sourceKind === 'block') {
      if (task.dueDate === target.dayKey && !task.startTime) return null;
      return { dueDate: target.dayKey, startTime: undefined };
    }
    if (task.dueDate === target.dayKey) return null;
    return { dueDate: target.dayKey, startTime: task.startTime };
  }
  const startTime = toTime(target.startMin);
  if (task.dueDate === target.dayKey && task.startTime === startTime) return null;
  return {
    dueDate: target.dayKey,
    startTime,
    durationMinutes: task.durationMinutes ?? DEFAULT_TASK_MINUTES,
  };
}

// Label shown next to the pointer while over the Timebox: "10:30 to 11:00",
// "23:00 to 24:00", "22:00 to 06:00 next day".
export function slotLabel(startMin: number, duration: number): string {
  const end = startMin + duration;
  if (end === GRID_END_MIN) return `${toTime(startMin)} to 24:00`;
  if (end > GRID_END_MIN) return `${toTime(startMin)} to ${toTime(end - GRID_END_MIN)} next day`;
  return `${toTime(startMin)} to ${toTime(end)}`;
}

// Start of a placed task in minutes (for the grab offset), or null.
export function startOf(task: Pick<Task, 'startTime'>): number | null {
  return toMinutes(task.startTime);
}

// --- Week change at the board's edges ---

// -1 near the left edge, 1 near the right edge, 0 otherwise. Never -1 while
// the current week is shown (the board is forward only).
export function edgeDirection(x: number, y: number, board: Rect, atCurrentWeek: boolean): -1 | 0 | 1 {
  if (!inside(x, y, board)) return 0;
  if (x <= board.left + EDGE_ZONE_PX) return atCurrentWeek ? 0 : -1;
  if (x >= board.right - EDGE_ZONE_PX) return 1;
  return 0;
}

// The week a dwell moves to: never before the current week. Returns null when
// the step is not allowed.
export function stepWeekStart(shown: Date, delta: -1 | 1, current: Date): Date | null {
  const next = new Date(shown.getFullYear(), shown.getMonth(), shown.getDate() + delta * 7);
  if (next.getTime() < current.getTime()) return null;
  return next;
}

export function dwellDone(armedAt: number, now: number): boolean {
  return now - armedAt >= EDGE_DWELL_MS;
}

// --- Auto scroll ---

// Pixels per frame to scroll a pane while dragging near its top (negative) or
// bottom (positive) edge; faster the closer to the edge. 0 elsewhere or when
// the pointer is outside the pane horizontally.
export function autoScrollSpeed(x: number, y: number, pane: Rect): number {
  if (x < pane.left || x > pane.right) return 0;
  const fromTop = y - pane.top;
  const fromBottom = pane.bottom - y;
  if (fromTop >= 0 && fromTop < AUTO_SCROLL_ZONE_PX) {
    return -Math.ceil(AUTO_SCROLL_MAX_PX * (1 - fromTop / AUTO_SCROLL_ZONE_PX));
  }
  if (fromBottom >= 0 && fromBottom < AUTO_SCROLL_ZONE_PX) {
    return Math.ceil(AUTO_SCROLL_MAX_PX * (1 - fromBottom / AUTO_SCROLL_ZONE_PX));
  }
  return 0;
}

// At a board edge: first scroll the board sideways if it can still go that
// way (the week is usually wider than the pane), and only when it is at the
// end of its scroll arm the dwell that changes the week.
export function edgeAction(dir: -1 | 0 | 1, scrollLeft: number, maxScrollLeft: number): 'scroll' | 'dwell' | 'none' {
  if (dir === 0) return 'none';
  if (dir === -1 && scrollLeft > 1) return 'scroll';
  if (dir === 1 && scrollLeft < maxScrollLeft - 1) return 'scroll';
  return 'dwell';
}
