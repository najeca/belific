// Web build only: Metro picks this file over DesktopEntry.tsx on web, so the
// desktop workspace (and its drag code, checkpoint 4) is reachable from the
// web export and never from the iOS bundle.
export { default } from './DesktopHome';
