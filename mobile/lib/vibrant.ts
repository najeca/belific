// "Vibrant task colours" (a desktop look setting, default off). Pure; see vibrant.test.ts.
// DESKTOP ONLY: nothing of this is in the phone's bundle (the iOS marker list names it).
//
// With the setting on, a Calendar block or Timebox card is drawn in a vivid version of its
// label colour with white text. Each colour keeps its hue, is made more saturated, and is
// darkened only as far as needed for white text to keep a contrast ratio of at least 6:1
// (WCAG AA for normal text); since 2.34.0 the bar is 6:1, a clear margin over AA. A label colour that is already dark enough is only saturated.
import { contrast } from './labelColors.ts';

export const VIBRANT_TEXT = '#FFFFFF';
// The least ratio the white text may have on any vibrant background (2.33.0: 4.5, 2.34.0: 6).
export const MIN_CONTRAST = 6;
// Tested against this a little above the minimum, so rounding of the channels can never drop under it.
const TARGET = 6.05;
// The neutral block (a break with no label colour): a mid slate grey.
export const VIBRANT_NEUTRAL = '#536070';

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: number[]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

// hue 0 to 360, s and l 0 to 1.
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = channels(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))) * 255;
  };
  return toHex([f(0), f(8), f(4)]);
}

// 3.23.2: how a label colour becomes vibrant.
// A colour keeps its hue. Its saturation is lifted, but not to one level for everything (the old rule, 0.85 for all,
// made a muted Sage the same green as the vivid Green, and a grey Slate the same blue as Blue): a muted colour is
// lifted to SAT_LOW and a vivid one to SAT_HIGH, in proportion to how saturated it was.
const SAT_LOW = 0.4;
const SAT_HIGH = 0.95;
// An edge colour with less saturation than this is a NEUTRAL (a grey, a black, a warm or cool stone): it never takes a
// hue of its own. It becomes a quiet slate, charcoal or warm grey (see neutralVibrant), never a vivid blue or orange.
export const NEUTRAL_SAT = 0.11;
// A vibrant colour is never lighter than this before the contrast darkening (very light colours look washed out).
const MAX_LIGHT = 0.52;
const DEEPER = 0.5;
const DEEPER_MAX = 0.12;

function chromaSat(s: number): number {
  const t = Math.max(0, Math.min(1, (s - 0.1) / 0.55));
  return SAT_LOW + (SAT_HIGH - SAT_LOW) * t;
}

// A grey, black or stone: its own hue at a low saturation (a cool grey stays a cool slate, a warm one a warm grey,
// a true grey stays grey), as dark as white text at 6:1 needs, and a little darker the darker the original was, so
// Slate, Charcoal and Stone stay three different colours and none is a blue or an orange.
function neutralVibrant(h: number, s: number, l: number): string {
  const sat = s === 0 ? 0 : Math.min(0.3, 0.12 + s * 1.6);
  const start = Math.max(0.1, Math.min(0.36, 0.2 + (l - 0.4) * 0.8));
  for (let light = start; light > 0; light -= 0.005) {
    const hex = hslToHex(h, sat, light);
    if (contrast(VIBRANT_TEXT, hex) >= TARGET) return hex;
  }
  return '#000000';
}

// The vibrant version of a label colour (its solid `edge`): the same hue, more saturated,
// then darkened step by step until white text on it has at least 6:1. A neutral (grey) stays a grey.
export function vibrantColor(edge: string): string {
  const { h, s, l } = hexToHsl(edge);
  if (s < NEUTRAL_SAT) return neutralVibrant(h, s, l);
  const sat = chromaSat(s);
  // A darker original ends a little darker than a lighter one at the contrast limit, so two colours of one hue
  // (Yellow and Sand, Cyan and Ocean) are still told apart.
  const deeper = Math.max(0, Math.min(DEEPER_MAX, (MAX_LIGHT - l) * DEEPER));
  for (let light = Math.min(l, MAX_LIGHT) - deeper; light > 0; light -= 0.005) {
    const hex = hslToHex(h, sat, light);
    if (contrast(VIBRANT_TEXT, hex) >= TARGET) return hex;
  }
  return '#000000';
}

// The left edge of a vibrant block: the same colour a little deeper, so the edge still reads.
export function vibrantEdge(bg: string): string {
  return toHex(channels(bg).map((v) => v * 0.78));
}
