// Phase 3 of PLAN_phone_parity (item 6): three example lists and three example labels, offered with one tap when a person
// has none and at the top of "New list" / "New label", on phone and desktop. Pure: NO runtime imports besides types;
// see presets.test.ts. Nothing is created without a tap; name, emoji and colour can be changed afterwards.
import type { Project, TaskList } from './types.ts';

export interface ListPreset { name: string; emoji: string }
export interface LabelPreset { name: string; emoji: string; colorKey: string; originalKey: string }

export const LIST_PRESETS: readonly ListPreset[] = [
  { name: 'Home', emoji: '🏠' },
  { name: 'Work', emoji: '💼' },
  { name: 'Shopping', emoji: '🛒' },
];
// Colours far apart, from the existing palette (`LABEL_COLORS`): Green, Yellow, Blue. `originalKey` is the same hue among
// the original eight, for a desktop that has not turned the 2.27 colours on (see uiStore NEW_COLORS_KEY).
export const LABEL_PRESETS: readonly LabelPreset[] = [
  { name: 'Health', emoji: '💪', colorKey: 'green', originalKey: 'sage' },
  { name: 'Money', emoji: '💷', colorKey: 'yellow', originalKey: 'sand' },
  { name: 'Family', emoji: '👪', colorKey: 'blue', originalKey: 'sky' },
];
export const PRESET_HINT = 'Tap one to add it. You can change the name, emoji and colour later.';

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

// The presets no live list / label already has, in their fixed order.
export const availableListPresets = (lists: Array<Pick<TaskList, 'name' | 'deletedAt'>>): ListPreset[] =>
  LIST_PRESETS.filter((p) => !lists.some((l) => !l.deletedAt && same(l.name, p.name)));
export const availableLabelPresets = (labels: Array<Pick<Project, 'name' | 'deletedAt'>>): LabelPreset[] =>
  LABEL_PRESETS.filter((p) => !labels.some((l) => !l.deletedAt && same(l.name, p.name)));
