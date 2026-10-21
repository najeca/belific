import { useSyncExternalStore } from 'react';
import { kv } from '../../lib/kv';

// Small shared UI state for the desktop home screen (build plan phases 2 and
// 3): which overlay is open, which task's details panel is open, which list the
// left pane shows, a request to reveal one task, and a timer that needs an
// answer. A plain module store (like Popover.tsx) so the shortcut handler, the
// cards and the overlays can all reach it without threading props through the
// panes. Nothing here is stored except the selected list (kv, local).

export type Overlay =
  | { kind: 'help' }
  | { kind: 'search' }
  | { kind: 'capture'; mode: 'list' | 'today' }
  | { kind: 'flow'; mode: 'planning' | 'shutdown' }
  | { kind: 'labels' }
  | { kind: 'missed' }
  | null;

export interface TimerConfirm {
  taskId: string;
  elapsedMinutes: number;
  // After the stale timer is answered, start this task's timer.
  thenStart?: string;
}

export interface RevealRequest {
  taskId: string;
  dueDate?: string;
  listKey?: string;
  nonce: number;
}

interface State {
  overlay: Overlay;
  detailId: string | null;
  // What the details modal puts the keyboard on when it opens (2.27.0: the
  // card's keys for steps, notes, estimate and actual open the modal there).
  detailFocus: DetailFocus | null;
  selectedList: string | null;
  reveal: RevealRequest | null;
  timerConfirm: TimerConfirm | null;
  goToday: number;
  undo: UndoOffer | null;
  notice: Notice | null;
}

// A short plain message at the bottom of the screen (2.34.1: why a timer could not start).
export interface Notice {
  text: string;
  nonce: number;
}

// One change that can be taken back straight after (2.27.0: moving a day's tasks).
export interface UndoOffer {
  text: string;
  run: () => Promise<unknown>;
  nonce: number;
}

let state: State = { overlay: null, detailId: null, detailFocus: null, selectedList: null, reveal: null, timerConfirm: null, goToday: 0, undo: null, notice: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function set(patch: Partial<State>): void {
  state = { ...state, ...patch };
  emit();
}
function use<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state), () => pick(state));
}

// ---- undo ----
export const useUndo = () => use((s) => s.undo);
export function offerUndo(text: string, run: () => Promise<unknown>): void {
  set({ undo: { text, run, nonce: Date.now() } });
}
export function clearUndo(): void {
  if (state.undo) set({ undo: null });
}

// ---- notice ----
export const useNotice = () => use((s) => s.notice);
export function showNotice(text: string): void {
  set({ notice: { text, nonce: Date.now() } });
}
export function clearNotice(): void {
  if (state.notice) set({ notice: null });
}

// ---- overlays ----
export const useOverlay = () => use((s) => s.overlay);
export const isOverlayOpen = () => state.overlay !== null;
export function openOverlay(o: Exclude<Overlay, null>): void {
  set({ overlay: o });
}
export function closeOverlay(): void {
  if (state.overlay) set({ overlay: null });
}

// ---- the task details panel ----
export type DetailFocus = 'title' | 'subtask' | 'notes' | 'estimate' | 'actual';
export const useDetailId = () => use((s) => s.detailId);
export const getDetailFocus = () => state.detailFocus;
export function openDetail(taskId: string, focus: DetailFocus = 'title'): void {
  set({ detailId: taskId, detailFocus: focus });
}
export function closeDetail(): void {
  if (state.detailId) set({ detailId: null, detailFocus: null });
}

// ---- the list the left pane shows (null = Brain Dump) ----
export const LIST_KEY = 'belific_desktop_list';
export const useSelectedList = () => use((s) => s.selectedList);
export const getSelectedList = () => state.selectedList;
export function selectList(key: string | null): void {
  set({ selectedList: key });
  (key ? kv.setItem(LIST_KEY, key) : kv.removeItem(LIST_KEY)).catch(() => {});
}
export async function restoreSelectedList(): Promise<void> {
  try {
    const raw = await kv.getItem(LIST_KEY);
    if (raw && raw !== state.selectedList) set({ selectedList: raw });
  } catch {
    // Brain Dump
  }
}

// ---- the 2.27.0 label colours (labelColors.ts) ----
// Locked until the person says every computer runs 2.27 or later, because a
// desktop before 2.26 changes a label with a new colour back to one of the
// original eight, and 2.26 draws one it does not know neutral. Stored on this
// computer only (kv), never synced. A new key: the 2.26 tick (the old key) said
// nothing about 2.27, so it is not carried over.
export const NEW_COLORS_KEY = 'belific_desktop_label_colors_227_ok';
let newColorsOk = false;
const colorListeners = new Set<() => void>();
export const useNewColorsOk = () =>
  useSyncExternalStore(
    (l) => {
      colorListeners.add(l);
      return () => colorListeners.delete(l);
    },
    () => newColorsOk,
    () => newColorsOk,
  );
export function setNewColorsOk(ok: boolean): void {
  newColorsOk = ok;
  colorListeners.forEach((l) => l());
  (ok ? kv.setItem(NEW_COLORS_KEY, '1') : kv.removeItem(NEW_COLORS_KEY)).catch(() => {});
}
export async function restoreNewColorsOk(): Promise<void> {
  try {
    if ((await kv.getItem(NEW_COLORS_KEY)) === '1' && !newColorsOk) {
      newColorsOk = true;
      colorListeners.forEach((l) => l());
    }
  } catch {
    // locked
  }
}

// ---- reveal one task (search results) ----
let nonce = 0;
export const useReveal = () => use((s) => s.reveal);
export function requestReveal(r: Omit<RevealRequest, 'nonce'>): void {
  nonce += 1;
  set({ reveal: { ...r, nonce } });
}

// ---- Shift+T: the board goes to this week ----
let todayNonce = 0;
export const useGoToday = () => use((s) => s.goToday);
export function requestGoToday(): void {
  todayNonce += 1;
  set({ goToday: todayNonce });
}

// ---- a stale timer waiting for an answer ----
export const useTimerConfirm = () => use((s) => s.timerConfirm);
export function askTimerConfirm(c: TimerConfirm): void {
  set({ timerConfirm: c });
}
export function clearTimerConfirm(): void {
  if (state.timerConfirm) set({ timerConfirm: null });
}

// ---- "data changed" for modules that are not React components ----
let changed: (() => void) | null = null;
export function setChangeNotifier(fn: (() => void) | null): void {
  changed = fn;
}
export function notifyChanged(): void {
  changed?.();
}
