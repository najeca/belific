import { useSyncExternalStore } from 'react';
import { THEMES, cssVarName, type ThemeName } from '../../lib/tokens';
import { tintFor, type LabelColor } from '../../lib/labelColors';
import { DEFAULT_THEME_MODE, normalizeThemeMode, resolveTheme, type ThemeMode } from '../../lib/themeMode';

// The Theme setting (Settings, Appearance) as a small module store, like vibrantStore. The value
// lives in the main process settings (`theme`, per computer, never synced); this is its renderer
// copy. Applying it sets the design tokens (lib/tokens.ts) as CSS variables on <html>: every
// `Colors.x` is a `var(--ds-...)` on the desktop, so the whole screen changes at once.
//
// To avoid a flash of the wrong theme at start, the last value is also cached in localStorage and
// applied before the first paint (`installTheme`, called from the desktop entry); the main
// process setting stays the source of truth and corrects the cache when it is read.
const CACHE_KEY = 'belific.theme';
const cssVar = (token: string) => `var(${cssVarName(token)})`;

let mode: ThemeMode = DEFAULT_THEME_MODE;
let resolved: ThemeName = 'light';
let mql: MediaQueryList | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function systemDark(): boolean {
  try {
    return !!mql?.matches;
  } catch {
    return false;
  }
}

// Native controls that stay (a select in Settings and the planning flow, a date or time box): the browser draws
// their popup, so it is told the theme (color-scheme on <html>) and its options take the theme's surface and text
// colour. Without this a select with a transparent background drew a white popup with white names in dark mode.
const NATIVE_STYLE_ID = 'belific-native-controls';
function ensureNativeControlStyle() {
  if (document.getElementById(NATIVE_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = NATIVE_STYLE_ID;
  el.textContent = `select, input[type="date"], input[type="time"] { color-scheme: inherit; }
select option, select optgroup { background-color: ${cssVar('surface')}; color: ${cssVar('textPrimary')}; }
select option:checked { background-color: ${cssVar('accentSoft')}; }`;
  document.head.appendChild(el);
}

function apply() {
  const next = resolveTheme(mode, systemDark());
  resolved = next;
  if (typeof document === 'undefined') return;
  ensureNativeControlStyle();
  const root = document.documentElement;
  const tokens = THEMES[next];
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(cssVarName(k), v);
  root.setAttribute('data-theme', next);
  root.style.colorScheme = next;
  emit();
}

function set(next: ThemeMode) {
  if (next === mode && installed) {
    apply();
    return;
  }
  mode = next;
  try {
    localStorage.setItem(CACHE_KEY, next);
  } catch {
    // no cache: the setting still applies
  }
  apply();
}

// The theme in use now ('light' or 'dark'), for the few things that cannot take a CSS variable
// (a label tint, a chart colour).
export const useResolvedTheme = (): ThemeName => useSyncExternalStore(subscribe, () => resolved, () => resolved);
export const useThemeMode = (): ThemeMode => useSyncExternalStore(subscribe, () => mode, () => mode);
// A label's card or block background on the theme in use (the pastel tint on light, the colour
// mixed into the dark surface on dark).
export function useTint(): (c: Pick<LabelColor, 'edge' | 'tint'>) => string {
  const dark = useResolvedTheme() === 'dark';
  return (c) => tintFor(c, dark);
}
export const currentTheme = (): ThemeName => resolved;

// Web only: apply the cached value now (before the first paint) and follow the computer's own
// setting while the mode is "system".
export function installTheme(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  try {
    mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', () => {
      if (mode === 'system') apply();
    });
  } catch {
    mql = null;
  }
  let cached: ThemeMode = DEFAULT_THEME_MODE;
  try {
    cached = normalizeThemeMode(localStorage.getItem(CACHE_KEY));
  } catch {
    // default
  }
  mode = cached;
  apply();
}

export async function refreshTheme(): Promise<void> {
  try {
    const s = await globalThis.belificDesktop?.settings.get();
    if (s) set(normalizeThemeMode(s.theme));
  } catch {
    // keep what is showing
  }
}

export async function setThemeMode(next: ThemeMode): Promise<void> {
  set(next);
  try {
    const saved = await globalThis.belificDesktop?.settings.set({ theme: next });
    if (saved) set(normalizeThemeMode(saved.theme));
  } catch {
    // the main process keeps the old value; the next refresh puts it back
  }
}
