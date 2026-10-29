import { useSyncExternalStore } from 'react';

// 3.17.0: the Today button sits in the top row beside the Tasks / Calendar toggle, outside the two panes. Each pane
// says whether it already shows today (so the button can switch itself off, as the per pane buttons did), and the
// Calendar is asked to jump with a counter, as the board is by uiStore.requestGoToday.
export type CenterView = 'kanban' | 'calendar';

let at: Record<CenterView, boolean> = { kanban: false, calendar: false };
let calendarNonce = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setAtToday(which: CenterView, value: boolean): void {
  if (at[which] === value) return;
  at = { ...at, [which]: value };
  emit();
}
export const useAtToday = (which: CenterView): boolean => useSyncExternalStore(subscribe, () => at[which], () => false);

export function requestCalendarToday(): void {
  calendarNonce += 1;
  emit();
}
export const useCalendarTodayRequest = (): number => useSyncExternalStore(subscribe, () => calendarNonce, () => 0);
