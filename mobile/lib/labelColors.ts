// The label palette (decision 016, checkpoint 4.1): the ONLY colours a label
// can have. Pure, no runtime imports, so `node --test` can run it; see
// labelColors.test.ts. A Project stores a palette KEY (`colorKey`), never a
// hex value, so the palette can be retuned without touching data.
//
// Muted Quiet Function tones that sit with the sage/cream theme. `edge` is
// the solid colour (a card's 4px left edge, a row's dot, the editor swatch);
// `tint` is the soft card background. Both Colors.textPrimary and
// Colors.textSecondary stay readable on every tint (AA, tested).
import type { Project } from './types.ts';

export const LABEL_COLORS = [
  { key: 'sage', name: 'Sage', edge: '#6F8F7E', tint: '#E9F0EB' },
  { key: 'clay', name: 'Clay', edge: '#B57A62', tint: '#F6ECE7' },
  { key: 'sky', name: 'Sky', edge: '#6E8DA6', tint: '#E9EFF4' },
  { key: 'sand', name: 'Sand', edge: '#B89B66', tint: '#F5F0E4' },
  { key: 'plum', name: 'Plum', edge: '#8D6F8B', tint: '#F4EEF3' },
  { key: 'moss', name: 'Moss', edge: '#7C8A56', tint: '#EFF1E5' },
  { key: 'rose', name: 'Rose', edge: '#B57D88', tint: '#F6EBED' },
  { key: 'slate', name: 'Slate', edge: '#6F7882', tint: '#EDEFF1' },
] as const;

export type LabelColorKey = (typeof LABEL_COLORS)[number]['key'];
export type LabelColor = (typeof LABEL_COLORS)[number];

export function labelColor(key: unknown): LabelColor | undefined {
  return LABEL_COLORS.find((c) => c.key === key);
}

// The colour for a new label: the first palette colour no live label uses;
// when all eight are taken, the least used (palette order breaks ties).
export function nextColorKey(projects: Pick<Project, 'colorKey' | 'deletedAt'>[]): LabelColorKey {
  const counts = new Map<string, number>();
  for (const p of projects) {
    if (p.deletedAt || !labelColor(p.colorKey)) continue;
    counts.set(p.colorKey as string, (counts.get(p.colorKey as string) ?? 0) + 1);
  }
  let best: LabelColorKey = LABEL_COLORS[0].key;
  let bestCount = Infinity;
  for (const c of LABEL_COLORS) {
    const n = counts.get(c.key) ?? 0;
    if (n < bestCount) {
      best = c.key;
      bestCount = n;
    }
  }
  return best;
}

// Gives every live label without a valid colorKey one, in list order, each
// taking the next free colour. Labels that already have one, deleted labels
// and every other field (updatedAt included) are left exactly as they were:
// this is a silent local fill. `changed` says whether anything was filled.
export function assignMissingColors<T extends Pick<Project, 'colorKey' | 'deletedAt'>>(
  projects: T[],
): { projects: T[]; changed: boolean } {
  let changed = false;
  const result: T[] = [];
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (p.deletedAt || labelColor(p.colorKey)) {
      result.push(p);
      continue;
    }
    // Everything already decided plus everything still to come that has one.
    const known = [...result, ...projects.slice(i + 1).filter((q) => labelColor(q.colorKey))];
    result.push({ ...p, colorKey: nextColorKey(known) });
    changed = true;
  }
  return { projects: result, changed };
}
