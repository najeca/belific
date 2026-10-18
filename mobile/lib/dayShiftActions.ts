import { loadTasksRaw } from './storage';
import { patchTask } from './taskActions';
import { canShift, type DayMove } from './dayShift';

// Moving a day's tasks (2.27.0, items 8 and 10). Desktop only. Each move is
// checked against the latest stored row first (a task done or moved on the other
// device in the meantime is left alone) and written as an ordinary task edit,
// queued for sync like any other. Only the Day changes: the time of day stays.

// Returns the moves that were made (for the undo).
export async function applyMoves(moves: DayMove[]): Promise<DayMove[]> {
  const byId = new Map((await loadTasksRaw()).map((t) => [t.id, t]));
  const done: DayMove[] = [];
  for (const m of moves) {
    const t = byId.get(m.id);
    if (!t || !canShift(t) || t.dueDate !== m.from) continue;
    await patchTask(m.id, { dueDate: m.to });
    done.push(m);
  }
  return done;
}

// The undo: each task back to its old day, if it is still where it was moved to.
export async function undoMoves(moves: DayMove[]): Promise<number> {
  const back = moves.map((m) => ({ id: m.id, from: m.to, to: m.from }));
  return (await applyMoves(back)).length;
}
