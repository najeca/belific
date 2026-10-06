'use strict';
// Sandboxed preload: the only thing the page can see of Electron is the
// small allow list below (decision 010). Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');

const kv = {
  getItem: (key) => ipcRenderer.invoke('kv:getItem', key),
  setItem: (key, value) => ipcRenderer.invoke('kv:setItem', key, value),
  removeItem: (key) => ipcRenderer.invoke('kv:removeItem', key),
  multiRemove: (keys) => ipcRenderer.invoke('kv:multiRemove', keys),
};

// The Supabase session lives here, encrypted by the main process (decision 012).
const secureKv = {
  getItem: (key) => ipcRenderer.invoke('secure:getItem', key),
  setItem: async (key, value) => {
    await ipcRenderer.invoke('secure:setItem', key, value);
  },
  removeItem: (key) => ipcRenderer.invoke('secure:removeItem', key),
};

const auth = {
  status: () => ipcRenderer.invoke('auth:status'),
  // Main opens the url in the system browser (after the one-time backup).
  begin: (url) => ipcRenderer.invoke('auth:begin', url),
  cancel: () => ipcRenderer.invoke('auth:cancel'),
  // Called with { code, flowId } for a validated callback, or { error: true }.
  onCallback: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('auth:callback', handler);
    return () => ipcRenderer.removeListener('auth:callback', handler);
  },
};

const settings = {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (partial) => ipcRenderer.invoke('settings:set', partial),
};

// The next 48 hours of notifiable items (decision 017). Main owns the timers.
const notify = {
  update: (payload) => ipcRenderer.invoke('notify:update', payload),
  // Main asks the page to sync and resend while its window is hidden in the tray.
  onTick: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('notify:tick', handler);
    return () => ipcRenderer.removeListener('notify:tick', handler);
  },
};

const actions = {
  exportData: () => ipcRenderer.invoke('desktop:exportData'),
  openBackups: () => ipcRenderer.invoke('desktop:openBackups'),
};

contextBridge.exposeInMainWorld('belificDesktop', {
  kv,
  secureKv,
  auth,
  settings,
  notify,
  actions,
  version: ipcRenderer.sendSync('desktop:version'),
});
