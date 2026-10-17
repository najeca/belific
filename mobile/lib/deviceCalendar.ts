// The iPhone's own calendars, read only (build plan phase 8, step 1). Every
// account on the phone (iCloud, Google, Outlook, Exchange) is already in the
// phone's calendar database, so no server and no sign in is needed.
//
// Events are read for the month on screen, kept in memory only, never stored,
// never synced and never written back. Belific never creates, changes or
// deletes a calendar event. Permission is asked only when the person presses
// "Show my calendars" (Calendar tab or Settings), never at launch.
//
// expo-calendar is a native module: this works only in a build that includes
// it (the TestFlight build after 2.25.0). The pure mapping is externalEvents.ts.
import { Linking, Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import { fromDeviceEvent, rangeOf } from './externalEvents';
import type { Occurrence } from './icsParse';

export type CalendarAccess = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface DeviceOccurrence extends Occurrence {
  calendarName: string;
  color: string;
}

function accessOf(status: string | undefined): CalendarAccess {
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

// The current state, without asking.
export async function calendarAccess(): Promise<CalendarAccess> {
  if (Platform.OS !== 'ios') return 'unavailable';
  try {
    return accessOf((await Calendar.getCalendarPermissionsAsync()).status);
  } catch {
    return 'unavailable';
  }
}

// Asks once (iOS shows its own prompt with the NSCalendars usage text). After a
// "Don't Allow" iOS never asks again; the person turns it on in Settings.
export async function askCalendarAccess(): Promise<CalendarAccess> {
  if (Platform.OS !== 'ios') return 'unavailable';
  try {
    return accessOf((await Calendar.requestCalendarPermissionsAsync()).status);
  } catch {
    return 'unavailable';
  }
}

export function openPhoneSettings(): void {
  Linking.openSettings().catch(() => {});
}

// Every event of every calendar on the phone between two days (inclusive).
export async function loadDeviceEvents(firstKey: string, lastKey: string): Promise<DeviceOccurrence[]> {
  if (Platform.OS !== 'ios') return [];
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return [];
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const { fromMs, toMs } = rangeOf(firstKey, lastKey);
  const events = await Calendar.getEventsAsync(
    calendars.map((c) => c.id),
    new Date(fromMs),
    new Date(toMs),
  );
  const out: DeviceOccurrence[] = [];
  for (const e of events) {
    const o = fromDeviceEvent({ id: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate, allDay: e.allDay, calendarId: e.calendarId });
    if (!o) continue;
    const cal = byId.get(e.calendarId);
    out.push({ ...o, calendarName: cal?.title ?? 'Calendar', color: cal?.color ?? '#6E6C64' });
  }
  return out;
}

export const DEVICE_CALENDAR_TEXT = {
  askTitle: 'Show your iPhone calendar events here?',
  askBody: 'Belific can show the events from the calendars on this iPhone (iCloud, Google, Outlook) beside your tasks. It only reads them: it never changes, copies or uploads them.',
  askButton: 'Show my calendars',
  notNow: 'Not now',
  deniedTitle: 'Calendar access is off',
  deniedBody: 'To see your iPhone calendars here, allow Belific in the iPhone Settings app: Belific, Calendars, Full Access. Everything else in Belific works without it.',
  openSettings: 'Open Settings',
  granted: 'Showing events from the calendars on this iPhone. Read only.',
  unavailable: 'This version of the app cannot read the iPhone calendar.',
} as const;
