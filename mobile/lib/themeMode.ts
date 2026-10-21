// The Theme setting (Settings, Appearance): Light (the default), Dark or Match system.
// Pure, so it is testable; components/desktop/themeStore.ts holds the live value.
import type { ThemeName } from './tokens.ts';

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
export const DEFAULT_THEME_MODE: ThemeMode = 'light';

export const THEME_MODE_LABEL: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'Match system' };

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

// Anything that is not a mode (a hand edited file, an older shell with no value) is the default.
export function normalizeThemeMode(v: unknown): ThemeMode {
  return isThemeMode(v) ? v : DEFAULT_THEME_MODE;
}

// The theme that is drawn: "system" follows the computer's own light or dark setting.
export function resolveTheme(mode: ThemeMode, systemDark: boolean): ThemeName {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}
