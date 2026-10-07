import { useEffect, useState } from 'react';
import { DEFAULT_DAY_START, dayStartMinutes } from '../../lib/dayStart';

// "My day starts at" (decision 024), read from the main process settings and
// refreshed when the Settings modal changes it. Minutes since midnight.
export const DAY_START_EVENT = 'belific:settings';

export function useDayStart(): number {
  const [value, setValue] = useState<string>(DEFAULT_DAY_START);
  useEffect(() => {
    let alive = true;
    const load = () => {
      globalThis.belificDesktop?.settings
        .get()
        .then((s) => alive && setValue(s.dayStart))
        .catch(() => {});
    };
    load();
    window.addEventListener(DAY_START_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(DAY_START_EVENT, load);
    };
  }, []);
  return dayStartMinutes(value);
}
