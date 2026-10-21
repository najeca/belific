// Web build only: Metro picks this file over DesktopEntry.tsx on web, so the
// desktop workspace (and its drag code, checkpoint 4) is reachable from the
// web export and never from the iOS bundle.
import { installDesktopFonts } from './desktopFonts';
import { installTheme } from './themeStore';

// Inter and Roboto Mono, shipped in the app (2.26.0).
installDesktopFonts();
// The theme's colours go on <html> before the first paint (the cached value; Settings is the source).
installTheme();

export { default } from './DesktopHome';
