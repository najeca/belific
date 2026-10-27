// The "Frequently used" row of the emoji picker (3.13.0): the emojis chosen most often on this device, most
// often first, the latest first among equals. Pure: NO runtime imports; see emojiUse.test.ts. Before 3.13.0 the
// desktop kept a "recent" list; `useFromRecent` turns it into counts once. Nothing is invented: a device that has
// chosen nothing has an empty row (the picker says so), not a row of defaults.
export type EmojiUse = Record<string, { n: number; at: number }>;

export const FREQUENT_MAX = 8;
const MAX_KEPT = 60;

export function parseUse(raw: string | null | undefined): EmojiUse {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: EmojiUse = {};
    for (const [emoji, e] of Object.entries(v as Record<string, unknown>)) {
      const r = e as { n?: unknown; at?: unknown } | null;
      if (emoji.length === 0 || emoji.length > 32 || !r || typeof r.n !== 'number' || typeof r.at !== 'number' || !(r.n >= 1)) continue;
      out[emoji] = { n: Math.floor(r.n), at: r.at };
    }
    return out;
  } catch {
    return {};
  }
}

export function bumpUse(use: EmojiUse, emoji: string, at: number): EmojiUse {
  const next: EmojiUse = { ...use, [emoji]: { n: (use[emoji]?.n ?? 0) + 1, at } };
  const keys = Object.keys(next);
  if (keys.length <= MAX_KEPT) return next;
  // Forget the least used (then the oldest) so the stored list stays small.
  const keep = keys.sort((a, b) => next[b].n - next[a].n || next[b].at - next[a].at).slice(0, MAX_KEPT);
  return Object.fromEntries(keep.map((k) => [k, next[k]]));
}

export function frequentRow(use: EmojiUse, max = FREQUENT_MAX): string[] {
  return Object.keys(use)
    .sort((a, b) => use[b].n - use[a].n || use[b].at - use[a].at || a.localeCompare(b))
    .slice(0, max);
}

// The old recent row (newest first) as counts of one, the newest the latest.
export function useFromRecent(recent: readonly string[], now: number): EmojiUse {
  const out: EmojiUse = {};
  recent.forEach((e, i) => {
    out[e] = { n: 1, at: now - i };
  });
  return out;
}
