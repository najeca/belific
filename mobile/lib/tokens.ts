// The one design token source (the Ellie Planner look, docs/DESIGN_TARGET.md and docs/DESIGN_SYSTEM.md).
// Pure, no runtime imports, so `node --test` and the token export script can read it.
// design-tokens/ (tokens.json, tokens.css, tailwind-preset.js) is generated from this file by
// `node scripts/export-tokens.js`; edit the values here, never there.
//
// Two themes share one set of names: light (the default: cream and sage, Option B of the study)
// and dark (Option A, with a brighter sage so it shows on dark). Only the accent changes per app.
export type ThemeName = 'light' | 'dark';

export interface ColorTokens {
  background: string; // the page behind the panes
  pane: string; // a pane or column floating on the page
  surface: string; // a card, popover, modal, input: raised one step from the pane
  surfaceRaised: string; // a quiet fill: pills, the segmented track, a header strip
  hover: string; // the hovered row of a list or menu
  border: string; // the 1px line round every raised surface and between rows
  borderStrong: string; // a control's own outline (input, outlined button, checkbox)
  textPrimary: string;
  textSecondary: string;
  textTertiary: string; // placeholders and hints only (not for text that has to be read)
  accent: string; // fills and icons; text on it is onAccent
  accentText: string; // the accent as text or a thin line on the pane or surface
  accentSoft: string; // the accent at a low strength: a selected row, a drop target
  onAccent: string;
  danger: string;
  success: string; // a done tick
  successBg: string; // a done checkbox
  now: string; // the current time line
  scrim: string; // behind a modal
  scrimSoft: string; // behind a side panel
  trackLine: string; // an empty checkbox's outline on a tinted card
  chip: string; // a small chip or a hidden-until-hover icon strip on a tinted card
  chipStrong: string; // the same while it is open or hovered
  checkFill: string; // the inside of an empty checkbox on a tinted card
  onLabel: string; // white: text and icons on a saturated label colour (both themes)
  plainBlock: string; // a Calendar block or card with no label colour
  breakTint: string; // a break with no label colour
  hostChip: string; // a task during a break: its chip inside the break's block (light in both themes)
  onHostChip: string; // the chip's text (dark in both themes)
  hostPill: string; // 3.10.0: "3 inside" on a break's card
  onHostPill: string; // its text, and a hosted task's "During Lunch" caption
  pickerPreview: string; // 3.13.0: the emoji picker's panel with the chosen emoji shown large
  pickerTabOn: string; // the picker's chosen category tab
  pickerCellOn: string; // the picker's chosen emoji
  switchOn: string; // 3.15.0: a switch's track when on
  switchOff: string; // its track when off (a clearly different grey)
  switchKnob: string; // its knob: light in both themes
  switchEdge: string; // a hairline round the knob
  inverseBg: string; // the undo bar, a tooltip
  inverseText: string;
  shadowSm: string; // a block lifted a hair
  shadowMd: string; // a popover
  shadowLg: string; // a modal
  chartActual: string; // charts: what happened (actual time, tasks done)
  chartEstimate: string; // charts: the estimate (drawn as an outline too, so colour is never the only signal)
}

export const lightTokens: ColorTokens = {
  background: '#FAF7F0',
  pane: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceRaised: '#F3EFE6',
  hover: '#F3EFE6',
  border: '#E6E0D2',
  borderStrong: '#D3CCBB',
  textPrimary: '#1B1B1B',
  textSecondary: '#6B6B6B',
  textTertiary: '#A0A0A0',
  accent: '#5C7A6B',
  accentText: '#44604F',
  accentSoft: 'rgba(92,122,107,0.12)',
  onAccent: '#FFFFFF',
  danger: '#A8402F',
  success: '#2E7D32',
  successBg: '#E3F2E5',
  now: '#E5484D',
  scrim: 'rgba(27,27,27,0.28)',
  scrimSoft: 'rgba(27,27,27,0.12)',
  trackLine: 'rgba(27,27,27,0.35)',
  chip: 'rgba(255,255,255,0.75)',
  chipStrong: 'rgba(255,255,255,0.85)',
  checkFill: 'rgba(255,255,255,0.7)',
  onLabel: '#FFFFFF',
  plainBlock: '#FFFFFF',
  breakTint: '#EFEDE6',
  hostChip: '#FFFFFF',
  onHostChip: '#1B1B1B',
  hostPill: '#E6EEE8',
  onHostPill: '#3B5646',
  pickerPreview: '#EEF2EF',
  pickerTabOn: '#DCE7E0',
  pickerCellOn: '#D3E2D8',
  switchOn: '#3F6B52',
  switchOff: '#7F8681',
  switchKnob: '#FFFFFF',
  switchEdge: 'rgba(0,0,0,0.22)',
  inverseBg: '#1B1B1B',
  inverseText: '#FFFFFF',
  shadowSm: '0 1px 2px rgba(27,27,27,0.06)',
  shadowMd: '0 6px 18px rgba(27,27,27,0.12)',
  shadowLg: '0 16px 48px rgba(27,27,27,0.20)',
  chartActual: '#5C7A6B',
  chartEstimate: '#9A5F3D',
};

export const darkTokens: ColorTokens = {
  background: '#121212',
  pane: '#1A1A1A',
  surface: '#282828',
  surfaceRaised: '#2E2E2E',
  hover: '#333333',
  border: '#333333',
  borderStrong: '#4A4A4A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A7A7A7',
  textTertiary: '#6B6B6B',
  accent: '#8FB39A',
  accentText: '#8FB39A',
  accentSoft: 'rgba(143,179,154,0.16)',
  onAccent: '#121212',
  danger: '#E5775F',
  success: '#2E7D32',
  successBg: '#14301A',
  now: '#E5484D',
  scrim: 'rgba(0,0,0,0.55)',
  scrimSoft: 'rgba(0,0,0,0.35)',
  trackLine: 'rgba(255,255,255,0.35)',
  chip: 'rgba(255,255,255,0.06)',
  chipStrong: 'rgba(255,255,255,0.12)',
  checkFill: 'rgba(255,255,255,0.05)',
  onLabel: '#FFFFFF',
  plainBlock: '#282828',
  breakTint: '#3A3A3A',
  hostChip: '#ECECEC',
  onHostChip: '#121212',
  hostPill: '#2C3A31',
  onHostPill: '#CFE4D6',
  pickerPreview: '#222A25',
  pickerTabOn: '#2F3E35',
  pickerCellOn: '#37493D',
  switchOn: '#3F7F58',
  switchOff: '#8A8A8A',
  switchKnob: '#FFFFFF',
  switchEdge: 'rgba(0,0,0,0.35)',
  inverseBg: '#F2F2F2',
  inverseText: '#121212',
  shadowSm: '0 1px 2px rgba(0,0,0,0.4)',
  shadowMd: '0 6px 18px rgba(0,0,0,0.5)',
  shadowLg: '0 16px 48px rgba(0,0,0,0.6)',
  chartActual: '#8FB39A',
  chartEstimate: '#D9955F',
};

export const THEMES: Record<ThemeName, ColorTokens> = { light: lightTokens, dark: darkTokens };

// 2.59.0 (PLAN_phone P11): the iPhone uses these tokens too (light and dark, components/phone/theme.tsx);
// the frozen phone palette it kept until then (phoneColors) is gone.

// One scale, nothing between: cards and add rows 10, popovers 10 (rows 6), pills 6, buttons 8,
// modals 16, an avatar or a round checkbox full.
export const radius = { xs: 4, sm: 6, md: 8, lg: 10, xl: 16, full: 999 } as const;
export const space = { s4: 4, s6: 6, s8: 8, s10: 10, s12: 12, s16: 16, s20: 20, s30: 30, s35: 35 } as const;
export const fonts = {
  ui: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  display: 'Newsreader, Georgia, "Times New Roman", serif',
  mono: "'Roboto Mono', ui-monospace, monospace",
} as const;
// The sizes the study reads off Ellie (by eye): day header, card title, meta, hint, hour label,
// modal title, modal row label.
export const fontSize = { dayHeader: 20, cardTitle: 13, meta: 12, hint: 11, hour: 10, modalTitle: 20, rowLabel: 13 } as const;

// Per app accent (the study, section 7). Belific is sage; Landis and Proload take their own.
// `onAccent` is the text on an accent fill (white, or near black where white would not reach 4.5:1:
// Proload's orange, Landis' bright indigo on dark). The soft accent is derived from the accent.
export const accents = {
  belific: { light: { accent: '#5C7A6B', accentText: '#44604F', onAccent: '#FFFFFF' }, dark: { accent: '#8FB39A', accentText: '#8FB39A', onAccent: '#121212' } },
  landis: { light: { accent: '#6D4AE0', accentText: '#5B3CC4', onAccent: '#FFFFFF' }, dark: { accent: '#8B5CF6', accentText: '#A78BFA', onAccent: '#0A0A0A' } },
  proload: { light: { accent: '#E8620C', accentText: '#B84A06', onAccent: '#1B1B1B' }, dark: { accent: '#F97316', accentText: '#FB923C', onAccent: '#121212' } },
} as const;
export type AppName = keyof typeof accents;

// `backgroundColor` -> `--ds-background-color`: the CSS variable a token is published under (the
// same names in the app and in design-tokens/tokens.css, so Landis and Proload read them as they are).
export const CSS_PREFIX = '--ds-';
export const cssVarName = (key: string): string => `${CSS_PREFIX}${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
