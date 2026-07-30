// Belific "Quiet Function" theme — sage/cream palette.
// accent (#5C7A6B) is verified 4.07:1 on background — fine for fills/icons
// with onAccent text on top, but fails AA for body text directly on
// background/surface. Use accentText (5.97:1) wherever the accent color
// sits behind readable text (labels, values, links) on background/surface.
export const Colors = {
  background: '#F0EEE8',
  surface: '#FAF9F5',
  accent: '#5C7A6B',
  accentText: '#44604F',
  onAccent: '#FFFFFF',
  textPrimary: '#26251F',
  textSecondary: '#6E6C64',
  border: '#E4E0D5',
  danger: '#A8402F',
} as const;
