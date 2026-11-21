// The Feng Shui skin's small touches: the element class, a light frame and the
// element seal. widget.skin is set by the main process only while the Feng Shui
// layout is active; otherwise everything here is removed.

const ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water'];
// Widgets that draw their own object (paper, cork, a ticket) get no glass frame.
const SELF_DRAWN = new Set(['cork', 'board', 'doughcon', 'neh', 'watched', 'nuke', 'cabinet']);

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
  const seal = Object.assign(document.createElement('span'), { className: 'fs-seal', textContent: skin.seal });
  seal.setAttribute('aria-hidden', 'true');
  frame.replaceChildren(seal);
}

// widget.js calls this with every update.
export function trackSkin(widget) { latest = widget; }
