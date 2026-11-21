// Wrap up on the phone (PLAN_phone_parity phase 9, 3.65.0): the tasks of today still open, asked one at a time, and the
// answers each offers. Pure: NO runtime imports besides siblings; see wrapQueue.test.ts. The rules are the desktop's
// (wrapUp.ts buttonsFor, dayItems); the writes are wrapActions.ts, put together in wrapPhoneActions.ts.
import type { Task } from './types.ts';
import { buttonsFor, dayItems, stepsButton, partsButton, type WrapItem } from './wrapUp.ts';
import { isQuickReminder } from './quickReminder.ts';

export type WrapAnswer = 'done' | 'tomorrow' | 'list' | 'letGo' | 'steps' | 'parts';

// Today's tasks that are not done, in time order (a shift is one; the rows inside it are not asked one by one).
// D6 of PLAN_desktop_parity (3.68.0): the day's rows Wrap up shows, for both apps. The desktop's one screen shows them
// all (done ones without buttons); the phone asks only the open ones (wrapQueue). `todayKey` is the real today.
export const wrapDayItems = (raw: Task[], dayKey: string, todayKey: string, cutMin: number): WrapItem[] => dayItems(raw, dayKey, todayKey, cutMin);

export function wrapQueue(raw: Task[], todayKey: string, cutMin: number): WrapItem[] {
  return wrapDayItems(raw, todayKey, todayKey, cutMin).filter((i) => !i.done && !i.row && !isQuickReminder(i.task));
}

export interface WrapOffer {
  answer: WrapAnswer;
  label: string;
}

// Done always; the rest are the desktop's buttons for that row. A repeating day has Done and Let go (it skips only that day).
export function wrapOffers(item: WrapItem): WrapOffer[] {
  const b = buttonsFor(item);
  const out: WrapOffer[] = [{ answer: 'done', label: 'Done' }];
  if (b.tomorrow) out.push({ answer: 'tomorrow', label: 'Tomorrow' });
  if (b.list) out.push({ answer: 'list', label: 'Back to its list' });
  if (b.stepsLeft > 0) out.push({ answer: 'steps', label: stepsButton(b.stepsLeft) });
  if (b.partsLeft > 0) out.push({ answer: 'parts', label: partsButton(b.partsLeft) });
  if (b.letGo) out.push({ answer: 'letGo', label: item.series ? 'Let go for today' : 'Let go' });
  return out;
}

export const wrapHint = (item: WrapItem): string => (item.series ? 'Let go skips only today. The repeat stays.' : 'Let go puts it in the Trash. Tomorrow keeps its time.');

// The line an answer leaves in the summary and the Undo bar.
export function wrapText(answer: WrapAnswer, title: string): string {
  const word: Record<WrapAnswer, string> = { done: 'Done', tomorrow: 'Tomorrow', list: 'Back to its list', letGo: 'Let go', steps: 'Steps left to tomorrow', parts: 'Smaller tasks left to tomorrow' };
  return `${word[answer]}: ${title}`;
}
