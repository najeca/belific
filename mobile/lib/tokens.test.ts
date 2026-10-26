import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, accents, cssVarName, darkTokens, lightTokens } from './tokens.ts';
import { DEFAULT_THEME_MODE, normalizeThemeMode, resolveTheme } from './themeMode.ts';
import { LABEL_COLORS, LEGACY_COLORS, contrast, darkTint, tintFor } from './labelColors.ts';
import { Colors } from './theme.ts';

const HEX = /^#[0-9A-F]{6}$/i;

test('both themes define every token, and the colours that are read as text or maths are plain hex', () => {
  assert.deepEqual(Object.keys(lightTokens).sort(), Object.keys(darkTokens).sort());
  for (const k of ['background', 'pane', 'surface', 'surfaceRaised', 'hover', 'border', 'textPrimary', 'textSecondary', 'accent', 'accentText', 'onAccent', 'danger', 'success', 'successBg', 'now', 'plainBlock', 'breakTint']) {
    assert.match(lightTokens[k as keyof typeof lightTokens], HEX, `light ${k}`);
    assert.match(darkTokens[k as keyof typeof darkTokens], HEX, `dark ${k}`);
  }
});

test('the studied values: Option B light and Option A dark', () => {
  assert.equal(lightTokens.background, '#FAF7F0');
  assert.equal(lightTokens.surface, '#FFFFFF');
  assert.equal(lightTokens.border, '#E6E0D2');
  assert.equal(darkTokens.background, '#121212');
  assert.equal(darkTokens.surface, '#282828');
  assert.equal(darkTokens.textSecondary, '#A7A7A7');
  assert.equal(darkTokens.accent, '#8FB39A');
});

for (const [name, t] of Object.entries(THEMES)) {
  test(`${name}: text on every surface it sits on is AA`, () => {
    for (const bg of [t.background, t.pane, t.surface, t.surfaceRaised, t.hover, t.plainBlock]) {
      assert.ok(contrast(t.textPrimary, bg) >= 7, `primary on ${bg} ${contrast(t.textPrimary, bg).toFixed(2)}`);
      assert.ok(contrast(t.textSecondary, bg) >= 4.5, `secondary on ${bg} ${contrast(t.textSecondary, bg).toFixed(2)}`);
    }
    for (const bg of [t.background, t.pane, t.surface]) {
      assert.ok(contrast(t.accentText, bg) >= 4.5, `accentText on ${bg} ${contrast(t.accentText, bg).toFixed(2)}`);
      assert.ok(contrast(t.danger, bg) >= 4.5, `danger on ${bg} ${contrast(t.danger, bg).toFixed(2)}`);
    }
    assert.ok(contrast(t.onAccent, t.accent) >= 4.5, `onAccent on accent ${contrast(t.onAccent, t.accent).toFixed(2)}`);
    assert.ok(contrast(t.inverseText, t.inverseBg) >= 7);
    assert.ok(contrast(t.textSecondary, t.breakTint) >= 4.5, `break ${contrast(t.textSecondary, t.breakTint).toFixed(2)}`);
  });
}

test('dark: every label colour, old and new, keeps primary and secondary text readable on its dark tint', () => {
  for (const c of [...LABEL_COLORS, ...LEGACY_COLORS]) {
    const tint = darkTint(c.edge);
    assert.match(tint, HEX, c.key);
    assert.ok(contrast(darkTokens.textPrimary, tint) >= 7, `${c.key} primary ${contrast(darkTokens.textPrimary, tint).toFixed(2)}`);
    assert.ok(contrast(darkTokens.textSecondary, tint) >= 4.5, `${c.key} secondary ${contrast(darkTokens.textSecondary, tint).toFixed(2)}`);
    assert.notEqual(tint, darkTokens.surface.toUpperCase(), `${c.key} still shows its colour`);
  }
});

test('dark: secondary text stays 4.5:1 on a label colour even with a chip (the duration pill) laid over it', () => {
  const mix = (a: string, b: string, t: number) => `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')}`;
  const chipAlpha = Number(/[\d.]+\)$/.exec(darkTokens.chip)![0].slice(0, -1));
  for (const c of [...LABEL_COLORS, ...LEGACY_COLORS]) {
    const under = mix(darkTint(c.edge), '#FFFFFF', chipAlpha);
    assert.ok(contrast(darkTokens.textSecondary, under) >= 4.5, `${c.key} under a chip ${contrast(darkTokens.textSecondary, under).toFixed(2)}`);
  }
  const plain = mix(darkTokens.plainBlock, '#FFFFFF', chipAlpha);
  assert.ok(contrast(darkTokens.textSecondary, plain) >= 4.5, `plain under a chip ${contrast(darkTokens.textSecondary, plain).toFixed(2)}`);
});

test('the chart colours are readable graphics (3:1) on every surface in both themes', () => {
  for (const t of [lightTokens, darkTokens]) {
    for (const bg of [t.background, t.pane, t.surface]) {
      assert.ok(contrast(t.chartActual, bg) >= 3, `actual on ${bg}`);
      assert.ok(contrast(t.chartEstimate, bg) >= 3, `estimate on ${bg}`);
    }
  }
});

test('light: every label colour keeps the tint it always had, and its text stays readable', () => {
  for (const c of [...LABEL_COLORS, ...LEGACY_COLORS]) {
    assert.equal(tintFor(c, false), c.tint);
    assert.ok(contrast(lightTokens.textPrimary, c.tint) >= 4.5, `${c.key} primary`);
    assert.ok(contrast(lightTokens.textSecondary, c.tint) >= 4.5, `${c.key} secondary ${contrast(lightTokens.textSecondary, c.tint).toFixed(2)}`);
  }
});

test('the theme mode: light by default, system follows the computer, junk is the default', () => {
  assert.equal(DEFAULT_THEME_MODE, 'light');
  assert.equal(normalizeThemeMode(undefined), 'light');
  assert.equal(normalizeThemeMode('Dark'), 'light');
  assert.equal(normalizeThemeMode('dark'), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

// Changed on purpose in 2.59.0 (PLAN_phone P11): the phone's old palette (phoneColors) is gone.
test('Colors: plain hex here (no document), the light tokens; CSS variable names are stable', () => {
  assert.equal(Colors.accent, '#5C7A6B');
  assert.equal(Colors.background, lightTokens.background);
  assert.equal(Colors.background, '#FAF7F0');
  assert.equal(cssVarName('textPrimary'), '--ds-text-primary');
  assert.equal(cssVarName('shadowMd'), '--ds-shadow-md');
});

test('each app brings its own accent and Belific stays sage (brighter on dark)', () => {
  assert.equal(accents.belific.light.accent, lightTokens.accent);
  assert.equal(accents.belific.dark.accent, darkTokens.accent);
  for (const [app, a] of Object.entries(accents)) {
    assert.ok(contrast(a.light.accentText, '#FFFFFF') >= 4.5, `${app} light accentText`);
    assert.ok(contrast(a.dark.accentText, darkTokens.surface) >= 4.5, `${app} dark accentText`);
  }
});

// 3.6.0 (task during a break): the chip of a hosted task is light with dark text in both themes, so it
// reads the same on a plain break, a label tinted one and a vibrant (slate or saturated) one.
test('a task during a break: the chip text is 6:1 in both themes and the chip stands out on vibrant blocks', async () => {
  const { VIBRANT_NEUTRAL, vibrantColor } = await import('./vibrant.ts');
  for (const t of [lightTokens, darkTokens]) {
    assert.match(t.hostChip, HEX);
    assert.match(t.onHostChip, HEX);
    assert.ok(contrast(t.onHostChip, t.hostChip) >= 6, `chip text ${contrast(t.onHostChip, t.hostChip).toFixed(2)}`);
    for (const bg of [VIBRANT_NEUTRAL, ...[...LABEL_COLORS, ...LEGACY_COLORS].map((c) => vibrantColor(c.edge))]) {
      assert.ok(contrast(t.hostChip, bg) >= 3, `chip on vibrant ${bg} ${contrast(t.hostChip, bg).toFixed(2)}`);
    }
  }
});
