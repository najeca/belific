// Run with `npm test` from mobile/. The iPhone's look (PLAN_phone P1): its fonts are real TrueType
// files of the desktop's families with their licences beside them, the text pairs the phone kit uses
// are readable in both themes, and the phone screens never read the old palette or desktop code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { THEMES } from './tokens.ts';
import { contrast } from './labelColors.ts';

const root = path.join(import.meta.dirname, '..');
const phoneDir = path.join(root, 'components', 'phone');

test('every font the iPhone registers is a TrueType file of a desktop family, with its licence beside it', () => {
  const src = fs.readFileSync(path.join(phoneDir, 'phoneFonts.native.ts'), 'utf8');
  const entries = [...src.matchAll(/'([A-Za-z]+-\d{3})': require\('\.\.\/\.\.\/assets\/fonts\/([A-Za-z]+-\d{3})\.ttf'\)/g)];
  assert.equal(entries.length, 9, 'Inter 400 to 700, Newsreader 500 to 700, Roboto Mono 400 and 500');
  for (const [, name, file] of entries) {
    assert.equal(name, file, 'the registered name is the file name');
    const buf = fs.readFileSync(path.join(root, 'assets', 'fonts', `${file}.ttf`));
    assert.equal(buf.readUInt32BE(0), 0x00010000, `${file}.ttf is TrueType`);
    assert.ok(fs.existsSync(path.join(root, 'assets', 'fonts', `${file}.woff2`)), `${file}: the desktop has the same font`);
  }
  for (const lic of ['Inter-OFL.txt', 'Newsreader-OFL.txt', 'RobotoMono-LICENSE.txt']) assert.ok(fs.existsSync(path.join(root, 'assets', 'fonts', lic)), lic);
  // Every name type.ts can produce is registered.
  const typeSrc = fs.readFileSync(path.join(phoneDir, 'type.ts'), 'utf8');
  assert.match(typeSrc, /face\('Inter', 'Inter', w\)/);
  assert.match(typeSrc, /face\('Newsreader', 'Newsreader', w\)/);
  assert.match(typeSrc, /face\('Roboto Mono', 'RobotoMono', w\)/);
});

test('the phone kit text is readable in light and dark (4.5:1; the done tick is onAccent on the accent)', () => {
  for (const [name, c] of Object.entries(THEMES)) {
    for (const bg of [c.background, c.pane, c.surface, c.surfaceRaised]) {
      assert.ok(contrast(c.textPrimary, bg) >= 4.5, `${name}: text on ${bg}`);
      assert.ok(contrast(c.textSecondary, bg) >= 4.5, `${name}: secondary text on ${bg}`);
      assert.ok(contrast(c.accentText, bg) >= 4.5, `${name}: accent text on ${bg}`);
      assert.ok(contrast(c.danger, bg) >= 4.5, `${name}: danger text on ${bg}`);
    }
    assert.ok(contrast(c.onAccent, c.accent) >= 4.5, `${name}: text on the accent button`);
    assert.ok(contrast(c.inverseText, c.inverseBg) >= 4.5, `${name}: the undo bar`);
  }
});

test('phone screens read the theme hook, never the old palette (lib/theme) or desktop code', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(phoneDir);
  assert.ok(files.length >= 4);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /from '\.\.\/\.\.\/lib\/theme'/, `${path.basename(f)} imports the old palette`);
    assert.doesNotMatch(src, /from '[^']*components\/desktop|from '\.\.\/desktop\//, `${path.basename(f)} imports desktop code`);
  }
});
