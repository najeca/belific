// "Split" (shown to the person as Split; field cutsBelow; Part B, build plan P4). Pure: NO runtime imports; see
// cuts.test.ts. DESKTOP ONLY: nothing of this is in the phone's bundle (the iOS
// marker gate lists `cutDay`, `planCuts` and `refusalNote`).
//
// A task with the switch on is a break: where it overlaps another task, the
// other task is drawn in pieces around it, stacked top to bottom at full width,
// instead of side by side. Everything here is DERIVED from the day's tasks every
// time they are drawn: nothing is stored, the host task is never changed, and
// moving, resizing or deleting the break (or the host) simply recomputes.
//
//  * Only a break cuts, and it never cuts another break (two overlapping breaks
//    stay side by side, as before).
//  * A cut is allowed only when every piece it leaves of the host is at least
//    `minLen` minutes (15, 30 or 60; the setting `planner.cut_min`, default 30).
//    A piece that would be shorter, or a break that covers the whole host,
//    refuses that cut: the host stays whole and the two overlap side by side as
//    before, and the break's block says why (`refusalNote`).
//  * Several breaks are tried one by one, earliest first, each judged on its
//    own: a refused one does not stop the others cutting.
//  * Times are minutes after midnight of the day drawn. A host's TRUE end may
//    pass 24:00 (an overnight task): the last piece then ends at that true end
//    and the grid draws it to the bottom with its "continues" marker, as an
//    uncut block does. The next day cuts its own continuation the same way.
export const CUT_MIN_OPTIONS = [15, 30, 60] as const;
export type CutMin = (typeof CUT_MIN_OPTIONS)[number];
export const DEFAULT_CUT_MIN: CutMin = 30;
// The user_settings row (synced, so every computer agrees).
export const CUT_MIN_KEY = 'planner.cut_min';

const DAY_MINUTES = 1440;

// A damaged or unknown value is the default.
export function parseCutMin(value: unknown): CutMin {
  const n = typeof value === 'string' ? Number(value) : value;
  return CUT_MIN_OPTIONS.find((o) => o === n) ?? DEFAULT_CUT_MIN;
}

export interface CutEntry {
  // The id the pane uses for the block (task:…, cont:…).
  id: string;
  startMin: number;
  // The TRUE end: may be past 24:00.
  endMin: number;
  // The task has the switch on: it is a break, never a host.
  breaks: boolean;
}

export interface CutPiece {
  // The id of this piece's block: `${hostId}#${index}`.
  id: string;
  hostId: string;
  index: number;
  count: number;
  startMin: number;
  // The last piece of a host that runs past 24:00 ends at the true end (past 1440).
  endMin: number;
  // Minutes from the start of this piece to the end of the whole task.
  leftMin: number;
  // The piece starts where the task itself starts: it shows the full length, not "left".
  head: boolean;
  last: boolean;
}

export interface CutRefusal {
  hostId: string;
  breakId: string;
  reason: 'short' | 'covers';
  // For 'short': the shortest piece the cut would have left.
  pieceMin?: number;
}

export interface CutResult {
  pieces: CutPiece[];
  // Hosts drawn in pieces.
  cut: Set<string>;
  refusals: CutRefusal[];
}

type Span = [number, number];

function subtract(spans: Span[], cutStart: number, cutEnd: number): Span[] {
  const out: Span[] = [];
  for (const [s, e] of spans) {
    if (cutEnd <= s || cutStart >= e) {
      out.push([s, e]);
      continue;
    }
    if (cutStart > s) out.push([s, cutStart]);
    if (cutEnd < e) out.push([cutEnd, e]);
  }
  return out;
}

export function cutDay(entries: CutEntry[], minLen: number): CutResult {
  const result: CutResult = { pieces: [], cut: new Set(), refusals: [] };
  const valid = entries.filter((e) => Number.isFinite(e.startMin) && Number.isFinite(e.endMin) && e.endMin > e.startMin && e.startMin < DAY_MINUTES);
  const breaks = valid
    .filter((e) => e.breaks)
    .map((e) => ({ id: e.id, start: Math.max(0, e.startMin), end: Math.min(DAY_MINUTES, e.endMin) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  if (breaks.length === 0) return result;

  for (const host of valid) {
    if (host.breaks) continue;
    const drawnEnd = Math.min(DAY_MINUTES, host.endMin);
    let spans: Span[] = [[Math.max(0, host.startMin), drawnEnd]];
    let changed = false;
    for (const b of breaks) {
      if (b.end <= spans[0][0] || b.start >= spans[spans.length - 1][1]) continue;
      const next = subtract(spans, b.start, b.end);
      const same = next.length === spans.length && next.every((s, i) => s[0] === spans[i][0] && s[1] === spans[i][1]);
      if (same) continue; // the break only touches a part that is already cut away
      if (next.length === 0) {
        result.refusals.push({ hostId: host.id, breakId: b.id, reason: 'covers' });
        continue;
      }
      const shortest = Math.min(...next.map(([s, e]) => e - s));
      if (shortest < minLen) {
        result.refusals.push({ hostId: host.id, breakId: b.id, reason: 'short', pieceMin: shortest });
        continue;
      }
      spans = next;
      changed = true;
    }
    if (!changed) continue;
    result.cut.add(host.id);
    spans.forEach(([s, e], i) => {
      const last = i === spans.length - 1;
      result.pieces.push({
        id: `${host.id}#${i}`,
        hostId: host.id,
        index: i,
        count: spans.length,
        startMin: s,
        endMin: e === drawnEnd && host.endMin > DAY_MINUTES ? host.endMin : e,
        leftMin: host.endMin - s,
        head: s === host.startMin,
        last,
      });
    });
  }
  return result;
}

// What the pane needs for one day: the plain items, with the cut hosts replaced
// by their pieces, and the notes of refused cuts keyed by the break's block id.
export interface PlannedItem {
  id: string;
  startMin: number;
  endMin: number;
  piece?: CutPiece;
}
export function planCuts(
  entries: CutEntry[],
  minLen: number,
  titleOf: (id: string) => string,
): { items: PlannedItem[]; notes: Map<string, string>; badges: Map<string, string> } {
  const res = cutDay(entries, minLen);
  const items: PlannedItem[] = [];
  for (const e of entries) {
    if (!res.cut.has(e.id)) {
      items.push({ id: e.id, startMin: e.startMin, endMin: e.endMin });
      continue;
    }
    for (const p of res.pieces) if (p.hostId === e.id) items.push({ id: p.id, startMin: p.startMin, endMin: p.endMin, piece: p });
  }
  // `notes`: the whole sentence (the break's tooltip); `badges`: the short form drawn on the block.
  const notes = new Map<string, string>();
  const badges = new Map<string, string>();
  for (const r of res.refusals) {
    const text = refusalNote(r, titleOf(r.hostId), minLen);
    notes.set(r.breakId, notes.has(r.breakId) ? `${notes.get(r.breakId)} ${text}` : text);
    if (!badges.has(r.breakId)) badges.set(r.breakId, refusalBadge(r, minLen));
  }
  return { items, notes, badges };
}

function minutesText(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

// The small note on a break that could not cut (and in its tooltip).
export function refusalNote(r: CutRefusal, hostTitle: string, minLen: number): string {
  if (r.reason === 'covers') return `Not splitting ${hostTitle}: it would cover all of the task.`;
  return `Not splitting ${hostTitle}: a piece would be ${minutesText(r.pieceMin ?? 0)} (the minimum is ${minutesText(minLen)}).`;
}

// The short form on the block itself ("Not split: 20 min piece (min 30)"); the first refusal of the break.
export function refusalBadge(r: CutRefusal, minLen: number): string {
  if (r.reason === 'covers') return 'Not split: it would cover a whole task';
  return `Not split: ${r.pieceMin ?? 0} min piece (min ${minLen})`;
}

// The time line of a piece: the first shows the start and the full length, the
// others their own start and the time left to the end of the task.
export function pieceTimeText(startText: string, durationText: string | undefined, leftText: string | undefined, head: boolean): string {
  return head ? `${startText} ${durationText ?? ''}`.trim() : `${startText} ${leftText ? `${leftText} left` : ''}`.trim();
}
