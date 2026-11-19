import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_COLORS, AVATAR_KEY, AVATAR_PRESETS, avatarA11y, avatarValue, initialsOf, parseAvatar } from './profileAvatar.ts';
import { labelColor } from './labelColors.ts';

test('one synced user_settings row', () => {
  assert.equal(AVATAR_KEY, 'profile.avatar');
});

test('presets: unique ids, each with a known colour; the initials colours are the original eight', () => {
  assert.equal(new Set(AVATAR_PRESETS.map((p) => p.id)).size, AVATAR_PRESETS.length);
  for (const p of AVATAR_PRESETS) assert.ok(labelColor(p.color), p.id);
  assert.deepEqual(AVATAR_COLORS, ['sage', 'clay', 'sky', 'sand', 'plum', 'moss', 'rose', 'slate']);
});

test('initials: one or two letters, upper case', () => {
  assert.equal(initialsOf('jc'), 'JC');
  assert.equal(initialsOf('Ann Lee'), 'AL');
  assert.equal(initialsOf('  ann  b  c '), 'AB');
  assert.equal(initialsOf('x'), 'X');
  assert.equal(initialsOf('j.c!'), 'JC');
  assert.equal(initialsOf('élan'), 'ÉL');
  assert.equal(initialsOf('   '), '');
});

test('a value round trips; damaged or unknown values are no avatar', () => {
  const fox = AVATAR_PRESETS.find((p) => p.id === 'fox')!;
  assert.deepEqual(parseAvatar(avatarValue({ kind: 'preset', preset: fox })), { kind: 'preset', preset: fox });
  assert.deepEqual(parseAvatar(avatarValue({ kind: 'initials', text: 'JC', color: 'sky' })), { kind: 'initials', text: 'JC', color: 'sky' });
  assert.deepEqual(parseAvatar('initials:jc:nope'), { kind: 'initials', text: 'JC', color: 'sage' });
  assert.deepEqual(parseAvatar('preset:dragon'), { kind: 'none' });
  assert.deepEqual(parseAvatar('initials::sky'), { kind: 'none' });
  assert.deepEqual(parseAvatar('photo:file.png'), { kind: 'none' });
  assert.deepEqual(parseAvatar(null), { kind: 'none' });
  assert.equal(avatarValue({ kind: 'none' }), '');
});

test('VoiceOver hears what is shown', () => {
  assert.equal(avatarA11y({ kind: 'none' }), 'Profile');
  assert.equal(avatarA11y({ kind: 'initials', text: 'JC', color: 'sky' }), 'Profile, initials J C');
  assert.equal(avatarA11y(parseAvatar('preset:owl')), 'Profile, picture Owl');
});
