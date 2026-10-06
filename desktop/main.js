'use strict';
// Belific desktop shell (decisions 009, 010, 011). Loads the static Expo web
// export from mobile/dist through a privileged app:// protocol (never
// file://, never a public URL) and owns the app's data on disk.
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  nativeImage,
  powerMonitor,
  protocol,
  net,
  ipcMain,
  dialog,
  shell,
  safeStorage,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { KvStore } = require('./src/kvstore');
const { backupNow, dayStamp } = require('./src/backups');
const { resolveAssetPath } = require('./src/assetPath');
const { checkAuthorizeUrl, SCHEME, WINDOW_MS } = require('./src/authLink');
const { SignIn } = require('./src/signin');
const { isAllowedExternal } = require('./src/externalLinks');
const { assertRendererKey } = require('./src/ipcPolicy');
const { SecureStore } = require('./src/secureStore');
const { ensureFirstSigninBackup } = require('./src/firstSignin');
const { Scheduler } = require('./src/scheduler');
const { DEFAULTS, loadSettings, saveSettings, sanitize, loginItemOptions } = require('./src/settings');

const IS_DEV = process.argv.includes('--dev');
const DEV_URL = 'http://localhost:8081/';
const APP_ORIGIN = 'app://belific/';
// Packaged by electron-builder the web export sits beside app.asar in resources/web.
const EXPORT_DIR = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'mobile', 'dist');
const APP_USER_MODEL_ID = 'com.najeca.belific.desktop';
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');
const TRAY_ICON_PATH = path.join(__dirname, 'assets', 'tray.png');
const HIDDEN_TICK_MS = 120 * 1000;
const SUPABASE_HOST = 'https://uucycebkpgwbktdytxvr.supabase.co';
const CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `connect-src 'self' ${SUPABASE_HOST}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Windows only shows toast notifications for an app that has an AppUserModelID
// (decision 017). The installer's shortcut carries the same id.
app.setAppUserModelId(APP_USER_MODEL_ID);

// Dev must never touch real data (the dev seed writes fake events).
if (IS_DEV) app.setPath('userData', app.getPath('userData') + '-dev');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let store;
let secure;
let signIn;
let signInTimer = null;
let mainWindow = null;
let backupTimer = null;
let tray = null;
let settings = { ...DEFAULTS };
let scheduler = null;
let hiddenTick = null;
let quitting = false;

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
  // The plain kv IPC refuses the encrypted session files and the first sign in
  // flag (cp6.1 L4).
  ipcMain.handle('kv:getItem', guard((key) => store.getItem(assertRendererKey(key))));
  ipcMain.handle('kv:setItem', guard((key, value) => store.setItem(assertRendererKey(key), value)));
  ipcMain.handle('kv:removeItem', guard((key) => store.removeItem(assertRendererKey(key))));
  ipcMain.handle('kv:multiRemove', guard((keys) => store.multiRemove(Array.isArray(keys) ? keys.map(assertRendererKey) : keys)));
  // The Supabase session (decision 012): encrypted with safeStorage, memory
  // only if encryption is unavailable.
  ipcMain.handle('secure:getItem', guard((key) => secure.getItem(String(key))));
  ipcMain.handle('secure:setItem', guard((key, value) => secure.setItem(String(key), value)));
  ipcMain.handle('secure:removeItem', guard((key) => secure.removeItem(String(key))));
  ipcMain.handle('auth:status', guard(() => ({ persistent: secure.persistent })));
  ipcMain.handle('auth:begin', guard((url) => beginSignIn(url)));
  ipcMain.handle('auth:finish', guard((success) => signIn.finish(success === true)));
  ipcMain.handle('auth:cancel', guard(() => signIn.cancel()));
  ipcMain.handle('desktop:backupNow', guard((label) => backupForRenderer(label)));
  ipcMain.handle('settings:get', guard(() => settings));
  ipcMain.handle('settings:set', guard((partial) => changeSettings(partial)));
  ipcMain.handle('notify:update', guard((payload) => scheduler.update(payload)));
  ipcMain.handle('desktop:exportData', guard(() => exportData()));
  ipcMain.handle('desktop:openBackups', guard(() => openBackupsFolder()));
  ipcMain.on('desktop:version', (event) => {
    event.returnValue = trustedSender(event) ? appVersion() : '';
  });
}

// Opens the Apple sign in page in the SYSTEM browser, never in the app
// window. Refuses any URL that is not the Belific Supabase authorize URL, and
// takes the one-time "pre-signin" backup before the very first sign in.
async function beginSignIn(url) {
  signIn.sweep();
  if (signIn.gate.active) return { ok: false, reason: 'busy' };
  if (!checkAuthorizeUrl(String(url), SUPABASE_HOST) || !isAllowedExternal(String(url))) {
    signIn.cancel();
    return { ok: false, reason: 'refused' };
  }
  try {
    const { data, backups } = paths();
    await ensureFirstSigninBackup({
      kv: store,
      backup: (label, now) => backupNow(data, backups, now, 14, label),
    });
  } catch (err) {
    log(`pre-signin backup failed: ${err.stack || err}`);
    signIn.cancel();
    return { ok: false, reason: 'backup-failed' };
  }
  const begun = signIn.begin(String(url));
  if (!begun.ok) return begun;
  try {
    await shell.openExternal(String(url));
  } catch {
    signIn.cancel();
    return { ok: false, reason: 'no-browser' };
  }
  // Expiry wipes the verifier even if no link ever arrives.
  clearTimeout(signInTimer);
  signInTimer = setTimeout(() => signIn.sweep(), WINDOW_MS + 1000);
  return { ok: true };
}

// A belific:// link, from the first launch arguments or a second instance.
// Only the exact callback of a sign in started in this run is forwarded; the
// link itself is never logged.
function handleDeepLink(raw) {
  const result = signIn.onLink(raw);
  if (!result.ok) {
    log(`auth link ignored (${result.reason})`);
    if (result.reason === 'provider-error' && mainWindow) mainWindow.webContents.send('auth:callback', { error: true });
    return;
  }
  if (mainWindow) {
    mainWindow.webContents.send('auth:callback', { code: result.code, flowId: result.flowId });
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

// A labelled safety backup asked for by the page (account switching). Only
// this one label is allowed.
async function backupForRenderer(label) {
  if (label !== 'account-switch') throw new Error('Unknown backup label');
  const { data, backups } = paths();
  await backupNow(data, backups, new Date(), 14, label);
}

function linkFromArgv(argv) {
  return (argv || []).find((a) => typeof a === 'string' && a.toLowerCase().startsWith(`${SCHEME}://`));
}

function registerProtocolClient() {
  // Tests set this so they never touch the real Windows protocol registration.
  if (process.env.BELIFIC_NO_PROTOCOL_REGISTER === '1') return;
  if (process.defaultApp) {
    // Dev mode (electron.exe main.js): Windows needs the script path too.
    if (process.argv.length >= 2) app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(SCHEME);
  }
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

function openBackupsFolder() {
  fs.mkdirSync(paths().backups, { recursive: true });
  return shell.openPath(paths().backups);
}

// ----- notifications, tray and window (decision 017, checkpoint 7) -----

function showWindow() {
  if (!mainWindow) {
    createWindow(true);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showToast({ title, body, kind }) {
  if (!Notification.isSupported()) {
    log('notifications are not supported here');
    return;
  }
  const toast = new Notification({ title, body, icon: ICON_PATH, silent: false });
  toast.on('click', showWindow);
  toast.show();
  log(`toast shown (${kind})`);
}

function quitApp() {
  quitting = true;
  app.quit();
}

function createTray() {
  if (tray) return;
  const image = nativeImage.createFromPath(TRAY_ICON_PATH);
  tray = new Tray(image);
  tray.setToolTip('Belific');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Belific', click: () => showWindow() },
      { type: 'separator' },
      { label: 'Quit Belific', click: () => quitApp() },
    ]),
  );
  tray.on('click', () => showWindow());
}

function applyLoginItem() {
  // Never write the Windows startup entry from an unpackaged (dev or test) run.
  if (!app.isPackaged || process.env.BELIFIC_NO_LOGIN_ITEM === '1') return;
  try {
    app.setLoginItemSettings(loginItemOptions(settings.startWithWindows, process.execPath));
  } catch (err) {
    log(`login item failed: ${err.message}`);
  }
}

async function changeSettings(partial) {
  const before = settings;
  settings = sanitize(partial, settings);
  await saveSettings(store, settings);
  scheduler.setSettings(settings);
  if (before.startWithWindows !== settings.startWithWindows) applyLoginItem();
  return settings;
}

// Closing the window keeps Belific running in the tray so timers survive.
function onWindowClose(event) {
  if (quitting || !settings.closeToTray) return;
  event.preventDefault();
  mainWindow.hide();
  if (!settings.trayNoteShown) {
    changeSettings({ trayNoteShown: true }).catch((err) => log(`settings save failed: ${err.message}`));
    showToast({
      kind: 'tray-note',
      title: 'Belific is still running',
      body: 'It stays in the system tray so your reminders keep working. Quit from the tray icon, or change this in Settings.',
    });
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
          click: () => openBackupsFolder(),
        },
        { type: 'separator' },
        { label: 'Quit Belific', accelerator: 'Ctrl+Q', click: () => quitApp() },
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

function createWindow(visible = true) {
  const startHidden = !visible || (process.argv.includes('--hidden') && settings.closeToTray);
  mainWindow = new BrowserWindow({
    show: !startHidden,
    icon: ICON_PATH,
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
    if (isAllowedExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('close', onWindowClose);
  // Windows logoff or shutdown must never be blocked by close-to-tray.
  mainWindow.on('session-end', () => {
    quitting = true;
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(IS_DEV ? DEV_URL : APP_ORIGIN);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const link = linkFromArgv(argv);
    if (link) handleDeepLink(link);
    showWindow();
  });

  app.whenReady().then(async () => {
    const { data } = paths();
    store = new KvStore(data, (err, context) => log(`kv error (${context}): ${err.stack || err}`));
    secure = new SecureStore(
      store,
      {
        isAvailable: () => process.env.BELIFIC_FORCE_NO_SAFESTORAGE !== '1' && safeStorage.isEncryptionAvailable(),
        encrypt: (text) => safeStorage.encryptString(text),
        decrypt: (buf) => safeStorage.decryptString(buf),
      },
      (err, context) => log(`secure store error (${context}): ${err.message}`),
    );
    signIn = new SignIn(secure, SUPABASE_HOST, WINDOW_MS, (reason) => log(`sign in ended (${reason})`));
    settings = await loadSettings(store);
    scheduler = new Scheduler({ settings, notify: showToast, log });
    registerIpc();
    registerProtocolClient();
    if (!IS_DEV) registerAppProtocol();
    buildMenu();
    createTray();
    createWindow();
    applyLoginItem();
    const launchLink = linkFromArgv(process.argv);
    if (launchLink) handleDeepLink(launchLink);
    runBackup();
    backupTimer = setInterval(runBackup, 24 * 60 * 60 * 1000);
    // While the window is hidden in the tray the page does not poll, so ask it
    // to sync and resend the notification payload now and then.
    hiddenTick = setInterval(() => {
      if (mainWindow && !mainWindow.isVisible()) mainWindow.webContents.send('notify:tick');
    }, HIDDEN_TICK_MS);
    // After sleep, timers that should have fired are fired (or dropped if late).
    powerMonitor.on('resume', () => {
      scheduler.refresh();
      if (mainWindow) mainWindow.webContents.send('notify:tick');
    });
  });

  app.on('before-quit', () => {
    quitting = true;
    if (scheduler) scheduler.stop();
    if (hiddenTick) clearInterval(hiddenTick);
  });

  app.on('window-all-closed', () => {
    // With close-to-tray the window is hidden, not closed, so this only runs
    // when closing really means quitting.
    if (backupTimer) clearInterval(backupTimer);
    if (quitting || !settings.closeToTray) app.quit();
  });
}
