import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { THEMES, type ColorTokens, type ThemeName } from '../../lib/tokens';
import { normalizeThemeMode, resolveTheme, type ThemeMode } from '../../lib/themeMode';
import { kv } from '../../lib/kv';

// The iPhone's theme (PLAN_phone P1). The phone screens read their colours from here, never from
// lib/theme.ts (that is the old palette, kept for the old screens until P11). Light is the default;
// Dark and Match system are a per phone setting (stored in kv on this phone, never synced), shown in
// Settings from P11. The token values are the desktop's (lib/tokens.ts), so both apps look the same.
export const PHONE_THEME_KEY = 'belific_phone_theme_mode';

export interface PhoneTheme {
  c: ColorTokens;
  name: ThemeName;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<PhoneTheme>({ c: THEMES.light, name: 'light', mode: 'light', setMode: () => {} });

export function PhoneThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const scheme = useColorScheme();
  useEffect(() => {
    kv.getItem(PHONE_THEME_KEY)
      .then((v) => setModeState(normalizeThemeMode(v)))
      .catch(() => {});
  }, []);
  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    kv.setItem(PHONE_THEME_KEY, next).catch(() => {});
  }, []);
  const name = resolveTheme(mode, scheme === 'dark');
  const value = useMemo(() => ({ c: THEMES[name], name, mode, setMode }), [name, mode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): PhoneTheme {
  return useContext(ThemeContext);
}

// Styles made from the theme's colours, made again only when the theme changes. `make` must be a
// module level function (not a new one per render).
export function useStyles<T extends StyleSheet.NamedStyles<T>>(make: (c: ColorTokens) => T): T {
  const { c } = useTheme();
  return useMemo(() => StyleSheet.create(make(c)), [c, make]);
}

// For a screen whose styles are made with StyleSheet.create inside `make` (the older phone screens
// moved onto the theme in P11): the result, made again only when the theme changes.
export function useThemed<T>(make: (c: ColorTokens) => T): T {
  const { c } = useTheme();
  return useMemo(() => make(c), [c, make]);
}
