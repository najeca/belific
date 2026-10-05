import { Platform, useWindowDimensions } from 'react-native';

// Decision 009: one codebase, richer layout past a desktop breakpoint.
// Desktop layout is web-only; native never renders it.
export const DESKTOP_BREAKPOINT = 1024;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}
