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
    cancel(): Promise<void>;
    onCallback(listener: (payload: { code?: string; flowId?: string | null; error?: boolean }) => void): () => void;
  };
  actions: {
    exportData(): Promise<void>;
    openBackups(): Promise<void>;
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
