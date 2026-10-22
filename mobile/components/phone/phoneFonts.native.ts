import { useFonts } from 'expo-font';

// The iPhone's fonts (PLAN_phone P1): the desktop's own Inter, Newsreader and Roboto Mono, as .ttf
// (iOS cannot read the desktop's .woff2; the .ttf files are the same fonts and versions, unpacked
// from those files). One family name per weight, because iOS picks a custom font by its name, not
// by fontWeight (components/phone/type.ts names them). The web export uses the desktop's own
// @font-face rules instead (phoneFonts.ts), so these files never reach the desktop bundle.
export function usePhoneFonts(): boolean {
  const [loaded, error] = useFonts({
    'Inter-400': require('../../assets/fonts/Inter-400.ttf'),
    'Inter-500': require('../../assets/fonts/Inter-500.ttf'),
    'Inter-600': require('../../assets/fonts/Inter-600.ttf'),
    'Inter-700': require('../../assets/fonts/Inter-700.ttf'),
    'Newsreader-500': require('../../assets/fonts/Newsreader-500.ttf'),
    'Newsreader-600': require('../../assets/fonts/Newsreader-600.ttf'),
    'Newsreader-700': require('../../assets/fonts/Newsreader-700.ttf'),
    'RobotoMono-400': require('../../assets/fonts/RobotoMono-400.ttf'),
    'RobotoMono-500': require('../../assets/fonts/RobotoMono-500.ttf'),
  });
  // A font that fails to load falls back to the system font; the app never waits forever.
  return loaded || !!error;
}
