// Belific theme colours. `Colors.x` is what every component reads; it holds no hard-coded colour
// of its own (lib/tokens.ts is the one source).
//
// On the desktop (web) each entry is a CSS variable reference, `var(--b-text-primary)`, so a
// change of theme (components/desktop/themeStore.ts sets the variables on <html>) repaints the
// whole screen at once with no re-render. On the phone (and in `node --test`, where there is no
// document) each entry is the plain hex the phone shipped with, which is also what the colour
// maths and the contrast tests need.
//
// accent (#5C7A6B) is verified 4.07:1 on the old background: fine for fills and icons with
// onAccent text on top, but it fails AA for body text directly on background/surface. Use
// accentText wherever the accent sits behind readable text.
import { cssVarName, phoneColors, type ColorTokens } from './tokens.ts';

const onWeb = typeof document !== 'undefined';

const refs = Object.fromEntries(Object.keys(phoneColors).map((k) => [k, `var(${cssVarName(k)})`])) as unknown as ColorTokens;

export const Colors: Readonly<ColorTokens> = Object.freeze(onWeb ? refs : { ...phoneColors });
