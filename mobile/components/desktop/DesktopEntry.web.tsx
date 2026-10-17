// Web build only: Metro picks this file over DesktopEntry.tsx on web, so the
// desktop workspace (and its drag code, checkpoint 4) is reachable from the
// web export and never from the iOS bundle.
import { installDesktopFonts } from './desktopFonts';

// Inter and Roboto Mono, shipped in the app (2.26.0).
installDesktopFonts();

export { default } from './DesktopHome';
