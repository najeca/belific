// Pure layout helpers for the desktop Timebox pane (checkpoint 3). NO
// react-native or other runtime imports so `node --test` can run it; see
// timebox.test.ts. Times are minutes since local midnight; the UI stores
// 'HH:mm' text (CustomEvent.start/end, Task.startTime).
import type { Task } from './types';

export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 23;
export const PX_PER_HOUR = 56;
// A 5 minute event still needs to be readable and clickable.
export const MIN_BLOCK_PX = 20;
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
  // The item runs past 23:00: drawn to the grid end with a "continues"
  // marker; the stored duration is unchanged.
  continues: boolean;
}

export interface TimeboxLayout {
  blocks: PlacedBlock[];
  // Items that fall completely outside the visible hours, in start order.
  outside: string[];
}

// An end at or before the start crosses midnight (or is bad data): run to
// the end of the day. Never more than midnight.
export function normalizeRange(startMin: number, endMin: number): { startMin: number; endMin: number } {
  const start = Math.max(0, Math.min(DAY_MINUTES, startMin));
  const end = endMin > startMin ? Math.min(DAY_MINUTES, endMin) : DAY_MINUTES;
  return { startMin: start, endMin: end };
}

// A placed Task as a Timebox item: needs a valid startTime. Length is
// durationMinutes, or 30 when unset.
export function taskToItem(task: Task): TimeboxItem | null {
  const start = toMinutes(task.startTime);
  if (start === null) return null;
  const length = task.durationMinutes && task.durationMinutes > 0 ? task.durationMinutes : DEFAULT_TASK_MINUTES;
  return { id: task.id, startMin: start, endMin: Math.min(DAY_MINUTES, start + length) };
}

// Positions items on the 06:00 to 23:00 grid. Items are clamped to the
// visible hours; ones entirely outside are returned in `outside` instead of
// vanishing. Items that overlap in time share width side by side.
export function layoutItems(items: TimeboxItem[]): TimeboxLayout {
  type Clamped = { id: string; startMin: number; endMin: number; continues: boolean };
  const visible: Clamped[] = [];
  const outside: Array<{ id: string; startMin: number }> = [];

  for (const item of items) {
    const { startMin, endMin } = normalizeRange(item.startMin, item.endMin);
    const clampedStart = Math.max(startMin, GRID_START_MIN);
    const clampedEnd = Math.min(endMin, GRID_END_MIN);
    if (clampedEnd <= clampedStart) {
      outside.push({ id: item.id, startMin });
    } else {
      visible.push({ id: item.id, startMin: clampedStart, endMin: clampedEnd, continues: endMin > GRID_END_MIN });
    }
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
      height: Math.max(((item.endMin - item.startMin) / 60) * PX_PER_HOUR, MIN_BLOCK_PX),
      col,
      cols: 1,
      startMin: item.startMin,
      endMin: item.endMin,
      continues: item.continues,
    });
  }
  closeCluster();

  outside.sort((a, b) => a.startMin - b.startMin);
  return { blocks, outside: outside.map((o) => o.id) };
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

// Top offset in px for scrolling so `minutes` sits near the top with a
// little context above it.
export function scrollOffsetFor(minutes: number): number {
  const hoursFromStart = Math.max(0, minutes / 60 - GRID_START_HOUR - 1);
  return hoursFromStart * PX_PER_HOUR;
}

export const GRID_HEIGHT_PX = (GRID_END_HOUR - GRID_START_HOUR) * PX_PER_HOUR;
