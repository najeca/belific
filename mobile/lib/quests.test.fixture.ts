// The rows quests.test.ts compares across time zones, as a module the child
// processes (each with its own TZ) can import. Only tests use it; it is not a
// test file itself, so `npm test` does not run it on its own.
import type { Task } from './types.ts';

const STAMP = '2026-09-01T00:00:00.000Z';
const T = (id: string, dueDate: string, extra: Partial<Task> = {}): Task => ({ id, title: id, dueDate, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });
const done = (id: string, dueDate: string, extra: Partial<Task> = {}) => T(id, dueDate, { completed: true, completedAt: `${dueDate}T09:00:00.000Z`, ...extra });
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function fixture(): Task[] {
  const rows: Task[] = [];
  const stamps = ['T00:30:00+13:00', 'T23:30:00-08:00', 'T12:00:00.000Z'];
  let i = 0;
  for (let d = new Date(2026, 2, 1); d <= new Date(2026, 10, 10); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const k = key(d);
    if (k === '2026-03-29') {
      rows.push(T(`d:${k}`, k, { recurrence: 'daily', deletedAt: STAMP }));
      continue;
    }
    const id = k === '2026-03-01' ? 'd' : `d:${k}`;
    rows.push({ ...T(id, k, { recurrence: 'daily' }), completed: true, completedAt: `${k}${stamps[i++ % 3]}` });
  }
  rows.push(done('w', '2026-03-02', { recurrence: 'weekly', recurrenceDays: ['Mon', 'Sun'] }));
  for (const k of ['2026-03-08', '2026-03-09', '2026-03-15', '2026-03-16', '2026-03-22', '2026-03-23', '2026-03-29', '2026-03-30', '2026-04-05']) {
    rows.push(done(`w:${k}`, k, { recurrence: 'weekly', recurrenceDays: ['Mon', 'Sun'] }));
  }
  rows.push(done('mo', '2026-01-31', { recurrence: 'monthly', recurrenceMonthDay: 31 }));
  for (const k of ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31']) {
    rows.push(done(`mo:${k}`, k, { recurrence: 'monthly', recurrenceMonthDay: 31 }));
  }
  return rows;
}
