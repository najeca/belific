// Popover placement (checkpoint 8.2, decision 021). Pure: given the trigger's
// rectangle, the popover's natural size and the window, it picks a side and
// clamps so the popover always stays inside the window. See popover.test.ts.
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  maxHeight: number;
  side: 'below' | 'above' | 'right' | 'left';
}

export const MAX_POPOVER_HEIGHT = 320;
const GAP = 6;
const MARGIN = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function placePopover(anchor: Box, size: { width: number; height: number }, win: { width: number; height: number }): Placement {
  const maxH = Math.min(MAX_POPOVER_HEIGHT, win.height - 2 * MARGIN);
  const h = Math.min(size.height, maxH);
  const w = Math.min(size.width, win.width - 2 * MARGIN);
  const left = clamp(anchor.x, MARGIN, win.width - w - MARGIN);
  const spaceBelow = win.height - (anchor.y + anchor.height) - GAP - MARGIN;
  const spaceAbove = anchor.y - GAP - MARGIN;

  if (h <= spaceBelow) {
    return { left, top: anchor.y + anchor.height + GAP, maxHeight: maxH, side: 'below' };
  }
  if (h <= spaceAbove) {
    return { left, top: anchor.y - GAP - h, maxHeight: maxH, side: 'above' };
  }
  // Neither side has room for the whole popover: try beside the trigger.
  const spaceRight = win.width - (anchor.x + anchor.width) - GAP - MARGIN;
  const spaceLeft = anchor.x - GAP - MARGIN;
  const topSide = clamp(anchor.y, MARGIN, win.height - h - MARGIN);
  if (w <= spaceRight) return { left: anchor.x + anchor.width + GAP, top: topSide, maxHeight: maxH, side: 'right' };
  if (w <= spaceLeft) return { left: anchor.x - GAP - w, top: topSide, maxHeight: maxH, side: 'left' };
  // Last resort: the roomier of below and above, with the height squeezed to
  // fit (it scrolls inside) so it never leaves the window.
  if (spaceBelow >= spaceAbove) {
    const mh = Math.max(80, spaceBelow);
    return { left, top: anchor.y + anchor.height + GAP, maxHeight: Math.min(maxH, mh), side: 'below' };
  }
  const mh = Math.max(80, spaceAbove);
  const hh = Math.min(h, mh);
  return { left, top: anchor.y - GAP - hh, maxHeight: Math.min(maxH, mh), side: 'above' };
}
