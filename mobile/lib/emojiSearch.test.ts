// Run with `npm test` from mobile/. The emoji picker's data and search (2.27.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RECENT, parseEmojiData, parseRecent, pushRecent, searchEmoji } from './emojiSearch.ts';
import { EMOJI_DATA, EMOJI_GROUPS } from './emojiData.ts';

const all = parseEmojiData(EMOJI_DATA);
const strip = (e: string) => e.replace(/️/g, '');

test('the bundled data: nine groups, about 1,870 emoji, each with a name', () => {
  assert.equal(EMOJI_GROUPS.length, 9);
  assert.equal(EMOJI_DATA.length, 9);
  assert.ok(all.length > 1800 && all.length < 2000, String(all.length));
  assert.ok(all.every((e) => e.emoji && e.name));
  // No skin tone variants and no skin tone swatches on their own.
  assert.ok(!all.some((e) => /[\u{1F3FB}-\u{1F3FF}]/u.test(e.emoji)));
});

test('"game" finds the video game controller (and the joystick)', () => {
  const found = searchEmoji(all, 'game').map((e) => strip(e.emoji));
  assert.ok(found.includes('🎮'), found.join(' '));
  assert.ok(found.includes('🕹'), found.join(' '));
  assert.ok(searchEmoji(all, 'controller').some((e) => strip(e.emoji) === '🎮'));
});

test('search matches names and keywords, every word typed, by word start', () => {
  assert.equal(strip(searchEmoji(all, 'video game')[0].emoji), '🎮');
  assert.ok(searchEmoji(all, 'vid gam').some((e) => strip(e.emoji) === '🎮'));
  assert.ok(searchEmoji(all, 'GAME').length > 0, 'any case');
  assert.equal(searchEmoji(all, 'zzzqqq').length, 0);
  assert.equal(searchEmoji(all, '   ').length, 0);
  // The name itself ranks first.
  assert.equal(searchEmoji(all, 'dog')[0].name, 'dog');
});

test('the recent row: newest first, no repeats, at most 16', () => {
  assert.deepEqual(pushRecent(['🎮', '🐶'], '🐶'), ['🐶', '🎮']);
  let r: string[] = [];
  for (let i = 0; i < 20; i++) r = pushRecent(r, String.fromCodePoint(0x1f600 + i));
  assert.equal(r.length, MAX_RECENT);
  assert.equal(r[0], String.fromCodePoint(0x1f600 + 19));
  assert.deepEqual(parseRecent('["🎮","🐶"]'), ['🎮', '🐶']);
  assert.deepEqual(parseRecent('nope'), []);
  assert.deepEqual(parseRecent('{"a":1}'), []);
  assert.deepEqual(parseRecent(null), []);
});
