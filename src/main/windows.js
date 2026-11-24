'use strict';

// Desktop window management. Every widget is its own frameless, transparent
// BrowserWindow with native macOS vibrancy behind it. All decisions about
// window level, Spaces and full-screen behaviour live in this file so they
// can be changed in one place.
//
// Window modes (Settings > General):
//   normal  - Default. Ordinary window level. Widgets sit beside your apps:
//             clicking one brings it forward, other apps cover it as usual.
//   desktop - Just above the desktop icons and below every app window
//             (CGWindowLevelForKey(kCGDesktopIconWindowLevelKey) + 1, set by
//             the native helper). Widgets stay on the wallpaper, still take
//             clicks, and stay put during Mission Control. Without the native
//             helper this falls back to Electron's "desktop" window type,
//             which macOS doesn't send clicks to, so "Arrange Widgets" in the
//             menu bar lifts them temporarily for editing.
//   float   - Always on top (floating level). Opt-in only.
//
// Spaces: with "Show on all Spaces" on, widgets follow you to every desktop
// Space. They are never shown over full-screen apps, which get their own
// Space on macOS. Stage Manager treats normal-mode widgets as windows of the
// Feng Shui app, so they may be grouped into a Feng Shui stage; desktop mode avoids
// that.

const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { TYPES } = require('../shared/registry');
const native = require('./native');
const bagua = require('./bagua');

const SNAP = 10;
const GAP = 12;

// A paper Sticky Note draws itself: its own paper, shadow and pin, with the
// desktop showing around it. Such windows get no native blur or shadow.
function paperNote(widget) {
  if (['cork', 'board', 'doughcon', 'neh', 'watched', 'nuke', 'cabinet', 'records', 'library'].includes(widget.type)) return true;
  if (widget.type === 'image' && widget.config.frame && widget.config.frame !== 'glass') return true;
  return widget.type === 'note' && (widget.config.paper || 'butter') !== 'glass';
}
// The Feng Shui layout puts every glass widget on one shared light glass,
// warm off-white with charcoal type over the living yin yang wallpaper: the
// same material, tint, radius and light, with only a small element accent
// telling them apart. Widgets that draw themselves (paper, cork, tickets) keep
// their own look. Every other layout is untouched.
let skinned = false;
const HARMONY = { material: 'popover', tint: '#f7f5f0', tintOpacity: 0.62, text: '#1d1c1a', highlight: 0.7, radius: 18, padding: 18, shadow: true, weight: 300 };
const ELEMENT_ACCENT = { wood: '#5f8d76', fire: '#d4582f', earth: '#a88b5c', metal: '#7d828a', water: '#527698' };
const appearanceOf = (widget) => (skinned && !paperNote(widget) ? { ...widget.appearance, ...HARMONY } : widget.appearance);
const materialOf = (widget) => (paperNote(widget) ? 'none' : appearanceOf(widget).material);
const shadowOf = (widget) => !paperNote(widget) && !!appearanceOf(widget).shadow;

class WidgetWindows {
  constructor(store, { onContextMenu } = {}) {
    this.store = store;
    this.windows = new Map(); // widget id -> BrowserWindow
    this.arranging = false;
    this.onContextMenu = onContextMenu;
    this.gesture = null;
  }

  get mode() {
    const mode = this.store.doc.settings.windowMode;
    if (mode === 'desktop' && !native.available) return this.arranging ? 'normal' : 'desktop-type';
    return mode;
  }

  get needsArranging() {
    return this.store.doc.settings.windowMode === 'desktop' && !native.available;
  }

  get skin() {
    return bagua.isFengShuiLayout(this.store.layout) ? 'fengshui' : null;
  }

  // What a widget window is sent: the widget, plus how the skin draws it.
  payload(widget) {
    if (!this.skin) return { ...widget, skin: null };
    const skin = bagua.skinFor(widget, TYPES[widget.type]?.name);
    const appearance = paperNote(widget) ? widget.appearance : { ...appearanceOf(widget), accent: ELEMENT_ACCENT[skin.element] || widget.appearance.accent };
    return { ...widget, appearance, skin };
  }

  // Bring the visible set of windows in line with the active layout.
  sync({ fade = false } = {}) {
    const { settings } = this.store.doc;
    skinned = !!this.skin;
    this.syncWallpaper();
    this.syncFengShui();
    this.syncBar();
    this.sendRoom();
    const wanted = new Map(this.store.widgets.filter((w) => w.visible).map((w) => [w.id, w]));
    for (const [id, win] of this.windows) {
      if (!wanted.has(id) || !settings.widgetsVisible) this.close(id, fade);
    }
    if (!settings.widgetsVisible) return;
    for (const w of wanted.values()) {
      const win = this.windows.get(w.id);
      if (!win) this.open(w, fade);
      else this.apply(w, win);
    }
  }

  open(widget, fade) {
    const bounds = this.onScreen(widget.bounds);
    const mode = this.mode;
    const material = materialOf(widget);
    const win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: shadowOf(widget),
      vibrancy: material === 'none' ? undefined : material,
      visualEffectState: 'active',
      roundedCorners: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      acceptFirstMouse: true,
      type: mode === 'desktop-type' ? 'desktop' : undefined,
      title: TYPES[widget.type].name,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: true,
      },
    });
    win.widgetId = widget.id;
    win.widgetMaterial = material;
    win.widgetMode = mode;
    if (mode === 'float') win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(!!this.store.doc.settings.allSpaces, { visibleOnFullScreen: false, skipTransformProcessType: true });
    if (mode === 'desktop') native.setDesktopLevel(win, true);
    win.widgetRadius = null;
    this.shape(win, widget);
    win.loadFile(path.join(__dirname, '..', 'renderer', 'widget.html'), { query: { id: widget.id } });
    win.once('ready-to-show', () => {
      if (fade) win.setOpacity(0);
      win.showInactive();
      win.widgetRadius = null;
      this.shape(win, this.store.widget(widget.id) || widget);
      if (process.env.FENGSHUI_CAPTURE) console.log('[native] shaped', widget.type, win.widgetRadius, 'level', mode);
      if (fade) this.fadeIn(win);
    });
    win.on('closed', () => {
      if (this.windows.get(widget.id) === win) this.windows.delete(widget.id);
    });
    this.windows.set(widget.id, win);
  }

  fadeIn(win) {
    let o = 0;
    const t = setInterval(() => {
      if (win.isDestroyed()) return clearInterval(t);
      o = Math.min(1, o + 0.1);
      win.setOpacity(o);
      if (o >= 1) clearInterval(t);
    }, 16);
  }

  close(id, fade) {
    const win = this.windows.get(id);
    this.windows.delete(id);
    if (!win || win.isDestroyed()) return;
    if (!fade) return win.destroy();
    let o = 1;
    const t = setInterval(() => {
      if (win.isDestroyed()) return clearInterval(t);
      o -= 0.12;
      if (o <= 0) { clearInterval(t); win.destroy(); } else win.setOpacity(o);
    }, 16);
  }

  // Apply changes to an existing window without recreating it when possible.
  apply(widget, win) {
    if (win.widgetMode !== this.mode) {
      this.close(widget.id);
      this.open(widget);
      return;
    }
    const material = materialOf(widget);
    if (material !== win.widgetMaterial) {
      win.setVibrancy(material === 'none' ? null : material);
      win.widgetMaterial = material;
      win.widgetRadius = null; // a new effect view needs its mask again
    }
    this.shape(win, widget);
    win.setHasShadow(shadowOf(widget));
    if (!this.gesture || this.gesture.id !== widget.id) {
      const b = win.getBounds();
      const t = widget.bounds;
      if (b.x !== t.x || b.y !== t.y || b.width !== t.width || b.height !== t.height) {
        win.setBounds(t, true);
      }
    }
    win.webContents.send('fengshui:widget', this.payload(widget));
  }

  // Round the native blur to the widget's own corner radius.
  shape(win, widget) {
    const r = appearanceOf(widget).radius;
    if (materialOf(widget) === 'none' || win.widgetRadius === r) return;
    if (native.setCornerRadius(win, r)) win.widgetRadius = r;
  }

  // The Feng Shui layout's wallpaper: a living yin yang on warm paper, on a
  // window at the desktop level, under the desktop icons and every widget.
  // The real wallpaper is never changed, so leaving the layout restores it at
  // once.
  syncWallpaper() {
    const want = this.store.doc.settings.widgetsVisible && !!this.skin;
    let win = this.wallWin;
    if (!want) {
      if (win && !win.isDestroyed()) win.destroy();
      this.wallWin = null;
      return;
    }
    if (win && !win.isDestroyed()) return;
    const d = screen.getPrimaryDisplay();
    win = this.wallWin = new BrowserWindow({
      ...d.bounds, show: false, frame: false, transparent: false, backgroundColor: '#eeebe4', hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, focusable: false,
      skipTaskbar: true, type: 'desktop', title: 'Feng Shui wallpaper', enableLargerThanScreen: true,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    win.setIgnoreMouseEvents(true);
    win.setVisibleOnAllWorkspaces(!!this.store.doc.settings.allSpaces, { visibleOnFullScreen: false, skipTransformProcessType: true });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'fengshui', 'wallpaper.html'));
    win.once('ready-to-show', () => { if (!win.isDestroyed()) win.showInactive(); });
    win.webContents.on('did-finish-load', () => { win.roomKey = null; this.sendRoom(); });
  }

  // Tell the wallpaper where the open centre of the room is, so the yin yang
  // sits in the space the widgets leave free and grows or shrinks to fit.
  sendRoom() {
    const win = this.wallWin;
    if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
    const d = screen.getPrimaryDisplay();
    const rects = this.store.widgets.filter((w) => w.visible).map((w) => w.bounds);
    const c = bagua.openCentre(rects, d.workArea);
    const room = JSON.stringify({ cx: c.cx - d.bounds.x, cy: c.cy - d.bounds.y, r: c.r });
    if (win.roomKey === room) return;
    win.roomKey = room;
    win.webContents.executeJavaScript(`window.fsRoom && window.fsRoom(${room})`).catch(() => {});
  }

  // The Feng Shui button: a small round window in the lower-right corner of
  // the main display, on the same layer as the widgets.
  syncFengShui() {
    const { settings } = this.store.doc;
    const fs = settings.fengShui || {};
    const want = settings.widgetsVisible && fs.show !== false;
    const icon = fs.icon === 'dragon' ? 'dragon' : 'yinyang';
    const mode = this.mode;
    let win = this.fengWin;
    if (win && !win.isDestroyed() && (!want || win.fengIcon !== icon || win.fengMode !== mode)) { win.destroy(); win = this.fengWin = null; }
    if (!want || (win && !win.isDestroyed())) return;
    const a = screen.getPrimaryDisplay().workArea;
    const size = 64;
    win = this.fengWin = new BrowserWindow({
      x: a.x + a.width - size - 14, y: a.y + a.height - size - 14, width: size, height: size,
      show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, acceptFirstMouse: true, type: mode === 'desktop-type' ? 'desktop' : undefined, title: 'Feng Shui',
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true },
    });
    win.fengIcon = icon;
    win.fengMode = mode;
    if (mode === 'float') win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(!!settings.allSpaces, { visibleOnFullScreen: false, skipTransformProcessType: true });
    if (mode === 'desktop') native.setDesktopLevel(win, true);
    win.loadFile(path.join(__dirname, '..', 'renderer', 'fengshui.html'), { query: { icon } });
    win.once('ready-to-show', () => {
      win.showInactive();
      // Keep it down on the desktop with the widgets, not above other apps.
      if (mode === 'desktop') native.setDesktopLevel(win, true);
    });
  }

  // The layout bar: a liquid-glass switcher in the top-right corner of the
  // main display, on the same layer as the widgets. It sizes itself to fit.
  syncBar() {
    const { settings, layouts, activeLayoutId } = this.store.doc;
    // While switching layouts with the keys the bar shows even if it is set to hidden.
    const want = (settings.widgetsVisible && (settings.bar || {}).show !== false) || !!this.barKeys;
    const mode = this.mode;
    let win = this.barWin;
    const skin = this.skin;
    if (win && !win.isDestroyed() && (!want || win.barMode !== mode || win.barSkin !== skin)) { win.destroy(); win = this.barWin = null; }
    if (!want) return;
    const state = { layouts: layouts.map((l) => ({ id: l.id, name: l.name })), active: activeLayoutId, skin, locked: !!settings.locked, lockOrder: !!(settings.bar || {}).lockOrder };
    if (win && !win.isDestroyed()) { win.webContents.send('fengshui:bar', state); return; }
    const a = screen.getPrimaryDisplay().workArea;
    const H = 34;
    win = this.barWin = new BrowserWindow({
      x: a.x + a.width - 420 - 12, y: a.y + 10, width: 420, height: H,
      show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: true,
      vibrancy: 'hud', visualEffectState: 'active', roundedCorners: true,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, acceptFirstMouse: true, type: mode === 'desktop-type' ? 'desktop' : undefined, title: 'Layouts',
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true },
    });
    win.barMode = mode;
    win.barSkin = skin;
    win.barState = state;
    if (mode === 'float') win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(!!settings.allSpaces, { visibleOnFullScreen: false, skipTransformProcessType: true });
    if (mode === 'desktop') native.setDesktopLevel(win, true);
    native.setCornerRadius(win, H / 2);
    win.loadFile(path.join(__dirname, '..', 'renderer', 'bar.html'));
    win.webContents.once('did-finish-load', () => win.webContents.send('fengshui:bar', this.store.doc && { layouts: this.store.doc.layouts.map((l) => ({ id: l.id, name: l.name })), active: this.store.doc.activeLayoutId, skin: this.skin, locked: !!this.store.doc.settings.locked, lockOrder: !!(this.store.doc.settings.bar || {}).lockOrder }));
    win.once('ready-to-show', () => {
      // A bar rebuilt mid-way through keyboard switching (the Feng Shui skin
      // comes and goes with its layout) picks the keyboard straight back up.
      if (this.barKeys) { win.show(); win.focus(); win.webContents.send('fengshui:bar-keys', true); } else win.showInactive();
      native.setCornerRadius(win, H / 2);
      if (mode === 'desktop') native.setDesktopLevel(win, true);
    });
  }

  // The bar asks for the width its contents need; it stays pinned to the right.
  sizeBar(width) {
    const win = this.barWin;
    if (!win || win.isDestroyed()) return;
    const a = screen.getPrimaryDisplay().workArea;
    const w = Math.max(60, Math.min(a.width - 40, Math.round(width)));
    const b = win.getBounds();
    if (b.width === w) return;
    win.setBounds({ x: a.x + a.width - w - 12, y: a.y + 10, width: w, height: b.height });
    if (!win.barSkin) native.setCornerRadius(win, b.height / 2);
  }

  broadcast(channel, payload) {
    for (const win of this.windows.values()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }

  recreateAll() {
    for (const id of [...this.windows.keys()]) this.close(id);
    this.sync();
  }

  setArranging(on) {
    this.arranging = on;
    this.recreateAll();
  }

  // Keep restored widgets reachable when a monitor was disconnected.
  onScreen(b) {
    const displays = screen.getAllDisplays();
    const visible = displays.some((d) => {
      const a = d.workArea;
      return b.x + b.width > a.x + 40 && b.x < a.x + a.width - 40 && b.y + b.height > a.y + 20 && b.y < a.y + a.height - 20;
    });
    if (visible) return { x: b.x, y: b.y, width: b.width, height: b.height };
    const a = screen.getPrimaryDisplay().workArea;
    return {
      x: Math.round(a.x + Math.max(0, (a.width - b.width) / 2)),
      y: Math.round(a.y + Math.max(0, (a.height - b.height) / 3)),
      width: b.width,
      height: b.height,
    };
  }

  revalidateScreens() {
    for (const w of this.store.widgets) {
      const fixed = this.onScreen(w.bounds);
      if (fixed.x !== w.bounds.x || fixed.y !== w.bounds.y) this.store.updateWidget(w.id, { bounds: fixed });
    }
  }

  // Dragging and resizing ------------------------------------------------
  // The renderer reports mouse down/up; the main process follows the cursor
  // so it can apply snapping against screen edges and other widgets.

  startGesture(id, kind, edge) {
    const win = this.windows.get(id);
    const widget = this.store.widget(id);
    if (!win || !widget || this.store.doc.settings.locked) return;
    this.endGesture();
    const cursor = screen.getCursorScreenPoint();
    this.gesture = { id, kind, edge, win, cursor, start: win.getBounds(), type: TYPES[widget.type] };
    this.gesture.timer = setInterval(() => this.stepGesture(), 1000 / 60);
  }

  stepGesture() {
    const g = this.gesture;
    if (!g || g.win.isDestroyed()) return this.endGesture();
    if (native.mouseDown() === false) return this.endGesture();
    const c = screen.getCursorScreenPoint();
    const dx = c.x - g.cursor.x;
    const dy = c.y - g.cursor.y;
    let b = { ...g.start };
    if (g.kind === 'move') {
      b.x += dx;
      b.y += dy;
      if (this.store.doc.settings.snapping) b = this.snap(b, g.id);
    } else {
      const { min, max } = g.type;
      if (g.edge.includes('e')) b.width = clamp(g.start.width + dx, min.width, max.width);
      if (g.edge.includes('s')) b.height = clamp(g.start.height + dy, min.height, max.height);
      if (g.edge.includes('w')) {
        b.width = clamp(g.start.width - dx, min.width, max.width);
        b.x = g.start.x + g.start.width - b.width;
      }
      if (g.edge.includes('n')) {
        b.height = clamp(g.start.height - dy, min.height, max.height);
        b.y = g.start.y + g.start.height - b.height;
      }
    }
    const cur = g.win.getBounds();
    if (cur.x !== b.x || cur.y !== b.y || cur.width !== b.width || cur.height !== b.height) g.win.setBounds(b);
  }

  endGesture() {
    const g = this.gesture;
    if (!g) return;
    clearInterval(g.timer);
    this.gesture = null;
    if (!g.win.isDestroyed()) this.store.updateWidget(g.id, { bounds: g.win.getBounds() });
  }

  snap(b, selfId) {
    const display = screen.getDisplayMatching(b);
    const a = display.workArea;
    const xs = [];
    const ys = [];
    // Screen edges, inset by a comfortable margin.
    xs.push([a.x + GAP, 'l'], [a.x + a.width - GAP, 'r'], [a.x + a.width / 2, 'c']);
    ys.push([a.y + GAP, 't'], [a.y + a.height - GAP, 'b']);
    for (const [id, win] of this.windows) {
      if (id === selfId || win.isDestroyed()) continue;
      const o = win.getBounds();
      // Align edges, and sit next to another widget with a consistent gap.
      xs.push([o.x, 'l'], [o.x + o.width, 'r'], [o.x + o.width + GAP, 'l'], [o.x - GAP, 'r']);
      ys.push([o.y, 't'], [o.y + o.height, 'b'], [o.y + o.height + GAP, 't'], [o.y - GAP, 'b']);
    }
    const best = (cands, edges) => {
      let found = null;
      for (const [v, side] of cands) {
        const e = edges[side];
        if (e === undefined) continue;
        const d = Math.abs(v - e.at);
        if (d <= SNAP && (!found || d < found.d)) found = { d, shift: v - e.at };
      }
      return found ? found.shift : 0;
    };
    const sx = best(xs, { l: { at: b.x }, r: { at: b.x + b.width }, c: { at: b.x + b.width / 2 } });
    const sy = best(ys, { t: { at: b.y }, b: { at: b.y + b.height } });
    return { ...b, x: Math.round(b.x + sx), y: Math.round(b.y + sy) };
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

module.exports = { WidgetWindows };
