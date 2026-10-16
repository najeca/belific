// Chart colours (build plan phase 6): the sage of the theme for what happened
// (actual time, tasks done) and a warm clay for estimates. Both are at least 3:1
// against the cream surface (the minimum for a graphic; checked in
// chartColors.test.ts), and the two also differ in SHAPE in the charts (an
// estimate is an outline, actual is solid), so colour is never the only signal.
// Label colours come from the label palette (labelColors.ts), darkened where a
// palette colour is too light to read as a graphic (chartLabelColor). Pure, no
// imports.
export const CHART_ACTUAL = '#5C7A6B';
export const CHART_ESTIMATE = '#9A5F3D';

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance(hex: string): number {
  const c = channels(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The colour darkened, in small steps toward black, until it is at least `min`:1
// against `background`. A colour that already passes is returned as it is.
export function chartLabelColor(hex: string, background: string, min = 3): string {
  let c = channels(hex);
  const toHex = (v: [number, number, number]) => `#${v.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
  for (let i = 0; i < 40 && contrastRatio(toHex(c), background) < min; i++) c = c.map((x) => x * 0.95) as [number, number, number];
  return toHex(c);
}
