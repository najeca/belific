import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useIsDesktop } from '../lib/useIsDesktop';
import { getPhoneGate, loadPhoneGate, subscribePhoneGate } from '../lib/phoneAccount';
// Resolves to DesktopEntry.web.tsx on web and DesktopEntry.tsx (renders
// nothing) on iOS, so no desktop code ships in the iOS bundle.
import DesktopEntry from '../components/desktop/DesktopEntry';

export default function Index() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <DesktopEntry />;
  return <PhoneStart />;
}

// 3.58.0 (PLAN_phone_parity item A): the phone opens on the Sign in screen when it is signed out and the person has
// not chosen "Use without an account", or while a sign in waits for its account check. Otherwise Today, as before.
function PhoneStart() {
  const [gate, setGate] = useState(getPhoneGate);
  useEffect(() => subscribePhoneGate(setGate), []);
  useEffect(() => {
    if (!getPhoneGate().loaded) loadPhoneGate().catch(() => {});
  }, []);
  if (!gate.loaded) return null;
  return <Redirect href={gate.screen === 'app' ? '/(tabs)/today' : '/welcome'} />;
}
