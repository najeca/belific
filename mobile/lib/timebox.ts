// Pure layout helpers for the desktop Timebox pane (checkpoint 3). NO
// react-native or other runtime imports so `node --test` can run it; see
// timebox.test.ts. Times are minutes since local midnight; the UI stores
// 'HH:mm' text (CustomEvent.start/end, Task.startTime).
import type { Task } from './types';

// The Timebox covers the whole day, 00:00 to 24:00 (checkpoint 8.4, decision
// 024), so a night shift works as well as a day one. Where it opens is the
// "My day starts at" setting (dayStart.ts).
export const GRID_START_HOUR = 0;
export const GRID_END_HOUR = 24;
export const PX_PER_HOUR = 56;
// A 5 minute event still needs to be readable and clickable. 20px is less
// than a 30 minute slot (28px), so a short block never looks like it fills one.
export const MIN_BLOCK_PX = 20;
// Below this height a block shows one line (title and duration).
export const COMPACT_BLOCK_PX = 36;
// Block length for a placed task with no durationMinutes (decision 015).
export const DEFAULT_TASK_MINUTES = 30;

const DAY_MINUTES = 24 * 60;
const GRID_START_MIN = GRID_START_HOUR * 60;
const GRID_END_MIN = GRID_END_HOUR * 60;

// 'HH:mm' to minutes, or null if it is not a real time.
export function toMinutes(time: unknown): number | null {
  if (typeof time !== 'string') return null;
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Labels for the hour lines, 00:00 to 24:00.
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function toTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface TimeboxItem {
  id: string;
  startMin: number;
  endMin: number;
}

export interface PlacedBlock {
  id: string;
  top: number;
  height: number;
  // Side by side column inside an overlap cluster.
  col: number;
  cols: number;
  // Minutes after clamping to the visible grid.
  startMin: number;
  endMin: number;
  // The item runs past 24:00: drawn to the grid end with a "continues"
  // marker; the stored duration is unchanged and the rest shows at the top of
  // the next day (continuationOf).
  continues: boolean;
}

export interface TimeboxLayout {
  blocks: PlacedBlock[];
}

// An end at or before the start crosses midnight (or is bad data): run to
// the end of the day. Never more than midnight.
export function normalizeRange(startMin: number, endMin: number): { startMin: number; endMin: number } {
  const start = Math.max(0, Math.min(DAY_MINUTES, startMin));
  const end = endMin > startMin ? Math.min(DAY_MINUTES, endMin) : DAY_MINUTES;
  return { startMin: start, endMin: end };
}

// A placed Task as a Timebox item: needs a valid startTime. Length is
// durationMinutes, or 30 when unset. The end is NOT capped at midnight: a task
// that starts at 22:00 and lasts 8 hours ends at minute 1800. The day's grid
// draws it to 24:00 and the next day shows the rest (continuationOf).
export function taskToItem(task: Task): TimeboxItem | null {
  const start = toMinutes(task.startTime);
  if (start === null) return null;
  const length = task.durationMinutes && task.durationMinutes > 0 ? task.durationMinutes : DEFAULT_TASK_MINUTES;
  return { id: task.id, startMin: start, endMin: start + length };
}

// Overnight tasks (checkpoint 8.4, decision 024). A task belongs to the Day it
// starts on. When its start plus length passes 24:00 the rest of it is shown at
// the top of the NEXT day as a continuation. The continuation is derived from
// the task every time it is drawn, never stored. Returns the minutes after
// midnight (0 when the task ends by 24:00). A task is at most 24 hours long, so
// the rest always fits in the next day.
export function minutesPastMidnight(startMin: number, lengthMinutes: number): number {
  return Math.max(0, Math.min(DAY_MINUTES, startMin + lengthMinutes - DAY_MINUTES));
}

// The Timebox item for a task's continuation on the day after its own, or null.
export const CONTINUATION_PREFIX = 'cont:';
export function continuationOf(task: Task): TimeboxItem | null {
  const item = taskToItem(task);
  if (!item) return null;
  const rest = minutesPastMidnight(item.startMin, item.endMin - item.startMin);
  return rest > 0 ? { id: `${CONTINUATION_PREFIX}${task.id}`, startMin: 0, endMin: rest } : null;
}

// Positions items on the 00:00 to 24:00 grid. An item that runs past 24:00 is
// drawn to the bottom and marked "continues". Items that overlap in time share
// width side by side.
export function layoutItems(items: TimeboxItem[]): TimeboxLayout {
  type Clamped = { id: string; startMin: number; endMin: number; continues: boolean };
  const visible: Clamped[] = [];

  for (const item of items) {
    const { startMin, endMin } = normalizeRange(item.startMin, item.endMin);
    // An end beyond 24:00, or at or before the start (bad data), runs on.
    const continues = item.endMin > GRID_END_MIN || item.endMin <= item.startMin;
    const clampedStart = Math.max(startMin, GRID_START_MIN);
    const clampedEnd = Math.min(endMin, GRID_END_MIN);
    if (clampedEnd > clampedStart) visible.push({ id: item.id, startMin: clampedStart, endMin: clampedEnd, continues });
  }

  visible.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.id.localeCompare(b.id));

  const blocks: PlacedBlock[] = [];
  let cluster: PlacedBlock[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];

  const closeCluster = () => {
    for (const b of cluster) b.cols = columnEnds.length;
    blocks.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const item of visible) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) closeCluster();
    let col = columnEnds.findIndex((end) => end <= item.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[col] = item.endMin;
    }
    clusterEnd = Math.max(clusterEnd, item.endMin);
    cluster.push({
      id: item.id,
      top: ((item.startMin - GRID_START_MIN) / 60) * PX_PER_HOUR,
      height: blockHeightPx(item.endMin - item.startMin),
      col,
      cols: 1,
      startMin: item.startMin,
      endMin: item.endMin,
      continues: item.continues,
    });
  }
  closeCluster();

  return { blocks };
}

// Minutes actually scheduled in the day: the union of all ranges, so two
// overlapping items are not counted twice. Counts time outside the visible
// hours too.
export function totalScheduledMinutes(items: TimeboxItem[]): number {
  const ranges = items
    .map((i) => normalizeRange(i.startMin, i.endMin))
    .filter((r) => r.endMin > r.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const r of ranges) {
    if (curEnd < 0 || r.startMin > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart;
      curStart = r.startMin;
      curEnd = r.endMin;
    } else {
      curEnd = Math.max(curEnd, r.endMin);
    }
  }
  if (curEnd >= 0) total += curEnd - curStart;
  return total;
}

// 390 -> "6h 30m", 120 -> "2h", 45 -> "45m"
export function formatMinutes(total: number): string {
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Top offset in px that puts `minutes` at the top of the scroll area.
export function scrollOffsetFor(minutes: number): number {
  return Math.max(0, (minutes / 60 - GRID_START_HOUR) * PX_PER_HOUR);
}

// Block height for a length in minutes: true scale, never below MIN_BLOCK_PX.
export function blockHeightPx(minutes: number): number {
  return Math.max((minutes / 60) * PX_PER_HOUR, MIN_BLOCK_PX);
}

export function isCompactBlock(heightPx: number): boolean {
  return heightPx < COMPACT_BLOCK_PX;
}

export const GRID_HEIGHT_PX = (GRID_END_HOUR - GRID_START_HOUR) * PX_PER_HOUR;
