import { Platform, useWindowDimensions } from 'react-native';

// Decision 009: one codebase, richer layout past a desktop breakpoint.
// Desktop layout is web-only; native never renders it.
// 2.26.0: only a phone sized page (under 640 px) gets the phone layout. It was
// 1024, the same as the Windows app's minimum OUTER window width, so the page
// (about 16 px narrower) fell to the phone layout at the smallest window. The
// desktop layout now folds its side panels as the window narrows instead
// (lib/paneState.ts, responsiveLayout).
export const DESKTOP_BREAKPOINT = 640;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}
