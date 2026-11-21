'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { TYPES, DEFAULT_APPEARANCE } = require('../shared/registry');

const VERSION = 1;

const DEFAULT_SETTINGS = {
  widgetsVisible: true,
  windowMode: 'desktop', // desktop | normal | float
  allSpaces: true,
  snapping: true,
  locked: false,
  showDock: false,
  launchAtLogin: false,
  fengShui: { show: false, icon: 'yinyang' },
  appearance: { ...DEFAULT_APPEARANCE },
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Recursive merge used for both patches and for filling in defaults when an
// older or partially damaged configuration is loaded. Arrays are replaced.
function merge(base, patch) {
  if (!isObject(base) || !isObject(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObject(v) && isObject(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const newId = () => crypto.randomUUID();

// Older saved data, upgraded in place so nothing a user set up is lost.
function migrate(raw) {
  if (raw.type === 'countdown' && isObject(raw.config) && raw.config.layout && !raw.config.style) {
    const { layout, ...rest } = raw.config;
    return { ...raw, config: { ...rest, style: layout === 'live' ? 'live' : 'editorial' } };
  }
  return raw;
}

function normalizeWidget(raw, fallbackAppearance) {
  if (!isObject(raw) || !TYPES[raw.type]) return null;
  raw = migrate(raw);
  const type = TYPES[raw.type];
  const w = merge(
    {
      id: newId(),
      type: raw.type,
      visible: true,
      bounds: { x: 120, y: 120, ...type.size },
      appearance: clone(fallbackAppearance),
      config: clone(type.config),
    },
    raw,
  );
  for (const k of ['x', 'y', 'width', 'height']) {
    if (!Number.isFinite(w.bounds[k])) w.bounds[k] = k === 'width' || k === 'height' ? type.size[k] : 120;
  }
  w.bounds.width = Math.min(type.max.width, Math.max(type.min.width, Math.round(w.bounds.width)));
  w.bounds.height = Math.min(type.max.height, Math.max(type.min.height, Math.round(w.bounds.height)));
  return w;
}

function emptyDocument() {
  const layoutId = newId();
  return {
    version: VERSION,
    settings: clone(DEFAULT_SETTINGS),
    presets: [],
    activeLayoutId: layoutId,
    layouts: [{ id: layoutId, name: 'Personal', widgets: [] }],
  };
}

function normalizeDocument(raw) {
  const doc = emptyDocument();
  if (!isObject(raw)) return doc;
  doc.settings = merge(doc.settings, isObject(raw.settings) ? raw.settings : {});
  doc.settings.appearance = merge(DEFAULT_APPEARANCE, doc.settings.appearance || {});
  doc.presets = Array.isArray(raw.presets)
    ? raw.presets.filter((p) => isObject(p) && p.name).map((p) => ({ id: p.id || newId(), name: String(p.name), appearance: merge(DEFAULT_APPEARANCE, p.appearance || {}) }))
    : [];
  if (Array.isArray(raw.layouts) && raw.layouts.length) {
    doc.layouts = raw.layouts.filter(isObject).map((l) => ({
      id: l.id || newId(),
      name: String(l.name || 'Untitled'),
      widgets: (Array.isArray(l.widgets) ? l.widgets : [])
        .map((w) => normalizeWidget(w, doc.settings.appearance))
        .filter(Boolean)
        .map((w) => ({ ...w, appearance: merge(DEFAULT_APPEARANCE, w.appearance) })),
    }));
  }
  if (!doc.layouts.length) doc.layouts = emptyDocument().layouts;
  doc.activeLayoutId = doc.layouts.some((l) => l.id === raw.activeLayoutId) ? raw.activeLayoutId : doc.layouts[0].id;
  return doc;
}

class Store extends EventEmitter {
  constructor(dir) {
    super();
    this.file = path.join(dir, 'morrow-config.json');
    this.notice = null;
    this.doc = this.load();
    this.saveTimer = null;
  }

  load() {
    let text;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      return emptyDocument();
    }
    try {
      return normalizeDocument(JSON.parse(text));
    } catch (err) {
      // Keep the damaged file for the user instead of silently overwriting it.
      const backup = this.file.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
      try { fs.renameSync(this.file, backup); } catch {}
      this.notice = `Morrow couldn't read its saved configuration, so it started fresh. The old file was kept at ${backup}.`;
      return emptyDocument();
    }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.saveTimer);
    const tmp = this.file + '.tmp';
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.doc, null, 2));
    fs.renameSync(tmp, this.file);
  }

  changed(kind, detail) {
    this.save();
    this.emit('change', kind, detail);
  }

  get layout() {
    return this.doc.layouts.find((l) => l.id === this.doc.activeLayoutId) || this.doc.layouts[0];
  }

  get widgets() {
    return this.layout.widgets;
  }

  widget(id) {
    return this.widgets.find((w) => w.id === id);
  }

  addWidget(type, bounds) {
    // Some types start from their own appearance, e.g. notes are left-aligned.
    const appearance = merge(this.doc.settings.appearance, TYPES[type]?.appearance || {});
    const w = normalizeWidget({ type, bounds, appearance }, this.doc.settings.appearance);
    if (!w) return null;
    this.widgets.push(w);
    this.changed('widgets', { added: w.id });
    return w;
  }

  duplicateWidget(id) {
    const src = this.widget(id);
    if (!src) return null;
    const copy = clone(src);
    copy.id = newId();
    copy.bounds.x += 24;
    copy.bounds.y += 24;
    this.widgets.push(copy);
    this.changed('widgets', { added: copy.id });
    return copy;
  }

  removeWidget(id) {
    const layout = this.layout;
    layout.widgets = layout.widgets.filter((w) => w.id !== id);
    this.changed('widgets', { removed: id });
  }

  updateWidget(id, patch) {
    const layout = this.layout;
    const i = layout.widgets.findIndex((w) => w.id === id);
    if (i < 0) return null;
    layout.widgets[i] = normalizeWidget(merge(layout.widgets[i], patch), this.doc.settings.appearance);
    this.changed('widget', { id });
    return layout.widgets[i];
  }

  updateSettings(patch) {
    this.doc.settings = merge(this.doc.settings, patch);
    this.changed('settings');
  }

  // Layouts -------------------------------------------------------------

  createLayout(name, fromId) {
    const src = fromId && this.doc.layouts.find((l) => l.id === fromId);
    const layout = {
      id: newId(),
      name: name || 'New layout',
      widgets: src ? clone(src.widgets).map((w) => ({ ...w, id: newId() })) : [],
    };
    this.doc.layouts.push(layout);
    this.changed('layouts');
    return layout;
  }

  renameLayout(id, name) {
    const l = this.doc.layouts.find((x) => x.id === id);
    if (l && name.trim()) { l.name = name.trim(); this.changed('layouts'); }
  }

  deleteLayout(id) {
    if (this.doc.layouts.length < 2) return;
    this.doc.layouts = this.doc.layouts.filter((l) => l.id !== id);
    if (this.doc.activeLayoutId === id) this.doc.activeLayoutId = this.doc.layouts[0].id;
    this.changed('layout-switch');
  }

  switchLayout(id) {
    if (!this.doc.layouts.some((l) => l.id === id) || id === this.doc.activeLayoutId) return;
    this.doc.activeLayoutId = id;
    this.changed('layout-switch');
  }

  // Presets -------------------------------------------------------------

  savePreset(name, appearance) {
    const preset = { id: newId(), name: name || 'My preset', appearance: merge(DEFAULT_APPEARANCE, appearance) };
    this.doc.presets.push(preset);
    this.changed('presets');
    return preset;
  }

  deletePreset(id) {
    this.doc.presets = this.doc.presets.filter((p) => p.id !== id);
    this.changed('presets');
  }
}

module.exports = { Store, merge, normalizeDocument };
