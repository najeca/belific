import { Asset } from 'expo-asset';

// Web (the phone layout below 640 px in the web export, which the real touch checks drive): the same
// Inter, Newsreader and Roboto Mono files the desktop ships (.woff2), declared once as @font-face. The
// desktop entry declares its own when it starts at "/"; a page opened straight on a phone screen does
// not pass through it, so the phone declares them too (the browser keeps the first of two identical
// rules). The iPhone build uses phoneFonts.native.ts (the .ttf files).
const FACES: Array<[string, number, number]> = [
  ['Inter', 400, require('../../assets/fonts/Inter-400.woff2')],
  ['Inter', 500, require('../../assets/fonts/Inter-500.woff2')],
  ['Inter', 600, require('../../assets/fonts/Inter-600.woff2')],
  ['Inter', 700, require('../../assets/fonts/Inter-700.woff2')],
  ['Newsreader', 500, require('../../assets/fonts/Newsreader-500.woff2')],
  ['Newsreader', 600, require('../../assets/fonts/Newsreader-600.woff2')],
  ['Newsreader', 700, require('../../assets/fonts/Newsreader-700.woff2')],
  ['Roboto Mono', 400, require('../../assets/fonts/RobotoMono-400.woff2')],
  ['Roboto Mono', 500, require('../../assets/fonts/RobotoMono-500.woff2')],
];

let installed = false;

export function usePhoneFonts(): boolean {
  if (!installed && typeof document !== 'undefined') {
    installed = true;
    const css = FACES.map(([family, weight, mod]) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url("${Asset.fromModule(mod).uri}") format('woff2');}`).join('\n');
    const style = document.createElement('style');
    style.setAttribute('data-belific-phone-fonts', '1');
    style.textContent = css;
    document.head.appendChild(style);
  }
  return true;
}
