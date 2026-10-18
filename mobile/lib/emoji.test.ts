// Run with `npm test` from mobile/. Emoji fields keep one emoji (phase 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { firstEmoji, MAX_EMOJI_CODE_UNITS } from './emoji.ts';
import { EMOJI_DATA } from './emojiData.ts';
import { parseEmojiData } from './emojiSearch.ts';
import { sanitizeEmoji } from './syncCore.ts';

test('the first emoji of what was typed or pasted', () => {
  assert.equal(firstEmoji('📚'), '📚');
  assert.equal(firstEmoji('  🏠  '), '🏠');
  assert.equal(firstEmoji('read 📚 now 🏠'), '📚');
  assert.equal(firstEmoji('❤️'), '❤️');
  assert.equal(firstEmoji('🇬🇧'), '🇬🇧', 'a flag is one emoji');
  assert.equal(firstEmoji('1️⃣'), '1️⃣', 'a keycap is one emoji');
  assert.equal(firstEmoji('👨‍👩‍👧'), '👨‍👩‍👧', 'a joined family stays whole');
});

test('no emoji in the text means no emoji', () => {
  for (const v of ['', '   ', 'hello', '123', '#', '*', undefined, null, 5]) assert.equal(firstEmoji(v), undefined, String(v));
});

// 2.27.1: the picker offers the bundled emojibase set (lib/emojiData.ts).
test('every emoji the picker offers is a single emoji the sync mapping will accept', () => {
  const offered = parseEmojiData(EMOJI_DATA).map((x) => x.emoji);
  for (const e of offered) {
    assert.equal(firstEmoji(e), e, e);
    assert.equal(sanitizeEmoji(e), e, e);
    assert.ok(e.length <= MAX_EMOJI_CODE_UNITS);
  }
  assert.equal(new Set(offered).size, offered.length);
});
