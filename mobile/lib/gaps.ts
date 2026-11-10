// A Break drawn as a free gap (PLAN_breaks_as_gaps P2, 3.34.0). Pure: NO runtime imports besides siblings; see
// gaps.test.ts. One day's entries (as the Timebox and the Calendar build them) become:
//  * `gaps`: every Break of the day at its real times, drawn under the blocks (light hatching, a dashed outline). A
//    break inside a longer one is a second outline inside the first; yesterday's overnight rest is a gap at the top.
//  * `items`: what is drawn as blocks. A task a break cuts is its pieces (cuts.ts, unchanged); a task wholly inside a
//    break (hosting.ts, unchanged) is an ordinary block at its real time and length, with a floor of
//    GAP_BLOCK_MIN_PX so a short one does not stick out of its gap. Breaks are never blocks.
//  * a refused cut (a piece under the minimum, or the break covers the task): the task draws whole over the gap, the
//    gap is marked `refused` (its outline is drawn above the task) and the task's tooltip says why (`hostNotes`).
// Nothing is stored: like cutting and hosting it is worked out from the times every time a day is drawn.
import { cutDay, planCuts, refusalBadge, refusalNote, type CutEntry, type PlannedItem } from './cuts.ts';
import { hostDay, type DayHostEntry, type HostEntry } from './hosting.ts';
import { GAP_BLOCK_MIN_PX } from './timebox.ts';

export interface GapSpan {
  // The break's block id (task:…, cont:…).
  id: string;
  startMin: number;
  // The TRUE end: may be past 24:00.
  endMin: number;
  cont: boolean;
  // A cut of this break was refused: a task draws whole over it.
  refused: boolean;
  // Why (the whole sentence), when refused.
  note?: string;
}

export interface GapItem extends PlannedItem {
  // A block inside a gap: the gap's id, and its own floor.
  gapId?: string;
  minPx?: number;
}

export interface GapLayout {
  items: GapItem[];
  gaps: GapSpan[];
  // A task drawn whole over a gap it could not be cut by: the sentence and the short badge, by the block id that
  // carries them (the task's block, or its piece under that gap).
  hostNotes: Map<string, string>;
  hostBadges: Map<string, string>;
}

export function gapLayout(entries: Array<CutEntry & HostEntry>, minLen: number, titleOf: (id: string) => string): GapLayout {
  const host = hostDay(entries);
  const plain = entries.filter((e) => !host.hostOf.has(e.id));
  const plan = planCuts(plain, minLen, titleOf);
  const isGap = new Set(entries.filter((e) => e.breaks).map((e) => e.id));
  const items: GapItem[] = plan.items.filter((i) => !isGap.has(i.id));
  for (const e of entries) {
    const gapId = host.hostOf.get(e.id);
    if (gapId && !e.breaks) items.push({ id: e.id, startMin: e.startMin, endMin: e.endMin, gapId, minPx: GAP_BLOCK_MIN_PX });
  }
  const refusals = cutDay(plain, minLen).refusals;
  const refused = new Set(refusals.map((r) => r.breakId));
  const hostNotes = new Map<string, string>();
  const hostBadges = new Map<string, string>();
  const byId = new Map(entries.map((e) => [e.id, e]));
  const hostOfItem = (i: GapItem) => i.piece?.hostId ?? i.id;
  for (const r of refusals) {
    // The block that carries the note: the task's piece under the refused break (a task other breaks did cut is
    // drawn in pieces), else the task's own block.
    const b = byId.get(r.breakId);
    const mine = items.filter((i) => hostOfItem(i) === r.hostId);
    const at = (b && mine.find((i) => i.startMin < b.endMin && i.endMin > b.startMin)) ?? mine[0];
    const key = at?.id ?? r.hostId;
    const text = refusalNote(r, titleOf(r.hostId), minLen);
    hostNotes.set(key, hostNotes.has(key) ? `${hostNotes.get(key)} ${text}` : text);
    if (!hostBadges.has(key)) hostBadges.set(key, refusalBadge(r, minLen));
  }
  const gaps: GapSpan[] = entries
    .filter((e) => e.breaks && Number.isFinite(e.startMin) && e.endMin > e.startMin)
    // The longer first, so an inner outline is drawn over the outer one.
    .sort((a, b) => b.endMin - b.startMin - (a.endMin - a.startMin) || a.startMin - b.startMin || a.id.localeCompare(b.id))
    .map((e) => ({ id: e.id, startMin: e.startMin, endMin: e.endMin, cont: !!e.cont, refused: refused.has(e.id), ...(plan.notes.has(e.id) ? { note: plan.notes.get(e.id) } : {}) }));
  return { items, gaps, hostNotes, hostBadges };
}

// The hover text of a gap: "Short break · 20 min".
export function gapTip(title: string, lengthMin: number, note?: string): string {
  const len = lengthMin < 60 ? `${lengthMin} min` : lengthMin % 60 === 0 ? `${lengthMin / 60} h` : `${Math.floor(lengthMin / 60)} h ${lengthMin % 60} min`;
  return `${title || 'Break'} · ${len}${note ? `. ${note}` : ''}`;
}

// D5 (P3): the breaks that follow a task that moves (lib/breakCarry.ts writes them).
export interface CarryFrom {
  dayKey: string;
  startMin: number;
  endMin: number;
}

export interface CarryMove {
  entry: DayHostEntry;
  // The new start, minutes after midnight of `dayKey`.
  startMin: number;
  dayKey: string;
}

// Pure: the breaks of `entries` (one day, as dayHostEntries builds it) wholly inside `from`, and where each goes when
// the task starts at `toStart` on `toDay`. A break that would leave the day (before 00:00 or from 24:00) stays.
export function carryPlan(entries: DayHostEntry[], hostTaskId: string, from: CarryFrom, toDay: string, toStart: number): CarryMove[] {
  const delta = toStart - from.startMin;
  if (delta === 0 && toDay === from.dayKey) return [];
  return entries
    .filter((e) => e.breaks && !e.cont && e.full.id !== hostTaskId && from.startMin <= e.startMin && e.endMin <= from.endMin)
    .map((e) => ({ entry: e, startMin: e.startMin + delta, dayKey: toDay }))
    .filter((m) => m.startMin >= 0 && m.startMin < 24 * 60);
}

