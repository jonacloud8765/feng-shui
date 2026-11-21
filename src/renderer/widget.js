import { applyAppearance, fileUrl } from './appearance.js';

const id = new URLSearchParams(location.search).get('id');
const glass = document.getElementById('glass');
const content = document.getElementById('content');
const imageLayer = glass.querySelector('.image');

let widget;
let registry;
let settings;
let instance;

const interactive = 'button, input, select, textarea, a, [data-interactive]';

function applyLook() {
  const ap = widget.appearance;
  applyAppearance(document.documentElement, ap, registry.FONTS);
  const img = registry.TYPES[widget.type].imageSupport && ap.image;
  imageLayer.style.backgroundImage = img ? `url("${fileUrl(ap.image)}")` : '';
  imageLayer.style.display = img ? '' : 'none';
}

const ctx = {
  get widget() { return widget; },
  get config() { return widget.config; },
  setConfig(patch) {
    widget = { ...widget, config: { ...widget.config, ...patch } };
    window.morrow.updateWidget(id, { config: patch });
  },
  api: window.morrow,
  get registry() { return registry; },
};

async function main() {
  const init = await window.morrow.init(id);
  widget = init.widget;
  registry = init.registry;
  settings = init.settings;
  document.body.classList.toggle('locked', !!settings.locked);
  if (!widget) return;
  applyLook();
  document.title = registry.TYPES[widget.type].name;
  const mod = await import(`./widgets/${widget.type}.js`);
  instance = mod.mount(content, ctx) || {};

  window.morrow.onWidget((w) => {
    const prev = widget;
    widget = w;
    applyLook();
    if (JSON.stringify(prev.config) !== JSON.stringify(w.config)) instance.update?.(w);
  });
  window.morrow.onSettings((s) => {
    settings = s;
    document.body.classList.toggle('locked', !!s.locked);
  });
  window.morrow.onResume(() => instance.resume?.());
  window.morrow.onMenuAction((action) => instance.menuAction?.(action));
}

// Moving and resizing. The main process follows the cursor between these two
// events, which keeps dragging smooth and lets it snap to edges.
glass.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const handle = e.target.closest('.handle');
  if (handle) {
    e.preventDefault();
    window.morrow.gestureStart('resize', handle.dataset.edge);
  } else if (!e.target.closest(interactive)) {
    window.morrow.gestureStart('move');
  }
});
window.addEventListener('mouseup', () => window.morrow.gestureEnd());
window.addEventListener('blur', () => window.morrow.gestureEnd());

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.morrow.contextMenu(instance?.menu?.() || []);
});

window.addEventListener('dblclick', (e) => {
  // Some widgets (the Sticky Note) are typed in, so a double-click there is just text selection.
  if (!e.target.closest(interactive) && !instance?.noDoubleClickSettings) window.morrow.openSettings(id);
});

main();
