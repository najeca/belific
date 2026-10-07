// The keyboard route for a task card (checkpoint 9, decision 025): Tab reaches
// the card, Enter expands or collapses it, Escape collapses it. Pure, no
// runtime imports; see cardKeys.test.ts.
//
// Only a key pressed on the card element itself counts. A key from any field
// (rename box, notes, subtask box, search) or from a button inside the card
// is never the card's: this is what keeps the 2.12.1 space key fix fixed.
// Space is deliberately not handled here (it scrolls, or types in a field).
export type CardKeyAction = 'toggle' | 'collapse' | null;

export function cardKeyAction(input: {
  key: string;
  onCardItself: boolean;
  editable: boolean;
  expanded: boolean;
  modified: boolean;
}): CardKeyAction {
  if (!input.onCardItself || input.editable || input.modified) return null;
  if (input.key === 'Enter') return 'toggle';
  if (input.key === 'Escape' && input.expanded) return 'collapse';
  return null;
}
