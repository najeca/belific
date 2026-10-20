// Run with `npm test` from mobile/. "Vibrant task colours": every colour the app can draw
// a block in keeps white text at 4.5:1 or better, and keeps its hue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LABEL_COLORS, LEGACY_COLORS, contrast, hueShadeToHex, labelColor } from './labelColors.ts';
import { MIN_CONTRAST, VIBRANT_NEUTRAL, VIBRANT_TEXT, vibrantColor, vibrantEdge } from './vibrant.ts';

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
function saturation(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === min ? 0 : (max - min) / (1 - Math.abs(max + min - 1));
}

test('the base palette (20), the legacy 2.26 colours (12): white text keeps at least 4.5:1', () => {
  assert.equal(LABEL_COLORS.length, 20);
  assert.equal(LEGACY_COLORS.length, 12);
  let worst = Infinity;
  for (const c of [...LABEL_COLORS, ...LEGACY_COLORS]) {
    const bg = vibrantColor(c.edge);
    const ratio = contrast(VIBRANT_TEXT, bg);
    worst = Math.min(worst, ratio);
    assert.ok(ratio >= MIN_CONTRAST, `${c.key}: ${bg} is ${ratio.toFixed(2)}:1`);
  }
  console.log(`vibrant: palette (32 colours) lowest ratio ${worst.toFixed(2)}:1`);
});

test('every colour wheel colour (hue 0 to 359 at every shade step) keeps at least 4.5:1', () => {
  let n = 0;
  let worst = Infinity;
  for (let h = 0; h < 360; h++) {
    for (let shade = 0; shade <= 100; shade += 5) {
      const edge = hueShadeToHex(h, shade);
      const bg = vibrantColor(edge);
      const ratio = contrast(VIBRANT_TEXT, bg);
      worst = Math.min(worst, ratio);
      n++;
      assert.ok(ratio >= MIN_CONTRAST, `hue ${h} shade ${shade}: ${edge} -> ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
  console.log(`vibrant: colour wheel (${n} colours) lowest ratio ${worst.toFixed(2)}:1`);
});

test('any custom colour a label can hold, including greys and the extremes, keeps at least 4.5:1', () => {
  for (const edge of ['#000000', '#FFFFFF', '#808080', '#FFFF00', '#00FF00', '#00FFFF', '#FFA500', '#F0E68C', '#C0C0C0', '#101010']) {
    const bg = vibrantColor(edge);
    assert.ok(contrast(VIBRANT_TEXT, bg) >= MIN_CONTRAST, `${edge} -> ${bg}`);
  }
  // a stored custom label colour goes through labelColor() to its edge
  const custom = labelColor('#FFE600');
  assert.ok(custom && contrast(VIBRANT_TEXT, vibrantColor(custom.edge)) >= MIN_CONTRAST);
});

test('the neutral (break) slate and the left edges keep the ratio too', () => {
  assert.ok(contrast(VIBRANT_TEXT, VIBRANT_NEUTRAL) >= MIN_CONTRAST, `${VIBRANT_NEUTRAL} is ${contrast(VIBRANT_TEXT, VIBRANT_NEUTRAL).toFixed(2)}:1`);
  for (const c of LABEL_COLORS) assert.ok(contrast(VIBRANT_TEXT, vibrantEdge(vibrantColor(c.edge))) >= MIN_CONTRAST, c.key);
});

test('the hue is kept (within a few degrees) and the result is more saturated, only as dark as needed', () => {
  for (const c of LABEL_COLORS) {
    const bg = vibrantColor(c.edge);
    if (saturation(c.edge) > 0.2) assert.ok(hueGap(hue(c.edge), hue(bg)) <= 6, `${c.key}: ${hue(c.edge)} -> ${hue(bg)}`);
    assert.ok(saturation(bg) >= Math.min(saturation(c.edge), 0.7) - 0.02, `${c.key} is not duller than before`);
  }
  // a blue that already has the contrast is only saturated, not darkened below what it needs
  const blue = vibrantColor('#2F6FEB');
  assert.ok(contrast(VIBRANT_TEXT, blue) < 5.2, 'blue is not darkened past the need');
  // yellow had to be darkened a lot, to a dark gold
  assert.ok(contrast(VIBRANT_TEXT, vibrantColor('#BF9100')) >= MIN_CONTRAST);
});

test('it is deterministic and always a six digit hex', () => {
  for (const c of LABEL_COLORS) {
    assert.equal(vibrantColor(c.edge), vibrantColor(c.edge));
    assert.match(vibrantColor(c.edge), /^#[0-9A-F]{6}$/);
    assert.match(vibrantEdge(vibrantColor(c.edge)), /^#[0-9A-F]{6}$/);
  }
});
