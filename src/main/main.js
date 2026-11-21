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
const pizzint = () => pizzintService || (pizzintService = require('./pizzint').createPizzint(app.getPath('userData')));

// The app is called Feng Shui (it was Morrow). Its data stays where Morrow
// kept it, so nothing set up before the rename is lost.
app.setName(brand.name);
if (!process.env.MORROW_DATA_DIR) app.setPath('userData', path.join(app.getPath('appData'), 'Morrow'));
// A separate data folder (used for development and tests) also gets its own
// single-instance lock, so it can run beside the everyday copy.
if (process.env.MORROW_DATA_DIR) {
  app.setName('Morrow Dev'); // the lock follows the app name, so a dev copy never wakes the everyday one
  app.setPath('userData', path.resolve(process.env.MORROW_DATA_DIR));
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
const BAGUA_VERSION = 1;

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
  win.webContents.send('morrow:bar-keys', true);
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
      resolve([...new Set(names)].filter((n) => n && !/^(Electron|Morrow|Morrow Dev|Feng Shui)$/.test(n)).sort((a, b) => a.localeCompare(b)));
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
    { label: 'Feng Shui This Layout', click: () => fengShui() },
    { label: 'Save Layout As New…', click: () => windows.barWin?.webContents.executeJavaScript('document.querySelector(".seg.icon")?.click()') },
    { label: 'Show Layout Bar', type: 'checkbox', checked: (s.bar || {}).show !== false, click: () => store.updateSettings({ bar: { show: (s.bar || {}).show === false } }) },
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

// A small template image for the menu bar: a sun resting on the horizon.
// While the Mac is kept awake the sun is filled in.
function trayIcon(awake = false) {
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
      if (awake && y + 0.5 < cy && d < r) a = 1; // a risen, solid sun
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
  ipcMain.handle('morrow:init', (e, id) => ({
    widget: id && store.widget(id) ? windows.payload(store.widget(id)) : null,
    settings: store.doc.settings,
    doc: id ? null : store.doc,
    registry,
    notice: store.notice,
    nativeAvailable: require('./native').available,
  }));

  ipcMain.handle('morrow:about', () => ({ ...brand, version: app.getVersion(), electron: process.versions.electron }));
  ipcMain.on('morrow:open-repo', () => shell.openExternal(brand.repo));
  ipcMain.on('morrow:update-widget', (e, id, patch) => store.updateWidget(id || senderWidgetId(e), patch));
  ipcMain.on('morrow:gesture-start', (e, kind, edge) => windows.startGesture(senderWidgetId(e), kind, edge));
  ipcMain.on('morrow:gesture-end', () => windows.endGesture());
  ipcMain.on('morrow:context-menu', (e, extra) => {
    const id = senderWidgetId(e);
    // Widget-specific items come over as labels plus an action key.
    const items = (extra || []).map((x) => (x.type === 'separator' ? { type: 'separator' }
      : { label: x.label, ...(x.type === 'checkbox' || x.type === 'radio' ? { type: x.type, checked: !!x.checked } : {}), click: () => e.sender.send('morrow:menu-action', x.action) }));
    widgetContextMenu(id, items);
  });
  ipcMain.on('morrow:open-settings', (e, id) => openSettings(id));
  ipcMain.on('morrow:feng-shui', () => fengShui());
  ipcMain.on('morrow:bar-size', (e, w) => windows.sizeBar(w));
  ipcMain.on('morrow:bar-focus', () => { app.focus({ steal: true }); windows.barWin?.focus(); });
  // Only the bar on screen may end the mode (an old bar being replaced blurs as it goes).
  ipcMain.on('morrow:bar-keys', (e, on) => { if (BrowserWindow.fromWebContents(e.sender) === windows.barWin) layoutKeys(on); });
  ipcMain.on('morrow:bar-step', (e, dir) => stepLayout(dir > 0 ? 1 : -1));
  ipcMain.on('morrow:save-layout', (e, name) => saveLayout(name));
  ipcMain.on('morrow:nuke-open', (e) => openNuke(BrowserWindow.fromWebContents(e.sender)));
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
  ipcMain.handle('morrow:pizzint', (e, kind, force) => settle(pizzint().get(kind, { force })));
  ipcMain.on('morrow:pizzint-open', (e, kind) => shell.openExternal(kind === 'neh' ? 'https://www.pizzint.watch/nothingeverhappens' : 'https://www.pizzint.watch/'));
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
  ipcMain.handle('morrow:pick-page', async () => {
    app.focus({ steal: true });
    const r = await dialog.showOpenDialog(settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined, {
      properties: ['openFile'],
      filters: [{ name: 'Web page', extensions: ['html', 'htm'] }],
    });
    if (r.canceled) return { ok: false, canceled: true };
    return settle(pages.importPage(r.filePaths[0]));
  });
  ipcMain.on('morrow:open-watchlist', (e, user) => movies.openWatchlist(user));
  ipcMain.on('morrow:open-profile', (e, user) => movies.openProfile(user));
  ipcMain.handle('morrow:watched', (e, user, force) => movies.watched(user, { force }));
  ipcMain.handle('morrow:film-details', (e, slugs) => movies.details(slugs));
  ipcMain.handle('morrow:cabinet', async (e, op, ...args) => {
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
        case 'scan': return await cab.scan(root, args[0], (p) => { if (!e.sender.isDestroyed()) e.sender.send('morrow:cabinet-progress', { id: args[0], ...p }); });
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
  registerIpc();
  appMenu();

  tray = new Tray(trayIcon());
  // The "While App Is Running" list is kept fresh in the background.
  const refreshApps = async () => { const list = await visibleApps(); if (JSON.stringify(list) !== JSON.stringify(runningApps)) { runningApps = list; rebuildTray(); } };
  refreshApps();
  setInterval(refreshApps, 60000);
  tray.setToolTip(`${brand.name} (aka ${brand.aka})`);
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
  // Development aid: MORROW_FENG_TEST=ms runs Feng Shui once after launch.
  if (process.env.MORROW_FENG_TEST) setTimeout(fengShui, Number(process.env.MORROW_FENG_TEST));
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
    store.addWidget('random', { x: right - 174, y: area.y + 216, width: 150, height: 150 });
    openSettings();
  }

  if (process.env.MORROW_OPEN_SETTINGS) openSettings(process.env.MORROW_OPEN_SETTINGS);
  if (process.env.MORROW_OPEN_ABOUT) openAbout();
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
