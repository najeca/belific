import { useSyncExternalStore } from 'react';
import type { LabelColor } from '../../lib/labelColors';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import { VIBRANT_NEUTRAL, VIBRANT_TEXT, vibrantColor, vibrantEdge } from '../../lib/vibrant';

// "Vibrant task colours" (Settings, Appearance), as a small module store so every block, chip
// and card follows one value at once. The value lives in the main process settings
// (`vibrantColours`, per computer, never synced): this is its renderer copy, read when the home
// screen opens and whenever it is changed here. Off by default.
let on = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useVibrant = (): boolean => useSyncExternalStore(subscribe, () => on, () => on);

function set(next: boolean) {
  if (next === on) return;
  on = next;
  emit();
}

export async function refreshVibrant(): Promise<void> {
  try {
    const s = await globalThis.belificDesktop?.settings.get();
    if (s && typeof s.vibrantColours === 'boolean') set(s.vibrantColours);
  } catch {
    // keep what is showing
  }
}

export async function setVibrant(next: boolean): Promise<void> {
  set(next);
  try {
    const saved = await globalThis.belificDesktop?.settings.set({ vibrantColours: next });
    if (saved && typeof saved.vibrantColours === 'boolean') set(saved.vibrantColours);
  } catch {
    // the main process keeps the old value; the next refresh puts it back
  }
}

// What a block or chip is drawn with when the setting is on: the background, the left edge and
// the text. null = draw it as before (the setting is off, or an unlabelled task, which keeps
// its plain white block because white text would not show on it).
export interface VibrantLook {
  bg: string;
  edge: string;
}

const memo = new Map<string, VibrantLook>();

export function vibrantLook(vibrant: boolean, color: LabelColor | undefined, isBreak = false): VibrantLook | null {
  if (!vibrant) return null;
  if (!color && !isBreak) return null;
  const bg = color ? vibrantColor(color.edge) : VIBRANT_NEUTRAL;
  const key = bg;
  let look = memo.get(key);
  if (!look) {
    look = { bg, edge: vibrantEdge(bg) };
    memo.set(key, look);
  }
  return look;
}

// A very subtle dark shadow (not an outline): it only lifts the white off the colour.
const SHADOW = { textShadow: '0 1px 1px rgba(0, 0, 0, 0.28)' } as object;

// The title: bold white.
export const vibrantText = { color: VIBRANT_TEXT, fontWeight: '700', ...SHADOW } as const;
// The time, duration, "continues" and "left" lines (2.34.0): medium weight in the regular
// proportional font (the fixed width one is dropped where the line is drawn), a little more
// letter spacing and line height.
export const vibrantMeta = { color: VIBRANT_TEXT, fontWeight: '500', letterSpacing: 0.25, lineHeight: 15, fontFamily: DESKTOP_FONT_FAMILY, ...SHADOW } as const;
export const VIBRANT_WHITE = VIBRANT_TEXT;
