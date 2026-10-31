// Run with `npm test` from mobile/. "Vibrant task colours": every colour the app can draw
// a block in keeps white text at 6:1 or better, and keeps its hue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LABEL_COLORS, LEGACY_COLORS, colorDistance, contrast, hueShadeToHex, labelColor } from './labelColors.ts';
import { MIN_CONTRAST, NEUTRAL_SAT, VIBRANT_NEUTRAL, VIBRANT_TEXT, vibrantColor, vibrantEdge } from './vibrant.ts';

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

test('the base palette (20), the legacy 2.26 colours (12): white text keeps at least 6:1', () => {
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

test('every colour wheel colour (hue 0 to 359 at every shade step) keeps at least 6:1', () => {
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

test('any custom colour a label can hold, including greys and the extremes, keeps at least 6:1', () => {
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
  // darkened only as far as the 6:1 rule needs: a blue ends just above it
  const blue = vibrantColor('#2F6FEB');
  assert.ok(contrast(VIBRANT_TEXT, blue) < 6.6, 'blue is not darkened past the need');
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

// ---- 3.23.2: labels never merge in vibrant mode ----
// Reported: with Vibrant task colours on, the grey Work label showed as the same blue as Study (a grey's tiny blue tint
// was lifted to 0.85 saturation, the same as every other colour). The vibrant colour of a block does not depend on the
// theme (white text on it in Light and in Dark), so these checks hold in both.
const NEUTRAL_EDGES = ['#6F7882', '#5B5F66', '#8C8579', '#808080', '#000000', '#101010', '#C0C0C0', '#9A9A9A'];

test('a grey, black or stone label stays a quiet grey in vibrant mode (never a blue or an orange)', () => {
  for (const edge of NEUTRAL_EDGES) {
    assert.ok(saturation(edge) < NEUTRAL_SAT, `${edge} is a neutral`);
    const bg = vibrantColor(edge);
    assert.ok(saturation(bg) < 0.36, `${edge} -> ${bg} has saturation ${saturation(bg).toFixed(2)}`);
    assert.ok(contrast(VIBRANT_TEXT, bg) >= MIN_CONTRAST, `${edge} -> ${bg}`);
  }
});

test('the reported case: a grey Work and a blue Study are far apart in vibrant mode', () => {
  const study = ['#2F6FEB', '#6E8DA6', '#4F8299', '#66709E'].map((e) => vibrantColor(e)); // Blue, Sky, Ocean, Indigo (2.26)
  for (const grey of NEUTRAL_EDGES) {
    for (const blue of study) assert.ok(colorDistance(vibrantColor(grey), blue) > 20, `${grey} -> ${vibrantColor(grey)} vs ${blue}`);
  }
});

test('every neutral label colour is far from every coloured one (its own hue is never taken)', () => {
  const coloured = [...LABEL_COLORS, ...LEGACY_COLORS].filter((c) => saturation(c.edge) >= NEUTRAL_SAT).map((c) => ({ k: c.key, v: vibrantColor(c.edge) }));
  for (const edge of NEUTRAL_EDGES) {
    for (const c of coloured) assert.ok(colorDistance(vibrantColor(edge), c.v) > 15, `${edge} -> ${vibrantColor(edge)} vs ${c.k} ${c.v}`);
  }
});

test('every pair of distinct label colours in the palette stays visually distinct in vibrant mode', () => {
  const base = LABEL_COLORS.map((c) => ({ k: c.key, v: vibrantColor(c.edge) }));
  const all = [...base, ...LEGACY_COLORS.map((c) => ({ k: c.key, v: vibrantColor(c.edge) })), { k: 'break', v: VIBRANT_NEUTRAL }];
  let worstBase = Infinity;
  let worstAll = Infinity;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const d = colorDistance(all[i].v, all[j].v);
      worstAll = Math.min(worstAll, d);
      if (i < base.length && j < base.length) worstBase = Math.min(worstBase, d);
      // the 20 colours the Labels form offers: clearly different side by side (CIE76 7 or more)
      if (i < base.length && j < base.length) assert.ok(d >= 7, `${all[i].k} ${all[i].v} ~ ${all[j].k} ${all[j].v}: ${d.toFixed(1)}`);
      // with the 12 older 2.26 colours and the break slate too: never the same colour (4 or more)
      assert.ok(d >= 4, `${all[i].k} ${all[i].v} ~ ${all[j].k} ${all[j].v}: ${d.toFixed(1)}`);
    }
  }
  console.log(`vibrant: closest pair of the 20 ${worstBase.toFixed(1)}, of all 33 ${worstAll.toFixed(1)}`);
});

test('the left edges of two distinct vibrant colours stay distinct too, and 6:1 with white holds for every one', () => {
  const all = [...LABEL_COLORS, ...LEGACY_COLORS];
  for (const c of all) assert.ok(contrast(VIBRANT_TEXT, vibrantColor(c.edge)) >= MIN_CONTRAST, c.key);
  for (let i = 0; i < LABEL_COLORS.length; i++) {
    for (let j = i + 1; j < LABEL_COLORS.length; j++) {
      const a = vibrantEdge(vibrantColor(LABEL_COLORS[i].edge));
      const b = vibrantEdge(vibrantColor(LABEL_COLORS[j].edge));
      assert.ok(colorDistance(a, b) >= 5, `${LABEL_COLORS[i].key} ~ ${LABEL_COLORS[j].key}`);
    }
  }
});
