// The words of the phone's Now card on Today (PLAN_phone_stepflow section 2, 3.60.0). Pure: NO runtime imports besides
// siblings; see nowCard.test.ts.
//
//  * Now: an item running at this minute. A quick reminder (no length) is never Now. A free time block (a break) running
//    now gives "Free time", unless a task is running inside it, which is then Now.
//  * Next: the first item starting after this minute (a reminder can be Next). "in <time>" is the time until it starts.
//  * Nothing left today: "Nothing else today". Nothing at all: "A free day".
import { formatTime } from './data.ts';

export interface NowCardItem {
  key: string;
  title: string;
  startMin: number;
  endMin: number;
  // A time with no length (lib/quickReminder.ts).
  reminder: boolean;
  // A free time block (a break, `cutsBelow`).
  free: boolean;
  done: boolean;
}

export interface NowCard {
  // What is running now (never a reminder, never a free time block), or null.
  now: NowCardItem | null;
  // The pill: true when it says "Free time" (nothing running, or only a free time block).
  free: boolean;
  // The free time block running now, for its name.
  freeBlock: NowCardItem | null;
  // "2:00pm to 3:00pm".
  range: string;
  // "25 min left".
  left: string;
  // "Next: Call Mum at 3:30pm, in 55 min", "Nothing else today" or "A free day".
  nextLine: string;
  next: NowCardItem | null;
}

// "5 min", "1 h", "1 h 20 min".
export function minutesWords(total: number): string {
  const m = Math.max(0, Math.round(total));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function hhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function nowCard(items: NowCardItem[], nowMin: number): NowCard {
  const open = items.filter((i) => !i.done);
  const running = open.filter((i) => !i.reminder && i.startMin <= nowMin && nowMin < i.endMin);
  // The innermost: the latest start (a task inside a shift or a break is Now, not its host).
  const pick = (list: NowCardItem[]) => [...list].sort((a, b) => b.startMin - a.startMin || a.endMin - b.endMin)[0] ?? null;
  const now = pick(running.filter((i) => !i.free));
  const freeBlock = now ? null : pick(running.filter((i) => i.free));
  const next = [...open].filter((i) => i.startMin > nowMin).sort((a, b) => a.startMin - b.startMin || a.title.localeCompare(b.title))[0] ?? null;
  let nextLine: string;
  if (next) nextLine = `Next: ${next.title} at ${formatTime(hhmm(next.startMin))}, in ${minutesWords(next.startMin - nowMin)}`;
  else nextLine = items.length === 0 ? 'A free day' : 'Nothing else today';
  return {
    now,
    free: !now,
    freeBlock,
    range: now ? `${formatTime(hhmm(now.startMin))} to ${formatTime(hhmm(now.endMin))}` : '',
    left: now ? `${minutesWords(now.endMin - nowMin)} left` : '',
    nextLine,
    next,
  };
}
