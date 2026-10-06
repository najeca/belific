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
  passedThreshold,
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
import { loadTasksRaw, updateTask } from '../../lib/storage';
import { UNDO_MS, dwellArmed, nextDwell, resolveCardRelease, type DwellState, type SubtaskDropPlan } from '../../lib/subtasks';
import { closePopover } from './Popover';
import { isEditableTarget } from '../../lib/editable';
import { convertDumpItem, dropAsSubtask, undoDropAsSubtaskPlan } from '../../lib/taskActions';
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
  duration: number;
  // Blocks only: minutes between the block's start and where it was grabbed.
  grabOffsetMin?: number;
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
  // The id of the task card the pointer has hovered for about 300 ms, with the
  // "Add as subtask" highlight showing. Only then does a release add a subtask.
  subtaskHost: string | null;
}

type ZoneReg =
  | { kind: 'left'; node: HTMLElement }
  // `clip` is read lazily: child refs attach before their parent's.
  | { kind: 'day'; dayKey: string; node: HTMLElement; clip: () => HTMLElement | null }
  | { kind: 'timebox'; dayKey: string; node: HTMLElement; gridNode: HTMLElement | null };

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
  registerBoard: (reg: BoardReg | null) => void;
  // Ref callback factory for a drag source, cached per key.
  sourceRef: (key: string, getItem: (e: PointerEvent) => DragItem | null) => (node: unknown) => void;
  startResize: (e: PointerEvent, task: Task, startMin: number, gridNode: HTMLElement) => void;
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

// The id of the task card under the pointer (not the dragged one), or null.
// Cards carry data-task-card; legacy phone items and Timebox blocks do not.
function cardUnder(x: number, y: number, draggedId: string, allowed: boolean): string | null {
  if (!allowed) return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const card = (el as Element).closest('[data-task-card]');
    if (!card) continue;
    const id = (card as HTMLElement).dataset.taskCard ?? null;
    if (id && id !== draggedId) return id;
    if (id === draggedId) continue;
  }
  return null;
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
  const board = useRef<BoardReg | null>(null);
  const pending = useRef<Pending | null>(null);
  const last = useRef<DragState | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const armed = useRef<{ dir: -1 | 1; at: number } | null>(null);
  // Set while the pointer is at a board edge that can still scroll sideways.
  const sideScroll = useRef<-1 | 0 | 1>(0);
  const frame = useRef<number | null>(null);
  const dwell = useRef<DwellState>({ hostId: null, since: 0 });
  const [undo, setUndo] = useState<{ plan: SubtaskDropPlan; hostTitle: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTick = useRef(0);
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
        list.push({ kind: 'timebox', dayKey: reg.dayKey, rect: rectOf(reg.node), gridTop: rectOf(reg.gridNode).top });
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
      const next: DragState = { mode: 'resize', item: p.item, x, y, target: null, accepted: true, edge: 0, resizeDuration: duration, subtaskHost: null };
      last.current = next;
      setDrag(next);
      return;
    }
    const target = resolveDrop(x, y, measureZones(), p.item);
    const todayKey = dateKey(new Date());
    let edge: -1 | 0 | 1 = 0;
    const b = board.current;
    if (b && b.node.isConnected) {
      const dir = edgeDirection(x, y, rectOf(b.node), b.atCurrentWeek());
      const action = edgeAction(dir, b.node.scrollLeft, b.node.scrollWidth - b.node.clientWidth);
      sideScroll.current = action === 'scroll' ? dir : 0;
      if (action === 'dwell') edge = dir;
    }
    if (edge === 0) armed.current = null;
    else if (!armed.current || armed.current.dir !== edge) armed.current = { dir: edge, at: performance.now() };
    // Hovering another task's card for 300 ms arms "Add as subtask".
    const hid = cardUnder(x, y, p.item.id, !!p.item.task);
    const at = performance.now();
    dwell.current = nextDwell(dwell.current, hid, at);
    const next: DragState = {
      mode: 'move',
      item: p.item,
      x,
      y,
      target,
      accepted: target ? canDrop(target, todayKey) : false,
      edge,
      subtaskHost: dwellArmed(dwell.current, hid, at) ? hid : null,
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
    const side = sideScroll.current;
    if (p.mode === 'move' && side !== 0 && board.current) {
      board.current.node.scrollLeft += Math.round(side * AUTO_SCROLL_MAX_PX * scale);
      moved = true;
    }
    const a = armed.current;
    if (p.mode === 'move' && a && board.current && dwellDone(a.at, performance.now())) {
      board.current.step(a.dir);
      // Keep holding to keep stepping, one dwell per week.
      armed.current = { dir: a.dir, at: performance.now() };
      moved = true;
    }
    // The highlight appears after the dwell even if the pointer stays still.
    if (p.mode === 'move' && p.item.task) {
      const hid = cardUnder(x, y, p.item.id, true);
      const armedNow = dwellArmed(dwell.current, hid, performance.now());
      if (armedNow !== (last.current?.subtaskHost != null)) moved = true;
    }
    if (moved) update();
    frame.current = requestAnimationFrame(tick);
  }, [update]);

  const finish = useCallback(
    (commit: boolean) => {
      const p = pending.current;
      pending.current = null;
      armed.current = null;
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
      const dwellAtRelease = dwell.current;
      dwell.current = { hostId: null, since: 0 };
      setDrag(null);
      if (!p || !p.active) return;
      // The click that follows a real drag must not open the editor.
      const swallow = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
      };
      window.addEventListener('click', swallow, true);
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      if (commit && state) void commitDrop(p, state, dwellAtRelease);
    },
    // The listeners below are stable (declared with useCallback over refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function commitDrop(p: Pending, state: DragState, dwellAtRelease: DwellState) {
    const todayKey = dateKey(new Date());
    if (p.mode === 'resize') {
      const task = p.item.task;
      if (!task || !state.resizeDuration || state.resizeDuration === task.durationMinutes) return;
      await updateTask({ ...task, durationMinutes: state.resizeDuration });
      onChangedRef.current();
      return;
    }
    // Dropping on a card's own body, after the highlight showed, adds a subtask.
    // Anything else (a column, between cards, a release too early) is a Day drop.
    if (p.item.task) {
      const hovered = cardUnder(pointer.current.x, pointer.current.y, p.item.id, true);
      const outcome = resolveCardRelease(dwellAtRelease, hovered, p.item.id, performance.now());
      if (outcome.kind === 'subtask') {
        const all = await loadTasksRaw();
        const host = all.find((t) => t.id === outcome.hostId && !t.deletedAt);
        const dragged = all.find((t) => t.id === p.item.id && !t.deletedAt);
        if (host && dragged) {
          const plan = await dropAsSubtask(host, dragged);
          if (plan) {
            setUndo({ plan, hostTitle: host.title });
            if (undoTimer.current) clearTimeout(undoTimer.current);
            undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
            onChangedRef.current();
            return;
          }
        }
      }
    }
    if (!state.target || !state.accepted) return;
    const { task, item } = p.item;
    if (task) {
      const patch = dropPatch(task, p.item.kind, state.target, todayKey);
      if (!patch) return;
      await updateTask({ ...task, ...patch });
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

  async function undoSubtask() {
    const u = undo;
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (u) {
      await undoDropAsSubtaskPlan(u.plan);
      onChangedRef.current();
    }
  }

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
    (e: PointerEvent, task: Task, startMin: number, gridNode: HTMLElement) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      begin(e, {
        mode: 'resize',
        item: { kind: 'block', task, id: task.id, title: task.title, duration: taskDuration(task) },
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
  const registerBoard = useCallback((reg: BoardReg | null) => {
    board.current = reg;
  }, []);

  const api = useMemo(
    () => ({ drag, registerZone, registerScroller, registerBoard, sourceRef, startResize }),
    [drag, registerZone, registerScroller, registerBoard, sourceRef, startResize],
  );

  return (
    <DragContext.Provider value={api}>
      {children}
      {drag && drag.mode === 'move' && <LiftedCard drag={drag} />}
      {undo && (
        <View style={styles.undoBar} accessibilityLiveRegion="polite">
          <Text style={styles.undoText} numberOfLines={1}>
            Added to {undo.hostTitle}.
          </Text>
          <Pressable onPress={undoSubtask} accessibilityRole="button" accessibilityLabel="Undo add as subtask">
            <Text style={styles.undoLink}>Undo</Text>
          </Pressable>
        </View>
      )}
    </DragContext.Provider>
  );
}

// The card under the pointer: a soft shadow, the title, and over the Timebox
// the snapped time ("10:30 to 11:00"). It never takes pointer events, so the
// wheel still reaches the pane under it.
function LiftedCard({ drag }: { drag: DragState }) {
  const t = drag.target;
  let hint: string | null = null;
  if (drag.subtaskHost) hint = 'Add as subtask';
  else if (t && !drag.accepted) hint = 'Past day';
  else if (t?.kind === 'slot') hint = slotLabel(t.startMin, drag.item.duration);
  return (
    <View pointerEvents="none" style={[styles.lifted, { left: drag.x + 12, top: drag.y + 10 }]}>
      <Text style={styles.liftedTitle} numberOfLines={1}>
        {drag.item.title}
      </Text>
      {hint && <Text style={[styles.liftedHint, !drag.accepted && styles.liftedHintMuted]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  undoBar: {
    position: 'fixed' as 'absolute',
    bottom: 20,
    left: '50%' as unknown as number,
    transform: [{ translateX: '-50%' as unknown as number }],
    zIndex: 900,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    boxShadow: '0 6px 18px rgba(38, 37, 31, 0.14)',
  },
  undoText: { fontSize: 13, color: Colors.textPrimary, maxWidth: 320 },
  undoLink: { fontSize: 13, fontWeight: '700', color: Colors.accentText },
  lifted: {
    position: 'fixed' as 'absolute',
    zIndex: 1000,
    maxWidth: 240,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    boxShadow: '0 6px 18px rgba(38, 37, 31, 0.14)',
  },
  liftedTitle: { fontSize: 14, color: Colors.textPrimary },
  liftedHint: { marginTop: 2, fontSize: 12, fontWeight: '700', color: Colors.accentText },
  liftedHintMuted: { fontWeight: '400', color: Colors.textSecondary },
});
