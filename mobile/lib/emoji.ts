// Emoji helpers (build plan section 0, item 9: the system's native emoji).
// Pure: NO runtime imports; see emoji.test.ts. Nothing here draws an emoji;
// the operating system does. A field keeps ONE emoji: the first one typed or
// pasted, so a pasted sentence cannot end up as an "emoji".
type Segmenter = { segment(s: string): Iterable<{ segment: string }> };
const SEGMENTER: Segmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new (Intl as unknown as { Segmenter: new (l?: string, o?: object) => Segmenter }).Segmenter(undefined, { granularity: 'grapheme' })
    : null;

// A flag is two regional indicators; an emoji is a pictographic code point, a
// keycap (digit, then U+20E3) or a flag.
const LOOKS_LIKE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]️?⃣)/u;

export const MAX_EMOJI_CODE_UNITS = 32;

// The first emoji in the text, or undefined when there is none.
export function firstEmoji(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const text = input.trim();
  if (!text) return undefined;
  const graphemes: string[] = SEGMENTER ? Array.from(SEGMENTER.segment(text), (s) => s.segment) : Array.from(text);
  for (const g of graphemes) {
    if (LOOKS_LIKE_EMOJI.test(g) && g.length <= MAX_EMOJI_CODE_UNITS) return g;
  }
  return undefined;
}

// The suggestions under an emoji field. Fixed order; nothing is rendered from
// a bundled image set.
export const EMOJI_CHOICES: string[] = [
  '💼', '🏠', '📚', '🛒', '💪', '🎯', '🎨', '💻', '🧹', '📞',
  '✉️', '💡', '🌱', '❤️', '🐶', '✈️', '🍽️', '💰', '🎵', '🧘',
];

export const DEFAULT_LIST_EMOJI = '📋';
export const DEFAULT_LABEL_EMOJI = '🏷️';
export const BRAIN_DUMP_EMOJI = '🧠';
