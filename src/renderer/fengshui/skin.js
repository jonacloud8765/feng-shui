// The Feng Shui skin's small touches: the element class, a light frame and the
// element seal. widget.skin is set by the main process only while the Feng Shui
// layout is active; otherwise everything here is removed.

const ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water'];
// The seal's alchemical glyph for each element, in an 18 by 18 box.
const SEAL_PATHS = {
  fire: 'M9 2.6 L15.4 14 H2.6 Z',
  water: 'M9 15.4 L15.4 4 H2.6 Z',
  earth: 'M9 15.4 L15.4 4 H2.6 Z M4.9 8.2 H13.1',
  metal: 'M12.5 6.3 A3.5 3.5 0 1 1 5.5 6.3 A3.5 3.5 0 1 1 12.5 6.3 Z M9 9.8 V16 M6.3 13.1 H11.7',
  wood: 'M4.3 5.4 C4.3 1.9 9.6 1.7 9.6 5.1 C9.6 7.9 6.3 10.1 3.4 11.5 H15 M12.2 3.4 V16',
};
// Widgets that draw their own object (paper, cork, a ticket) get no glass frame.
const SELF_DRAWN = new Set(['cork', 'board', 'doughcon', 'neh', 'watched', 'nuke', 'cabinet', 'records']);

let built = '';
let latest = null;
let unrolled = false;

function selfDrawn(w) {
  if (SELF_DRAWN.has(w.type)) return true;
  if (w.type === 'image' && w.config.frame && w.config.frame !== 'glass') return true;
  return w.type === 'note' && (w.config.paper || 'butter') !== 'glass';
}

export function applySkin(widget, { id, api }) {
  latest = widget;
  const skin = widget.skin;
  const body = document.body;
  const title = document.getElementById('fs-title');
  const frame = document.getElementById('fs-frame');
  if (!title || !frame) return;
  body.classList.toggle('fs', !!skin);
  for (const el of ELEMENTS) body.classList.toggle(`el-${el}`, !!skin && skin.element === el);
  body.classList.toggle('self-drawn', !!skin && selfDrawn(widget));
  body.classList.toggle('tiny', !!skin && (widget.bounds.width < 200 || widget.bounds.height < 130));
  body.classList.remove('rolled', 't-page');
  if (!skin) {
    if (built) { title.replaceChildren(); frame.replaceChildren(); built = ''; }
    return;
  }
  // The old lacquer skin could roll a widget up to its title bar. There is no
  // title bar now, so a widget left rolled up opens back to its full height.
  if (widget.config?.fsRolled && !unrolled) {
    unrolled = true;
    api.updateWidget(id, { config: { fsRolled: 0 }, bounds: { ...widget.bounds, height: widget.config.fsRolled } });
  }
  const key = `${skin.element}|${skin.seal}`;
  if (built === key) return;
  built = key;
  title.replaceChildren();
  const seal = Object.assign(document.createElement('span'), { className: 'fs-seal' });
  seal.setAttribute('aria-hidden', 'true');
  const d = SEAL_PATHS[skin.element];
  if (d) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({
      viewBox: '0 0 18 18', width: '11', height: '11', fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.3', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'aria-hidden': 'true',
    })) svg.setAttribute(k, v);
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    seal.appendChild(svg);
  }
  frame.replaceChildren(seal);
}

// widget.js calls this with every update.
export function trackSkin(widget) { latest = widget; }
