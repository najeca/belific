import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from '../scripts/export-tokens.mjs';
import { accents, cssVarName, darkTokens, lightTokens, radius } from './tokens.ts';
import { contrast } from './labelColors.ts';

const root = path.join(import.meta.dirname, '..', '..', 'design-tokens');

test('design-tokens/ is current: the three files are exactly what lib/tokens.ts generates', () => {
  const out = build();
  for (const [name, text] of Object.entries(out)) {
    const onDisk = fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(onDisk, text, `${name} is stale: run "node scripts/export-tokens.mjs" in mobile/`);
  }
});

test('tokens.json carries both themes, the three accents and the shape scale', () => {
  const json = JSON.parse(build()['tokens.json']);
  assert.deepEqual(Object.keys(json.color).sort(), ['dark', 'light']);
  assert.equal(json.color.light.background, '#FAF7F0');
  assert.equal(json.color.dark.background, '#121212');
  assert.deepEqual(Object.keys(json.accent).sort(), ['belific', 'landis', 'proload']);
  assert.deepEqual(json.radius, radius);
});

test('tokens.css: light is the default, dark and "system" are selectors, each app has its accent', () => {
  const css = build()['tokens.css'];
  assert.match(css, /:root,\n:root\[data-theme="light"\] \{/);
  assert.match(css, /:root\[data-theme="dark"\] \{/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n {2}:root\[data-theme="system"\] \{/);
  for (const app of ['landis', 'proload']) {
    assert.match(css, new RegExp(`:root\\[data-accent="${app}"\\] \\{`));
    assert.match(css, new RegExp(`:root\\[data-accent="${app}"\\]\\[data-theme="dark"\\] \\{`));
  }
  // Every token is published once per theme under the same name the app reads.
  for (const k of Object.keys(lightTokens)) assert.ok(css.includes(`${cssVarName(k)}: ${lightTokens[k as keyof typeof lightTokens]};`), k);
  for (const k of Object.keys(darkTokens)) assert.ok(css.includes(`${cssVarName(k)}: ${darkTokens[k as keyof typeof darkTokens]};`), k);
});

test('the Tailwind preset loads and maps the tokens to their CSS variables', () => {
  const preset = createRequire(import.meta.url)(path.join(root, 'tailwind-preset.js'));
  assert.equal(preset.theme.extend.colors['text-primary'], 'var(--ds-text-primary)');
  assert.equal(preset.theme.extend.colors.accent, 'var(--ds-accent)');
  assert.equal(preset.theme.extend.borderRadius.lg, '10px');
  assert.equal(preset.theme.extend.borderRadius.full, '9999px');
  assert.match(preset.theme.extend.fontFamily.ui[0], /^Inter/);
  assert.match(preset.theme.extend.fontFamily.display[0], /^Newsreader/);
  assert.deepEqual(preset.darkMode, ['selector', '[data-theme="dark"]']);
});

test('every app accent is readable: text on its fill 4.5:1, accent text on the surfaces 4.5:1', () => {
  for (const [app, a] of Object.entries(accents)) {
    assert.ok(contrast(a.light.onAccent, a.light.accent) >= 4.5, `${app} light fill ${contrast(a.light.onAccent, a.light.accent).toFixed(2)}`);
    assert.ok(contrast(a.dark.onAccent, a.dark.accent) >= 4.5, `${app} dark fill ${contrast(a.dark.onAccent, a.dark.accent).toFixed(2)}`);
    for (const bg of [lightTokens.surface, lightTokens.background]) assert.ok(contrast(a.light.accentText, bg) >= 4.5, `${app} light text on ${bg}`);
    for (const bg of [darkTokens.surface, darkTokens.background, darkTokens.pane]) assert.ok(contrast(a.dark.accentText, bg) >= 4.5, `${app} dark text on ${bg}`);
  }
});
