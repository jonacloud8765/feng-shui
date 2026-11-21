// The Feng Shui skin's title bar, seal, caption buttons and corner motifs.
// widget.skin is set by the main process only while the Feng Shui layout is
// active; otherwise everything here is removed and the widget looks as before.

const ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water'];

// Small corner motifs, drawn in the element's accent colour (currentColor).
const MOTIF = {
  // Ice-ray lattice.
  wood: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M1 15V1h14M4 15V4h8M4 8h4v4M8 4v4"/></svg>',
  // A curling flame.
  fire: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 14c0-4 3-5 3-8 2 1 3 3 2 5 1-1 2-3 1-6 4 2 6 6 4 9z" opacity=".9"/><path d="M1 15h14v1H1z"/></svg>',
  // A square seal with a low mountain.
  earth: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="1.5" width="13" height="13"/><path d="M4 11l2.5-3 2 2 1.5-2 2 3z" fill="currentColor" stroke="none"/></svg>',
  // A round coin with a square hole.
  metal: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="#d9c79a" stroke="#8e7a3a" stroke-width="1.2"/><rect x="6" y="6" width="4" height="4" fill="#cdcdc9" stroke="#8e7a3a" stroke-width="1"/></svg>',
  // A wave crest.
  water: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M1 12c2-4 6-4 7-1-2-3 1-6 4-4"/><path d="M1 15c3-2 6-2 8 0s5 2 6 0"/><circle cx="12.5" cy="9" r="1" fill="currentColor" stroke="none"/></svg>',
};

const MIN = '<svg viewBox="0 0 8 8"><rect x="1" y="6" width="5" height="2" fill="currentColor"/></svg>';
const CLOSE = '<svg viewBox="0 0 8 8" stroke="currentColor" stroke-width="1.6"><path d="M1 1l6 6M7 1L1 7"/></svg>';

let built = '';

export function applySkin(widget, { id, api }) {
  const skin = widget.skin;
  const body = document.body;
  const title = document.getElementById('fs-title');
  const frame = document.getElementById('fs-frame');
  if (!title || !frame) return;
  body.classList.toggle('fs', !!skin);
  for (const el of ELEMENTS) body.classList.toggle(`el-${el}`, !!skin && skin.element === el);
  body.classList.toggle('t-page', !!skin && widget.type === 'page');
  body.classList.toggle('rolled', !!skin && !!widget.config?.fsRolled);
  body.classList.toggle('tiny', !!skin && (widget.bounds.width < 200 || widget.bounds.height < 130));
  if (!skin) {
    if (built) { title.replaceChildren(); frame.replaceChildren(); built = ''; }
    return;
  }
  const key = `${skin.element}|${skin.seal}|${skin.title}`;
  if (built === key) return;
  built = key;

  const seal = Object.assign(document.createElement('span'), { className: 'fs-seal', textContent: skin.seal, title: `${skin.element[0].toUpperCase()}${skin.element.slice(1)}` });
  const name = Object.assign(document.createElement('span'), { className: 'fs-name', textContent: skin.title });
  const min = Object.assign(document.createElement('button'), { className: 'fs-cap', title: 'Roll up', innerHTML: MIN });
  const close = Object.assign(document.createElement('button'), { className: 'fs-cap', title: 'Hide this widget (bring it back from Settings)', innerHTML: CLOSE });
  min.setAttribute('aria-label', 'Roll up');
  close.setAttribute('aria-label', 'Hide widget');
  min.addEventListener('click', () => {
    const w = current();
    if (w.config.fsRolled) api.updateWidget(id, { config: { fsRolled: 0 }, bounds: { ...w.bounds, height: w.config.fsRolled } });
    else api.updateWidget(id, { config: { fsRolled: w.bounds.height }, bounds: { ...w.bounds, height: 26 } });
  });
  close.addEventListener('click', () => api.updateWidget(id, { visible: false }));
  title.replaceChildren(seal, name, min, close);

  frame.replaceChildren(...['tl', 'tr', 'bl', 'br'].map((c) => {
    const m = document.createElement('span');
    m.className = `fs-motif ${c}`;
    m.innerHTML = MOTIF[skin.element];
    return m;
  }));

  let latest = widget;
  function current() { return latest; }
  applySkin.track = (w) => { latest = w; };
}

// widget.js calls this with every update, so the buttons act on fresh bounds.
export function trackSkin(widget) { applySkin.track?.(widget); }
