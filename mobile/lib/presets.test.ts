import test from 'node:test';
import assert from 'node:assert/strict';
import { LABEL_PRESETS, LIST_PRESETS, availableLabelPresets, availableListPresets } from './presets.ts';
import { LABEL_COLORS } from './labelColors.ts';

test('the six presets: lists Home, Work, Shopping; labels Health, Money, Family', () => {
  assert.deepEqual(LIST_PRESETS.map((p) => p.name), ['Home', 'Work', 'Shopping']);
  assert.deepEqual(LABEL_PRESETS.map((p) => p.name), ['Health', 'Money', 'Family']);
  assert.deepEqual(LABEL_PRESETS.map((p) => p.colorKey), ['green', 'yellow', 'blue']);
  assert.deepEqual(LABEL_PRESETS.map((p) => p.originalKey), ['sage', 'sand', 'sky']);
  for (const p of LABEL_PRESETS) assert.ok(LABEL_COLORS.some((c) => c.key === p.colorKey), p.colorKey);
});

test('a preset a live list or label already has is not offered again (case and spaces ignored); a deleted one is', () => {
  assert.equal(availableListPresets([]).length, 3);
  assert.deepEqual(availableListPresets([{ name: ' work ' }, { name: 'Home', deletedAt: 'x' }]).map((p) => p.name), ['Home', 'Shopping']);
  assert.deepEqual(availableLabelPresets([{ name: 'MONEY' }]).map((p) => p.name), ['Health', 'Family']);
});
