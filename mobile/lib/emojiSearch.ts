// The emoji picker's search and recent row (2.27.1). Pure, no runtime imports:
// it takes the data (lib/emojiData.ts) as an argument, so emojiSearch.test.ts
// can run it with node --test. Desktop only.

export interface EmojiEntry {
  emoji: string;
  name: string;
  // The name's words and the keywords, lower case.
  words: string[];
  group: number;
}

// The generated strings (one per group, one emoji per line: emoji, tab, name,
// tab, keywords) as entries, in the data's order.
export function parseEmojiData(groups: readonly string[]): EmojiEntry[] {
  const out: EmojiEntry[] = [];
  groups.forEach((block, group) => {
    for (const line of block.split('\n')) {
      if (!line) continue;
      const [emoji, name = '', keywords = ''] = line.split('\t');
      const words = [...name.split(/[\s:,]+/), ...keywords.split(' ')].filter(Boolean);
      out.push({ emoji, name, words, group });
    }
  });
  return out;
}

// Entries whose name or keywords match every word typed (each typed word is the
// start of one of theirs; "game" finds the video game controller, "vid gam" too).
// Best first: the name itself, then a name that starts with the text, then a
// name word match, then a keyword match; the data's order breaks ties.
export function searchEmoji(entries: readonly EmojiEntry[], query: string, limit = 160): EmojiEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const parts = q.split(/\s+/);
  const scored: Array<{ e: EmojiEntry; score: number; i: number }> = [];
  entries.forEach((e, i) => {
    if (!parts.every((p) => e.words.some((w) => w.startsWith(p)))) return;
    const nameWords = e.name.split(/[\s:,]+/);
    const score = e.name === q ? 0 : e.name.startsWith(q) ? 1 : parts.every((p) => nameWords.some((w) => w.startsWith(p))) ? 2 : 3;
    scored.push({ e, score, i });
  });
  scored.sort((a, b) => a.score - b.score || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.e);
}

export const MAX_RECENT = 16;

// The recent row after choosing `emoji`: it moves to the front, no repeats,
// at most MAX_RECENT.
export function pushRecent(recent: readonly string[], emoji: string): string[] {
  return [emoji, ...recent.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
}

// The stored recent row (a JSON list of strings); anything else is an empty row.
export function parseRecent(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((e): e is string => typeof e === 'string' && e.length > 0 && e.length <= 32).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}
