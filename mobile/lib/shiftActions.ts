// Shifts S3: what "Add inside" and a tick on a shift's row write (the pure rules are in shifts.ts). Each is ONE gesture,
// so one Ctrl+Z puts it back (undoStack.ts). Desktop only for now.
import type { Task } from './types';
import { generateId } from './data';
import { addTask, loadTasksRaw, updateTask } from './storage';
import { materialise } from './seriesActions';
import { opsForProjected, opsForTask } from './taskOps';
import { stack } from './undoStack';
import { flipTodo, insideTask, insideTodo, type InsideForm, type ShiftRow } from './shifts';

const latest = async (id: string): Promise<Task | undefined> => (await loadTasksRaw()).find((t) => t.id === id && !t.deletedAt);

// The stored row of a shift: a coming day of a repeating shift is stored first (series.ts), as a tick would.
async function storedRow(shift: Task, projected: boolean): Promise<Task | undefined> {
  const row = projected ? await materialise(shift) : shift;
  return row ? latest(row.id) : undefined;
}

// A timed item is an ordinary task on the shift's day (All days: on the shift's repeat days from this day on). A to do
// joins the shift's checklist: "All days" of a repeating shift adds it to every day (the steps are shared by the
// series, seriesWide.ts, each day keeping its own ticks); "This day only" stores that day and adds it there.
export async function addInside(shift: Task, projected: boolean, f: InsideForm): Promise<void> {
  const day = shift.dueDate;
  if (!day) return;
  stack.markGesture();
  if (f.timed) {
    const now = new Date().toISOString();
    await addTask({ id: generateId(), completed: false, createdAt: now, updatedAt: now, ...insideTask(shift, day, f) } as Task);
    return;
  }
  const id = generateId();
  if (shift.recurrence && f.scope === 'all') {
    const ops = projected ? opsForProjected(shift) : opsForTask(shift);
    const row = projected ? shift : await latest(shift.id);
    await ops.patch({ subtasks: insideTodo((row ?? shift).subtasks, f.title, id) });
    return;
  }
  const row = await storedRow(shift, projected);
  if (row) await updateTask({ ...row, subtasks: insideTodo(row.subtasks, f.title, id) });
}

// Ticks a row of a shift in place: a timed block is ticked like any task (only its own time for a task with several
// times); a to do flips in the shift's checklist, and never completes the shift.
export async function tickRow(shift: Task, projected: boolean, row: ShiftRow): Promise<void> {
  stack.markGesture();
  if (row.kind === 'timed' && row.full) {
    const ops = row.projected ? opsForProjected(row.full) : opsForTask(row.full);
    await (row.slot ? ops.setTimeDone(row.slot, !row.done) : ops.setCompleted(!row.done));
    return;
  }
  if (!row.subtaskId) return;
  const stored = await storedRow(shift, projected);
  if (stored) await updateTask({ ...stored, subtasks: flipTodo(stored.subtasks, row.subtaskId) });
}
