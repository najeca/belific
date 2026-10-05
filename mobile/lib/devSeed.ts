import { kv } from './kv';
import type { CustomEvent } from './types';
import { formatDateKey } from './data';

const DEV_SEED_KEY = 'belific_dev_seed_v1';

export async function seedDevEvents(): Promise<void> {
  if (!__DEV__) return;

  const already = await kv.getItem(DEV_SEED_KEY);
  if (already === 'true') return;

  const today = formatDateKey(new Date());

  const raw: Omit<CustomEvent, 'id' | 'updatedAt'>[] = [
    { title: 'Morning routine',  category: 'routine',  icon: '🌅', start: '07:00', end: '07:30', notes: '', date: today },
    { title: 'Breakfast',        category: 'free',     icon: '🍳', start: '07:30', end: '08:00', notes: '', date: today },
    { title: 'Gym session',      category: 'fitness',  icon: '💪', start: '08:00', end: '09:00', notes: '', date: today },
    { title: 'Shower & get ready', category: 'hygiene', icon: '🚿', start: '09:00', end: '09:30', notes: '', date: today },
    { title: 'Deep work block',  category: 'project',  icon: '💻', start: '10:00', end: '12:00', notes: '', date: today },
    { title: 'Lunch',            category: 'free',     icon: '🥗', start: '12:00', end: '12:30', notes: '', date: today },
    { title: 'Study session',    category: 'cyber',    icon: '📚', start: '13:00', end: '14:30', notes: '', date: today },
    { title: 'Walk outside',     category: 'fitness',  icon: '🚶', start: '15:00', end: '16:00', notes: '', date: today },
    { title: 'Cook dinner',      category: 'chore',    icon: '🍳', start: '17:00', end: '17:30', notes: '', date: today },
    { title: 'Dinner',           category: 'free',     icon: '🍽️', start: '18:00', end: '19:00', notes: '', date: today },
    { title: 'Wind down',        category: 'winddown', icon: '🌙', start: '20:00', end: '20:30', notes: '', date: today },
    { title: 'Brush teeth',      category: 'hygiene',  icon: '🦷', start: '21:00', end: '21:05', notes: '', date: today },
    // Sleep end corrected from 21:00 (before start) to 23:59 — same-day model cannot span midnight
    { title: 'Sleep',            category: 'sleep',    icon: '😴', start: '21:05', end: '23:59', notes: '', date: today },
  ];

  const events: CustomEvent[] = raw.map((fields, i) => ({
    ...fields,
    id: `dev-seed-${i}`,
    updatedAt: new Date().toISOString(),
  }));

  const existing = await kv.getItem('belific_custom_events');
  const parsed: CustomEvent[] = existing ? (JSON.parse(existing) as CustomEvent[]) : [];
  const merged = [...parsed, ...events];
  await kv.setItem('belific_custom_events', JSON.stringify(merged));
  await kv.setItem(DEV_SEED_KEY, 'true');
}
