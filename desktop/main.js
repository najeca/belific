'use strict';
// Belific desktop shell (decisions 009, 010, 011). Loads the static Expo web
// export from mobile/dist through a privileged app:// protocol (never
// file://, never a public URL) and owns the app's data on disk.
const { app, BrowserWindow, Menu, protocol, net, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { KvStore } = require('./src/kvstore');
const { backupNow, dayStamp } = require('./src/backups');
const { resolveAssetPath } = require('./src/assetPath');

const IS_DEV = process.argv.includes('--dev');
const DEV_URL = 'http://localhost:8081/';
const APP_ORIGIN = 'app://belific/';
const EXPORT_DIR = path.join(__dirname, '..', 'mobile', 'dist');
const SUPABASE_HOST = 'https://uucycebkpgwbktdytxvr.supabase.co';
const CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `connect-src 'self' ${SUPABASE_HOST}`,
].join('; ');

// Dev must never touch real data (the dev seed writes fake events).
if (IS_DEV) app.setPath('userData', app.getPath('userData') + '-dev');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let store;
let mainWindow = null;
let backupTimer = null;

function paths() {
  const userData = app.getPath('userData');
  return {
    data: path.join(userData, 'data'),
    backups: path.join(userData, 'backups'),
    logs: path.join(userData, 'logs'),
  };
}

function log(message) {
  try {
    const { logs } = paths();
    fs.mkdirSync(logs, { recursive: true });
    fs.appendFileSync(path.join(logs, 'main.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never crash the app.
  }
}

function appVersion() {
  try {
    const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mobile', 'app.json'), 'utf8'));
    return appJson.expo.version;
  } catch {
    return app.getVersion();
  }
}

function trustedSender(event) {
  const url = (event.senderFrame && event.senderFrame.url) || '';
  return IS_DEV ? url.startsWith(DEV_URL) : url.startsWith(APP_ORIGIN);
}

function registerIpc() {
  const guard = (handler) => (event, ...args) => {
    if (!trustedSender(event)) throw new Error('Untrusted sender');
    return handler(...args);
  };
  ipcMain.handle('kv:getItem', guard((key) => store.getItem(key)));
  ipcMain.handle('kv:setItem', guard((key, value) => store.setItem(key, value)));
  ipcMain.handle('kv:removeItem', guard((key) => store.removeItem(key)));
  ipcMain.handle('kv:multiRemove', guard((keys) => store.multiRemove(keys)));
  ipcMain.on('desktop:version', (event) => {
    event.returnValue = trustedSender(event) ? appVersion() : '';
  });
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const file = resolveAssetPath(EXPORT_DIR, url.pathname);
    if (!file) return new Response('Not found', { status: 404 });
    const upstream = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(upstream.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(upstream.body, { status: upstream.status, headers });
  });
}

async function runBackup() {
  try {
    const { data, backups } = paths();
    await backupNow(data, backups, new Date(), 14);
  } catch (err) {
    log(`backup failed: ${err.stack || err}`);
  }
}

async function exportData() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Belific data',
    defaultPath: path.join(app.getPath('documents'), `belific-export-${dayStamp(new Date())}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return;
  try {
    const keys = await store.readAll();
    const payload = { app: 'Belific', version: appVersion(), exportedAt: new Date().toISOString(), keys };
    await fs.promises.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    log(`export failed: ${err.stack || err}`);
    dialog.showErrorBox('Export failed', String(err.message || err));
  }
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Export data…', click: () => exportData() },
        {
          label: 'Open backups folder',
          click: () => {
            fs.mkdirSync(paths().backups, { recursive: true });
            shell.openPath(paths().backups);
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        ...(IS_DEV ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Belific',
    backgroundColor: '#F0EEE8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const allowed = (url) => (IS_DEV ? url.startsWith(DEV_URL) : url.startsWith(APP_ORIGIN));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!allowed(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(IS_DEV ? DEV_URL : APP_ORIGIN);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    const { data } = paths();
    store = new KvStore(data, (err, context) => log(`kv error (${context}): ${err.stack || err}`));
    registerIpc();
    if (!IS_DEV) registerAppProtocol();
    buildMenu();
    createWindow();
    runBackup();
    backupTimer = setInterval(runBackup, 24 * 60 * 60 * 1000);
  });

  app.on('window-all-closed', () => {
    if (backupTimer) clearInterval(backupTimer);
    app.quit();
  });
}
