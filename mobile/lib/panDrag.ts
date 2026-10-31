// Middle mouse drag to pan (3.24.0). Holding the wheel button over the Calendar or the Timebox and dragging grabs the
// content like a hand: it follows the pointer, so dragging left moves the content left (the view scrolls right) and
// dragging up moves the content up (the view scrolls down). Pure; the DOM wiring is components/desktop/MiddlePan.tsx.

export interface PanStart {
  // The pointer where the middle button went down.
  x: number;
  y: number;
  // The scroller's position then.
  left: number;
  top: number;
}

export interface PanLimits {
  maxLeft: number;
  maxTop: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: number) => (Number.isFinite(v) ? v : 0);

// Where the scroller is for a pointer at (x, y). A direction that cannot scroll (a limit of 0) stays where it was.
export function panPosition(start: PanStart, x: number, y: number, limits: PanLimits): { left: number; top: number } {
  const maxLeft = Math.max(0, num(limits.maxLeft));
  const maxTop = Math.max(0, num(limits.maxTop));
  return {
    left: maxLeft > 0 ? clamp(start.left - (num(x) - start.x), 0, maxLeft) : start.left,
    top: maxTop > 0 ? clamp(start.top - (num(y) - start.y), 0, maxTop) : start.top,
  };
}

// The middle button is held in a mouse event: `buttons` has the bit for the wheel button (4).
export function middleHeld(buttons: number): boolean {
  return (buttons & 4) === 4;
}

// What starts a pan: the middle button (button 1), over a pan area, and not over a field, a popover or the details.
export const PAN_AREAS = '[data-cal-scroller], [data-timebox-grid]';
export const PAN_BLOCKED = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [data-detail-panel], [data-popover]';

export function startsPan(button: number, inArea: boolean, blocked: boolean): boolean {
  return button === 1 && inArea && !blocked;
}
