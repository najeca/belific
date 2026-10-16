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
  selectedList: string | null;
  reveal: RevealRequest | null;
  timerConfirm: TimerConfirm | null;
  goToday: number;
}

let state: State = { overlay: null, detailId: null, selectedList: null, reveal: null, timerConfirm: null, goToday: 0 };
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
export const useDetailId = () => use((s) => s.detailId);
export function openDetail(taskId: string): void {
  set({ detailId: taskId });
}
export function closeDetail(): void {
  if (state.detailId) set({ detailId: null });
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
