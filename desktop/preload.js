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

contextBridge.exposeInMainWorld('belificDesktop', {
  kv,
  version: ipcRenderer.sendSync('desktop:version'),
});
