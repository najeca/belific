// The keyboard route for a task card (checkpoint 9, decision 025; 2.27.0): Tab
// reaches the card and Enter opens its details, the same as a click (there is no
// expanding in place any more). Pure, no runtime imports; see cardKeys.test.ts.
//
// Only a key pressed on the card element itself counts. A key from any field
// or from a button inside the card is never the card's: this is what keeps the
// 2.12.1 space key fix fixed. Space is deliberately not handled here (it
// scrolls, or types in a field).
export type CardKeyAction = 'open' | null;

export function cardKeyAction(input: { key: string; onCardItself: boolean; editable: boolean; modified: boolean }): CardKeyAction {
  if (!input.onCardItself || input.editable || input.modified) return null;
  if (input.key === 'Enter') return 'open';
  return null;
}
