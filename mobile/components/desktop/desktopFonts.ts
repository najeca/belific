import { Asset } from 'expo-asset';
import { Colors } from '../../lib/theme';

// The desktop's interface fonts (2.26.0): Inter for every word, Roboto Mono for
// timer and clock figures (elements marked data-mono). The files ship inside
// the app (mobile/assets/fonts, Inter under the SIL Open Font License, Roboto
// Mono under the Apache License 2.0, both with their licence beside them), so
// nothing is fetched and it works offline; the page's CSP allows only 'self'.
//
// react-native-web gives every <Text> the system stack
//   -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...
// in its own class, which a page wide rule cannot outrank without !important
// (and !important would also hit the icon font). On Windows the first family of
// that stack the browser has is "Segoe UI", so the same Inter files are also
// declared under that name: an @font-face family takes precedence over an
// installed font of the same name, so every text becomes Inter while the icon
// font (its own family) and emoji (Segoe UI Emoji, a different family) are
// untouched. DESKTOP_FONT_FAMILY names Inter first for the DOM controls.
// Web only: imported from the desktop entry, never the iOS bundle.
const INTER: Array<[number, number]> = [
  [400, require('../../assets/fonts/Inter-400.woff2')],
  [500, require('../../assets/fonts/Inter-500.woff2')],
  [600, require('../../assets/fonts/Inter-600.woff2')],
  [700, require('../../assets/fonts/Inter-700.woff2')],
];
const MONO: Array<[number, number]> = [
  [400, require('../../assets/fonts/RobotoMono-400.woff2')],
  [500, require('../../assets/fonts/RobotoMono-500.woff2')],
];

let installed = false;

export function installDesktopFonts(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const face = (family: string, weight: number, mod: number) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url("${Asset.fromModule(mod).uri}") format('woff2');}`;
  // Bold and semi bold both fall back to the nearest weight shipped.
  const css = [
    ...INTER.map(([w, m]) => face('Inter', w, m)),
    ...INTER.map(([w, m]) => face('Segoe UI', w, m)),
    ...MONO.map(([w, m]) => face('Roboto Mono', w, m)),
    `[data-mono]{font-family:'Roboto Mono',ui-monospace,monospace !important;font-variant-numeric:tabular-nums;letter-spacing:-0.2px}`,
    `body{background:${Colors.background};-webkit-font-smoothing:antialiased}`,
    // A Calendar block or chip scrolled into view (a click, keyboard focus) stays
    // clear of the sticky day headers, all day row and hours.
    `[data-cal-block]{scroll-margin-top:100px;scroll-margin-left:56px}`,
  ].join('\n');
  const style = document.createElement('style');
  style.setAttribute('data-belific-fonts', '1');
  style.textContent = css;
  document.head.appendChild(style);
}
