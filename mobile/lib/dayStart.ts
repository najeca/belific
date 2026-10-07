// "My day starts at" (checkpoint 8.4, decision 024). The Timebox shows the whole
// day, 00:00 to 24:00; this setting only decides where it OPENS, so a night
// shift worker can start their day at 20:00 and a day worker at 05:00. It is
// UI state in the main process store, never synced. Pure, no runtime imports;
// see dayStart.test.ts. Times are 'HH:mm' text; minutes are since midnight.

export const DEFAULT_DAY_START = '05:00';
const STEP = 30;
const HM_30 = /^([01]\d|2[0-3]):(00|30)$/;

// Every choice: 00:00, 00:30, ... 23:30.
export const DAY_START_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const m = i * STEP;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

// A valid setting is a time in 30 minute steps; anything else is not.
export function isDayStart(value: unknown): value is string {
  return typeof value === 'string' && HM_30.test(value);
}

export function dayStartMinutes(value: unknown): number {
  const v = isDayStart(value) ? value : DEFAULT_DAY_START;
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}

// Where the Timebox opens, in minutes since midnight (the time that sits at the
// top of the scroll area).
//  - any day other than today: the day start.
//  - today: about one hour before the current time, but never earlier than the
//    day start once the day has started. Before the day start (the small hours
//    of a night shift, say) it is just one hour before now.
export function openingMinutes(opts: { isToday: boolean; nowMin: number; dayStartMin: number }): number {
  const { isToday, nowMin, dayStartMin } = opts;
  if (!isToday) return dayStartMin;
  const ahead = Math.max(0, nowMin - 60);
  return nowMin >= dayStartMin ? Math.max(dayStartMin, ahead) : ahead;
}
