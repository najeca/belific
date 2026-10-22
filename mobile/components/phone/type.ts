import { Platform, type TextStyle } from 'react-native';

// Font styles for the phone screens. On the iPhone a custom font is chosen by its registered name
// (phoneFonts.native.ts: 'Inter-600'); on the web export by family and weight (the desktop's
// @font-face rules). Inter for the interface, Newsreader for the app name and big titles only,
// Roboto Mono for clock figures.
type Weight = 400 | 500 | 600 | 700;
const web = Platform.OS === 'web';

function face(family: 'Inter' | 'Newsreader' | 'Roboto Mono', file: string, w: Weight): TextStyle {
  return web ? { fontFamily: family, fontWeight: String(w) as TextStyle['fontWeight'] } : { fontFamily: `${file}-${w}` };
}

export const inter = (w: Weight = 400): TextStyle => face('Inter', 'Inter', w);
export const newsreader = (w: 500 | 600 | 700 = 600): TextStyle => face('Newsreader', 'Newsreader', w);
export const mono = (w: 400 | 500 = 400): TextStyle => ({ ...face('Roboto Mono', 'RobotoMono', w), fontVariant: ['tabular-nums'] });

// The type scale (the desktop's sizes, a step larger where a finger reads at arm's length).
export const type = {
  screenTitle: { ...newsreader(600), fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  sheetTitle: { ...newsreader(600), fontSize: 22, lineHeight: 28 },
  section: { ...inter(700), fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  body: { ...inter(400), fontSize: 16, lineHeight: 22 },
  bodyStrong: { ...inter(600), fontSize: 16, lineHeight: 22 },
  label: { ...inter(500), fontSize: 15, lineHeight: 20 },
  meta: { ...inter(400), fontSize: 13, lineHeight: 18 },
  small: { ...inter(500), fontSize: 12, lineHeight: 16 },
} satisfies Record<string, TextStyle>;
