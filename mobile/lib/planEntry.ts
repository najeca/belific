// F1 of PLAN_daily_flow: the Plan button in the top bar. Pure: NO runtime imports; see planEntry.test.ts.
//
// One button opens the flow that fits the time of day, and a small menu next to it always offers the other one:
//   * Plan my day in the morning (04:00 to 13:59),
//   * Wrap up (the old Shut down my day) from 14:00 to 03:59.
// Plan week is not built yet, so it is not listed.
export type PlanFlow = 'planning' | 'shutdown';

export const PLAN_LABEL: Record<PlanFlow, string> = { planning: 'Plan my day', shutdown: 'Wrap up' };

export const MORNING_FROM_HOUR = 4;
export const EVENING_FROM_HOUR = 14;

export function planFlowFor(hour: number): PlanFlow {
  return hour >= MORNING_FROM_HOUR && hour < EVENING_FROM_HOUR ? 'planning' : 'shutdown';
}

export const otherFlow = (f: PlanFlow): PlanFlow => (f === 'planning' ? 'shutdown' : 'planning');

// Below this window width the Analytics text button moves into the Plan menu, so the top row never wraps. It also moves
// when the centre pane's top row is too narrow to hold it beside the Plan button and the avatar (all three panes open on
// a 1440 px window leave the centre about 770 px): `rowWidth` is that row's measured width, 0 when it is not known.
export const ANALYTICS_IN_MENU_BELOW_PX = 1100;
export const TOP_ROW_NEEDS_PX = 880;
export const analyticsInMenu = (windowWidth: number, rowWidth = 0): boolean => windowWidth < ANALYTICS_IN_MENU_BELOW_PX || (rowWidth > 0 && rowWidth < TOP_ROW_NEEDS_PX);

// F1 (2): the "Free time" line at the foot of a day column is a setting, off by default (user_settings row).
export const FREE_TIME_LINE_KEY = 'board.free_time_line';
export const parseFreeTimeLine = (value: unknown): boolean => value === 'true' || value === true;
