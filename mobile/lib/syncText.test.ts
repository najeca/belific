import test from 'node:test';
import assert from 'node:assert/strict';
import { lastSyncedText, profileInitial, syncErrorText, syncLineText, type SyncLike } from './syncText.ts';

const base: SyncLike = { state: 'idle', signedIn: true, pending: 0, lastSuccessAt: null, lastError: null, lastErrorAt: null };
const NOW = Date.parse('2026-10-07T12:00:00Z');

test('signed out reads Local only', () => {
  assert.deepEqual(syncLineText({ ...base, signedIn: false }, NOW), { text: 'Local only · not signed in', warn: false });
  assert.equal(syncLineText({ ...base, state: 'signed-out' }, NOW).text, 'Local only · not signed in');
});

test('signed in states read plainly', () => {
  assert.equal(syncLineText(base, NOW).text, 'Synced');
  assert.equal(syncLineText({ ...base, pending: 1 }, NOW).text, '1 change waiting');
  assert.equal(syncLineText({ ...base, pending: 3 }, NOW).text, '3 changes waiting');
  assert.equal(syncLineText({ ...base, state: 'syncing' }, NOW).text, 'Syncing…');
  assert.equal(syncLineText({ ...base, state: 'offline', pending: 2 }, NOW).text, 'Offline · 2 changes waiting');
});

test('an error warns only while it is under a day old', () => {
  const recent = { ...base, state: 'error', lastError: 'Network down', lastErrorAt: '2026-10-07T11:00:00Z' };
  assert.deepEqual(syncLineText(recent, NOW), { text: 'Sync problem: Network down', warn: true });
  assert.equal(syncLineText({ ...recent, lastErrorAt: '2026-10-05T11:00:00Z' }, NOW).warn, false);
});

test('last synced time in plain words', () => {
  assert.equal(lastSyncedText(null, NOW), 'Not synced yet');
  assert.equal(lastSyncedText('junk', NOW), 'Not synced yet');
  assert.equal(lastSyncedText('2026-10-07T11:59:40Z', NOW), 'Last synced just now');
  assert.equal(lastSyncedText('2026-10-07T11:59:00Z', NOW), 'Last synced 1 minute ago');
  assert.equal(lastSyncedText('2026-10-07T11:15:00Z', NOW), 'Last synced 45 minutes ago');
  assert.equal(lastSyncedText('2026-10-07T09:00:00Z', NOW), 'Last synced 3 hours ago');
  assert.equal(lastSyncedText('2026-10-05T12:00:00Z', NOW), 'Last synced 2 days ago');
});

test('sync error text only while signed in and in error, and is shortened', () => {
  assert.equal(syncErrorText(base), null);
  assert.equal(syncErrorText({ ...base, signedIn: false, state: 'error', lastError: 'x' }), null);
  assert.equal(syncErrorText({ ...base, state: 'error', lastError: 'Network down' }), 'Network down');
  const long = syncErrorText({ ...base, state: 'error', lastError: 'a'.repeat(300) }) as string;
  assert.equal(long.length, 118);
  assert.ok(long.endsWith('…'));
});

test('profile initial is the first letter or digit, upper case', () => {
  assert.equal(profileInitial('jethro@example.com'), 'J');
  assert.equal(profileInitial('  ana'), 'A');
  assert.equal(profileInitial('élan'), 'É');
  assert.equal(profileInitial('42x'), '4');
  assert.equal(profileInitial('...'), null);
  assert.equal(profileInitial(''), null);
  assert.equal(profileInitial(null), null);
  assert.equal(profileInitial(undefined), null);
});
