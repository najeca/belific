// Native (iOS) stand-in for DesktopEntry.web.tsx. The desktop workspace is web
// only (useIsDesktop is always false on native), so iOS never renders this,
// and keeping the real import out of this file keeps every desktop pane and
// the drag code out of the iOS bundle.
export default function DesktopEntry() {
  return null;
}
