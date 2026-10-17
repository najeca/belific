// Run with `npm test` from mobile/. Label palette (checkpoint 4.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSIC_COLOR_KEYS, LABEL_COLORS, assignMissingColors, isNewColor, labelColor, nextColorKey } from './labelColors.ts';

function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = v.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('twenty colours with unique keys; the original eight unchanged and first', () => {
  assert.equal(LABEL_COLORS.length, 20);
  assert.equal(new Set(LABEL_COLORS.map((c) => c.key)).size, 20);
  // The eight that every Belific knows keep their names, keys and colours exactly.
  assert.deepEqual(
    LABEL_COLORS.slice(0, 8).map((c) => [c.key, c.edge, c.tint]),
    [
      ['sage', '#6F8F7E', '#E9F0EB'],
      ['clay', '#B57A62', '#F6ECE7'],
      ['sky', '#6E8DA6', '#E9EFF4'],
      ['sand', '#B89B66', '#F5F0E4'],
      ['plum', '#8D6F8B', '#F4EEF3'],
      ['moss', '#7C8A56', '#EFF1E5'],
      ['rose', '#B57D88', '#F6EBED'],
      ['slate', '#6F7882', '#EDEFF1'],
    ],
  );
  assert.deepEqual([...CLASSIC_COLOR_KEYS], LABEL_COLORS.slice(0, 8).map((c) => c.key));
  assert.ok(LABEL_COLORS.slice(8).every((c) => isNewColor(c.key)));
  assert.ok(!isNewColor('sage') && !isNewColor('nope'));
});

test('text stays readable on every tint (AA)', () => {
  for (const c of LABEL_COLORS) {
    assert.ok(contrast('#26251F', c.tint) >= 4.5, `${c.key} primary`);
    assert.ok(contrast('#6E6C64', c.tint) >= 4.5, `${c.key} secondary ${contrast('#6E6C64', c.tint).toFixed(2)}`);
    // The edge stands out from the card surface.
    assert.ok(contrast(c.edge, '#FAF9F5') >= 2.5, `${c.key} edge ${contrast(c.edge, '#FAF9F5').toFixed(2)}`);
  }
});

test('next colour is the first unused, then the least used', () => {
  assert.equal(nextColorKey([]), 'sage');
  assert.equal(nextColorKey([{ colorKey: 'sage' }, { colorKey: 'sky' }]), 'clay');
  // Deleted labels and unknown keys do not count
  assert.equal(nextColorKey([{ colorKey: 'sage', deletedAt: 'x' }, { colorKey: 'nope' }]), 'sage');
  const all = LABEL_COLORS.map((c) => ({ colorKey: c.key as string }));
  assert.equal(nextColorKey(all), 'sage');
  assert.equal(nextColorKey([...all, { colorKey: 'sage' }]), 'clay');
  // Never one of the new colours, even when the eight are all taken twice.
  const twice = [...CLASSIC_COLOR_KEYS, ...CLASSIC_COLOR_KEYS].map((k) => ({ colorKey: k as string }));
  assert.ok((CLASSIC_COLOR_KEYS as readonly string[]).includes(nextColorKey(twice)));
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
  // 2.26.0: a key this version does not know is LEFT ALONE (an older desktop
  // overwrote it, which reset a newer palette's colour on every device).
  assert.deepEqual(
    projects.map((p) => p.colorKey),
    ['clay', 'sage', 'sky', undefined, 'from-a-newer-version'],
  );
  assert.equal(labelColor('from-a-newer-version'), undefined, 'drawn neutral');
  assert.deepEqual(
    projects.map((p) => p.updatedAt),
    ['u1', 'u2', 'u3', 'u4', 'u5'],
  );
  assert.equal(projects[1], input[1]);
  assert.equal(labelColor(projects[0].colorKey)?.name, 'Clay');
  // A second pass changes nothing
  assert.equal(assignMissingColors(projects).changed, false);
});

test('older projects without the field load fine', () => {
  assert.equal(labelColor(undefined), undefined);
  assert.deepEqual(assignMissingColors([]), { projects: [], changed: false });
});
