import { h } from './dom.js';

const api = window.morrow;
const nav = document.getElementById('nav');
const main = document.getElementById('main');
const foot = document.getElementById('foot');

let doc;
let registry;
let zones = [];
let page = 'widgets';
let selected = new URLSearchParams(location.search).get('widget');
let lastLocalEdit = 0;

const GLYPHS = { clock: '9:41', countdown: '12', random: '37', coin: '◐', stopwatch: '0:14', launcher: '⌘', weather: '°', worldclock: '⊕' };
const ART = {
  clock: ['10:42', 'Thursday · October 9'],
  countdown: ['48', 'days to go'],
  random: ['27', '1 – 100'],
  coin: ['◐', 'heads'],
  stopwatch: ['01:24.6', 'lap 3'],
  launcher: ['⌘', 'your apps'],
  weather: ['18°', 'partly cloudy'],
  worldclock: ['22:10', 'Tokyo · +7h'],
};

const PAGES = [
  ['widgets', 'Widgets', '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="1.5" y="9" width="13" height="5.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'],
  ['gallery', 'Gallery', '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'],
  ['layouts', 'Layouts', '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 2.5v11" stroke="currentColor" stroke-width="1.3"/></svg>'],
  ['appearance', 'Appearance', '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.8a6.2 6.2 0 0 0 0 12.4z" fill="currentColor"/></svg>'],
  ['general', 'General', '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'],
];

const layout = () => doc.layouts.find((l) => l.id === doc.activeLayoutId) || doc.layouts[0];
const widgets = () => layout().widgets;
const widgetById = (id) => widgets().find((w) => w.id === id);

// Edits are applied locally right away, then sent to the main process, so
// the form never waits on a round trip.
function editWidget(id, patch) {
  const w = widgetById(id);
  if (w) deepAssign(w, patch);
  lastLocalEdit = Date.now();
  api.updateWidget(id, patch);
}
function editSettings(patch) {
  deepAssign(doc.settings, patch);
  lastLocalEdit = Date.now();
  api.updateSettings(patch);
}
function deepAssign(t, p) {
  for (const [k, v] of Object.entries(p)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object') deepAssign(t[k], v);
    else t[k] = v;
  }
}

function toast(msg) {
  const t = h('div.toast', {}, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1800);
}

// Form controls --------------------------------------------------------------

function row(label, control, hint) {
  return h('div.row', {}, h('div.k', {}, label, hint ? h('small', {}, hint) : null), h('div.v', {}, control));
}

function toggle(value, onChange, label) {
  const input = h('input', { type: 'checkbox', checked: !!value, 'aria-label': label });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label.switch', {}, input, h('span'));
}

function slider(value, { min, max, step = 1, format = (v) => v }, onChange, label) {
  const out = h('span.range-val', {}, format(value));
  const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
  input.addEventListener('input', () => {
    out.textContent = format(Number(input.value));
    onChange(Number(input.value));
  });
  return h('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, input, out);
}

function select(value, options, onChange, label) {
  const s = h('select', { 'aria-label': label }, ...Object.entries(options).map(([v, t]) => h('option', { value: v, selected: v === String(value) }, t)));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function segmented(value, options, onChange) {
  const wrap = h('div.segmented', { role: 'radiogroup' });
  for (const [v, t] of Object.entries(options)) {
    const b = h(`button${v === value ? '.on' : ''}`, { role: 'radio', 'aria-checked': String(v === value) }, t);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onChange(v);
    });
    wrap.append(b);
  }
  return wrap;
}

function text(value, onChange, { placeholder = '', type = 'text', label } = {}) {
  const input = h('input', { type, value: value ?? '', placeholder, 'aria-label': label });
  input.addEventListener('change', () => onChange(type === 'number' ? Number(input.value) : input.value));
  if (type === 'text') input.addEventListener('input', () => onChange(input.value));
  return input;
}

function color(value, onChange, label) {
  const input = h('input', { type: 'color', value, 'aria-label': label });
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

function timezone(value, onChange) {
  const listId = 'tz-list';
  if (!document.getElementById(listId)) {
    document.body.append(h('datalist', { id: listId }, ...zones.map((z) => h('option', { value: z }))));
  }
  const input = h('input', { type: 'text', value: value || '', placeholder: 'Local time', list: listId, 'aria-label': 'Time zone' });
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (v && !zones.includes(v)) {
      input.style.boxShadow = 'inset 0 0 0 1px var(--danger)';
      toast('Unknown time zone. Pick one from the list, or leave it empty for local time.');
      return;
    }
    input.style.boxShadow = '';
    onChange(v);
  });
  return input;
}

// Pages --------------------------------------------------------------------------

function renderNav() {
  nav.replaceChildren(
    ...PAGES.map(([id, label, icon]) =>
      h(`button${page === id ? '.active' : ''}`, { onclick: () => go(id) }, h('span', { html: icon, style: { display: 'grid' } }), label,
        id === 'widgets' ? h('span.count', {}, String(widgets().length)) : null),
    ),
  );
  const visible = doc.settings.widgetsVisible;
  foot.replaceChildren(
    h('div', { style: { color: 'var(--muted)', fontSize: '12px', padding: '0 6px' } }, `Layout: ${layout().name}`),
    h('button.btn', { onclick: () => editSettings({ widgetsVisible: !visible }) }, visible ? 'Hide widgets' : 'Show widgets'),
  );
}

function go(id) {
  page = id;
  render(true);
}

function render(animate = false) {
  const scroll = main.scrollTop;
  renderNav();
  const view = { widgets: widgetsPage, gallery: galleryPage, layouts: layoutsPage, appearance: appearancePage, general: generalPage }[page]();
  main.replaceChildren(...[view].flat());
  if (!animate) {
    main.scrollTop = scroll;
    main.querySelectorAll(':scope > *').forEach((el) => (el.style.animation = 'none'));
  } else main.scrollTop = 0;
}

function summary(w) {
  const c = w.config;
  switch (w.type) {
    case 'countdown': return c.title || 'Countdown';
    case 'clock': return `${c.hour12 ? '12' : '24'}-hour${c.seconds ? ', seconds' : ''}`;
    case 'random': return `${c.min} – ${c.max}`;
    case 'coin': return `${c.heads} / ${c.tails}`;
    default: return registry.TYPES[w.type].description;
  }
}

function widgetsPage() {
  const list = widgets();
  if (selected && !widgetById(selected)) selected = null;
  if (!selected && list.length) selected = list[0].id;

  const head = [h('h1', {}, 'Widgets'), h('p.subtitle', {}, 'Everything on your desktop in this layout. Drag widgets on the desktop to move them, pull an edge to resize, and right-click for more.')];
  if (!list.length) {
    return [...head, h('div.group', {}, h('div.empty', {}, 'No widgets yet. ', h('button.btn.primary', { onclick: () => go('gallery') }, 'Open the gallery')))];
  }
  const items = h('div.wlist', {}, ...list.map((w) =>
    h(`button.witem${w.id === selected ? '.active' : ''}${w.visible ? '' : '.hidden-w'}`, { onclick: () => { selected = w.id; render(); } },
      h('span.glyph', {}, GLYPHS[w.type] || '•'),
      h('span.meta', {}, h('div', {}, registry.TYPES[w.type].name), h('small', {}, w.visible ? summary(w) : 'Hidden')),
    )));
  return [...head, h('div.split', {}, items, inspector(widgetById(selected)))];
}

function inspector(w) {
  const t = registry.TYPES[w.type];
  const head = h('div.inspector-head', {},
    h('h3', {}, t.name),
    h('button.btn', { onclick: () => editWidget(w.id, { visible: !w.visible }) || render() }, w.visible ? 'Hide' : 'Show'),
    h('button.btn', { onclick: () => api.duplicateWidget(w.id) }, 'Duplicate'),
    h('button.btn.danger', { onclick: () => { api.removeWidget(w.id); selected = null; } }, 'Remove'),
  );

  const content = t.fields.length ? [h('h2', {}, 'Content'), h('div.group', {}, ...t.fields.filter((f) => matches(f, w.config)).map((f) => field(w, f)))] : [];

  const size = [
    h('h2', {}, 'Size'),
    h('div.group', {},
      row('Width', slider(w.bounds.width, { min: t.min.width, max: Math.min(t.max.width, 1200), format: (v) => `${v}` }, (v) => editWidget(w.id, { bounds: { width: v } }), 'Width')),
      row('Height', slider(w.bounds.height, { min: t.min.height, max: Math.min(t.max.height, 900), format: (v) => `${v}` }, (v) => editWidget(w.id, { bounds: { height: v } }), 'Height')),
      row('Reset to default size', h('button.btn', { onclick: () => { editWidget(w.id, { bounds: { ...t.size } }); render(); } }, 'Reset')),
    ),
  ];

  return h('div', {}, head, ...content, ...size, ...appearanceEditor(w.appearance, (patch) => editWidget(w.id, { appearance: patch }), { imageSupport: t.imageSupport, widget: w }));
}

function matches(f, config) {
  return !f.when || Object.entries(f.when).every(([k, v]) => config[k] === v);
}

function field(w, f) {
  const v = w.config[f.key];
  const set = (val) => {
    editWidget(w.id, { config: { [f.key]: val } });
    if (registry.TYPES[w.type].fields.some((x) => x.when && f.key in x.when)) render();
  };
  switch (f.type) {
    case 'toggle': return row(f.label, toggle(v, set, f.label));
    case 'select': return row(f.label, select(v, f.options, set, f.label));
    case 'number': return row(f.label, text(v, (n) => Number.isSafeInteger(n) ? set(n) : toast('Enter a whole number'), { type: 'number', label: f.label }));
    case 'datetime': return row(f.label, text(v, set, { type: 'datetime-local', label: f.label }), 'Local wall-clock time in the zone below.');
    case 'timezone': return row(f.label, timezone(v, set), 'Leave empty to use this Mac’s time zone.');
    default: return row(f.label, text(v, set, { placeholder: f.placeholder || '', label: f.label }));
  }
}

function presetSwatch(ap) {
  return h('span.sw', { style: { background: ap.tintOpacity > 0 ? ap.tint : 'transparent', color: ap.text, boxShadow: `inset 0 0 0 1px ${ap.accent}` } }, 'A');
}

function appearanceEditor(ap, set, { imageSupport, widget, global } = {}) {
  const F = registry.FONTS;
  const fonts = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, v.label]));
  const applyPreset = (p) => { set(p.appearance); render(); };
  const presets = [
    ...registry.PRESETS.map((p) => h('button.chip', { onclick: () => applyPreset(p) }, presetSwatch({ ...ap, ...p.appearance }), p.name)),
    ...doc.presets.map((p) => h('button.chip', { onclick: () => applyPreset(p) }, presetSwatch(p.appearance), p.name,
      h('span.x', { title: 'Delete preset', onclick: (e) => { e.stopPropagation(); api.deletePreset(p.id); } }, '×'))),
    h('button.chip', { onclick: (e) => {
      // Electron has no prompt(), so the chip turns into a name field.
      const chip = e.currentTarget;
      const input = h('input', { type: 'text', placeholder: 'Preset name', 'aria-label': 'Preset name', style: { width: '160px' } });
      chip.replaceWith(input);
      input.focus();
      input.addEventListener('keydown', async (ev) => {
        if (ev.key === 'Escape') render();
        if (ev.key !== 'Enter') return;
        const name = input.value.trim();
        input.blur();
        if (name) { await api.savePreset(name, ap); toast(`Saved “${name}”`); } else render();
      });
      input.addEventListener('blur', () => setTimeout(render, 100));
    } }, h('span.sw', {}, '+'), 'Save current…'),
  ];

  const pct = (v) => `${Math.round(v * 100)}%`;
  const out = [
    h('h2', {}, 'Style'),
    h('div.group', {}, h('div.chips', {}, ...presets)),
    h('h2', {}, 'Glass'),
    h('div.group', {},
      row('Material', select(ap.material, registry.MATERIALS, (v) => set({ material: v }), 'Material'), 'Native macOS blur behind the widget.'),
      row('Tint', h('span', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, color(ap.tint, (v) => set({ tint: v }), 'Tint color'),
        slider(ap.tintOpacity, { min: 0, max: 0.95, step: 0.01, format: pct }, (v) => set({ tintOpacity: v }), 'Tint strength')), 'Raise the strength for legibility on busy wallpapers.'),
      row('Highlight', slider(ap.highlight, { min: 0, max: 1, step: 0.05, format: pct }, (v) => set({ highlight: v }), 'Highlight'), 'Light-catching edge and sheen.'),
      row('Corner radius', slider(ap.radius, { min: 0, max: 48, format: (v) => `${v}` }, (v) => set({ radius: v }), 'Corner radius')),
      row('Shadow', toggle(ap.shadow, (v) => set({ shadow: v }), 'Shadow')),
      ...(imageSupport ? [
        row('Background image', h('span', { style: { display: 'flex', gap: '8px' } },
          h('button.btn', { onclick: async () => { const p = await api.pickImage(); if (p) { set({ image: p }); render(); } } }, ap.image ? 'Change…' : 'Choose…'),
          ap.image ? h('button.btn', { onclick: () => { set({ image: '' }); render(); } }, 'Remove') : null), ap.image ? ap.image.split('/').pop() : 'Optional photo behind the content.'),
        ...(ap.image ? [row('Image strength', slider(ap.imageOpacity, { min: 0.1, max: 1, step: 0.05, format: pct }, (v) => set({ imageOpacity: v }), 'Image strength'))] : []),
      ] : []),
    ),
    h('h2', {}, 'Type'),
    h('div.group', {},
      row('Display typeface', select(ap.font, fonts, (v) => set({ font: v }), 'Display typeface'), 'Numerals and headlines.'),
      row('Detail typeface', select(ap.infoFont, fonts, (v) => set({ infoFont: v }), 'Detail typeface'), 'Labels, dates and controls.'),
      row('Weight', slider(ap.weight, { min: 100, max: 900, step: 100 }, (v) => set({ weight: v }), 'Weight')),
      row('Size', slider(ap.scale, { min: 0.6, max: 1.6, step: 0.05, format: pct }, (v) => set({ scale: v }), 'Text size')),
      row('Alignment', segmented(ap.align, { left: 'Left', center: 'Center', right: 'Right' }, (v) => set({ align: v }))),
      row('Labels', toggle(ap.labels, (v) => set({ labels: v }), 'Show labels')),
      row('Padding', slider(ap.padding, { min: 4, max: 48 }, (v) => set({ padding: v }), 'Padding')),
    ),
    h('h2', {}, 'Color'),
    h('div.group', {},
      row('Text', color(ap.text, (v) => set({ text: v }), 'Text color')),
      row('Accent', color(ap.accent, (v) => set({ accent: v }), 'Accent color')),
    ),
  ];
  if (global) {
    out.push(h('div', { style: { marginTop: '16px', display: 'flex', gap: '8px' } },
      h('button.btn', { onclick: () => { for (const w of widgets()) editWidget(w.id, { appearance: { ...doc.settings.appearance, image: w.appearance.image } }); toast('Applied to every widget in this layout'); } }, 'Apply to all widgets in this layout')));
  }
  return out;
}

function galleryPage() {
  const counts = {};
  for (const w of widgets()) counts[w.type] = (counts[w.type] || 0) + 1;
  return [
    h('h1', {}, 'Gallery'),
    h('p.subtitle', {}, 'Add as many as you like. Each one is independent, with its own size, style and settings.'),
    h('div.gallery', {}, ...Object.entries(registry.TYPES).map(([type, t]) => {
      const [big, small] = ART[type] || ['•', ''];
      return h('div.card', {},
        h('div.art', {}, h('div', {}, big, h('small', {}, small))),
        h('div.body', {},
          h('b', {}, t.name),
          h('p', {}, t.description),
          counts[type] ? h('span.count', {}, `${counts[type]} on the desktop`) : null,
          h('button.btn.primary', { onclick: async () => {
            const w = await api.addWidget(type);
            if (w) { selected = w.id; toast(`Added ${t.name}`); }
          } }, 'Add to desktop')));
    })),
  ];
}

function layoutsPage() {
  const rows = doc.layouts.map((l) => {
    const active = l.id === doc.activeLayoutId;
    const name = h('input', { type: 'text', value: l.name, 'aria-label': 'Layout name' });
    name.addEventListener('change', () => api.renameLayout(l.id, name.value));
    name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
    return h('div.row.layout-row', {},
      h('div.name', {}, name, h('small', { style: { color: 'var(--muted)', display: 'block' } }, `${l.widgets.length} widget${l.widgets.length === 1 ? '' : 's'}`)),
      active ? h('span.badge', {}, 'Active') : h('button.btn.primary', { onclick: () => api.switchLayout(l.id) }, 'Switch'),
      h('button.btn', { onclick: async () => { await api.createLayout(`${l.name} copy`, l.id); toast('Layout duplicated'); } }, 'Duplicate'),
      h('button.btn.danger', { disabled: doc.layouts.length < 2, onclick: () => confirm(`Delete “${l.name}” and its widgets?`) && api.deleteLayout(l.id) }, 'Delete'));
  });
  return [
    h('h1', {}, 'Layouts'),
    h('p.subtitle', {}, 'Each layout remembers its own widgets, positions, sizes and styles. Switching swaps the desktop without moving anything in the other layouts.'),
    h('div.group', {}, ...rows),
    h('div', { style: { marginTop: '14px', display: 'flex', gap: '8px' } },
      h('button.btn', { onclick: async () => { const l = await api.createLayout('New layout'); api.switchLayout(l.id); } }, 'New empty layout'),
      h('button.btn', { onclick: async () => { const l = await api.createLayout(`${layout().name} copy`, layout().id); api.switchLayout(l.id); } }, 'Duplicate current')),
  ];
}

function appearancePage() {
  return [
    h('h1', {}, 'Appearance'),
    h('p.subtitle', {}, 'The default style for new widgets. Each widget can still be styled on its own from the Widgets page.'),
    ...appearanceEditor(doc.settings.appearance, (patch) => editSettings({ appearance: patch }), { global: true }),
  ];
}

function generalPage() {
  const s = doc.settings;
  const modes = {
    normal: 'Beside your windows',
    desktop: 'On the desktop layer',
    float: 'Always on top',
  };
  const modeHints = {
    normal: 'Widgets behave like ordinary windows. Click one to bring it forward; your apps cover them as usual.',
    desktop: 'Widgets sit below every app, on the wallpaper. macOS doesn’t send clicks to this layer, so use Arrange Widgets in the menu bar to edit them.',
    float: 'Widgets float above other apps. Useful for a timer you need to watch.',
  };
  return [
    h('h1', {}, 'General'),
    h('p.subtitle', {}, 'How Morrow behaves on your Mac.'),
    h('h2', {}, 'Desktop'),
    h('div.group', {},
      row('Widget placement', select(s.windowMode, modes, (v) => { editSettings({ windowMode: v }); render(); }, 'Widget placement'), modeHints[s.windowMode]),
      row('Show on all Spaces', toggle(s.allSpaces, (v) => editSettings({ allSpaces: v }), 'Show on all Spaces'), 'Widgets never appear over full-screen apps.'),
      row('Snap to edges and other widgets', toggle(s.snapping, (v) => editSettings({ snapping: v }), 'Snapping')),
      row('Lock positions', toggle(s.locked, (v) => editSettings({ locked: v }), 'Lock positions'), 'Prevents accidental moves and resizes.'),
      row('Show widgets', toggle(s.widgetsVisible, (v) => { editSettings({ widgetsVisible: v }); render(); }, 'Show widgets'), 'Shortcut: ⌥⌘W while Morrow is active, or the menu bar icon.'),
    ),
    h('h2', {}, 'App'),
    h('div.group', {},
      row('Show in Dock', toggle(s.showDock, (v) => editSettings({ showDock: v }), 'Show in Dock'), 'Morrow is always available from the menu bar.'),
      row('Open at login', toggle(s.launchAtLogin, (v) => editSettings({ launchAtLogin: v }), 'Open at login'), 'Works once Morrow is packaged as an app. See the README.'),
    ),
  ];
}

// Boot ------------------------------------------------------------------------

async function boot() {
  const init = await api.init(null);
  doc = init.doc;
  registry = init.registry;
  zones = await api.timeZones();
  render(true);
  api.onDoc((d) => {
    doc = d;
    // Don't rebuild the form underneath the user while they're typing or dragging a slider.
    const active = document.activeElement;
    const editing = active && main.contains(active) && /INPUT|SELECT|TEXTAREA/.test(active.tagName);
    if (editing || Date.now() - lastLocalEdit < 350) {
      renderNav();
      clearTimeout(boot.t);
      boot.t = setTimeout(() => {
        const a = document.activeElement;
        if (!(a && main.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && a.type !== 'range')) render();
      }, 400);
      return;
    }
    render();
  });
  api.onFocusWidget((id) => { selected = id; page = 'widgets'; render(true); });
}

boot();
