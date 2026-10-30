// Hadir desktop: runs the Hadir server inside the app, on this computer only, and shows it in a window.
// Data lives in the user's own app-data folder. Nothing is sent anywhere.
'use strict';
const { app, BrowserWindow, Menu, shell, dialog, session, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const PORT = 3977;
let srv = null, win = null, port = PORT, lan = false;
const appRoot = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.resolve(__dirname, '..');
const iconPath = path.join(__dirname, 'build', 'icon.png');
const configFile = () => path.join(app.getPath('userData'), 'desktop.json');
const readConfig = () => { try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch { return {}; } };
const writeConfig = (c) => { try { fs.writeFileSync(configFile(), JSON.stringify(c)); } catch { /* not fatal */ } };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); } else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
}
app.setAppUserModelId('dz.hadir.desktop');

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

async function startServer() {
  const { createServer } = await import(pathToFileURL(path.join(appRoot, 'server', 'app.js')).href);
  const dataDir = path.join(app.getPath('userData'), 'data');
  srv = await createServer({ dataDir, desktop: true });
  const host = lan ? '0.0.0.0' : '127.0.0.1';
  try { await srv.app.listen(PORT, host); port = PORT; }
  catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    srv.app.server?.close();
    await srv.app.listen(0, host); port = srv.app.server.address().port;
  }
}

async function restartListener() {
  await srv.app.close();
  const host = lan ? '0.0.0.0' : '127.0.0.1';
  try { await srv.app.listen(port, host); } catch { await srv.app.listen(0, host); port = srv.app.server.address().port; }
  win?.loadURL(`http://127.0.0.1:${port}/app/`);
}

function buildMenu() {
  const t = [
    { label: 'Hadir', submenu: [
      { label: 'Open my data folder', click: () => shell.openPath(path.join(app.getPath('userData'), 'data')) },
      { label: 'Back up now', click: async () => {
        try { const f = srv.engine.backup('manual'); dialog.showMessageBox(win, { type: 'info', message: 'Backup saved', detail: f }); }
        catch (e) { dialog.showErrorBox('Backup failed', String(e.message || e)); }
      } },
      { type: 'separator' },
      { label: 'Let other devices on this network connect', type: 'checkbox', checked: lan, click: async (item) => {
        lan = item.checked; writeConfig({ ...readConfig(), lan });
        await restartListener();
        if (lan) dialog.showMessageBox(win, { type: 'info', message: 'Other devices can now connect', detail: `On this network: ${lanAddresses().map((a) => `http://${a}:${port}`).join('\n') || 'no network found'}\n\nPhones only sign class codes on a secure https address. For students, set a public https address in Settings.` });
      } },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 880, minWidth: 980, minHeight: 640, title: 'Hadir · حاضر', backgroundColor: '#F1F2F0',
    icon: fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false },
  });
  const origin = `http://127.0.0.1:${port}`;
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  win.loadURL(`${origin}/app/`);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  if (!gotLock) return;
  lan = !!readConfig().lan;
  // Only this app's own pages may use the camera; every other permission is refused.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media' && wc.getURL().startsWith(`http://127.0.0.1:${port}`)));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media');
  try { await startServer(); }
  catch (e) { dialog.showErrorBox('Hadir could not start', `${e.message || e}\n\nHadir needs the database engine built into this version of the app.`); app.quit(); return; }
  buildMenu(); createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
let closing = false;
app.on('before-quit', async (e) => { if (srv && !closing) { closing = true; e.preventDefault(); try { await srv.stop(); } catch { /* closing anyway */ } app.exit(0); } });
