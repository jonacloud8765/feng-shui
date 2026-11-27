'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, clipboard, powerMonitor, powerSaveBlocker, shell, dialog } = require('electron');
const { Store } = require('./store');
const { WidgetWindows } = require('./windows');
const { Runtime } = require('./runtime');
const registry = require('../shared/registry');
const brand = require('../shared/brand');
const apps = require('./apps');
const weather = require('./weather').createWeatherService();
let pizzintService;
let soundcloudService;
const soundcloud = () => soundcloudService || (soundcloudService = require('./soundcloud').createSoundCloud(app.getPath('userData')));
let libraryService;
const library = () => libraryService || (libraryService = (() => {
  const lib = require('./library').createLibrary(app.getPath('userData'), { nativeImage });
  // Every Library widget hears about new books, covers and progress.
  const tell = () => { if (windows) windows.broadcast('fengshui:library-changed', lib.view()); };
  lib.on('change', tell);
  lib.on('status', tell);
  return lib;
})());
let squeezeService;
const squeeze = () => squeezeService || (squeezeService = (() => {
  const { Engine } = require('./squeeze/engine');
  const eng = new Engine({ dataDir: app.getPath('userData'), trash: (p) => shell.trashItem(p) });
  // Only SQUEEZE windows hear about the queue.
  eng.on('change', (snap) => {
    if (!windows) return;
    for (const win of windows.windows.values()) {
      if (!win.isDestroyed() && store.widget(win.widgetId)?.type === 'squeeze') win.webContents.send('fengshui:squeeze-changed', snap);
    }
  });
  return eng;
})());
const pizzint = () => pizzintService || (pizzintService = require('./pizzint').createPizzint(app.getPath('userData')));

// The app keeps its data in Application Support/Feng Shui.
app.setName(brand.name);
if (!process.env.FENGSHUI_DATA_DIR) app.setPath('userData', path.join(app.getPath('appData'), 'Feng Shui'));
// A separate data folder (used for development and tests) also gets its own
// single-instance lock, so it can run beside the everyday copy.
if (process.env.FENGSHUI_DATA_DIR) {
  app.setName('Feng Shui Dev'); // the lock follows the app name, so a dev copy never wakes the everyday one
  app.setPath('userData', path.resolve(process.env.FENGSHUI_DATA_DIR));
}
if (!app.requestSingleInstanceLock()) app.quit();

let store;
let windows;
let tray;
let settingsWin = null;
let images;
let movies;
let pages;
const runtime = new Runtime();

// Settings window ----------------------------------------------------------

function openSettings(focusWidgetId) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (focusWidgetId) settingsWin.webContents.send('fengshui:focus-widget', focusWidgetId);
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
    title: brand.name,
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

// About window ------------------------------------------------------------------

let aboutWin = null;
function openAbout() {
  if (aboutWin && !aboutWin.isDestroyed()) { aboutWin.show(); aboutWin.focus(); app.focus({ steal: true }); return; }
  aboutWin = new BrowserWindow({
    width: 400, height: 520, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    title: `About ${brand.name}`, titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#efe9dc', show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  aboutWin.loadFile(path.join(__dirname, '..', 'renderer', 'about.html'));
  aboutWin.once('ready-to-show', () => { aboutWin.show(); app.focus({ steal: true }); });
  aboutWin.on('closed', () => { aboutWin = null; });
}

// Feng Shui: rearrange the visible widgets of the current layout into balance.
// Each press moves on to the next balanced composition (another heart, or the
// mirror image), skipping any that would leave the desk as it already is, so
// the command always visibly does something. Positions are unlocked for it.
const fengTurn = new Map(); // layout id -> next variant
function fengShui() {
  if (windows.skin) return baguaArrange();
  const fsh = require('./fengshui');
  const widgets = store.widgets.filter((w) => w.visible).map((w) => ({ id: w.id, type: w.type, bounds: w.bounds, min: registry.TYPES[w.type].min, max: registry.TYPES[w.type].max, share: w.type === 'cork' ? 0.25 : 0 }));
  if (!widgets.length) return;
  const work = screen.getPrimaryDisplay().workArea;
  const total = fsh.variants(widgets, work);
  const layoutId = store.layout.id;
  let v = fengTurn.get(layoutId) || 0;
  let placed = null;
  for (let tries = 0; tries < total; tries++, v++) {
    placed = fsh.arrange(widgets, work, { variant: v % total });
    const moved = widgets.reduce((t, w) => { const b = placed[w.id]; return t + (b ? Math.abs(b.x - w.bounds.x) + Math.abs(b.y - w.bounds.y) + Math.abs(b.width - w.bounds.width) : 0); }, 0);
    if (moved > 60) break;
  }
  fengTurn.set(layoutId, (v + 1) % total);
  if (store.doc.settings.locked) store.updateSettings({ locked: false });
  for (const [id, bounds] of Object.entries(placed)) store.updateWidget(id, { bounds });
}

// In the Feng Shui layout itself the desk is arranged by the bagua (see
// bagua.js): zones, Five Elements and the balance rules. It runs the first time
// the layout is opened and whenever "Feng Shui This Layout" is chosen there;
// manual moves in between are kept.
function baguaArrange() {
  const widgets = store.widgets.filter((w) => w.visible).map((w) => ({ id: w.id, type: w.type, config: w.config, bounds: w.config.fsRolled ? { ...w.bounds, height: w.config.fsRolled } : w.bounds, min: registry.TYPES[w.type].min, max: registry.TYPES[w.type].max }));
  if (!widgets.length) return;
  const { placed } = require('./bagua').arrange(widgets, screen.getPrimaryDisplay().workArea);
  if (store.doc.settings.locked) store.updateSettings({ locked: false });
  for (const [id, bounds] of Object.entries(placed)) store.updateWidget(id, { bounds, config: { fsRolled: 0 } });
  store.setLayoutMeta(store.layout.id, { fsArranged: BAGUA_VERSION });
}
const BAGUA_VERSION = 2;

// launch.exe: the Nuke France widget's page, in its own small window next to
// the briefcase. Its title bar drags it; Esc or clicking elsewhere closes it.
let nukeWin = null;
function openNuke(from) {
  if (nukeWin && !nukeWin.isDestroyed()) { nukeWin.close(); return; }
  const W = 400, H = 440;
  const b = from && !from.isDestroyed() ? from.getBounds() : screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  let x = b.x + (b.width || 0) + 12, y = b.y + (b.height || 0) / 2 - H / 2;
  if (x + W > area.x + area.width) x = b.x - W - 12;
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - W - 8));
  y = Math.max(area.y + 8, Math.min(y, area.y + area.height - H - 8));
  nukeWin = new BrowserWindow({
    x: Math.round(x), y: Math.round(y), width: W, height: H, frame: false, resizable: true, minWidth: 260, minHeight: 280,
    show: false, title: 'launch.exe', backgroundColor: '#101418', hasShadow: true, fullscreenable: false, minimizable: false, maximizable: false, alwaysOnTop: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const win = nukeWin;
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'Escape') win.close(); });
  win.webContents.on('did-finish-load', () => win.webContents.insertCSS('.tb{-webkit-app-region:drag}.tb button{-webkit-app-region:no-drag}'));
  win.on('blur', () => setTimeout(() => { if (!win.isDestroyed() && !win.isFocused()) win.close(); }, 120));
  win.on('closed', () => { if (nukeWin === win) nukeWin = null; });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'nuke', 'launch.html'));
  win.once('ready-to-show', () => { win.show(); app.focus({ steal: true }); win.focus(); });
}

// Save the arrangement on screen as a new layout and switch to it, so the
// one it came from stays as it was.
function saveLayout(name) {
  const l = store.createLayout(String(name || '').trim() || `${store.layout.name} copy`, store.layout.id);
  store.switchLayout(l.id);
  return l;
}

function sendDoc() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('fengshui:doc', store.doc);
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
  return [
    { label: 'Switch with ← → Keys', toolTip: 'Use the left and right arrow keys to move between layouts. Esc or Return ends it.', click: () => layoutKeys(true) },
    { type: 'separator' },
    ...store.doc.layouts.map((l) => ({
    label: l.name,
    type: 'radio',
    checked: l.id === store.doc.activeLayoutId,
    click: () => store.switchLayout(l.id),
  })),
  ];
}

// Layout switching mode: the layout bar takes the keyboard, and the left and
// right arrow keys step through the layouts (wrapping round). Esc, Return or
// clicking anywhere else ends it. Clicking the bar also starts it.
function layoutKeys(on) {
  windows.barKeys = !!on;
  windows.syncBar();
  const win = windows.barWin;
  if (!on || !win || win.isDestroyed()) return;
  app.focus({ steal: true });
  win.focus();
  win.webContents.send('fengshui:bar-keys', true);
}

function stepLayout(dir) {
  const list = store.doc.layouts;
  const i = list.findIndex((l) => l.id === store.doc.activeLayoutId);
  const next = list[(i + dir + list.length) % list.length];
  if (next) store.switchLayout(next.id);
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

// Keep Mac Awake --------------------------------------------------------------
// Laid out like a caffeine app's menu: the current session's details, its
// options, "End Current Session", then the ways to start a new one. Saved in
// settings.awake as { on, mode: indefinitely|until|app|download, until (ms),
// app (name), started (ms), display (allow display sleep) }.
let awakeBlocker = null;
let awakeTimer = null;
let runningApps = [];
const DOWNLOADING = /\.(crdownload|download|part|partial|opdownload)$/i;

function visibleApps() {
  return new Promise((resolve) => {
    require('child_process').execFile('/usr/bin/lsappinfo', ['visibleProcessList'], { timeout: 3000 }, (err, out) => {
      if (err) return resolve([]);
      const names = [...String(out).matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/_/g, ' ').replace(/[‎‏]/g, '').trim());
      resolve([...new Set(names)].filter((n) => n && !/^(Electron|Feng Shui|Feng Shui Dev)$/.test(n)).sort((a, b) => a.localeCompare(b)));
    });
  });
}

function downloadsInProgress() {
  try {
    return require('fs').readdirSync(app.getPath('downloads')).some((f) => DOWNLOADING.test(f));
  } catch { return false; }
}

function endAwake() { store.updateSettings({ awake: { on: false, until: 0, mode: '', app: '' } }); }
function startAwake(patch) { store.updateSettings({ awake: { on: true, until: 0, app: '', mode: 'indefinitely', ...patch, started: Date.now() } }); }

// Whether the session should still be running, checked each time it is applied.
async function awakeStillWanted(a) {
  if (!a.on) return false;
  if (a.mode === 'until' || (a.until && !a.mode)) return a.until > Date.now();
  if (a.mode === 'app') return (await visibleApps()).includes(a.app);
  if (a.mode === 'download') return downloadsInProgress() || Date.now() - (a.started || 0) < 60000;
  return true;
}

async function applyAwake() {
  const a = store.doc.settings.awake || {};
  const live = await awakeStillWanted(a);
  if (a.on && !live) { endAwake(); return; }
  const kind = a.display ? 'prevent-app-suspension' : 'prevent-display-sleep';
  if (awakeBlocker && (!live || awakeBlocker.kind !== kind)) {
    if (powerSaveBlocker.isStarted(awakeBlocker.id)) powerSaveBlocker.stop(awakeBlocker.id);
    awakeBlocker = null;
  }
  if (live && !awakeBlocker) awakeBlocker = { id: powerSaveBlocker.start(kind), kind };
  clearTimeout(awakeTimer);
  // Check again in a while: a timed session's clock, an app quitting, a download finishing.
  if (live && a.mode !== 'indefinitely') {
    const wait = a.mode === 'until' ? Math.max(1000, Math.min(60000, a.until - Date.now())) : 30000;
    awakeTimer = setTimeout(() => { rebuildTray(); applyAwake(); }, wait);
  }
  if (tray) tray.setImage(trayIcon(live));
}

const hm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function left(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

function awakeDetails(a) {
  if (!a.on) return [{ label: 'No session: your Mac sleeps as usual', enabled: false }];
  const rows = {
    indefinitely: ['Time remaining: indefinite', 'Activation: Indefinitely'],
    until: [`Time remaining: ${left(a.until - Date.now())}`, `Activation: until ${hm(a.until)}`],
    app: ['Time remaining: while the app runs', `Activation: while ${a.app} is running`],
    download: ['Time remaining: until downloads finish', 'Activation: while a file is downloading'],
  }[a.mode || (a.until ? 'until' : 'indefinitely')];
  return rows.map((label) => ({ label, enabled: false }));
}

function awakeMenu() {
  const a = store.doc.settings.awake || {};
  const now = new Date();
  // "Until" offers the next few whole and half hours.
  const until = [];
  const t = new Date(now);
  t.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  while (until.length < 8) { if (t - now > 10 * 60000) until.push(new Date(t)); t.setMinutes(t.getMinutes() + 30); }
  const appItems = runningApps.length
    ? runningApps.map((name) => ({ label: name, click: () => startAwake({ mode: 'app', app: name }) }))
    : [{ label: 'No apps found', enabled: false }];
  return [
    { label: 'Keep Mac Awake', type: 'checkbox', checked: !!a.on, accelerator: 'Alt+Command+A', click: () => (a.on ? endAwake() : startAwake({})) },
    {
      label: 'Keep Awake Options',
      submenu: [
        { label: 'Current Session Details', enabled: false },
        ...awakeDetails(a).map((r) => ({ ...r, label: `   ${r.label}` })),
        { type: 'separator' },
        { label: 'Allow Display Sleep', type: 'checkbox', checked: !!a.display, toolTip: 'The screen may dim and sleep, but the Mac stays awake.', click: () => store.updateSettings({ awake: { display: !a.display } }) },
        { label: 'End Current Session', enabled: !!a.on, click: endAwake },
        { type: 'separator' },
        { label: 'Start New Session', enabled: false },
        { label: 'Indefinitely', click: () => startAwake({ mode: 'indefinitely' }) },
        { label: 'Minutes', submenu: [5, 10, 15, 30, 45].map((m) => ({ label: `${m} minutes`, click: () => startAwake({ mode: 'until', until: Date.now() + m * 60000 }) })) },
        { label: 'Hours', submenu: [1, 2, 3, 4, 5, 6, 8, 12].map((hr) => ({ label: `${hr} hour${hr > 1 ? 's' : ''}`, click: () => startAwake({ mode: 'until', until: Date.now() + hr * 3600000 }) })) },
        { label: 'Until', submenu: until.map((d) => ({ label: `${hm(d)}${d.getDate() !== now.getDate() ? ' tomorrow' : ''}`, click: () => startAwake({ mode: 'until', until: d.getTime() }) })) },
        { label: 'While App Is Running', submenu: appItems },
        { label: 'While File Is Downloading', toolTip: 'Stays awake while anything in Downloads is still downloading.', click: () => startAwake({ mode: 'download' }) },
      ],
    },
  ];
}

// While music plays (here or on another layout), the menu bar can pause it.
function musicMenu() {
  if (!windows?.playing.size) return [];
  const title = [...windows.playing.values()].find(Boolean);
  return [{ label: title ? `Pause “${title.length > 40 ? title.slice(0, 39) + '…' : title}”` : 'Pause Music', click: () => windows.pauseMusic() }, { type: 'separator' }];
}

function rebuildTray() {
  if (!tray) return;
  const s = store.doc.settings;
  const menu = Menu.buildFromTemplate([
    ...musicMenu(),
    { label: s.widgetsVisible ? 'Hide Widgets' : 'Show Widgets', accelerator: 'Alt+Command+W', click: toggleWidgets },
    desktopToggle(),
    { label: 'Show in Dock', type: 'checkbox', checked: !!s.showDock, click: () => store.updateSettings({ showDock: !s.showDock }) },
    ...(windows.needsArranging
      ? [{ label: 'Arrange Widgets', type: 'checkbox', checked: windows.arranging, click: () => windows.setArranging(!windows.arranging) }]
      : []),
    { label: 'Add Widget', submenu: addWidgetMenu() },
    { label: 'Layout', submenu: layoutMenu() },
    { label: 'Feng Shui This Layout', click: () => fengShui() },
    { label: 'Save Layout As New…', click: () => windows.barWin?.webContents.executeJavaScript('window.startNaming && window.startNaming()') },
    { label: 'Show Layout Bar', type: 'checkbox', checked: (s.bar || {}).show !== false, click: () => store.updateSettings({ bar: { show: (s.bar || {}).show === false } }) },
    { label: 'Lock Layout Order', type: 'checkbox', checked: !!(s.bar || {}).lockOrder, click: () => store.updateSettings({ bar: { lockOrder: !(s.bar || {}).lockOrder } }) },
    ...awakeMenu(),
    { type: 'separator' },
    { label: `Open ${brand.name}…`, accelerator: 'Command+,', click: () => openSettings() },
    { label: `About ${brand.name}`, click: openAbout },
    { type: 'separator' },
    { label: `Quit ${brand.name}`, accelerator: 'Command+Q', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function toggleWidgets() {
  store.updateSettings({ widgetsVisible: !store.doc.settings.widgetsVisible });
}

// A small template image for the menu bar: a yin-yang in a fine ring.
// While the Mac is kept awake a small dot sits at its upper right.
function trayIcon(awake = false) {
  const size = 36; // drawn at 2x for an 18pt icon
  const buf = Buffer.alloc(size * size * 4);
  const cx = 18, cy = 18.5, R = 13.5; // the symbol
  const ring = 1.7; // outline width in pixels
  const inside = (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d > R + ring / 2) return awake && Math.hypot(x - 32, y - 4.5) < 3.2; // the awake dot
    if (d > R - ring / 2) return true; // the ring
    const top = Math.hypot(x - cx, y - (cy - R / 2));
    const bottom = Math.hypot(x - cx, y - (cy + R / 2));
    if (top < R / 7) return true; // the dark seed in the light half
    if (bottom < R / 7) return false; // the light seed in the dark half
    if (top < R / 2) return false; // the light head
    if (bottom < R / 2) return true; // the dark head
    return x > cx; // dark on the right
  };
  const S = 4; // 4x4 supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) if (inside(x + (sx + 0.5) / S, y + (sy + 0.5) / S)) n++;
      buf[(y * size + x) * 4 + 3] = Math.round((n / (S * S)) * 255);
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
        label: brand.name,
        submenu: [
          { label: `About ${brand.name}`, click: openAbout },
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
          { label: 'Keep Mac Awake', accelerator: 'Alt+Command+A', click: () => (store.doc.settings.awake?.on ? endAwake() : startAwake({})) },
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
  ipcMain.handle('fengshui:init', (e, id) => ({
    widget: id && store.widget(id) ? windows.payload(store.widget(id)) : null,
    settings: store.doc.settings,
    doc: id ? null : store.doc,
    registry,
    notice: store.notice,
    nativeAvailable: require('./native').available,
  }));

  ipcMain.handle('fengshui:about', () => ({ ...brand, version: app.getVersion(), electron: process.versions.electron }));
  ipcMain.on('fengshui:open-repo', () => shell.openExternal(brand.repo));
  ipcMain.on('fengshui:update-widget', (e, id, patch) => store.updateWidget(id || senderWidgetId(e), patch));
  ipcMain.on('fengshui:gesture-start', (e, kind, edge) => windows.startGesture(senderWidgetId(e), kind, edge));
  ipcMain.on('fengshui:gesture-end', () => windows.endGesture());
  ipcMain.on('fengshui:context-menu', (e, extra) => {
    const id = senderWidgetId(e);
    // Widget-specific items come over as labels plus an action key.
    const items = (extra || []).map((x) => (x.type === 'separator' ? { type: 'separator' }
      : { label: x.label, ...(x.type === 'checkbox' || x.type === 'radio' ? { type: x.type, checked: !!x.checked } : {}), click: () => e.sender.send('fengshui:menu-action', x.action) }));
    widgetContextMenu(id, items);
  });
  ipcMain.on('fengshui:open-settings', (e, id) => openSettings(id));
  ipcMain.on('fengshui:feng-shui', () => fengShui());
  ipcMain.on('fengshui:bar-size', (e, w) => windows.sizeBar(w));
  ipcMain.on('fengshui:bar-focus', () => { app.focus({ steal: true }); windows.barWin?.focus(); });
  // Only the bar on screen may end the mode (an old bar being replaced blurs as it goes).
  ipcMain.on('fengshui:bar-keys', (e, on) => { if (BrowserWindow.fromWebContents(e.sender) === windows.barWin) layoutKeys(on); });
  ipcMain.on('fengshui:bar-step', (e, dir) => stepLayout(dir > 0 ? 1 : -1));
  ipcMain.on('fengshui:save-layout', (e, name) => saveLayout(name));
  // The bar's save button: keep this layout exactly as it is and lock it.
  ipcMain.on('fengshui:lock-layout', (e, on) => { store.updateSettings({ locked: !!on }); store.flush(); });
  ipcMain.on('fengshui:nuke-open', (e) => openNuke(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.on('fengshui:copy', (e, text) => clipboard.writeText(String(text)));
  ipcMain.handle('fengshui:stopwatch', (e, action) => {
    const id = senderWidgetId(e);
    return action === 'get' ? runtime.snapshot(id) : runtime.stopwatchAction(id, action);
  });

  // Settings window operations.
  ipcMain.handle('fengshui:add-widget', (e, type) => addWidget(type));
  ipcMain.on('fengshui:duplicate-widget', (e, id) => store.duplicateWidget(id));
  ipcMain.on('fengshui:remove-widget', (e, id) => { runtime.forget(id); store.removeWidget(id); });
  ipcMain.on('fengshui:update-settings', (e, patch) => store.updateSettings(patch));
  ipcMain.handle('fengshui:create-layout', (e, name, fromId) => store.createLayout(name, fromId));
  ipcMain.on('fengshui:rename-layout', (e, id, name) => store.renameLayout(id, name));
  ipcMain.on('fengshui:move-layout', (e, id, index) => store.moveLayout(id, index));
  ipcMain.on('fengshui:delete-layout', (e, id) => store.deleteLayout(id));
  ipcMain.on('fengshui:switch-layout', (e, id) => store.switchLayout(id));
  ipcMain.handle('fengshui:save-preset', (e, name, appearance) => store.savePreset(name, appearance));
  ipcMain.on('fengshui:delete-preset', (e, id) => store.deletePreset(id));
  ipcMain.handle('fengshui:pick-image', async () => {
    const r = await dialog.showOpenDialog(settingsWin, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('fengshui:apps-list', (e, refresh) => apps.listApps(refresh));
  ipcMain.handle('fengshui:app-icon', (e, p, size) => apps.icon(p, size));
  ipcMain.handle('fengshui:bundle-id', (e, p) => apps.bundleId(p));
  ipcMain.handle('fengshui:apps-resolve', async (e, entries, size) => {
    const out = await apps.resolve(entries || [], size);
    // Remember where moved apps went, so the next launch is instant.
    const id = senderWidgetId(e);
    if (id && out.some((a) => a.moved)) {
      store.updateWidget(id, { config: { apps: out.map(({ path: p, name, bundleId }) => ({ path: p, name, bundleId })) } });
    }
    return out;
  });
  ipcMain.handle('fengshui:launch', (e, p) => apps.launch(p));
  // Results come back as { ok, data } or { ok: false, error } so widgets can show the reason.
  const settle = (p) => p.then((data) => ({ ok: true, data }), (err) => ({ ok: false, error: err.message }));
  ipcMain.handle('fengshui:weather', (e, loc, force) => settle(weather.forecast(loc, { force })));
  ipcMain.handle('fengshui:pizzint', (e, kind, force) => settle(pizzint().get(kind, { force })));
  ipcMain.on('fengshui:pizzint-open', (e, kind) => shell.openExternal(kind === 'neh' ? 'https://www.pizzint.watch/nothingeverhappens' : 'https://www.pizzint.watch/'));
  ipcMain.handle('fengshui:city-search', (e, q) => settle(weather.searchCities(q)));
  ipcMain.handle('fengshui:import-image', (e, p) => settle(images.importImage(p)));
  ipcMain.handle('fengshui:pick-photo', async () => {
    app.focus({ steal: true });
    const r = await dialog.showOpenDialog(settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined, {
      properties: ['openFile'],
      filters: [{ name: 'Photos', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif'] }],
    });
    if (r.canceled) return { ok: false, canceled: true };
    return settle(images.importImage(r.filePaths[0]));
  });
  ipcMain.handle('fengshui:time-zones', () => Intl.supportedValuesOf('timeZone'));
  ipcMain.handle('fengshui:films', (e, opts) => settle(movies.library(opts || {})));
  ipcMain.handle('fengshui:film-poster', (e, url) => movies.poster(url));
  ipcMain.handle('fengshui:film-play', (e, files) => movies.play(files));
  ipcMain.on('fengshui:film-page', (e, link) => movies.openFilm(link));
  ipcMain.handle('fengshui:pick-page', async () => {
    app.focus({ steal: true });
    const r = await dialog.showOpenDialog(settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined, {
      properties: ['openFile'],
      filters: [{ name: 'Web page', extensions: ['html', 'htm'] }],
    });
    if (r.canceled) return { ok: false, canceled: true };
    return settle(pages.importPage(r.filePaths[0]));
  });
  ipcMain.handle('fengshui:pick-model', async () => {
    app.focus({ steal: true });
    const r = await dialog.showOpenDialog(settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined, {
      properties: ['openFile'],
      message: 'Choose a 3D character (.glb)',
      filters: [{ name: '3D model', extensions: ['glb'] }],
    });
    if (r.canceled) return { ok: false, canceled: true };
    return settle((async () => {
      const src = r.filePaths[0];
      const fs = require('fs');
      const st = await fs.promises.stat(src);
      if (st.size > 120 * 1024 * 1024) throw new Error('That model is larger than 120 MB.');
      const dir = path.join(app.getPath('userData'), 'models');
      await fs.promises.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${require('crypto').randomUUID()}.glb`);
      await fs.promises.copyFile(src, file);
      return { file, name: path.basename(src) };
    })());
  });
  ipcMain.on('fengshui:open-watchlist', (e, user) => movies.openWatchlist(user));
  ipcMain.on('fengshui:open-profile', (e, user) => movies.openProfile(user));
  ipcMain.handle('fengshui:watched', (e, user, force) => movies.watched(user, { force }));
  ipcMain.handle('fengshui:film-details', (e, slugs) => movies.details(slugs));
  ipcMain.handle('fengshui:records', async (e, force) => {
    const w = store.widgets.find((x) => x.id === senderWidgetId(e));
    if (!w || w.type !== 'records') return { ok: false, error: 'Not a Music Player.' };
    const inputs = [w.config.crate1, w.config.crate2, w.config.crate3];
    return { ok: true, data: await soundcloud().crates(inputs, { force: !!force }) };
  });
  ipcMain.on('fengshui:records-playing', (e, on, title) => {
    const id = senderWidgetId(e);
    if (id) windows.setPlaying(id, !!on, String(title || '').slice(0, 120));
  });
  ipcMain.on('fengshui:records-open', (e, url) => {
    if (/^https:\/\/soundcloud\.com\/[^\s]*$/.test(String(url))) shell.openExternal(url);
  });
  ipcMain.handle('fengshui:library', async (e, op, ...args) => {
    const w = store.widgets.find((x) => x.id === senderWidgetId(e));
    if (!w || w.type !== 'library') return { ok: false, error: 'Not a Library.' };
    const lib = library();
    try {
      switch (op) {
        case 'load': {
          if (w.config.goodreads) lib.syncProfile(w.config.goodreads).catch(() => {});
          return { ok: true, data: lib.view() };
        }
        case 'sync': return await lib.syncProfile(w.config.goodreads, { force: true });
        case 'favorite': return { ok: true, favorite: lib.favorite(String(args[0]), !!args[1]) };
        case 'import-text': return lib.importText(String(args[0] || ''), String(args[1] || ''));
        case 'import-file': {
          app.focus({ steal: true });
          const r = await dialog.showOpenDialog({
            properties: ['openFile'],
            message: 'Choose your Goodreads export (.csv) or a saved Amazon Wish List page (.html)',
            filters: [{ name: 'Goodreads export or Wish List page', extensions: ['csv', 'html', 'htm'] }],
          });
          if (r.canceled) return { ok: false, canceled: true };
          const text = await require('fs').promises.readFile(r.filePaths[0], 'utf8');
          return lib.importText(path.basename(r.filePaths[0]), text);
        }
        case 'retry': lib.retry(); return { ok: true };
        case 'open': {
          const url = String(args[0] || '');
          if (/^https:\/\/(www\.)?(goodreads\.com|amazon\.[a-z.]+)\/[^\s]*$/.test(url)) shell.openExternal(url);
          return { ok: true };
        }
        default: return { ok: false, error: 'Unknown Library request.' };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('fengshui:squeeze', async (e, op, ...args) => {
    const w = store.widgets.find((x) => x.id === senderWidgetId(e));
    if (!w || w.type !== 'squeeze') return { ok: false, error: 'Not SQUEEZE.' };
    const eng = squeeze();
    const resultOf = (id, which) => {
      const it = eng.item(String(id));
      return it && (which === 'before' ? it.path : it.result?.path);
    };
    try {
      switch (op) {
        case 'state': return { ok: true, state: eng.snapshot() };
        case 'add': return await eng.add((Array.isArray(args[0]) ? args[0] : []).map(String));
        case 'pick': {
          app.focus({ steal: true });
          const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender) || undefined, {
            properties: args[0] === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'openDirectory', 'multiSelections'],
            message: args[0] === 'folder' ? 'Choose folders to squeeze' : 'Choose files or folders to squeeze',
            buttonLabel: 'Add to SQUEEZE',
          });
          if (r.canceled) return { ok: false, canceled: true };
          return await eng.add(r.filePaths);
        }
        case 'remove': eng.remove(String(args[0])); return { ok: true };
        case 'clear': eng.clear(); return { ok: true };
        case 'start': {
          const o = args[1] && typeof args[1] === 'object' ? args[1] : {};
          const options = {
            approved: !!o.approved, lossyImages: !!o.lossyImages, resize: !!o.resize, heicOut: !!o.heicOut, video: !!o.video, flac: !!o.flac, aac: !!o.aac,
            keepTags: w.config.keepTags !== false, keepArt: w.config.keepArt !== false, convertHeic: w.config.convertHeic !== false, replaceOriginal: w.config.replaceOriginal !== false,
          };
          return await eng.start({ mode: ['quick', 'pure', 'maximum'].includes(args[0]) ? args[0] : 'quick', options });
        }
        case 'pause': eng.pause(); return { ok: true };
        case 'resume': eng.resume(); return { ok: true };
        case 'cancel': eng.cancel(); return { ok: true };
        case 'estimate': return { ok: true, estimates: await eng.estimate() };
        case 'preview': return await eng.preview(String(args[0]), args[1] === 'after' ? 'after' : 'before', Math.max(1, Number(args[2]) || 1));
        case 'reveal': {
          // For the whole batch, show the first result selected in its folder.
          const first = eng.items.find((x) => x.inBatch && x.status === 'done' && x.result?.path);
          if (args[1] === 'before' && eng.item(String(args[0]))?.trashed) {
            const t = path.join(app.getPath('home'), '.Trash', path.basename(eng.item(String(args[0])).trashed));
            if (require('fs').existsSync(t)) shell.showItemInFolder(t); else await shell.openPath(path.join(app.getPath('home'), '.Trash'));
            return { ok: true };
          }
          const p = args[0] === 'batch' ? first?.result.path : resultOf(args[0], args[1]);
          if (p) shell.showItemInFolder(p);
          return { ok: !!p };
        }
        case 'open': {
          const p = resultOf(args[0], args[1]);
          if (p) await shell.openPath(p);
          return { ok: !!p };
        }
        case 'open-output': {
          const p = eng.batch?.dir;
          if (p) await shell.openPath(p);
          return { ok: !!p };
        }
        default: return { ok: false, error: 'Unknown SQUEEZE request.' };
      }
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('fengshui:cabinet', async (e, op, ...args) => {
    const cab = require('./cabinet');
    const wid = senderWidgetId(e);
    const w = store.widgets.find((x) => x.id === wid);
    if (!w || w.type !== 'cabinet') return { ok: false, error: 'Not a File Cabinet.' };
    const root = w.config.root || cab.defaultRoot();
    try {
      switch (op) {
        case 'list': return await cab.list(root, args[0]);
        case 'folders': return await cab.folders(root, args[0]);
        case 'peek': return await cab.peek(root, args[0]);
        case 'trash': return await cab.trash(root, args[0]);
        case 'open': return { ok: !(await cab.open(root, args[0])) };
        case 'reveal': cab.reveal(root, args[0]); return { ok: true };
        case 'cancel': cab.cancelScan(args[0]); return { ok: true };
        case 'scan': return await cab.scan(root, args[0], (p) => { if (!e.sender.isDestroyed()) e.sender.send('fengshui:cabinet-progress', { id: args[0], ...p }); });
        case 'pick': {
          app.focus({ steal: true });
          const r = await dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath: root, message: 'Choose a folder for File Cabinet' });
          if (r.canceled) return { ok: false, canceled: true };
          store.updateWidget(wid, { config: { root: r.filePaths[0] } });
          return { ok: true, root: r.filePaths[0] };
        }
        default: return { ok: false, error: 'Unknown request.' };
      }
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('fengshui:pick-folder', async (e, current) => {
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
  if (!prev || JSON.stringify(prev.awake) !== JSON.stringify(s.awake)) applyAwake();
  if (prev && (prev.windowMode !== s.windowMode || prev.allSpaces !== s.allSpaces)) {
    windows.arranging = false;
    windows.recreateAll();
  }
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  images = require('./images').createImages(app.getPath('userData'));
  images.cleanup(store.doc);
  pages = require('./pages').createPages(app.getPath('userData'));
  movies = require('./movies').createMovies(app.getPath('userData'), { openExternal: (u) => shell.openExternal(u) });
  windows = new WidgetWindows(store);
  windows.onPlaying = () => rebuildTray();
  registerIpc();
  appMenu();

  tray = new Tray(trayIcon());
  // The "While App Is Running" list is kept fresh in the background.
  const refreshApps = async () => { const list = await visibleApps(); if (JSON.stringify(list) !== JSON.stringify(runningApps)) { runningApps = list; rebuildTray(); } };
  refreshApps();
  setInterval(refreshApps, 60000);
  tray.setToolTip(brand.name);
  rebuildTray();

  let prevSettings = JSON.parse(JSON.stringify(store.doc.settings));
  applySettings(null);

  store.on('change', (kind) => {
    if (kind === 'settings') {
      applySettings(prevSettings);
      prevSettings = JSON.parse(JSON.stringify(store.doc.settings));
      windows.broadcast('fengshui:settings', store.doc.settings);
    }
    windows.sync({ fade: kind === 'layout-switch' || kind === 'widgets' || kind === 'settings' });
    if (kind === 'layout-switch' && windows.skin && store.layout.fsArranged !== BAGUA_VERSION) setTimeout(baguaArrange, 350);
    if (kind === 'widgets' || kind === 'layouts' || kind === 'layout-switch') {
      clearTimeout(images.timer);
      images.timer = setTimeout(() => images.cleanup(store.doc), 5000);
    }
    rebuildTray();
    sendDoc();
  });

  windows.sync();
  if (windows.skin && store.layout.fsArranged !== BAGUA_VERSION) setTimeout(baguaArrange, 1500);
  // Development aid: FENGSHUI_FENG_TEST=ms runs Feng Shui once after launch.
  if (process.env.FENGSHUI_FENG_TEST) setTimeout(fengShui, Number(process.env.FENGSHUI_FENG_TEST));
  if (process.env.FENGSHUI_SELFTEST) {
    try {
      return require('../../test/selftest')({ app, BrowserWindow, store, windows });
    } catch (err) {
      console.error('Self test unavailable:', err.message);
      return app.exit(2);
    }
  }

  // The Library arrives as a layout of its own, once, filling the main screen.
  // (Delete it and it stays deleted; the widget is still in the Gallery.)
  if (!store.doc.settings.libraryLayout && require('fs').existsSync(store.file)) {
    const area = screen.getPrimaryDisplay().workArea;
    // Leave the top strip clear for the layout bar (10px down, 34px tall).
    store.createLayoutWith('Library', [{ type: 'library', bounds: { x: area.x + 16, y: area.y + 56, width: area.width - 32, height: area.height - 72 } }]);
    store.updateSettings({ libraryLayout: true });
  }

  // SQUEEZE arrives the same way: its own layout, once, filling the main screen.
  if (!store.doc.settings.squeezeLayout && require('fs').existsSync(store.file)) {
    const area = screen.getPrimaryDisplay().workArea;
    store.createLayoutWith('SQUEEZE', [{ type: 'squeeze', bounds: { x: area.x + 16, y: area.y + 56, width: area.width - 32, height: area.height - 72 } }]);
    store.updateSettings({ squeezeLayout: true });
  }

  // First launch: start with a calm, useful arrangement instead of an empty desktop.
  if (!store.widgets.length && !require('fs').existsSync(store.file)) {
    const area = screen.getPrimaryDisplay().workArea;
    const right = area.x + area.width - 24;
    store.addWidget('clock', { x: right - 360, y: area.y + 24, width: 360, height: 180 });
    const cd = store.addWidget('countdown', { x: right - 360, y: area.y + 216, width: 174, height: 150 });
    store.updateWidget(cd.id, { config: { title: 'New Year', target: `${new Date().getFullYear() + 1}-01-01T00:00`, layout: 'days' } });
    store.addWidget('random', { x: right - 174, y: area.y + 216, width: 150, height: 150 });
    openSettings();
  }

  // Development aid: FENGSHUI_SQUEEZE_TEST=<path>:<path> adds those to SQUEEZE
  // (never used by the packaged app); FENGSHUI_SQUEEZE_RUN=quick|pure starts it.
  if (process.env.FENGSHUI_SQUEEZE_TEST && process.env.FENGSHUI_DATA_DIR) {
    const w = store.widgets.find((x) => x.type === 'squeeze');
    setTimeout(async () => {
      await squeeze().add(process.env.FENGSHUI_SQUEEZE_TEST.split(':'));
      // FENGSHUI_SQUEEZE_PICK=<n> opens the n-th file's comparison when the batch is done.
      if (process.env.FENGSHUI_SQUEEZE_PICK) squeeze().once('finished', () => setTimeout(() => {
        for (const win of windows.windows.values()) {
          if (store.widget(win.widgetId)?.type === 'squeeze') win.webContents.executeJavaScript(`[...document.querySelectorAll('.sq-sheet button')].find((b) => /Preview/.test(b.textContent))?.click(); setTimeout(() => document.querySelectorAll('.sq-row')[${Number(process.env.FENGSHUI_SQUEEZE_PICK) || 0}]?.click(), 300);`);
        }
      }, 600));
      // FENGSHUI_SQUEEZE_SHEET=1 opens the Maximum approval sheet.
      if (process.env.FENGSHUI_SQUEEZE_SHEET) setTimeout(() => {
        for (const win of windows.windows.values()) {
          if (store.widget(win.widgetId)?.type === 'squeeze') win.webContents.executeJavaScript(`[...document.querySelectorAll('.sq-seg button')].find((b) => /MAXIMUM/.test(b.textContent))?.click(); setTimeout(() => document.querySelector('.sq-btn.primary')?.click(), 300);`);
        }
      }, 2500);
      if (process.env.FENGSHUI_SQUEEZE_RUN) setTimeout(() => squeeze().start({ mode: process.env.FENGSHUI_SQUEEZE_RUN, options: { convertHeic: w?.config.convertHeic !== false } }), 1500);
    }, 800);
  }

  if (process.env.FENGSHUI_OPEN_SETTINGS) openSettings(process.env.FENGSHUI_OPEN_SETTINGS);
  if (process.env.FENGSHUI_OPEN_ABOUT) openAbout();
  if (store.notice) dialog.showMessageBox({ type: 'warning', message: 'Configuration reset', detail: store.notice });

  screen.on('display-removed', () => windows.revalidateScreens());
  screen.on('display-metrics-changed', () => windows.revalidateScreens());
  powerMonitor.on('resume', () => windows.broadcast('fengshui:resume'));

  app.on('activate', () => openSettings());
});

// Development aid: FENGSHUI_CAPTURE=<dir> saves a PNG of every window's page
// content after a few seconds, and renderer console output goes to stdout.
if (process.env.FENGSHUI_CAPTURE) {
  const fs = require('fs');
  app.on('web-contents-created', (_e, wc) => {
    wc.on('console-message', (ev) => console.log(`[renderer] ${ev.level}: ${ev.message} (${ev.sourceId}:${ev.lineNumber})`));
    wc.on('preload-error', (_ev, p, err) => console.log('[preload-error]', p, err));
    wc.on('render-process-gone', (_ev, d) => console.log('[gone]', d));
  });
  app.whenReady().then(() => setTimeout(async () => {
    const dir = path.resolve(process.env.FENGSHUI_CAPTURE);
    fs.mkdirSync(dir, { recursive: true });
    let i = 0;
    for (const win of BrowserWindow.getAllWindows()) {
      const img = await win.webContents.capturePage();
      const name = win.widgetId ? store.widget(win.widgetId)?.type || 'widget' : 'settings';
      fs.writeFileSync(path.join(dir, `${i++}-${name}.png`), img.toPNG());
      console.log('[capture]', name, JSON.stringify(win.getBounds()));
    }
    console.log('[capture] done');
  }, Number(process.env.FENGSHUI_CAPTURE_DELAY || 4000)));
}

app.on('second-instance', () => openSettings());
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', () => { if (squeezeService) squeezeService.cancel(); if (store) store.flush(); });
