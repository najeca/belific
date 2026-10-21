import AsyncStorage from '@react-native-async-storage/async-storage';

// Single key/value entry point for all app data (decision 011). On the
// Windows desktop app the Electron preload exposes `belificDesktop.kv`,
// backed by files in the main process (atomic writes, daily backups). On
// iOS and everywhere else it is plain AsyncStorage, so nothing changes
// there. Never use window.localStorage for app data: it is tied to the
// page origin, has a small quota, and loses writes without telling anyone.
export interface KvStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
}

// Desktop settings kept in the main process (decisions 017 and 020).
export interface DesktopSettings {
  notifyEvents: boolean;
  notifyTasks: boolean;
  dailyReminder: boolean;
  dailyTime: string;
  // Part B (P5): the reminders a timed task gets unless it has its own list, as whole minutes
  // before the start (0 = at the start). Per computer, never synced.
  defaultReminders: number[];
  // "My day starts at": where the Timebox opens, 'HH:mm' in 30 minute steps.
  dayStart: string;
  // The "N days in a row" line on repeating tasks (checkpoint 11). Desktop only, never synced.
  showStreaks: boolean;
  // "Vibrant task colours": saturated blocks with white text on the Calendar and the Timebox. Per computer, never synced.
  vibrantColours: boolean;
  closeToTray: boolean;
  startWithWindows: boolean;
  trayNoteShown: boolean;
}

// The next 48 hours of notifiable items, sent to the main process.
export interface NotifyPayload {
  events: Array<{ id: string; title: string; icon: string; start: number }>;
  // `slot`: the time ('HH:mm') of every time of a task after its first (Part C), so each has its own timers.
  placed: Array<{ id: string; title: string; start: number; completed: boolean; slot?: string; reminderMinutes?: number; reminders?: number[] }>;
  planned: Array<{ dueDate: string; completed: boolean; startTime?: string; reminderMinutes?: number; reminders?: number[] }>;
}

// What desktop/preload.js exposes (decisions 010, 012, 017). Everything but
// `kv` and `version` is optional so older shells still type check.
export interface BelificDesktop {
  kv: KvStore;
  version: string;
  // The Supabase session, encrypted by the main process (decision 012).
  secureKv: Pick<KvStore, 'getItem' | 'setItem' | 'removeItem'>;
  auth: {
    status(): Promise<{ persistent: boolean }>;
    begin(url: string): Promise<{ ok: boolean; reason?: string }>;
    // Reports the code exchange result; a failure keeps the sign in alive.
    finish(success: boolean): Promise<{ ended: boolean }>;
    cancel(): Promise<void>;
    onCallback(listener: (payload: { code?: string; flowId?: string | null; error?: boolean }) => void): () => void;
  };
  settings: {
    get(): Promise<DesktopSettings>;
    set(partial: Partial<DesktopSettings>): Promise<DesktopSettings>;
  };
  notify: {
    update(payload: NotifyPayload): Promise<void>;
    onTick(listener: () => void): () => void;
  };
  actions: {
    exportData(): Promise<void>;
    openBackups(): Promise<void>;
    // A labelled safety backup of the data folder. Resolves with the backup
    // folder's name once it exists on disk.
    backupNow(label: 'account-switch' | 'routine-convert'): Promise<string>;
    // Is the Chromium and Electron licences file in the app folder? (About, checkpoint 9)
    licensesAvailable?(): Promise<boolean>;
    openLicenses?(): Promise<void>;
  };
  // The app menu asks the page to show a view (File, Settings).
  menu?: {
    onOpenSettings(listener: () => void): () => void;
    // File, Progress (checkpoint 11).
    onOpenProgress?(listener: () => void): () => void;
  };
  // Imported calendar subscriptions (build plan phase 8): main fetches the link.
  ics?: {
    fetch(url: string): Promise<{ ok: true; text: string; finalHost: string } | { ok: false; reason: string }>;
  };
}

declare global {
  // Set by desktop/preload.js. Absent on iOS and in a plain browser.
  // eslint-disable-next-line no-var
  var belificDesktop: BelificDesktop | undefined;
}

function backend(): KvStore {
  return globalThis.belificDesktop?.kv ?? AsyncStorage;
}

export const kv: KvStore = {
  getItem: (key) => backend().getItem(key),
  setItem: (key, value) => backend().setItem(key, value),
  removeItem: (key) => backend().removeItem(key),
  multiRemove: (keys) => backend().multiRemove(keys),
};

// The Supabase session store: encrypted by the main process on the desktop,
// plain kv (AsyncStorage) on iOS, exactly as before.
export const authStorage: Pick<KvStore, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem: (key) => (globalThis.belificDesktop?.secureKv ?? kv).getItem(key),
  setItem: (key, value) => (globalThis.belificDesktop?.secureKv ?? kv).setItem(key, value),
  removeItem: (key) => (globalThis.belificDesktop?.secureKv ?? kv).removeItem(key),
};
