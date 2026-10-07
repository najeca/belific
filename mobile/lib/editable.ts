// Is this event target an editable field (input, textarea, select or
// contenteditable)? Card level handlers (expand on press, key activation, drag
// start) ignore events that come from one, so typing a space or pressing Enter
// in Notes, a rename box, a subtask field or a search box never reaches the
// card. Pure: works on anything with an optional closest() (a DOM element).
export const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export function isEditableTarget(target: unknown): boolean {
  const t = target as { closest?: (selector: string) => unknown } | null | undefined;
  if (!t || typeof t.closest !== 'function') return false;
  try {
    return t.closest(EDITABLE_SELECTOR) !== null && t.closest(EDITABLE_SELECTOR) !== undefined;
  } catch {
    return false;
  }
}

// A field where Escape means something else (cancel the edit, close the list):
// text entry, a select, a textarea, contenteditable. A checkbox, radio or button
// is not one, so Escape on a focused switch still leaves a page (checkpoint 11).
export const TEXT_ENTRY_SELECTOR =
  'textarea, select, [contenteditable]:not([contenteditable="false"]), input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"])';

export function isTextEntryTarget(target: unknown): boolean {
  const t = target as { closest?: (selector: string) => unknown } | null | undefined;
  if (!t || typeof t.closest !== 'function') return false;
  try {
    const hit = t.closest(TEXT_ENTRY_SELECTOR);
    return hit !== null && hit !== undefined;
  } catch {
    return false;
  }
}
