// What a Calendar or Timebox block shows at its height (2.47.0). Pure, no runtime imports; see
// blockLayout.test.ts. Three tiers by height; when a tier runs out of width, parts drop in a fixed
// order (the component counts how many). The title never drops.
//   1  very short: one line, the title and a short text on the right (the priority mark stays).
//   2  medium: line 1 the title, line 2 the time and the length ("left" on a later piece);
//      the repeat icon and the list emoji only if they still fit on those lines.
//   3  tall: the full layout (the title may wrap in the Calendar, a cut note, the list emoji).
import { COMPACT_BLOCK_PX } from './timebox.ts';

export type BlockTier = 1 | 2 | 3;
export type BlockPart = 'listEmoji' | 'repeat' | 'left' | 'time' | 'priority';

// A block of 60 minutes (56px) and taller shows the full layout.
export const FULL_BLOCK_PX = 56;

// First to go first.
export const BLOCK_DROP_ORDER: readonly BlockPart[] = ['listEmoji', 'repeat', 'left', 'time', 'priority'];

export interface BlockPlan {
  tier: BlockTier;
  showListEmoji: boolean;
  showRepeat: boolean;
  showLeft: boolean;
  showTime: boolean;
  showPriority: boolean;
}

export function blockTier(heightPx: number): BlockTier {
  if (heightPx < COMPACT_BLOCK_PX) return 1;
  return heightPx < FULL_BLOCK_PX ? 2 : 3;
}

// `dropped` = how many parts the width has already taken away, in BLOCK_DROP_ORDER.
export function blockPlan(heightPx: number, dropped = 0): BlockPlan {
  const tier = blockTier(heightPx);
  const gone = new Set(BLOCK_DROP_ORDER.slice(0, Math.max(0, dropped)));
  // Tier 1 has no icons other than the priority mark; its right hand text is the 'time' part.
  const iconsHere = tier !== 1;
  return {
    tier,
    showListEmoji: iconsHere && !gone.has('listEmoji'),
    showRepeat: iconsHere && !gone.has('repeat'),
    showLeft: iconsHere && !gone.has('left'),
    showTime: !gone.has('time'),
    showPriority: !gone.has('priority'),
  };
}
