'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, clipboard, powerMonitor, shell, dialog } = require('electron');
const { Store } = require('./store');
const { WidgetWindows } = require('./windows');
const { Runtime } = require('./runtime');
const registry = require('../shared/registry');
const apps = require('./apps');
const weather = require('./weather').createWeatherService();

app.setName('Morrow');
// A separate data folder (used for development and tests) also gets its own
// single-instance lock, so it can run beside the everyday copy.
if (process.env.MORROW_DATA_DIR) app.setPath('userData', path.resolve(process.env.MORROW_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.quit();

let store;
let windows;
let tray;
let settingsWin = null;
let images;
let movies;
const runtime = new Runtime();

// Settings window ----------------------------------------------------------

function openSettings(focusWidgetId) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (focusWidgetId) settingsWin.webContents.send('morrow:focus-widget', focusWidgetId);
    settingsWin.show();
    settingsWin.focus();
    app.focus({ steal: true });
    return;
  }
  settingsWin = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    title: 'Morrow',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'), { query: focusWidgetId ? { widget: focusWidgetId } : {} });
  settingsWin.once('ready-to-show', () => { settingsWin.show(); app.focus({ steal: true }); });
  settingsWin.on('closed', () => { settingsWin = null; });
}

function sendDoc() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('morrow:doc', store.doc);
}

// Adding widgets -----------------------------------------------------------

function addWidget(type) {
  const t = registry.TYPES[type];
  if (!t) return null;
  // Place new widgets near the cursor's display, cascading so they don't stack exactly.
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const n = store.widgets.length % 8;
  const bounds = {
    x: Math.round(area.x + area.width / 2 - t.size.width / 2 + n * 26 - 90),
    y: Math.round(area.y + area.height / 3 - t.size.height / 2 + n * 26 - 60),
    ...t.size,
  };
  const w = store.addWidget(type, bounds);
  if (!store.doc.settings.widgetsVisible) store.updateSettings({ widgetsVisible: true });
  return w;
}

// Menus ---------------------------------------------------------------------

function addWidgetMenu() {
  return Object.entries(registry.TYPES).map(([type, t]) => ({ label: t.name, click: () => addWidget(type) }));
}

function layoutMenu() {
  return store.doc.layouts.map((l) => ({
    label: l.name,
    type: 'radio',
    checked: l.id === store.doc.activeLayoutId,
    click: () => store.switchLayout(l.id),
  }));
}

function widgetContextMenu(id, extra = []) {
  const w = store.widget(id);
  if (!w) return;
  const s = store.doc.settings;
  const menu = Menu.buildFromTemplate([
    ...extra,
    ...(extra.length ? [{ type: 'separator' }] : []),
    { label: 'Customize…', click: () => openSettings(id) },
    { label: 'Duplicate', click: () => store.duplicateWidget(id) },
    { label: 'Hide', click: () => store.updateWidget(id, { visible: false }) },
    { type: 'separator' },
    desktopToggle(),
    { label: 'Lock Positions', type: 'checkbox', checked: !!s.locked, click: () => store.updateSettings({ locked: !s.locked }) },
    { label: 'Snap to Edges', type: 'checkbox', checked: !!s.snapping, click: () => store.updateSettings({ snapping: !s.snapping }) },
    { label: 'Add Widget', submenu: addWidgetMenu() },
    { type: 'separator' },
    { label: 'Remove Widget', click: () => { runtime.forget(id); store.removeWidget(id); } },
  ]);
  const win = windows.windows.get(id);
  menu.popup(win ? { window: win } : {});
}

function desktopToggle() {
  const on = store.doc.settings.windowMode === 'desktop';
  return {
    label: 'Keep Widgets on Desktop',
    type: 'checkbox',
    checked: on,
    toolTip: 'Widgets stay below your app windows, on the wallpaper.',
    click: () => store.updateSettings({ windowMode: on ? 'normal' : 'desktop' }),
  };
}

function rebuildTray() {
  if (!tray) return;
  const s = store.doc.settings;
  const menu = Menu.buildFromTemplate([
    { label: s.widgetsVisible ? 'Hide Widgets' : 'Show Widgets', accelerator: 'Alt+Command+W', click: toggleWidgets },
    desktopToggle(),
    { label: 'Show in Dock', type: 'checkbox', checked: !!s.showDock, click: () => store.updateSettings({ showDock: !s.showDock }) },
    ...(windows.needsArranging
      ? [{ label: 'Arrange Widgets', type: 'checkbox', checked: windows.arranging, click: () => windows.setArranging(!windows.arranging) }]
      : []),
    { label: 'Add Widget', submenu: addWidgetMenu() },
    { label: 'Layout', submenu: layoutMenu() },
    { type: 'separator' },
    { label: 'Open Morrow…', accelerator: 'Command+,', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit Morrow', accelerator: 'Command+Q', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function toggleWidgets() {
  store.updateSettings({ widgetsVisible: !store.doc.settings.widgetsVisible });
}

// A small template image for the menu bar: a sun resting on the horizon.
function trayIcon() {
  const size = 36; // drawn at 2x for an 18pt icon
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size * 0.64;
  const r = size * 0.3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let a = 0;
      if (y + 0.5 < cy) a = Math.max(0, Math.min(1, 1.6 - Math.abs(d - r) * 0.9)); // arc
      if (Math.abs(y + 0.5 - (cy + 2)) < 1.4 && Math.abs(x + 0.5 - cx) < size * 0.42) a = 1; // horizon
      const i = (y * size + x) * 4;
      buf[i + 3] = Math.round(a * 255);
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 });
  img.setTemplateImage(true);
  return img;
}

function appMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Morrow',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'Command+,', click: () => openSettings() },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'Widgets',
        submenu: [
          { label: 'Show or Hide Widgets', accelerator: 'Alt+Command+W', click: toggleWidgets },
          { label: 'Add Widget', submenu: addWidgetMenu() },
        ],
      },
      { role: 'windowMenu' },
    ]),
  );
}

// IPC -----------------------------------------------------------------------

function senderWidgetId(e) {
  const win = BrowserWindow.fromWebContents(e.sender);
  return win && win.widgetId;
}

function registerIpc() {
  ipcMain.handle('morrow:init', (e, id) => ({
    widget: id ? store.widget(id) : null,
    settings: store.doc.settings,
    doc: id ? null : store.doc,
    registry,
    notice: store.notice,
    nativeAvailable: require('./native').available,
  }));

  ipcMain.on('morrow:update-widget', (e, id, patch) => store.updateWidget(id || senderWidgetId(e), patch));
  ipcMain.on('morrow:gesture-start', (e, kind, edge) => windows.startGesture(senderWidgetId(e), kind, edge));
  ipcMain.on('morrow:gesture-end', () => windows.endGesture());
  ipcMain.on('morrow:context-menu', (e, extra) => {
    const id = senderWidgetId(e);
    // Widget-specific items come over as labels plus an action key.
    const items = (extra || []).map((x) => ({ label: x.label, click: () => e.sender.send('morrow:menu-action', x.action) }));
    widgetContextMenu(id, items);
  });
  ipcMain.on('morrow:open-settings', (e, id) => openSettings(id));
  ipcMain.on('morrow:copy', (e, text) => clipboard.writeText(String(text)));
  ipcMain.handle('morrow:stopwatch', (e, action) => {
    const id = senderWidgetId(e);
    return action === 'get' ? runtime.snapshot(id) : runtime.stopwatchAction(id, action);
  });

  // Settings window operations.
  ipcMain.handle('morrow:add-widget', (e, type) => addWidget(type));
  ipcMain.on('morrow:duplicate-widget', (e, id) => store.duplicateWidget(id));
  ipcMain.on('morrow:remove-widget', (e, id) => { runtime.forget(id); store.removeWidget(id); });
  ipcMain.on('morrow:update-settings', (e, patch) => store.updateSettings(patch));
  ipcMain.handle('morrow:create-layout', (e, name, fromId) => store.createLayout(name, fromId));
  ipcMain.on('morrow:rename-layout', (e, id, name) => store.renameLayout(id, name));
  ipcMain.on('morrow:delete-layout', (e, id) => store.deleteLayout(id));
  ipcMain.on('morrow:switch-layout', (e, id) => store.switchLayout(id));
  ipcMain.handle('morrow:save-preset', (e, name, appearance) => store.savePreset(name, appearance));
  ipcMain.on('morrow:delete-preset', (e, id) => store.deletePreset(id));
  ipcMain.handle('morrow:pick-image', async () => {
    const r = await dialog.showOpenDialog(settingsWin, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('morrow:apps-list', (e, refresh) => apps.listApps(refresh));
  ipcMain.handle('morrow:app-icon', (e, p, size) => apps.icon(p, size));
  ipcMain.handle('morrow:bundle-id', (e, p) => apps.bundleId(p));
  ipcMain.handle('morrow:apps-resolve', async (e, entries, size) => {
    const out = await apps.resolve(entries || [], size);
    // Remember where moved apps went, so the next launch is instant.
    const id = senderWidgetId(e);
    if (id && out.some((a) => a.moved)) {
      store.updateWidget(id, { config: { apps: out.map(({ path: p, name, bundleId }) => ({ path: p, name, bundleId })) } });
    }
    return out;
  });
  ipcMain.handle('morrow:launch', (e, p) => apps.launch(p));
  // Results come back as { ok, data } or { ok: false, error } so widgets can show the reason.
  const settle = (p) => p.then((data) => ({ ok: true, data }), (err) => ({ ok: false, error: err.message }));
  ipcMain.handle('morrow:weather', (e, loc, force) => settle(weather.forecast(loc, { force })));
  ipcMain.handle('morrow:city-search', (e, q) => settle(weather.searchCities(q)));
  ipcMain.handle('morrow:import-image', (e, p) => settle(images.importImage(p)));
  ipcMain.handle('morrow:pick-photo', async () => {
    app.focus({ steal: true });
    const r = await dialog.showOpenDialog(settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined, {
      properties: ['openFile'],
      filters: [{ name: 'Photos', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif'] }],
    });
    if (r.canceled) return { ok: false, canceled: true };
    return settle(images.importImage(r.filePaths[0]));
  });
  ipcMain.handle('morrow:time-zones', () => Intl.supportedValuesOf('timeZone'));
  ipcMain.handle('morrow:films', (e, opts) => settle(movies.library(opts || {})));
  ipcMain.handle('morrow:film-poster', (e, url) => movies.poster(url));
  ipcMain.handle('morrow:film-play', (e, files) => movies.play(files));
  ipcMain.on('morrow:film-page', (e, link) => movies.openFilm(link));
  ipcMain.on('morrow:open-watchlist', (e, user) => movies.openWatchlist(user));
  ipcMain.on('morrow:open-profile', (e, user) => movies.openProfile(user));
  ipcMain.handle('morrow:watched', (e, user, force) => movies.watched(user, { force }));
  ipcMain.handle('morrow:film-details', (e, slugs) => movies.details(slugs));
  ipcMain.handle('morrow:pick-folder', async (e, current) => {
    app.focus({ steal: true });
    const r = await dialog.showOpenDialog(settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined, {
      properties: ['openDirectory'],
      defaultPath: current || require('./movies').defaultFolder(),
    });
    return r.canceled ? null : r.filePaths[0];
  });
}

// Settings that need native side effects.
function applySettings(prev) {
  const s = store.doc.settings;
  // The packaged app starts without a Dock icon (LSUIElement), so at launch
  // only showing it needs a call; hiding is for when the toggle changes.
  if (!prev ? s.showDock : prev.showDock !== s.showDock) {
    if (s.showDock) app.dock.show();
    else {
      app.dock.hide();
      // Hiding the Dock icon can drop focus from the settings window.
      if (settingsWin && !settingsWin.isDestroyed()) setTimeout(() => { settingsWin.show(); settingsWin.focus(); }, 150);
    }
  }
  if (prev && prev.launchAtLogin !== s.launchAtLogin) {
    try { app.setLoginItemSettings({ openAtLogin: !!s.launchAtLogin }); } catch {}
  }
  if (prev && (prev.windowMode !== s.windowMode || prev.allSpaces !== s.allSpaces)) {
    windows.arranging = false;
    windows.recreateAll();
  }
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  images = require('./images').createImages(app.getPath('userData'));
  images.cleanup(store.doc);
  movies = require('./movies').createMovies(app.getPath('userData'), { openExternal: (u) => shell.openExternal(u) });
  windows = new WidgetWindows(store);
  registerIpc();
  appMenu();

  tray = new Tray(trayIcon());
  tray.setToolTip('Morrow');
  rebuildTray();

  let prevSettings = JSON.parse(JSON.stringify(store.doc.settings));
  applySettings(null);

  store.on('change', (kind) => {
    if (kind === 'settings') {
      applySettings(prevSettings);
      prevSettings = JSON.parse(JSON.stringify(store.doc.settings));
      windows.broadcast('morrow:settings', store.doc.settings);
    }
    windows.sync({ fade: kind === 'layout-switch' || kind === 'widgets' || kind === 'settings' });
    if (kind === 'widgets' || kind === 'layouts' || kind === 'layout-switch') {
      clearTimeout(images.timer);
      images.timer = setTimeout(() => images.cleanup(store.doc), 5000);
    }
    rebuildTray();
    sendDoc();
  });

  windows.sync();
  if (process.env.MORROW_SELFTEST) {
    try {
      return require('../../test/selftest')({ app, BrowserWindow, store, windows });
    } catch (err) {
      console.error('Self test unavailable:', err.message);
      return app.exit(2);
    }
  }

  // First launch: start with a calm, useful arrangement instead of an empty desktop.
  if (!store.widgets.length && !require('fs').existsSync(store.file)) {
    const area = screen.getPrimaryDisplay().workArea;
    const right = area.x + area.width - 24;
    store.addWidget('clock', { x: right - 360, y: area.y + 24, width: 360, height: 180 });
    const cd = store.addWidget('countdown', { x: right - 360, y: area.y + 216, width: 174, height: 150 });
    store.updateWidget(cd.id, { config: { title: 'New Year', target: `${new Date().getFullYear() + 1}-01-01T00:00`, layout: 'days' } });
    store.addWidget('coin', { x: right - 174, y: area.y + 216, width: 150, height: 150 });
    openSettings();
  }

  if (process.env.MORROW_OPEN_SETTINGS) openSettings(process.env.MORROW_OPEN_SETTINGS);
  if (store.notice) dialog.showMessageBox({ type: 'warning', message: 'Configuration reset', detail: store.notice });

  screen.on('display-removed', () => windows.revalidateScreens());
  screen.on('display-metrics-changed', () => windows.revalidateScreens());
  powerMonitor.on('resume', () => windows.broadcast('morrow:resume'));

  app.on('activate', () => openSettings());
});

// Development aid: MORROW_CAPTURE=<dir> saves a PNG of every window's page
// content after a few seconds, and renderer console output goes to stdout.
if (process.env.MORROW_CAPTURE) {
  const fs = require('fs');
  app.on('web-contents-created', (_e, wc) => {
    wc.on('console-message', (ev) => console.log(`[renderer] ${ev.level}: ${ev.message} (${ev.sourceId}:${ev.lineNumber})`));
    wc.on('preload-error', (_ev, p, err) => console.log('[preload-error]', p, err));
    wc.on('render-process-gone', (_ev, d) => console.log('[gone]', d));
  });
  app.whenReady().then(() => setTimeout(async () => {
    const dir = path.resolve(process.env.MORROW_CAPTURE);
    fs.mkdirSync(dir, { recursive: true });
    let i = 0;
    for (const win of BrowserWindow.getAllWindows()) {
      const img = await win.webContents.capturePage();
      const name = win.widgetId ? store.widget(win.widgetId)?.type || 'widget' : 'settings';
      fs.writeFileSync(path.join(dir, `${i++}-${name}.png`), img.toPNG());
      console.log('[capture]', name, JSON.stringify(win.getBounds()));
    }
    console.log('[capture] done');
  }, Number(process.env.MORROW_CAPTURE_DELAY || 4000)));
}

app.on('second-instance', () => openSettings());
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', () => store && store.flush());
