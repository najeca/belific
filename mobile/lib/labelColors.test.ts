// Run with `npm test` from mobile/. Label palette (checkpoint 4.1; 2.27.0).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASH_DISTANCE,
  CLASSIC_COLOR_KEYS,
  LABEL_COLORS,
  LEGACY_COLORS,
  assignMissingColors,
  colorClash,
  colorDistance,
  contrast,
  customTint,
  hexToHueShade,
  hueShadeToHex,
  isCustomColor,
  isNewColor,
  labelColor,
  nextColorKey,
  normalizeHex,
  sharedColorGroups,
} from './labelColors.ts';

test('twenty colours with unique keys; the original eight unchanged and first', () => {
  assert.equal(LABEL_COLORS.length, 20);
  assert.equal(new Set([...LABEL_COLORS, ...LEGACY_COLORS].map((c) => c.key)).size, 32, 'no key reused, the 2.26 ones included');
  // The eight that every Belific knows keep their names, keys and colours exactly.
  assert.deepEqual(
    LABEL_COLORS.slice(0, 8).map((c) => [c.key, c.name, c.edge, c.tint]),
    [
      ['sage', 'Sage', '#6F8F7E', '#E9F0EB'],
      ['clay', 'Clay', '#B57A62', '#F6ECE7'],
      ['sky', 'Sky', '#6E8DA6', '#E9EFF4'],
      ['sand', 'Sand', '#B89B66', '#F5F0E4'],
      ['plum', 'Plum', '#8D6F8B', '#F4EEF3'],
      ['moss', 'Moss', '#7C8A56', '#EFF1E5'],
      ['rose', 'Rose', '#B57D88', '#F6EBED'],
      ['slate', 'Slate', '#6F7882', '#EDEFF1'],
    ],
  );
  assert.deepEqual([...CLASSIC_COLOR_KEYS], LABEL_COLORS.slice(0, 8).map((c) => c.key));
  assert.ok(LABEL_COLORS.slice(8).every((c) => isNewColor(c.key) && c.since === '2.27'));
  assert.ok(!isNewColor('sage') && !isNewColor('nope'));
  // The vibrant twelve cover red, orange, yellow, green, teal, blue, purple and pink.
  for (const name of ['Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink']) assert.ok(LABEL_COLORS.some((c) => c.name === name), name);
});

test('text stays readable on every tint (AA), and every edge stands out from the surface', () => {
  for (const c of [...LABEL_COLORS, ...LEGACY_COLORS]) {
    assert.ok(contrast('#26251F', c.tint) >= 4.5, `${c.key} primary`);
    assert.ok(contrast('#6E6C64', c.tint) >= 4.5, `${c.key} secondary ${contrast('#6E6C64', c.tint).toFixed(2)}`);
    assert.ok(contrast(c.edge, '#FAF9F5') >= 2.5, `${c.key} edge ${contrast(c.edge, '#FAF9F5').toFixed(2)}`);
  }
});

test('the twelve vibrant colours are well apart from each other and from the original eight', () => {
  const vivid = LABEL_COLORS.slice(8);
  for (let i = 0; i < vivid.length; i++)
    for (let j = i + 1; j < vivid.length; j++) assert.ok(colorDistance(vivid[i].edge, vivid[j].edge) >= 20, `${vivid[i].key} vs ${vivid[j].key} ${colorDistance(vivid[i].edge, vivid[j].edge).toFixed(1)}`);
  for (const v of vivid) for (const c of LABEL_COLORS.slice(0, 8)) assert.ok(colorDistance(v.edge, c.edge) >= CLASH_DISTANCE, `${v.key} vs ${c.key}`);
  // Red, orange and yellow, the ones that were hard to tell apart, are far apart.
  const e = (k: string) => LABEL_COLORS.find((c) => c.key === k)!.edge;
  assert.ok(colorDistance(e('red'), e('orange')) >= 30 && colorDistance(e('orange'), e('yellow')) >= 30 && colorDistance(e('red'), e('pink')) >= 30);
});

test('custom colours: a hex value in the same field, drawn with a readable tint', () => {
  assert.equal(normalizeHex('#2f6feb'), '#2F6FEB');
  assert.equal(normalizeHex('2F6FEB'), '#2F6FEB');
  assert.equal(normalizeHex('#abc'), '#AABBCC');
  assert.equal(normalizeHex('blue'), null);
  assert.equal(normalizeHex('#12345'), null);
  assert.ok(isCustomColor('#2F6FEB') && !isCustomColor('#2f6feb') && !isCustomColor('sage'));
  assert.ok(isNewColor('#123456'), 'a custom colour needs the tick');
  const c = labelColor('#123456');
  assert.deepEqual([c?.name, c?.edge], ['Custom', '#123456']);
  // Any colour at all keeps both texts AA on its tint.
  for (let h = 0; h < 360; h += 15)
    for (const s of [0, 25, 50, 75, 100]) {
      const hex = hueShadeToHex(h, s);
      const tint = customTint(hex);
      assert.ok(contrast('#6E6C64', tint) >= 4.5 && contrast('#26251F', tint) >= 4.5, `${hex} -> ${tint}`);
    }
  for (const hex of ['#000000', '#FFFFFF', '#FFFF00', '#00FF00']) assert.ok(contrast('#6E6C64', customTint(hex)) >= 4.5, hex);
});

test('hue and shade round trip through hex', () => {
  for (const [h, s] of [[0, 30], [120, 50], [220, 70], [300, 10]]) {
    const back = hexToHueShade(hueShadeToHex(h, s));
    assert.ok(Math.abs(back.hue - h) <= 2 && Math.abs(back.shade - s) <= 2, `${h},${s} -> ${back.hue},${back.shade}`);
  }
});

test('an older Belific never breaks on a custom colour: it is an unknown key, kept and drawn neutral there', () => {
  // 2.26 rule (kept here for keys this version does not know): an unknown key is left alone.
  const { projects } = assignMissingColors([{ key: 'a', name: 'A', createdAt: 't', updatedAt: 'u', colorKey: '#2F6FEB' }]);
  assert.equal(projects[0].colorKey, '#2F6FEB');
  assert.equal(labelColor('from-a-newer-version'), undefined);
});

test('no two labels with the same colour: same key, or too close, names the label', () => {
  const labels = [
    { key: 'w', name: 'Work', colorKey: 'red' },
    { key: 'h', name: 'Home', colorKey: '#2F6FEB' },
    { key: 'g', name: 'Gone', colorKey: 'green', deletedAt: 'x' },
  ];
  assert.equal(colorClash(labels, 'red')?.name, 'Work');
  assert.equal(colorClash(labels, 'red', 'w'), undefined, 'its own colour is fine');
  assert.equal(colorClash(labels, 'blue')?.name, 'Home', 'the Blue swatch is the custom #2F6FEB');
  assert.equal(colorClash(labels, '#E5403F')?.name, 'Work', 'a wheel colour close to Red');
  assert.equal(colorClash(labels, 'green'), undefined, 'a deleted label does not count');
  assert.equal(colorClash(labels, 'cyan'), undefined);
});

test('labels that already share a colour are found for the notice, and left alone', () => {
  const labels = [
    { key: 'a', name: 'A', colorKey: 'sage' },
    { key: 'b', name: 'B', colorKey: 'sage' },
    { key: 'c', name: 'C', colorKey: 'clay' },
    { key: 'd', name: 'D', colorKey: 'red' },
    { key: 'e', name: 'E', colorKey: '#E23B3C' },
  ];
  assert.deepEqual(sharedColorGroups(labels).map((g) => g.map((l) => l.key)), [['a', 'b'], ['d', 'e']]);
});

test('next colour: the first free one; the vibrant ones only once allowed; then the least used of the eight', () => {
  assert.equal(nextColorKey([]), 'sage');
  assert.equal(nextColorKey([{ key: '1', name: '', colorKey: 'sage' }, { key: '2', name: '', colorKey: 'sky' }]), 'clay');
  assert.equal(nextColorKey([{ key: '1', name: '', colorKey: 'sage', deletedAt: 'x' }, { key: '2', name: '', colorKey: 'nope' }]), 'sage');
  const eight = CLASSIC_COLOR_KEYS.map((k, i) => ({ key: `${i}`, name: '', colorKey: k as string }));
  assert.equal(nextColorKey(eight, true), 'red');
  assert.ok((CLASSIC_COLOR_KEYS as readonly string[]).includes(nextColorKey(eight, false)), 'never a vibrant one without the tick');
  assert.equal(nextColorKey([...eight, { key: 'x', name: '', colorKey: 'sage' }]), 'clay', 'least used of the eight');
});

test('missing colours are filled silently, in order, without touching other fields', () => {
  const input = [
    { key: 'a', name: 'A', createdAt: 't', updatedAt: 'u1' },
    { key: 'b', name: 'B', createdAt: 't', updatedAt: 'u2', colorKey: 'sage' },
    { key: 'c', name: 'C', createdAt: 't', updatedAt: 'u3' },
    { key: 'd', name: 'D', createdAt: 't', updatedAt: 'u4', deletedAt: 'x' },
    { key: 'e', name: 'E', createdAt: 't', updatedAt: 'u5', colorKey: 'from-a-newer-version' },
  ];
  const { projects, changed } = assignMissingColors(input);
  assert.equal(changed, true);
  assert.deepEqual(
    projects.map((p) => p.colorKey),
    ['clay', 'sage', 'sky', undefined, 'from-a-newer-version'],
  );
  assert.deepEqual(
    projects.map((p) => p.updatedAt),
    ['u1', 'u2', 'u3', 'u4', 'u5'],
  );
  assert.equal(projects[1], input[1]);
  assert.equal(labelColor(projects[0].colorKey)?.name, 'Clay');
  assert.equal(assignMissingColors(projects).changed, false);
});

test('older projects without the field load fine; a 2.26 colour is still drawn', () => {
  assert.equal(labelColor(undefined), undefined);
  assert.deepEqual(assignMissingColors([]), { projects: [], changed: false });
  assert.equal(labelColor('teal')?.edge, '#5E8E8A');
});
