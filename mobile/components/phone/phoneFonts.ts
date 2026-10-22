// Web (the desktop's web export, and the phone layout below 640 px in it): the fonts are the
// desktop's @font-face rules (components/desktop/desktopFonts.ts, installed by DesktopEntry.web.tsx),
// so there is nothing to wait for. The iPhone build uses phoneFonts.native.ts.
export function usePhoneFonts(): boolean {
  return true;
}
