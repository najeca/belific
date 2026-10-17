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

// The first eight are the original palette: their keys and colours never change.
// 2.26.0 adds twelve more beside them (`since`). An older Belific does not know
// the new keys: on the desktop before 2.26.0 a label with one is given one of
// the original eight again and that is synced, so the label menu asks for
// "Every computer runs Belific 2.26 or later" before a new colour is used.
// From 2.26.0 an unknown key is left alone (drawn neutral), so any later
// palette degrades safely.
export const LABEL_COLORS = [
  { key: 'sage', name: 'Sage', edge: '#6F8F7E', tint: '#E9F0EB' },
  { key: 'clay', name: 'Clay', edge: '#B57A62', tint: '#F6ECE7' },
  { key: 'sky', name: 'Sky', edge: '#6E8DA6', tint: '#E9EFF4' },
  { key: 'sand', name: 'Sand', edge: '#B89B66', tint: '#F5F0E4' },
  { key: 'plum', name: 'Plum', edge: '#8D6F8B', tint: '#F4EEF3' },
  { key: 'moss', name: 'Moss', edge: '#7C8A56', tint: '#EFF1E5' },
  { key: 'rose', name: 'Rose', edge: '#B57D88', tint: '#F6EBED' },
  { key: 'slate', name: 'Slate', edge: '#6F7882', tint: '#EDEFF1' },
  { key: 'teal', name: 'Teal', edge: '#5E8E8A', tint: '#E9F2F1', since: '2.26' },
  { key: 'forest', name: 'Forest', edge: '#587C61', tint: '#EAF2EC', since: '2.26' },
  { key: 'olive', name: 'Olive', edge: '#8A8A4E', tint: '#F1F1E4', since: '2.26' },
  { key: 'mustard', name: 'Mustard', edge: '#B08B3A', tint: '#F6F0DF', since: '2.26' },
  { key: 'amber', name: 'Amber', edge: '#BC7A3E', tint: '#F8EFE4', since: '2.26' },
  { key: 'coral', name: 'Coral', edge: '#C06C5C', tint: '#F9EDEA', since: '2.26' },
  { key: 'berry', name: 'Berry', edge: '#A0607A', tint: '#F7ECF0', since: '2.26' },
  { key: 'lavender', name: 'Lavender', edge: '#8A7DAE', tint: '#F2F0F8', since: '2.26' },
  { key: 'indigo', name: 'Indigo', edge: '#66709E', tint: '#EEEFF7', since: '2.26' },
  { key: 'ocean', name: 'Ocean', edge: '#4F8299', tint: '#E9F2F5', since: '2.26' },
  { key: 'stone', name: 'Stone', edge: '#8C8579', tint: '#F0EEEA', since: '2.26' },
  { key: 'charcoal', name: 'Charcoal', edge: '#5B5F66', tint: '#EFF0F2', since: '2.26' },
] as const;

// The original eight: the only colours picked automatically, and the ones every
// version of Belific knows.
export const CLASSIC_COLOR_KEYS = ['sage', 'clay', 'sky', 'sand', 'plum', 'moss', 'rose', 'slate'] as const;

// A colour an older Belific does not know (see the note on LABEL_COLORS).
export function isNewColor(key: unknown): boolean {
  const c = LABEL_COLORS.find((x) => x.key === key);
  return !!c && 'since' in c;
}

export type LabelColorKey = (typeof LABEL_COLORS)[number]['key'];
export type LabelColor = (typeof LABEL_COLORS)[number];

export function labelColor(key: unknown): LabelColor | undefined {
  return LABEL_COLORS.find((c) => c.key === key);
}

// The colour for a new label: the first of the original eight no live label
// uses; when all eight are taken, the least used (palette order breaks ties).
// Never one of the 2.26.0 colours, which an older Belific would change back.
export function nextColorKey(projects: Pick<Project, 'colorKey' | 'deletedAt'>[]): LabelColorKey {
  const counts = new Map<string, number>();
  for (const p of projects) {
    if (p.deletedAt || !labelColor(p.colorKey)) continue;
    counts.set(p.colorKey as string, (counts.get(p.colorKey as string) ?? 0) + 1);
  }
  let best: LabelColorKey = CLASSIC_COLOR_KEYS[0];
  let bestCount = Infinity;
  for (const key of CLASSIC_COLOR_KEYS) {
    const n = counts.get(key) ?? 0;
    if (n < bestCount) {
      best = key;
      bestCount = n;
    }
  }
  return best;
}

// Gives every live label WITHOUT a colorKey one, in list order, each taking the
// next free colour. Labels that already have one (2.26.0: even one this version
// does not know, so a newer palette is never overwritten), deleted labels and
// every other field (updatedAt included) are left exactly as they were: this is
// a silent local fill. `changed` says whether anything was filled.
export function assignMissingColors<T extends Pick<Project, 'colorKey' | 'deletedAt'>>(
  projects: T[],
): { projects: T[]; changed: boolean } {
  let changed = false;
  const result: T[] = [];
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (p.deletedAt || (typeof p.colorKey === 'string' && p.colorKey.length > 0)) {
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
