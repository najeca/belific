import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { dateKey } from '../../lib/kanban';
import {
  AUTO_SCROLL_MAX_PX,
  autoScrollSpeed,
  canDrop,
  dropPatch,
  dwellDone,
  edgeAction,
  edgeDirection,
  inside,
  multiDropPatch,
  passedThreshold,
  resizeRefusal,
  resizedDuration,
  resolveDrop,
  slotLabel,
  taskDuration,
  yToMinutes,
  type DragSourceKind,
  type DropTarget,
  type Rect,
  type Zone,
} from '../../lib/drag';
import { updateTask } from '../../lib/storage';
import { closePopover } from './Popover';
import { isEditableTarget } from '../../lib/editable';
import { convertDumpItem } from '../../lib/taskActions';
import { editRepeatingTime, moveDay, patchSeries, startRepeatingOn } from '../../lib/seriesActions';
import { isUndatedRepeating, repeatDropRefusal } from '../../lib/repeatDrop';
import { isTimeEdit } from '../../lib/seriesTime';
import { withoutDay } from '../../lib/taskOps';
import { isDateKey } from '../../lib/kanban';
import { isMultiTime } from '../../lib/times';
import { showNotice } from './uiStore';
import { DROP_INSIDE, DWELL_MS, dwellDrop, fitRefusal, hostDrop, longerNote } from '../../lib/hosting';
import { blockChangeRefusal } from '../../lib/hostActions';
import { dayBreaks } from './breakStore';
import type { BrainDumpItem, Task } from '../../lib/types';

// Desktop drag and drop (checkpoint 4, decision 019): hand written pointer
// events, not HTML5 drag and drop (which cannot resize, cannot style the
// lifted card, and stops wheel events for the whole drag). Web only: this
// file is reached only through DesktopEntry.web.tsx, never the iOS bundle.
//
// One drag at a time. A press becomes a drag after DRAG_THRESHOLD_PX, so a
// click still opens the editor; after a real drag the click that follows is
// swallowed. Panes register their drop zones as DOM nodes and are measured on
// every move; all the maths (snapping, clamping, which zone, past day
// rejection, week stepping) is in lib/drag.ts. Nothing is written until a
// valid drop, so Escape or a drop outside any target simply leaves the item
// where it was.
export const DRAG_MARKER = 'belific-desktop-drag';

export interface DragItem {
  kind: DragSourceKind;
  // A legacy Brain Dump row has `item` and no `task`; it becomes a Task on drop.
  task?: Task;
  item?: BrainDumpItem;
  id: string;
  title: string;
  emoji?: string;
  duration: number;
  // Which time grid drew it (2.26.0: '' for the Timebox, `cal<day>:` for the Calendar).
  scope?: string;
  // Blocks only: minutes between the block's start and where it was grabbed.
  grabOffsetMin?: number;
  // Blocks of a task with several times a day (Part C): the time of the block that was grabbed.
  time?: string;
  // A projected occurrence of a repeating series (decision 023). On a time slot of
  // its own day it sets the series' start time; on another day (a column or a
  // slot) it moves that day only (3.2.0, seriesActions.moveDay); never the left list.
  projected?: boolean;
}

export interface DragState {
  mode: 'move' | 'resize';
  item: DragItem;
  x: number;
  y: number;
  target: DropTarget | null;
  accepted: boolean;
  // -1 or 1 while the week board edge is armed for a week change.
  edge: -1 | 0 | 1;
  // Resize only: the snapped duration so far.
  resizeDuration?: number;
  // 3.6.0: the pointer is on a break: the task goes inside it (the target's time is already moved
  // there), or it is longer than the break and drops as before.
  // 3.11.0: 'longer' is refused (the drop snaps back) and `note` says why: "Longer than the break (1 h)".
  // 3.22.0: 'note' is a hint only (a Split task held over a break it is not shorter than: nothing is refused, the
  // drop is placed as usual); `dwell` marks a Split task held over a break for DWELL_MS: the break is outlined
  // ("Drop inside", `blockId` is its block) and the drop hosts the task there.
  host?: { kind: 'host' | 'longer' | 'note'; title: string; note?: string; dwell?: boolean; blockId?: string };
  // 3.18.1: a repeating task with no Day dropped on a day that is not one of its repeat days: refused, with this hint.
  repeatNote?: string;
}

type ZoneReg =
  | { kind: 'left'; node: HTMLElement }
  // `clip` is read lazily: child refs attach before their parent's.
  | { kind: 'day'; dayKey: string; node: HTMLElement; clip: () => HTMLElement | null }
  | { kind: 'timebox'; dayKey: string; node: HTMLElement; gridNode: HTMLElement | null; clip?: () => Rect | null };

interface BoardReg {
  // The visible board (the horizontal ScrollView).
  node: HTMLElement;
  atCurrentWeek: () => boolean;
  step: (delta: -1 | 1) => void;
}

interface DragApi {
  drag: DragState | null;
  registerZone: (id: string, reg: ZoneReg | null) => void;
  registerScroller: (id: string, node: HTMLElement | null) => void;
  // One per view that scrolls sideways (the Tasks strip, the Calendar's week);
  // the one on screen is used.
  registerBoard: (id: string, reg: BoardReg | null) => void;
  // Ref callback factory for a drag source, cached per key.
  sourceRef: (key: string, getItem: (e: PointerEvent) => DragItem | null) => (node: unknown) => void;
  startResize: (e: PointerEvent, task: Task, startMin: number, gridNode: HTMLElement, projected?: boolean, scope?: string) => void;
}

const DragContext = createContext<DragApi | null>(null);

export function useDrag(): DragApi {
  const api = useContext(DragContext);
  if (!api) throw new Error('useDrag outside DragProvider');
  return api;
}

function rectOf(node: HTMLElement): Rect {
  const r = node.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

// The DOM node behind a react-native-web View or ScrollView ref.
export function domNode(ref: unknown): HTMLElement | null {
  if (!ref) return null;
  const maybe = ref as { getScrollableNode?: () => HTMLElement };
  if (typeof maybe.getScrollableNode === 'function') return maybe.getScrollableNode();
  const el = ref as HTMLElement;
  return typeof el.getBoundingClientRect === 'function' ? el : null;
}

interface Pending {
  mode: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  item: DragItem;
  active: boolean;
  // Resize only
  startMin?: number;
  gridNode?: HTMLElement;
}

export default function DragProvider({ children, onChanged }: { children: React.ReactNode; onChanged: () => void }) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const zones = useRef(new Map<string, ZoneReg>());
  const scrollers = useRef(new Map<string, HTMLElement>());
  const boards = useRef(new Map<string, BoardReg>());
  // The board on screen (a hidden view's node has no size).
  const activeBoard = (): BoardReg | null => {
    for (const b of boards.current.values()) {
      if (b.node.isConnected && b.node.getBoundingClientRect().width > 0) return b;
    }
    return null;
  };
  const pending = useRef<Pending | null>(null);
  const last = useRef<DragState | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const armed = useRef<{ dir: -1 | 1; at: number } | null>(null);
  // Set while the pointer is at a board edge that can still scroll sideways.
  const sideScroll = useRef<-1 | 0 | 1>(0);
  const frame = useRef<number | null>(null);
  const lastTick = useRef(0);
  // 3.22.0: the break a Split task has been held over, and since when.
  const dwell = useRef<{ blockId: string; at: number; fired: boolean } | null>(null);
  const getters = useRef(new Map<string, (e: PointerEvent) => DragItem | null>());
  const refCache = useRef(new Map<string, (node: unknown) => void>());
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const measureZones = useCallback((): Zone[] => {
    const list: Zone[] = [];
    for (const reg of zones.current.values()) {
      if (!reg.node.isConnected) continue;
      if (reg.kind === 'left') list.push({ kind: 'left', rect: rectOf(reg.node) });
      else if (reg.kind === 'day') {
        const clipNode = reg.clip();
        list.push({
          kind: 'day',
          dayKey: reg.dayKey,
          rect: rectOf(reg.node),
          clip: clipNode ? rectOf(clipNode) : undefined,
        });
      } else if (reg.gridNode) {
        list.push({ kind: 'timebox', dayKey: reg.dayKey, rect: rectOf(reg.node), gridTop: rectOf(reg.gridNode).top, clip: reg.clip?.() ?? undefined });
      }
    }
    return list;
  }, []);

  // Recomputes the drag state for the current pointer (after a move, a wheel
  // scroll, an auto scroll step or a week change).
  const update = useCallback(() => {
    const p = pending.current;
    if (!p || !p.active) return;
    const { x, y } = pointer.current;
    if (p.mode === 'resize') {
      const gridTop = p.gridNode ? rectOf(p.gridNode).top : 0;
      const duration = resizedDuration(p.startMin ?? 0, yToMinutes(y, gridTop));
      const next: DragState = { mode: 'resize', item: p.item, x, y, target: null, accepted: true, edge: 0, resizeDuration: duration };
      last.current = next;
      setDrag(next);
      return;
    }
    const zones = measureZones();
    let target = resolveDrop(x, y, zones, p.item);
    // 3.6.0: over a break on a time grid, the task starts inside it (lib/hosting.ts). A break is never hosted.
    let host: DragState['host'];
    const dragsSplit = !!p.item.task?.cutsBelow;
    if (!(target?.kind === 'slot' && dragsSplit)) dwell.current = null;
    // 3.22.0: a Split task held over another Split task for DWELL_MS is hosted by it ("Drop inside"); before that,
    // and when the pointer moves to another break or leaves, it is placed as before (Split cut, side by side).
    if (target?.kind === 'slot' && dragsSplit) {
      const dayKey = target.dayKey;
      const zone = zones.find((z) => z.kind === 'timebox' && z.dayKey === dayKey && inside(x, y, z.rect));
      const breaks = dayBreaks(dayKey).filter((b) => b.taskId !== p.item.id);
      const pointerMin = zone && zone.kind === 'timebox' ? yToMinutes(y, zone.gridTop) : -1;
      const over = zone ? breaks.find((b) => b.startMin <= pointerMin && pointerMin < b.endMin) : undefined;
      if (!over) dwell.current = null;
      else {
        const now = performance.now();
        if (!dwell.current || dwell.current.blockId !== over.id) dwell.current = { blockId: over.id, at: now, fired: false };
        if (now - dwell.current.at >= DWELL_MS) {
          const d = dwellDrop(breaks, pointerMin, target.startMin, p.item.duration);
          if (d.kind === 'inside') {
            target = { ...target, startMin: d.startMin };
            host = { kind: 'host', title: d.brk.title, dwell: true, blockId: d.brk.id };
          } else if (d.kind === 'longer') host = { kind: 'note', title: d.brk.title, note: d.note };
        }
      }
    }
    if (target?.kind === 'slot' && !dragsSplit) {
      const dayKey = target.dayKey;
      const zone = zones.find((z) => z.kind === 'timebox' && z.dayKey === dayKey && inside(x, y, z.rect));
      if (zone && zone.kind === 'timebox') {
        const breaks = dayBreaks(dayKey).filter((b) => b.taskId !== p.item.id);
        const hd = hostDrop(breaks, yToMinutes(y, zone.gridTop), target.startMin, p.item.duration);
        if (hd.kind === 'host') {
          target = { ...target, startMin: hd.startMin };
          host = { kind: 'host', title: hd.brk.title };
        } else if (hd.kind === 'longer') host = { kind: 'longer', title: hd.brk.title, note: longerNote(hd.brk) };
        else {
          // 3.11.0: a start inside a break (the pointer below it) the task does not fit from is refused too.
          const b2 = fitRefusal(breaks, [], [[target.startMin, target.startMin + p.item.duration]]);
          if (b2) host = { kind: 'longer', title: b2.title, note: longerNote(b2) };
        }
      }
    }
    const todayKey = dateKey(new Date());
    let edge: -1 | 0 | 1 = 0;
    const b = activeBoard();
    if (b) {
      const dir = edgeDirection(x, y, rectOf(b.node), b.atCurrentWeek());
      const action = edgeAction(dir, b.node.scrollLeft, b.node.scrollWidth - b.node.clientWidth);
      sideScroll.current = action === 'scroll' ? dir : 0;
      if (action === 'dwell') edge = dir;
    }
    if (edge === 0) armed.current = null;
    else if (!armed.current || armed.current.dir !== edge) armed.current = { dir: edge, at: performance.now() };
    // 3.18.1: a repeating task with no Day starts its series on the day it is dropped on, a repeat day.
    const dragged = p.item.task;
    const repeatNote =
      target && target.kind !== 'left' && dragged && !p.item.projected && !p.item.time && isUndatedRepeating(dragged) && isDateKey(target.dayKey)
        ? (repeatDropRefusal(dragged, target.dayKey, todayKey) ?? undefined)
        : undefined;
    const next: DragState = {
      mode: 'move',
      item: p.item,
      x,
      y,
      target,
      // A projected occurrence never goes to the left list (a day of a series keeps a Day).
      accepted: target ? canDrop(target, todayKey) && (!p.item.projected || target.kind !== 'left') && host?.kind !== 'longer' && !repeatNote : false,
      edge,
      ...(host ? { host } : {}),
      ...(repeatNote ? { repeatNote } : {}),
    };
    last.current = next;
    setDrag(next);
  }, [measureZones]);

  // One animation loop while dragging: edge auto scroll and the week dwell.
  const tick = useCallback(() => {
    frame.current = null;
    const p = pending.current;
    if (!p || !p.active) return;
    const { x, y } = pointer.current;
    // Speeds are per 60 Hz frame; scale by the real frame time so a fast
    // display does not scroll faster.
    const now = performance.now();
    const scale = lastTick.current ? Math.min(3, (now - lastTick.current) / (1000 / 60)) : 1;
    lastTick.current = now;
    let moved = false;
    for (const node of scrollers.current.values()) {
      if (!node.isConnected) continue;
      const speed = Math.round(autoScrollSpeed(x, y, rectOf(node)) * scale);
      if (speed !== 0) {
        const before = node.scrollTop;
        node.scrollTop = before + speed;
        if (node.scrollTop !== before) moved = true;
      }
    }
    // A Split task held over a break reaches the pause with a still pointer: look again then.
    const dw = dwell.current;
    if (dw && !dw.fired && p.mode === 'move' && now - dw.at >= DWELL_MS) {
      dw.fired = true;
      moved = true;
    }
    const side = sideScroll.current;
    const b = activeBoard();
    if (p.mode === 'move' && side !== 0 && b) {
      b.node.scrollLeft += Math.round(side * AUTO_SCROLL_MAX_PX * scale);
      moved = true;
    }
    const a = armed.current;
    if (p.mode === 'move' && a && b && dwellDone(a.at, performance.now())) {
      b.step(a.dir);
      // Keep holding to keep stepping, one dwell per week.
      armed.current = { dir: a.dir, at: performance.now() };
      moved = true;
    }
    if (moved) update();
    frame.current = requestAnimationFrame(tick);
  }, [update]);

  const finish = useCallback(
    (commit: boolean) => {
      const p = pending.current;
      pending.current = null;
      armed.current = null;
      dwell.current = null;
      sideScroll.current = 0;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onCancel);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      const state = last.current;
      last.current = null;
      setDrag(null);
      if (!p || !p.active) return;
      // The click that follows a real drag must not open the editor.
      const swallow = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
      };
      window.addEventListener('click', swallow, true);
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      if (commit && state) void commitDrop(p, state);
    },
    // The listeners below are stable (declared with useCallback over refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function commitDrop(p: Pending, state: DragState) {
    const todayKey = dateKey(new Date());
    if (p.mode === 'resize') {
      const task = p.item.task;
      if (!task || !state.resizeDuration || state.resizeDuration === task.durationMinutes) return;
      // A resize changes the length of every time of a task with several: refused if two would overlap.
      const refusal = resizeRefusal(task, state.resizeDuration);
      if (refusal) {
        showNotice(refusal);
        return;
      }
      // 3.12.0: a length that would take a task out of its break (the break shrinking, or a hosted time of this
      // task growing past its own break) is refused, nothing written.
      const brkNote = await blockChangeRefusal(task, { durationMinutes: state.resizeDuration }, task.dueDate ?? '');
      if (brkNote) {
        showNotice(brkNote);
        return;
      }
      // Resizing a day of a repeating task changes that day only (3.20.0).
      if (task.recurrence) await editRepeatingTime(task, !!p.item.projected, { durationMinutes: state.resizeDuration });
      else await updateTask({ ...task, durationMinutes: state.resizeDuration });
      onChangedRef.current();
      return;
    }
    // 2.26.0: a drop is only ever a move to a day, a time or the list. Dropping
    // on another card never merges or nests it; subtasks are added on the card
    // or in the details window.
    if (state.host?.kind === 'longer' && state.host.note) showNotice(state.host.note);
    if (state.repeatNote) {
      showNotice(state.repeatNote);
      return;
    }
    if (!state.target || !state.accepted) return;
    const { task, item } = p.item;
    // 3.2.0: a day of a repeating task dropped on ANOTHER day moves that day only, stored or projected
    // (the series' first row included, see series.planMoveDay). On its own day a projected one sets the
    // series' time, as before.
    const target = state.target;
    const otherDay = !!task && !!task.recurrence && target.kind !== 'left' && target.dayKey !== task.dueDate;
    const write = async (fields: Partial<Task>) => {
      if (!task) return;
      if (task.recurrence && isDateKey(fields.dueDate) && fields.dueDate !== task.dueDate) {
        const { dueDate, ...rest } = fields;
        await moveDay(task, dueDate as string, rest);
        return;
      }
      // 3.20.0: a new time on the same day of a repeating task changes that day only (the first time, every day).
      const sameDay = fields.dueDate === task.dueDate ? withoutDay(fields) : fields;
      if (task.recurrence && isTimeEdit(sameDay)) await editRepeatingTime(task, !!p.item.projected, sameDay);
      else if (p.item.projected) await patchSeries(task, fields);
      else await updateTask({ ...task, ...fields });
    };
    // 3.18.1: a repeating task with no Day (nothing was ever placed) starts its series on this repeat day. The
    // generic path below would send it to moveDay, which has no day to move from and wrote nothing.
    if (task && !p.item.projected && !p.item.time && isUndatedRepeating(task) && target.kind !== 'left') {
      const patch = dropPatch({ ...task, dueDate: undefined }, p.item.kind, target, todayKey);
      await startRepeatingOn(task, target.dayKey, patch ?? {});
      onChangedRef.current();
      return;
    }
    // A block of a task with several times a day (Part C): only its own time moves (see multiDropPatch).
    if (task && p.item.time && isMultiTime(task)) {
      const res = multiDropPatch(task, p.item.time, target, todayKey, !!p.item.projected && !otherDay);
      if (!res) return;
      if (!res.ok) {
        showNotice(res.note);
        return;
      }
      await write(res.fields);
      onChangedRef.current();
      return;
    }
    if (task && p.item.projected && !otherDay) {
      // Dropped on the Timebox of its own day: the start time (and the estimate, when it had none) is set for
      // that day; the Day is never touched.
      if (target.kind !== 'slot') return;
      const patch = dropPatch(task, p.item.kind, target, todayKey);
      if (!patch) return;
      // 3.20.0: that day only, except the first time of the series, which goes to every repeat day.
      await editRepeatingTime(task, true, {
        startTime: patch.startTime,
        ...(patch.durationMinutes !== undefined ? { durationMinutes: patch.durationMinutes } : {}),
      });
    } else if (task) {
      const patch = dropPatch(task, p.item.kind, target, todayKey);
      if (!patch) return;
      await write(patch);
    } else if (item) {
      const patch = dropPatch({}, 'row', state.target, todayKey);
      if (!patch) return;
      await convertDumpItem(item, patch);
    }
    onChangedRef.current();
  }

  const onMove = useCallback(
    (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!p.active) {
        if (!passedThreshold(e.clientX - p.startX, e.clientY - p.startY)) return;
        p.active = true;
        // Starting a drag closes any open popover.
        closePopover();
        document.body.style.userSelect = 'none';
        document.body.style.cursor = p.mode === 'resize' ? 'ns-resize' : 'grabbing';
        window.getSelection()?.removeAllRanges();
        lastTick.current = 0;
        frame.current = requestAnimationFrame(tick);
      }
      e.preventDefault();
      update();
    },
    [tick, update],
  );

  const onUp = useCallback(
    (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      if (p.active) update();
      finish(true);
    },
    [finish, update],
  );

  const onCancel = useCallback(() => finish(false), [finish]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !pending.current?.active) return;
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    },
    [finish],
  );

  // A wheel scroll moves the grid under a still pointer: re-resolve.
  const onScroll = useCallback(() => update(), [update]);

  const begin = useCallback(
    (e: PointerEvent, p: Omit<Pending, 'active' | 'pointerId' | 'startX' | 'startY'>) => {
      if (pending.current) finish(false);
      pending.current = { ...p, active: false, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
      pointer.current = { x: e.clientX, y: e.clientY };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('blur', onCancel);
    },
    [finish, onMove, onUp, onCancel, onKey, onScroll],
  );

  useEffect(() => () => finish(false), [finish]);

  const sourceRef = useCallback(
    (key: string, getItem: (e: PointerEvent) => DragItem | null) => {
      getters.current.set(key, getItem);
      const cached = refCache.current.get(key);
      if (cached) return cached;
      let cleanup: (() => void) | null = null;
      const ref = (node: unknown) => {
        cleanup?.();
        cleanup = null;
        const el = domNode(node);
        if (!el) return;
        const down = (e: PointerEvent) => {
          if (e.button !== 0 || e.pointerType === 'touch') return;
          // Presses on a nested button (the checkbox, the hover actions) are
          // clicks on that button, never a drag.
          const button = (e.target as Element | null)?.closest('[role="button"]');
          if (button && button !== el) return;
          // Typing and selecting text in a field (notes, subtasks) is not a drag.
          if (isEditableTarget(e.target) || (e.target as Element | null)?.closest('[data-no-drag]')) return;
          const item = getters.current.get(key)?.(e);
          if (!item) return;
          begin(e, { mode: 'move', item });
        };
        el.addEventListener('pointerdown', down);
        el.dataset.drag = DRAG_MARKER;
        cleanup = () => el.removeEventListener('pointerdown', down);
      };
      refCache.current.set(key, ref);
      return ref;
    },
    [begin],
  );

  const startResize = useCallback(
    (e: PointerEvent, task: Task, startMin: number, gridNode: HTMLElement, projected = false, scope = '') => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      begin(e, {
        mode: 'resize',
        item: { kind: 'block', task, id: task.id, title: task.title, emoji: task.emoji, duration: taskDuration(task), projected, scope },
        startMin,
        gridNode,
      });
    },
    [begin],
  );

  const registerZone = useCallback((id: string, reg: ZoneReg | null) => {
    if (reg) zones.current.set(id, reg);
    else zones.current.delete(id);
  }, []);
  const registerScroller = useCallback((id: string, node: HTMLElement | null) => {
    if (node) scrollers.current.set(id, node);
    else scrollers.current.delete(id);
  }, []);
  const registerBoard = useCallback((id: string, reg: BoardReg | null) => {
    if (reg) boards.current.set(id, reg);
    else boards.current.delete(id);
  }, []);

  const api = useMemo(
    () => ({ drag, registerZone, registerScroller, registerBoard, sourceRef, startResize }),
    [drag, registerZone, registerScroller, registerBoard, sourceRef, startResize],
  );

  return (
    <DragContext.Provider value={api}>
      {children}
      {drag && drag.mode === 'move' && <LiftedCard drag={drag} />}
      {drag && drag.mode === 'move' && drag.host?.dwell && drag.host.blockId ? <DropInside blockId={drag.host.blockId} x={drag.x} y={drag.y} /> : null}
    </DragContext.Provider>
  );
}

// The card under the pointer (2.26.0: drawn like a task card, tilted a little):
// the emoji and title, and over a time grid the snapped time ("10:30 to
// 11:00"). It never takes pointer events, so the wheel still reaches the pane
// under it. Where it would land shows its own placeholder (a dashed outline in
// a day column, a dashed slot on a time grid).
function LiftedCard({ drag }: { drag: DragState }) {
  const t = drag.target;
  let hint: string | null = null;
  // 3.2.0: a repeating day can go to another day (that day only), just not to the list.
  if (t && !drag.accepted && drag.item.projected && t.kind === 'left') hint = 'A day of a repeating task stays on a day';
  // 3.11.0: refused over a break the task does not fit: it snaps back on release.
  else if (t && !drag.accepted && drag.host?.kind === 'longer') hint = drag.host.note ?? null;
  // 3.18.1: a repeating task with no Day, over a day that is not one of its repeat days.
  else if (t && !drag.accepted && drag.repeatNote) hint = drag.repeatNote;
  else if (t && !drag.accepted) hint = 'Past day';
  // 3.6.0: on a break: "During Lunch, 12:30 to 12:45".
  else if (t?.kind === 'slot' && drag.host?.kind === 'host' && drag.host.dwell) hint = `${DROP_INSIDE} ${drag.host.title}, ${slotLabel(t.startMin, drag.item.duration)}`;
  else if (t?.kind === 'slot' && drag.host?.kind === 'host') hint = `During ${drag.host.title}, ${slotLabel(t.startMin, drag.item.duration)}`;
  else if (t?.kind === 'slot' && drag.host?.kind === 'note') hint = drag.host.note ?? null;
  else if (t?.kind === 'slot') hint = slotLabel(t.startMin, drag.item.duration);
  return (
    <View pointerEvents="none" style={[styles.lifted, { left: drag.x + 12, top: drag.y + 10 }]} {...({ dataSet: { liftedCard: drag.item.id } } as object)}>
      <Text style={styles.liftedTitle} numberOfLines={1}>
        {drag.item.emoji ? `${drag.item.emoji} ` : ''}
        {drag.item.title}
      </Text>
      {hint && <Text style={[styles.liftedHint, !drag.accepted && styles.liftedHintMuted]}>{hint}</Text>}
    </View>
  );
}

// 3.22.0: the break a Split task is held over, outlined with its label. The block is found under the pointer (the
// Timebox marks it data-block-id, the Calendar data-cal-block with the day in front); nothing takes pointer events.
function DropInside({ blockId, x, y }: { blockId: string; x: number; y: number }) {
  const want = blockId.replace(/^task:/, '');
  const rect = (() => {
    for (const el of document.elementsFromPoint(x, y)) {
      const b = (el as HTMLElement).closest?.('[data-block-id], [data-cal-block]') as HTMLElement | null;
      const id = b?.getAttribute('data-block-id') ?? b?.getAttribute('data-cal-block') ?? '';
      if (b && (id === want || id.endsWith(`:${want}`))) return b.getBoundingClientRect();
    }
    return null;
  })();
  if (!rect) return null;
  return (
    <View pointerEvents="none" style={[styles.dropInside, { left: rect.left - 2, top: rect.top - 2, width: rect.width + 4, height: rect.height + 4 }]} {...({ dataSet: { dropInside: blockId } } as object)}>
      <Text style={styles.dropInsideLabel}>{DROP_INSIDE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dropInside: {
    position: 'fixed' as 'absolute',
    zIndex: 999,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.accent,
    backgroundColor: 'transparent',
  },
  dropInsideLabel: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '700',
    color: Colors.onAccent,
    backgroundColor: Colors.accent,
  },
  lifted: {
    position: 'fixed' as 'absolute',
    zIndex: 1000,
    width: 240,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    boxShadow: Colors.shadowMd,
    transform: [{ rotate: '2deg' }],
  },
  liftedTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  liftedHint: { marginTop: 2, fontSize: 12, fontWeight: '700', color: Colors.accentText },
  liftedHintMuted: { fontWeight: '400', color: Colors.textSecondary },
});
