// The timeline of the phone's Today (PLAN_phone_stepflow section 2, 3.60.0). Pure: NO runtime imports; see
// todayTimeline.test.ts.
//
//  * Bubble height shows the length: 1 pt per minute, at least 44 pt (a full touch target), at most 160 pt (an eight
//    hour shift does not fill the screen). A quick reminder (no length) is a small round bubble (44 pt).
//  * The Now marker: inside the bubble of an item running now (at the share of its length gone), otherwise a line
//    between the item before this minute and the one after it.
export const BUBBLE_MIN = 44;
export const BUBBLE_MAX = 160;

export function bubbleHeight(minutes: number, reminder = false): number {
  if (reminder || !Number.isFinite(minutes)) return BUBBLE_MIN;
  return Math.max(BUBBLE_MIN, Math.min(BUBBLE_MAX, Math.round(minutes)));
}

export interface TimelineSpan {
  key: string;
  startMin: number;
  endMin: number;
  // A reminder or a free time block never holds the marker.
  reminder?: boolean;
  free?: boolean;
  done?: boolean;
}

export type NowMarker =
  // Inside the bubble of `key`, at `share` (0 to 1) of its height.
  | { inside: true; key: string; share: number }
  // A line before the item at `index` (the list's length: after the last one).
  | { inside: false; index: number };

// `spans` in the order they are drawn (by start time). The innermost running item (the latest start) holds the marker.
export function nowMarker(spans: TimelineSpan[], nowMin: number): NowMarker {
  let best: TimelineSpan | null = null;
  for (const s of spans) {
    if (s.reminder || s.free || s.done || s.endMin <= s.startMin) continue;
    if (s.startMin <= nowMin && nowMin < s.endMin && (!best || s.startMin >= best.startMin)) best = s;
  }
  if (best) return { inside: true, key: best.key, share: (nowMin - best.startMin) / (best.endMin - best.startMin) };
  const index = spans.findIndex((s) => s.startMin > nowMin);
  return { inside: false, index: index === -1 ? spans.length : index };
}
