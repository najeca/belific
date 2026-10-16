// Power feature toggles (build plan phase 7). Pure: NO runtime imports besides
// siblings; see features.test.ts.
//
// One user_settings row per toggle, key `feature.<name>`, value `on` or `off`
// (so it follows the person across devices, last write wins). OFF means the
// field or screen is hidden; nothing is deleted and the data stays: turn it on
// again and it is all there.
//
// Defaults keep today's screens exactly as they are: the features that already
// existed (reminders, priority, daily planning, analytics) default ON, the new
// ones (pomodoro, templates) default OFF so the everyday screen stays minimal.
// Attachments are not built: the toggle is a "coming later" row that cannot be
// switched on.
import type { UserSetting } from './types.ts';

export type FeatureKey = 'dueDates' | 'priority' | 'planning' | 'pomodoro' | 'templates' | 'analytics' | 'attachments';

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  emoji: string;
  hint: string;
  defaultOn: boolean;
  comingLater?: boolean;
}

export const FEATURES: FeatureDef[] = [
  { key: 'dueDates', label: 'Due dates and reminders', emoji: '🔔', hint: 'The reminder bell on a task and its Reminder option. Reminders you already set keep working.', defaultOn: true },
  { key: 'priority', label: 'Priority', emoji: '🚩', hint: 'The flag on a task and its Priority option.', defaultOn: true },
  { key: 'planning', label: 'Daily planning', emoji: '🌅', hint: 'Daily Planning and Daily Shutdown, their buttons and Ctrl+Shift+P.', defaultOn: true },
  { key: 'pomodoro', label: 'Pomodoro', emoji: '🍅', hint: 'Focus and break periods on the task timer.', defaultOn: false },
  { key: 'templates', label: 'Task templates', emoji: '📑', hint: 'Save a task as a template and start new tasks from one.', defaultOn: false },
  { key: 'analytics', label: 'Analytics', emoji: '📊', hint: 'The Analytics page in the profile menu.', defaultOn: true },
  { key: 'attachments', label: 'Attachments', emoji: '📎', hint: 'Files on a task. Coming later.', defaultOn: false, comingLater: true },
];

export const FEATURE_PREFIX = 'feature.';
export const featureSettingKey = (k: FeatureKey): string => `${FEATURE_PREFIX}${k}`;

export type FeatureMap = Record<FeatureKey, boolean>;

export function defaultFeatures(): FeatureMap {
  return Object.fromEntries(FEATURES.map((f) => [f.key, f.defaultOn])) as FeatureMap;
}

// `on` and `off` are the only values; anything else (a damaged or newer value)
// is the default. A feature that is not built can never be on.
export function parseFeature(def: FeatureDef, value: string | null | undefined): boolean {
  if (def.comingLater) return false;
  if (value === 'on') return true;
  if (value === 'off') return false;
  return def.defaultOn;
}

export function featuresFromSettings(settings: Array<Pick<UserSetting, 'key' | 'value' | 'deletedAt'>>): FeatureMap {
  const by = new Map(settings.filter((s) => !s.deletedAt).map((s) => [s.key, s.value]));
  return Object.fromEntries(FEATURES.map((f) => [f.key, parseFeature(f, by.get(featureSettingKey(f.key)))])) as FeatureMap;
}

export function featureValue(on: boolean): 'on' | 'off' {
  return on ? 'on' : 'off';
}
