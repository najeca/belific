// The phone's touch rules (PLAN_phone P2), in one place. Pure, no runtime imports; see
// touchRules.test.ts. components/phone/touch.tsx configures gesture handler with these numbers; the
// real touch checks (desktop/test/real/phone-*.js) drive fingers against the same numbers.
//
//  * A tap only counts when the finger barely moves and lifts quickly, so scrolling and swiping
//    never select anything.
//  * Press and hold starts after about 400 ms (with a small haptic), only if the finger stayed put.
//  * A swipe on a row commits past a share of the row's width; a sideways page change on the Calendar
//    needs a clearly sideways move, so vertical scrolling always wins.

export const TAP_MAX_MOVE = 10; // points the finger may drift during a tap
export const TAP_MAX_MS = 250; // a tap lifts within this time
export const HOLD_MS = 400; // press and hold
export const HOLD_MAX_MOVE = 10; // a hold is cancelled if the finger wanders further
export const SWIPE_COMMIT = 0.35; // share of the row's width that commits a full swipe
export const SWIPE_ACTION_WIDTH = 80; // each revealed action button
export const PAGE_ACTIVE_X = 24; // a sideways pan becomes a page change past this...
export const PAGE_FAIL_Y = 16; // ...unless the finger moved this far up or down first
export const PAGE_COMMIT = 0.22; // share of the screen width (or a fling) that turns the page
export const PAGE_FLING = 600; // points per second

export type TouchKind = 'tap' | 'hold' | 'none';

// What a finger that touched down and lifted counts as. `moved` is the largest distance from the
// first point at any moment; `held` is the time between down and up.
export function classifyTouch(moved: number, held: number): TouchKind {
  if (held >= HOLD_MS) return moved <= HOLD_MAX_MOVE ? 'hold' : 'none';
  if (moved <= TAP_MAX_MOVE && held <= TAP_MAX_MS) return 'tap';
  return 'none';
}

// Whether a sideways move turns the page: -1 back, 1 forward, 0 stay. `dx` is positive to the right
// (a finger moving right goes back, as on any calendar).
export function pageTurn(dx: number, vx: number, width: number): -1 | 0 | 1 {
  if (Math.abs(dx) >= width * PAGE_COMMIT || (Math.abs(vx) >= PAGE_FLING && Math.abs(dx) >= PAGE_ACTIVE_X)) return dx > 0 ? -1 : 1;
  return 0;
}
