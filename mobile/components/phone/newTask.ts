// Phase 4 of PLAN_phone_parity (item 1): the + (and a tap on an empty Day slot) opens the whole task card, empty, with the
// place already filled in (a day, a time, a length, a list). It replaces the title only quick add sheet. The card keeps the
// new task in memory until it has a title (3.23.0), then stores it once; Cancel throws it away.
import { generateId } from '../../lib/data';
import type { Task } from '../../lib/types';
import type { DetailsTarget } from './TaskDetails';

export interface NewTaskWhere {
  dueDate?: string;
  startTime?: string;
  durationMinutes?: number;
  listKey?: string;
  // What the card says the task will be ("Today", "Thu 23 Oct at 14:00", "Brain Dump").
  label: string;
}

export function newTaskTarget(where: NewTaskWhere): DetailsTarget {
  const now = new Date().toISOString();
  const task: Task = {
    id: generateId(),
    title: '',
    completed: false,
    createdAt: now,
    updatedAt: now,
    ...(where.listKey ? { listKey: where.listKey } : {}),
    ...(where.dueDate ? { dueDate: where.dueDate } : {}),
    ...(where.dueDate && where.startTime ? { startTime: where.startTime } : {}),
    ...(where.durationMinutes && where.durationMinutes > 0 ? { durationMinutes: where.durationMinutes } : {}),
  };
  return { task, projected: false, draft: true, where: where.label };
}
