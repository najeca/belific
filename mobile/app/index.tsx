import { Redirect } from 'expo-router';
import { useIsDesktop } from '../lib/useIsDesktop';
// Resolves to DesktopEntry.web.tsx on web and DesktopEntry.tsx (renders
// nothing) on iOS, so no desktop code ships in the iOS bundle.
import DesktopEntry from '../components/desktop/DesktopEntry';

export default function Index() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <DesktopEntry />;
  return <Redirect href="/(tabs)/today" />;
}
