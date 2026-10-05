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

declare global {
  // Set by desktop/preload.js. Absent on iOS and in a plain browser.
  // eslint-disable-next-line no-var
  var belificDesktop: { kv: KvStore; version: string } | undefined;
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
