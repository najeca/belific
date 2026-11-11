// F1 of PLAN_daily_flow: the Plan button in the top bar. Pure: NO runtime imports; see planEntry.test.ts.
//
// One button opens the flow that fits the time of day, and a small menu next to it always offers the other one:
//   * Plan my day in the morning (04:00 to 13:59),
//   * Wrap up (the old Shut down my day) from 14:00 to 03:59.
// F5 (3.44.0): Plan week comes first on Sunday from 16:00 and on Monday from 04:00 until 13:59 (Monday afternoon goes
// back to Wrap up). The menu always lists all three.
import { addDays, dateKey } from './kanban.ts';
import { weekOf } from './clear.ts';

export type PlanFlow = 'planning' | 'shutdown' | 'week';

export const PLAN_LABEL: Record<PlanFlow, string> = { planning: 'Plan my day', shutdown: 'Wrap up', week: 'Plan week' };
export const PLAN_ICON: Record<PlanFlow, 'sunny-outline' | 'moon-outline' | 'calendar-outline'> = { planning: 'sunny-outline', shutdown: 'moon-outline', week: 'calendar-outline' };
export const WEEK_FROM_SUNDAY_HOUR = 16;

export const MORNING_FROM_HOUR = 4;
export const EVENING_FROM_HOUR = 14;

export function planFlowFor(hour: number): PlanFlow {
  return hour >= MORNING_FROM_HOUR && hour < EVENING_FROM_HOUR ? 'planning' : 'shutdown';
}

// The flow the button opens at this moment (local time): Plan week on Sunday evening and Monday morning.
export function planFlowAt(now: Date): PlanFlow {
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 0 && hour >= WEEK_FROM_SUNDAY_HOUR) return 'week';
  if (day === 1 && hour >= MORNING_FROM_HOUR && hour < EVENING_FROM_HOUR) return 'week';
  return planFlowFor(hour);
}

// The menu: the one the button opens first, then the others in the usual order. All three, always.
export const menuFlows = (first: PlanFlow): PlanFlow[] => [first, ...(['planning', 'shutdown', 'week'] as PlanFlow[]).filter((f) => f !== first)];

// The week Plan week is for, Monday to Sunday: on Sunday from 16:00 that is next week, otherwise this one.
export function weekToPlan(now: Date): string[] {
  const sundayEvening = now.getDay() === 0 && now.getHours() >= WEEK_FROM_SUNDAY_HOUR;
  return weekOf(dateKey(sundayEvening ? addDays(now, 1) : now));
}

// Below this window width the Analytics text button moves into the Plan menu, so the top row never wraps. It also moves
// when the centre pane's top row is too narrow to hold it beside the Plan button and the avatar (all three panes open on
// a 1440 px window leave the centre about 770 px): `rowWidth` is that row's measured width, 0 when it is not known.
export const ANALYTICS_IN_MENU_BELOW_PX = 1100;
export const TOP_ROW_NEEDS_PX = 880;
export const analyticsInMenu = (windowWidth: number, rowWidth = 0): boolean => windowWidth < ANALYTICS_IN_MENU_BELOW_PX || (rowWidth > 0 && rowWidth < TOP_ROW_NEEDS_PX);

// F1 (2): the "Free time" line at the foot of a day column is a setting, off by default (user_settings row).
export const FREE_TIME_LINE_KEY = 'board.free_time_line';
export const parseFreeTimeLine = (value: unknown): boolean => value === 'true' || value === true;
