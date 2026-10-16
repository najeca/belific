// Run with `npm test` from mobile/. The chart colours are readable (phase 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_ACTUAL, CHART_ESTIMATE, chartLabelColor, contrastRatio } from './chartColors.ts';
import { LABEL_COLORS } from './labelColors.ts';
import { Colors } from './theme.ts';

test('actual and estimate are readable against the cream surface and the page background', () => {
  for (const bg of [Colors.surface, Colors.background]) {
    assert.ok(contrastRatio(CHART_ACTUAL, bg) >= 3, `actual on ${bg}: ${contrastRatio(CHART_ACTUAL, bg).toFixed(2)}`);
    assert.ok(contrastRatio(CHART_ESTIMATE, bg) >= 3, `estimate on ${bg}: ${contrastRatio(CHART_ESTIMATE, bg).toFixed(2)}`);
  }
  assert.equal(CHART_ACTUAL, Colors.accent, 'actual is the theme sage');
  assert.notEqual(CHART_ACTUAL, CHART_ESTIMATE);
});

test('every label colour, as a bar or swatch, is at least 3:1 on the surface once adjusted', () => {
  for (const c of LABEL_COLORS) {
    const adjusted = chartLabelColor(c.edge, Colors.surface);
    assert.ok(contrastRatio(adjusted, Colors.surface) >= 3, `${c.key} ${adjusted} ${contrastRatio(adjusted, Colors.surface).toFixed(2)}`);
  }
  // a colour that already passes is left alone
  assert.equal(chartLabelColor(CHART_ACTUAL, Colors.surface), CHART_ACTUAL.toLowerCase());
});

test('contrast maths: black on white is 21', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
});
