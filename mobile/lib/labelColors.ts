// The label palette (decision 016, checkpoint 4.1; 2.27.0). Pure, no runtime
// imports, so `node --test` can run it; see labelColors.test.ts. A Project
// stores a palette KEY (`colorKey`), or since 2.27.0 a custom colour as a hex
// value ("#RRGGBB") in the same field. No schema change: it is the same text.
//
// `edge` is the solid colour (a row's dot, a block's and a card's left edge, the
// swatch); `tint` is the soft card background. Both Colors.textPrimary and
// Colors.textSecondary stay readable on every tint (AA, tested), which is why the
// tints stay light: the edge carries the strong colour.
import type { Project } from './types.ts';

export interface LabelColor {
  key: string;
  name: string;
  edge: string;
  tint: string;
  // The version that introduced it: an older Belific does not know it.
  since?: string;
}

// The 20 swatches offered. The first eight are the original palette: their
// keys, names and colours never change (every version of Belific knows them).
// 2.27.0 replaces the twelve muted 2.26 colours with twelve vibrant, well
// separated ones (red, orange, yellow, green, teal, blue, purple, pink and the
// shades between), our own values.
export const LABEL_COLORS: readonly LabelColor[] = [
  { key: 'sage', name: 'Sage', edge: '#6F8F7E', tint: '#E9F0EB' },
  { key: 'clay', name: 'Clay', edge: '#B57A62', tint: '#F6ECE7' },
  { key: 'sky', name: 'Sky', edge: '#6E8DA6', tint: '#E9EFF4' },
  { key: 'sand', name: 'Sand', edge: '#B89B66', tint: '#F5F0E4' },
  { key: 'plum', name: 'Plum', edge: '#8D6F8B', tint: '#F4EEF3' },
  { key: 'moss', name: 'Moss', edge: '#7C8A56', tint: '#EFF1E5' },
  { key: 'rose', name: 'Rose', edge: '#B57D88', tint: '#F6EBED' },
  { key: 'slate', name: 'Slate', edge: '#6F7882', tint: '#EDEFF1' },
  { key: 'red', name: 'Red', edge: '#E23B3B', tint: '#FFEAEA', since: '2.27' },
  { key: 'orange', name: 'Orange', edge: '#F07A1A', tint: '#FFEBDC', since: '2.27' },
  { key: 'yellow', name: 'Yellow', edge: '#BF9100', tint: '#FFF0B8', since: '2.27' },
  { key: 'lime', name: 'Lime', edge: '#6FA80F', tint: '#E6F9BF', since: '2.27' },
  { key: 'green', name: 'Green', edge: '#1F9E4E', tint: '#D9F6E2', since: '2.27' },
  { key: 'aqua', name: 'Teal', edge: '#0F9E8E', tint: '#D2F6F1', since: '2.27' },
  { key: 'cyan', name: 'Cyan', edge: '#0B97CF', tint: '#D6F3FF', since: '2.27' },
  { key: 'blue', name: 'Blue', edge: '#2F6FEB', tint: '#E5EEFF', since: '2.27' },
  { key: 'violet', name: 'Indigo', edge: '#4F46C8', tint: '#EEEDFF', since: '2.27' },
  { key: 'purple', name: 'Purple', edge: '#A44BE0', tint: '#F4EAFF', since: '2.27' },
  { key: 'magenta', name: 'Magenta', edge: '#CC36B4', tint: '#FDE8FA', since: '2.27' },
  { key: 'pink', name: 'Pink', edge: '#E8508E', tint: '#FFEAF2', since: '2.27' },
];

// The twelve 2.26 colours, no longer offered. A label that already has one keeps
// it and is drawn exactly as before (never changed behind the person's back).
export const LEGACY_COLORS: readonly LabelColor[] = [
  { key: 'teal', name: 'Teal (2.26)', edge: '#5E8E8A', tint: '#E9F2F1', since: '2.26' },
  { key: 'forest', name: 'Forest', edge: '#587C61', tint: '#EAF2EC', since: '2.26' },
  { key: 'olive', name: 'Olive', edge: '#8A8A4E', tint: '#F1F1E4', since: '2.26' },
  { key: 'mustard', name: 'Mustard', edge: '#B08B3A', tint: '#F6F0DF', since: '2.26' },
  { key: 'amber', name: 'Amber', edge: '#BC7A3E', tint: '#F8EFE4', since: '2.26' },
  { key: 'coral', name: 'Coral', edge: '#C06C5C', tint: '#F9EDEA', since: '2.26' },
  { key: 'berry', name: 'Berry', edge: '#A0607A', tint: '#F7ECF0', since: '2.26' },
  { key: 'lavender', name: 'Lavender', edge: '#8A7DAE', tint: '#F2F0F8', since: '2.26' },
  { key: 'indigo', name: 'Indigo (2.26)', edge: '#66709E', tint: '#EEEFF7', since: '2.26' },
  { key: 'ocean', name: 'Ocean', edge: '#4F8299', tint: '#E9F2F5', since: '2.26' },
  { key: 'stone', name: 'Stone', edge: '#8C8579', tint: '#F0EEEA', since: '2.26' },
  { key: 'charcoal', name: 'Charcoal', edge: '#5B5F66', tint: '#EFF0F2', since: '2.26' },
];

// The original eight: the only colours picked automatically while the person has
// not said every computer is up to date, and the ones every version knows.
export const CLASSIC_COLOR_KEYS = ['sage', 'clay', 'sky', 'sand', 'plum', 'moss', 'rose', 'slate'] as const;

export type LabelColorKey = string;

const HEX = /^#[0-9A-F]{6}$/;

// "#rgb", "rgb", "#rrggbb" or "rrggbb" (any case) as "#RRGGBB"; else null.
export function normalizeHex(text: string): string | null {
  let t = text.trim().toUpperCase();
  if (!t.startsWith('#')) t = `#${t}`;
  if (/^#[0-9A-F]{3}$/.test(t)) t = `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  return HEX.test(t) ? t : null;
}

export function isCustomColor(key: unknown): key is string {
  return typeof key === 'string' && HEX.test(key);
}

// A colour an older Belific does not know: a 2.27 swatch or a custom colour. A
// desktop before 2.26 changes such a label back to one of the eight and syncs
// that; 2.26 keeps it but draws it neutral. Hence the "Every computer runs
// Belific 2.27 or later" tick before one is used.
export function isNewColor(key: unknown): boolean {
  if (isCustomColor(key)) return true;
  const c = LABEL_COLORS.find((x) => x.key === key);
  return !!c && !!c.since;
}

export function labelColor(key: unknown): LabelColor | undefined {
  if (typeof key !== 'string' || !key) return undefined;
  const known = LABEL_COLORS.find((c) => c.key === key) ?? LEGACY_COLORS.find((c) => c.key === key);
  if (known) return known;
  if (isCustomColor(key)) return { key, name: 'Custom', edge: key, tint: customTint(key) };
  return undefined;
}

// ---- colour maths (WCAG luminance and CIE Lab distance) ----
function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex(rgb: number[]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
function linear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function lab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linear);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
// CIE76 distance: about 2.3 is the smallest difference people notice.
export function colorDistance(a: string, b: string): number {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// The card tint for a custom colour: the colour mixed with white, the least
// white that keeps Belific's secondary text AA on it (so any colour stays readable).
const TEXT_SECONDARY = '#6E6C64';
const TEXT_PRIMARY = '#26251F';
export function customTint(hex: string): string {
  const rgb = channels(hex);
  for (let t = 0.6; t <= 1.0001; t += 0.01) {
    const c = toHex(rgb.map((v) => v + (255 - v) * t));
    if (contrast(TEXT_SECONDARY, c) >= 4.55 && contrast(TEXT_PRIMARY, c) >= 4.5) return c;
  }
  return '#FFFFFF';
}

// The same label colour on the dark theme (2.39.0): a block or card with a light pastel tint would
// carry white text, so on dark the tint is the colour mixed into the dark card surface instead,
// as strong as it can be while the dark theme's secondary text (#A7A7A7) stays AA on it.
// Light stays the tint above, untouched. Pure; labelColors.test.ts checks every colour.
const DARK_SURFACE = '#282828';
const DARK_TEXT_SECONDARY = '#A7A7A7';
const darkTints = new Map<string, string>();
export function darkTint(edge: string): string {
  const hit = darkTints.get(edge);
  if (hit) return hit;
  const base = channels(DARK_SURFACE);
  const rgb = channels(edge);
  let out = DARK_SURFACE;
  for (let t = 0.3; t >= 0; t -= 0.01) {
    const c = toHex(rgb.map((v, i) => base[i] + (v - base[i]) * t));
    if (contrast(DARK_TEXT_SECONDARY, c) >= 4.55) {
      out = c;
      break;
    }
  }
  darkTints.set(edge, out);
  return out;
}
export function tintFor(color: Pick<LabelColor, 'edge' | 'tint'>, dark: boolean): string {
  return dark ? darkTint(color.edge) : color.tint;
}

// ---- hue and shade (the colour wheel) ----
// Hue 0 to 360; shade 0 (light) to 100 (dark), at a vivid saturation.
export function hueShadeToHex(hue: number, shade: number): string {
  const h = ((hue % 360) + 360) % 360;
  const l = 0.72 - (Math.max(0, Math.min(100, shade)) / 100) * 0.5;
  const s = 0.85;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
export function hexToHueShade(hex: string): { hue: number; shade: number } {
  const [r, g, b] = channels(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { hue: Math.round((h + 360) % 360), shade: Math.round(Math.max(0, Math.min(100, ((0.72 - l) / 0.5) * 100))) };
}

// ---- no two labels with the same colour (2.27.0, a rule of this app only) ----
// Two colours closer than this read as the same on a card or the calendar.
export const CLASH_DISTANCE = 12;

// The other live label whose colour is the same as, or too close to, `key`;
// undefined when `key` is free. `exceptKey` is the label being edited.
export function colorClash<T extends Pick<Project, 'key' | 'name' | 'colorKey' | 'deletedAt'>>(labels: T[], key: string, exceptKey?: string): T | undefined {
  const mine = labelColor(key);
  for (const l of labels) {
    if (l.deletedAt || l.key === exceptKey || !l.colorKey) continue;
    if (l.colorKey === key) return l;
    const theirs = labelColor(l.colorKey);
    if (mine && theirs && colorDistance(mine.edge, theirs.edge) < CLASH_DISTANCE) return l;
  }
  return undefined;
}

// Groups of live labels that share a colour (same key, or too close), for the
// notice on the Labels page. Each group has two or more labels.
export function sharedColorGroups<T extends Pick<Project, 'key' | 'name' | 'colorKey' | 'deletedAt'>>(labels: T[]): T[][] {
  const live = labels.filter((l) => !l.deletedAt && labelColor(l.colorKey));
  const seen = new Set<string>();
  const groups: T[][] = [];
  for (const l of live) {
    if (seen.has(l.key)) continue;
    const group = [l, ...live.filter((o) => o.key !== l.key && !seen.has(o.key) && colorClash([o], l.colorKey as string, l.key))];
    if (group.length > 1) {
      group.forEach((g) => seen.add(g.key));
      groups.push(group);
    }
  }
  return groups;
}

// The colour for a new label: the first offered colour no live label uses (or
// is too close to). The 2.27 colours count only when `allowNew` (the person said
// every computer runs 2.27). When every allowed colour is taken it falls back to
// the least used of the original eight (palette order breaks ties), so a quick
// label can always be made; the Labels page then shows the shared colour.
export function nextColorKey(projects: Pick<Project, 'key' | 'name' | 'colorKey' | 'deletedAt'>[], allowNew = false): LabelColorKey {
  const allowed = LABEL_COLORS.filter((c) => allowNew || !c.since);
  const live = projects.map((p, i) => ({ ...p, key: p.key ?? `#${i}`, name: p.name ?? '' }));
  const free = allowed.find((c) => !colorClash(live, c.key));
  if (free) return free.key;
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

// The colour a new label's form starts with (2.27.1): the first free one, or ''
// (nothing picked) when every allowed colour is taken, so a form never shows a
// colour another label already has. Quick paths keep nextColorKey's fallback.
export function freeColorKey(projects: Pick<Project, 'key' | 'name' | 'colorKey' | 'deletedAt'>[], allowNew = false): LabelColorKey | '' {
  const key = nextColorKey(projects, allowNew);
  const live = projects.map((p, i) => ({ ...p, key: p.key ?? `#${i}`, name: p.name ?? '' }));
  return colorClash(live, key) ? '' : key;
}

// Gives every live label WITHOUT a colorKey one, in list order, each taking the
// next free colour of the original eight. Labels that already have one (even
// one this version does not know, so a newer palette is never overwritten),
// deleted labels and every other field (updatedAt included) are left exactly as
// they were: this is a silent local fill. `changed` says whether anything was filled.
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
    result.push({ ...p, colorKey: nextColorKey(known.map((k, j) => ({ key: `k${j}`, name: '', colorKey: k.colorKey, deletedAt: k.deletedAt }))) });
    changed = true;
  }
  return { projects: result, changed };
}
