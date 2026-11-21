// Which actions a task card offers, for both apps (PLAN_desktop_parity D1, 3.66.0). Moved unchanged out of the phone's
// components/phone/HoldCard.tsx (the press and hold card) so the desktop's right click menu (D5) offers the same ones in
// the same order. Pure: NO runtime imports; see cardActions.test.ts.
//
// Done (Not done when ticked), Edit, Skip today (repeating tasks only), Move, Delete, More. Delete on a repeating task
// asks DELETE_ASK first: Only today, or Every day. Delete is never red.
export const SKIP_TODAY_NOTE = 'Not today. It still repeats next time.';
export const DELETE_ASK = 'Only today, or every day?';

export type CardActionId = 'done' | 'edit' | 'skip' | 'move' | 'delete' | 'more';
export type CardDeleteId = 'delete-today' | 'delete-all';

export interface CardAction<Id extends string = CardActionId> {
  id: Id;
  label: string;
  primary?: boolean;
}

export function cardActions(task: { recurrence?: unknown }, completed: boolean): CardAction[] {
  const repeating = !!task.recurrence;
  const out: CardAction[] = [{ id: 'done', label: completed ? 'Not done' : 'Done', primary: true }, { id: 'edit', label: 'Edit' }];
  if (repeating) out.push({ id: 'skip', label: 'Skip today' });
  out.push({ id: 'move', label: 'Move' }, { id: 'delete', label: 'Delete' }, { id: 'more', label: 'More' });
  return out;
}

// Delete on a repeating task asks first; on a one off task it deletes at once.
export function deleteAsks(task: { recurrence?: unknown }): boolean {
  return !!task.recurrence;
}

export const DELETE_CHOICES: CardAction<CardDeleteId>[] = [
  { id: 'delete-today', label: 'Only today' },
  { id: 'delete-all', label: 'Every day' },
];

// The plain line under the buttons of a repeating task.
export function skipNote(): string {
  return `Skip today: ${SKIP_TODAY_NOTE.charAt(0).toLowerCase()}${SKIP_TODAY_NOTE.slice(1)}`;
}
