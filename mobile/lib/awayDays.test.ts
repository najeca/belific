import test from 'node:test';
import assert from 'node:assert/strict';
import { awayDaysFrom, awayKey } from './awayDays.ts';

test('away days come from away.<day> rows with value 1; 0, tombstones, bad keys and other settings are not away', () => {
  const rows = [
    { key: awayKey('2026-10-20'), value: '1' },
    { key: awayKey('2026-10-21'), value: '0' },
    { key: awayKey('2026-10-22'), value: '1', deletedAt: 'x' },
    { key: 'away.someday', value: '1' },
    { key: 'feature.pomodoro', value: 'on' },
    { key: 'template.abc', value: '{}' },
  ];
  assert.deepEqual([...awayDaysFrom(rows)], ['2026-10-20']);
});
