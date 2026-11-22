import { useSyncExternalStore } from 'react';
import type { Task } from '../../lib/types';
import type { TaskOps } from '../../lib/taskOps';

// The right click menu of a task (D5 of PLAN_desktop_parity, 3.71.0): which task it is open for and where. A plain module
// store like uiStore.ts, so any card, Anytime card or bubble can open it and one component (TaskContextMenu) draws it.
export interface CardMenuTarget {
  x: number;
  y: number;
  task: Task;
  projected: boolean;
  ops: TaskOps;
  // Opens the task's details (a card passes its own open, so a legacy item converts first).
  open: () => void;
  // Run after something changed.
  onChanged: () => void;
}

let current: CardMenuTarget | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useCardMenu = (): CardMenuTarget | null => useSyncExternalStore(subscribe, () => current, () => current);
export const isCardMenuOpen = (): boolean => current !== null;
export function openCardMenu(t: CardMenuTarget): void {
  current = t;
  emit();
}
export function closeCardMenu(): void {
  if (!current) return;
  current = null;
  emit();
}

// The props that make an element open the menu: a right click, and (from the element's own key handler) Shift+F10 or the
// Menu key, which open it at the element's top left.
export function contextMenuProps(make: () => Omit<CardMenuTarget, 'x' | 'y'>): { onContextMenu: (e: { preventDefault?: () => void; stopPropagation?: () => void; clientX?: number; clientY?: number; nativeEvent?: { clientX?: number; clientY?: number } }) => void } {
  return {
    onContextMenu: (e) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      const x = e.clientX ?? e.nativeEvent?.clientX ?? 0;
      const y = e.clientY ?? e.nativeEvent?.clientY ?? 0;
      openCardMenu({ ...make(), x, y });
    },
  };
}

// True for the two keys that mean "open the context menu".
export const isMenuKey = (e: { key: string; shiftKey?: boolean }): boolean => e.key === 'ContextMenu' || (e.key === 'F10' && !!e.shiftKey);
