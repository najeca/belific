'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { backupNow, pruneBackups, dayStamp } = require('../src/backups');

function tmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `belific-${name}-`));
}

test('dayStamp formats local dates as YYYY-MM-DD', () => {
  assert.equal(dayStamp(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(dayStamp(new Date(2026, 11, 31)), '2026-12-31');
});

test('backupNow copies data files into a dated folder and skips temp files', async () => {
  const data = tmp('data');
  const backups = path.join(tmp('root'), 'backups');
  fs.writeFileSync(path.join(data, 'belific_tasks.kv'), '[1]');
  fs.writeFileSync(path.join(data, 'belific_tasks.kv.abc123.tmp'), 'partial');
  const target = await backupNow(data, backups, new Date(2026, 9, 5));
  assert.equal(path.basename(target), '2026-10-05');
  assert.deepEqual(fs.readdirSync(target), ['belific_tasks.kv']);
  assert.equal(fs.readFileSync(path.join(target, 'belific_tasks.kv'), 'utf8'), '[1]');
});

test('a second backup on the same day replaces the first', async () => {
  const data = tmp('data');
  const backups = path.join(tmp('root'), 'backups');
  fs.writeFileSync(path.join(data, 'k.kv'), 'one');
  await backupNow(data, backups, new Date(2026, 9, 5));
  fs.writeFileSync(path.join(data, 'k.kv'), 'two');
  const target = await backupNow(data, backups, new Date(2026, 9, 5, 18));
  assert.equal(fs.readFileSync(path.join(target, 'k.kv'), 'utf8'), 'two');
  assert.deepEqual(fs.readdirSync(backups), ['2026-10-05']);
});

test('rotation keeps the newest 14 day folders', async () => {
  const data = tmp('data');
  const backups = path.join(tmp('root'), 'backups');
  fs.writeFileSync(path.join(data, 'k.kv'), 'v');
  for (let day = 1; day <= 20; day++) {
    await backupNow(data, backups, new Date(2026, 8, day), 14);
  }
  const kept = fs.readdirSync(backups).sort();
  assert.equal(kept.length, 14);
  assert.equal(kept[0], '2026-09-07');
  assert.equal(kept[13], '2026-09-20');
});

test('prune ignores folders that are not day stamps', async () => {
  const backups = tmp('prune');
  fs.mkdirSync(path.join(backups, 'notes'));
  for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) fs.mkdirSync(path.join(backups, d));
  const removed = await pruneBackups(backups, 2);
  assert.deepEqual(removed, ['2026-01-01']);
  assert.deepEqual(fs.readdirSync(backups).sort(), ['2026-01-02', '2026-01-03', 'notes']);
});

test('backup of a missing data folder yields an empty backup, not a crash', async () => {
  const backups = path.join(tmp('root'), 'backups');
  const target = await backupNow(path.join(tmp('nothing'), 'absent'), backups, new Date(2026, 9, 5));
  assert.deepEqual(fs.readdirSync(target), []);
});
