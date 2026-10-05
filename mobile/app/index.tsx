import { Redirect } from 'expo-router';
import { useIsDesktop } from '../lib/useIsDesktop';
import DesktopHome from './components/desktop/DesktopHome';

export default function Index() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <DesktopHome />;
  return <Redirect href="/(tabs)/today" />;
}
