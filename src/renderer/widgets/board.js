import { h } from '../dom.js';

// Whiteboard: draw with coloured markers on a white board, or with chalk on a
// green or black chalkboard. Write in handwriting or bubble letters.
//   - The tray at the bottom holds the markers (or chalk), the eraser and the
//     two lettering styles. Click one to pick it up.
//   - Drag on the board to draw; with the eraser, rub out what you touch.
//   - With a lettering style, click the board to write there.
//   - Hover the top-right corner to switch the surface. Drag the frame to move.
// Everything is stored in units of the board's width, so resizing the widget
// scales the drawing with it.

export const MARKERS = { black: '#1e1f22', blue: '#1d57c4', red: '#d22f2b', green: '#178a4a', purple: '#6c3cb0' };
export const CHALKS = { classic: '#f6f5ef', ivory: '#f1e6c8', dust: '#d9dfe0' };
const SURFACES = { white: 'Whiteboard', green: 'Green chalkboard', black: 'Black chalkboard' };
const isChalk = (s) => s === 'green' || s === 'black';

const svg = (w, hgt, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}">${body}</svg>`)}")`;
// Slate grain and the haze of chalk that was wiped off a hundred times.
const SLATE = svg(240, 240, '<filter id="s"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 -0.42"/></filter><rect width="240" height="240" filter="url(#s)"/>');
const HAZE = svg(600, 400, '<filter id="h"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.02" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.32 -0.1"/></filter><rect width="600" height="400" filter="url(#h)"/>');
// Faint ghosts of old marker on a well-used whiteboard.
const GHOST = svg(600, 400, '<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.03" numOctaves="3" seed="21"/><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.5  0 0 0 0 0.6  0 0 0 0.18 -0.07"/></filter><rect width="600" height="400" filter="url(#g)"/>');
const WOOD = 'repeating-linear-gradient(92deg, rgba(255,255,255,0) 0 7px, rgba(255,255,255,0.05) 7px 8px, rgba(0,0,0,0) 8px 15px, rgba(0,0,0,0.06) 15px 16px), linear-gradient(180deg, #9c6e43, #7d532f 45%, #65401f)';
const ALU = 'linear-gradient(180deg, #f4f5f6, #c9ccd0 40%, #e4e6e8 55%, #a9adb2)';

const css = `
.wb { position: absolute; inset: 4px 8px 12px 6px; }
.wb .frame { position: absolute; inset: 0; border-radius: 6px; padding: 10px 10px 26px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.35), 0 10px 24px -8px rgba(0,0,0,0.55); }
.wb.white .frame { background: ${ALU}; border-radius: 4px; padding: 8px 8px 24px; }
.wb.chalk .frame { background: ${WOOD}; }
.wb .frame::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.25); }
.wb.white .corner { position: absolute; width: 14px; height: 14px; background: linear-gradient(145deg, #5d6066, #2f3135); border-radius: 3px; }
.wb.chalk .corner { display: none; }
.wb .surface { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 1px; cursor: crosshair; }
.wb.white .surface { background:
  linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.75) 42%, rgba(255,255,255,0) 54%),
  ${GHOST}, linear-gradient(180deg, #fdfdfc, #eef0f1);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(0,0,0,0.12); }
.wb.green .surface { background: ${HAZE}, ${SLATE}, radial-gradient(130% 100% at 40% 30%, #3b5e48, #2b4636 70%, #233a2c); }
.wb.black .surface { background: ${HAZE}, ${SLATE}, radial-gradient(130% 100% at 40% 30%, #3a3e40, #2a2d2f 70%, #212325); }
.wb.chalk .surface { box-shadow: inset 0 2px 6px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(0,0,0,0.35); }
.wb canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.wb .texts { position: absolute; inset: 0; pointer-events: none; }
.wb .txt { position: absolute; white-space: pre; outline: none; pointer-events: none; line-height: 1.05; min-width: 0.4em; transform-origin: 0 0; }
.wb .txt { user-select: none; }
.wb.texting .txt { pointer-events: auto; cursor: text; user-select: text; }
.wb .txt.hand { font-family: "Caveat Brush", "Marker Felt", cursive; }
.wb .txt.bubble { font-family: "Arial Rounded MT Bold", "Chalkboard SE", sans-serif; font-weight: 700; letter-spacing: 0.04em;
  -webkit-text-stroke: 0.11em var(--ink); paint-order: stroke fill; color: var(--fill); }
.wb.chalk .txt { filter: url(#chalky); opacity: 0.92; }
.wb.chalk .txt.hand { font-family: "Chalkboard SE", "Caveat Brush", cursive; }
.wb .txt:empty::before { content: '|'; opacity: 0.35; }

/* The tray: markers or chalk lying on the ledge. */
.wb .tray { position: absolute; left: 10px; right: 10px; bottom: 0; height: 24px; display: flex; align-items: flex-end; gap: 6px; padding: 0 6px 3px; }
.wb.white .tray { left: 8px; right: 8px; }
.wb .tool { position: relative; border: 0; padding: 0; background: none; cursor: pointer; transition: transform .15s ease; }
.wb .tool:hover { transform: translateY(-2px); }
.wb .tool.on { transform: translateY(-5px); }
.wb .marker { width: 38px; height: 11px; border-radius: 3px 5px 5px 3px;
  background: linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0) 45%, rgba(0,0,0,0.18)), #f3f3f1;
  box-shadow: 0 1px 1.5px rgba(0,0,0,0.4); }
.wb .marker::before { content: ''; position: absolute; left: -8px; top: 1px; width: 10px; height: 9px; border-radius: 4px 1px 1px 4px; background: var(--c);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.25); }
.wb .marker::after { content: ''; position: absolute; right: 5px; top: 3px; width: 14px; height: 5px; border-radius: 2px; background: var(--c); opacity: 0.85; }
.wb .stick { width: 30px; height: 8px; border-radius: 3px; background: linear-gradient(180deg, rgba(255,255,255,0.4), rgba(0,0,0,0.1)), var(--c);
  box-shadow: 0 1px 1.5px rgba(0,0,0,0.45); }
.wb .stick::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: ${SLATE}; opacity: 0.25; mix-blend-mode: multiply; }
.wb .eraser { width: 34px; height: 13px; border-radius: 3px; box-shadow: 0 1px 1.5px rgba(0,0,0,0.45);
  background: linear-gradient(180deg, #4a4d52 0 55%, #e9e6df 55% 100%); }
.wb.chalk .eraser { background: linear-gradient(180deg, #a07a4f 0 55%, #5b5f63 55% 100%); }
.wb .letter { height: 16px; min-width: 22px; border-radius: 4px; font-size: 11px; line-height: 16px; padding: 0 4px; color: #2a2b2e;
  background: rgba(255,255,255,0.55); box-shadow: 0 1px 1.5px rgba(0,0,0,0.3); }
.wb.chalk .letter { background: rgba(0,0,0,0.25); color: #f3efe4; }
.wb .letter.hand { font-family: "Caveat Brush", cursive; font-size: 13px; }
.wb .letter.bubble { font-family: "Arial Rounded MT Bold", sans-serif; -webkit-text-stroke: 2px currentColor; paint-order: stroke fill; font-size: 11px; }
.wb .letter.bubble { color: #fff; -webkit-text-stroke-color: #2a2b2e; }
.wb.chalk .letter.bubble { color: #3a3a3a; -webkit-text-stroke-color: #f3efe4; }
.wb .gap { flex: 1; }

.wb .surfaces { position: absolute; top: 14px; right: 14px; display: flex; gap: 5px; padding: 4px; border-radius: 9px;
  background: rgba(30,30,30,0.35); backdrop-filter: blur(6px); opacity: 0; transition: opacity .2s ease; }
.wb:hover .surfaces { opacity: 1; }
.wb .surfaces button { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.8); padding: 0; cursor: pointer; }
.wb .surfaces button.on { box-shadow: 0 0 0 2px rgba(255,255,255,0.45); }
.wb .surfaces .white { background: #f6f7f7; } .wb .surfaces .green { background: #33523f; } .wb .surfaces .black { background: #2b2e30; }
`;

// A tiny chalk-dust pattern per colour: mostly solid, with grainy gaps.
const patterns = new Map();
function chalkPattern(g, color) {
  if (patterns.has(color)) return patterns.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const img = x.createImageData(64, 64);
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 64 * 64; i++) {
    const n = rand();
    img.data.set([r, gg, b, n < 0.22 ? n * 300 : 200 + n * 55], i * 4);
  }
  x.putImageData(img, 0, 0);
  const p = g.createPattern(c, 'repeat');
  patterns.set(color, p);
  return p;
}

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  document.documentElement.classList.add('paper-note');
  // A rough edge for chalk lettering.
  root.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><filter id="chalky"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.5"/><feComposite in="SourceGraphic" operator="in"/></filter></svg>');

  const canvas = h('canvas');
  const texts = h('div.texts');
  const surface = h('div.surface', { 'data-interactive': '' }, canvas, texts);
  const tray = h('div.tray', { 'data-interactive': '' });
  const surfBar = h('div.surfaces', { 'data-interactive': '' });
  const corners = ['top:-2px;left:-2px', 'top:-2px;right:-2px', 'bottom:-2px;left:-2px', 'bottom:-2px;right:-2px'].map((s) => h('div.corner', { style: s }));
  const wrap = h('div.wb', {}, h('div.frame', {}, surface, ...corners), tray, surfBar);
  root.append(wrap);
  const g = canvas.getContext('2d');

  let strokes = [];
  let words = [];
  let tool = 'pen'; // pen | eraser | hand | bubble
  let live = null;
  const c = () => ctx.config;
  const unit = () => surface.clientWidth || 1;
  const ink = () => (isChalk(c().surface) ? CHALKS[c().chalk] || CHALKS.classic : MARKERS[c().marker] || MARKERS.black);

  let saveTimer;
  function save(now) {
    clearTimeout(saveTimer);
    const run = () => ctx.setConfig({ strokes: strokes.map((s) => ({ ...s, p: s.p.slice() })), texts: words.map((t) => ({ ...t })) });
    if (now) run(); else saveTimer = setTimeout(run, 400);
  }

  // Drawing ----------------------------------------------------------------

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(surface.clientWidth * dpr);
    canvas.height = Math.round(surface.clientHeight * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
    placeTexts();
  }

  function path(p, u) {
    g.beginPath();
    g.moveTo(p[0] * u, p[1] * u);
    if (p.length === 2) { g.lineTo(p[0] * u + 0.1, p[1] * u); return; }
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = ((p[i] + p[i + 2]) / 2) * u, my = ((p[i + 1] + p[i + 3]) / 2) * u;
      g.quadraticCurveTo(p[i] * u, p[i + 1] * u, mx, my);
    }
    g.lineTo(p[p.length - 2] * u, p[p.length - 1] * u);
  }

  function paint(s) {
    const u = unit();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (s.k === 'chalk') {
      // Chalk: a grainy core with a dusty, broken edge.
      g.strokeStyle = chalkPattern(g, s.c);
      g.globalAlpha = 0.28;
      g.lineWidth = s.w * u * 1.6;
      path(s.p, u); g.stroke();
      g.globalAlpha = 0.85;
      g.lineWidth = s.w * u;
      path(s.p, u); g.stroke();
    } else {
      // Marker: a slightly translucent stroke that pools a little at its edges.
      g.strokeStyle = s.c;
      g.globalAlpha = 0.9;
      g.lineWidth = s.w * u;
      path(s.p, u); g.stroke();
      g.globalAlpha = 0.18;
      g.lineWidth = s.w * u * 1.15;
      path(s.p, u); g.stroke();
    }
    g.globalAlpha = 1;
  }

  function redraw() {
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) paint(s);
    if (live) paint(live);
  }

  const at = (e) => {
    const r = surface.getBoundingClientRect();
    const u = unit();
    return [Math.round(((e.clientX - r.left) / u) * 10000) / 10000, Math.round(((e.clientY - r.top) / u) * 10000) / 10000];
  };

  // Rubbing out splits strokes where the eraser passes and drops words it touches.
  function erase([x, y]) {
    const R = 0.035;
    let changed = false;
    const next = [];
    for (const s of strokes) {
      let piece = [];
      let cut = false;
      for (let i = 0; i < s.p.length; i += 2) {
        if (Math.hypot(s.p[i] - x, s.p[i + 1] - y) < R + s.w / 2) {
          cut = true;
          if (piece.length) next.push({ ...s, p: piece });
          piece = [];
        } else piece.push(s.p[i], s.p[i + 1]);
      }
      if (piece.length) next.push(cut ? { ...s, p: piece } : s);
      if (cut) changed = true;
    }
    strokes = next;
    const u = unit();
    const r = surface.getBoundingClientRect();
    const before = words.length;
    words = words.filter((t) => {
      const el = texts.querySelector(`[data-id="${t.id}"]`);
      if (!el) return true;
      const b = el.getBoundingClientRect();
      const px = x * u + r.left, py = y * u + r.top;
      return !(px > b.left - R * u && px < b.right + R * u && py > b.top - R * u && py < b.bottom + R * u);
    });
    if (words.length !== before) { changed = true; buildTexts(); }
    if (changed) redraw();
    return changed;
  }

  surface.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (tool === 'hand' || tool === 'bubble') {
      if (e.target.closest('.txt')) return; // editing a word
      e.preventDefault();
      addText(at(e));
      return;
    }
    e.preventDefault();
    let changed = false;
    if (tool === 'eraser') {
      changed = erase(at(e));
    } else {
      const chalk = isChalk(c().surface);
      live = { k: chalk ? 'chalk' : 'marker', c: ink(), w: chalk ? 0.012 : 0.01, p: at(e) };
      redraw();
    }
    const move = (ev) => {
      const p = at(ev);
      if (tool === 'eraser') { changed = erase(p) || changed; return; }
      const n = live.p.length;
      if (Math.hypot(p[0] - live.p[n - 2], p[1] - live.p[n - 1]) < 0.003) return;
      live.p.push(p[0], p[1]);
      redraw();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (live) { strokes.push(live); live = null; save(true); } else if (changed) save(true);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  // Lettering --------------------------------------------------------------

  function styleText(el, t) {
    const u = unit();
    Object.assign(el.style, { left: `${t.x * u}px`, top: `${t.y * u}px`, fontSize: `${t.s * u}px` });
    el.style.setProperty('--ink', t.c);
    el.style.setProperty('--fill', isChalk(c().surface) ? 'rgba(255,255,255,0.08)' : `color-mix(in srgb, ${t.c} 16%, transparent)`);
    el.style.color = t.st === 'bubble' ? '' : t.c;
  }

  function placeTexts() {
    for (const t of words) {
      const el = texts.querySelector(`[data-id="${t.id}"]`);
      if (el) styleText(el, t);
    }
  }

  function buildTexts() {
    const focused = document.activeElement?.closest?.('.txt')?.dataset.id;
    if (focused) return;
    texts.replaceChildren(...words.map((t) => {
      const el = h(`div.txt.${t.st}`, { contenteditable: 'plaintext-only', spellcheck: 'false', 'data-id': t.id, 'data-interactive': '' });
      el.textContent = t.t;
      styleText(el, t);
      el.addEventListener('input', () => { t.t = el.textContent; save(); });
      el.addEventListener('blur', () => {
        if (!el.textContent.trim()) { words = words.filter((w) => w !== t); el.remove(); }
        save(true);
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.blur(); });
      return el;
    }));
  }

  function addText([x, y]) {
    const t = { id: Math.random().toString(36).slice(2, 9), t: '', st: tool, c: ink(), x, y: y - 0.04, s: tool === 'bubble' ? 0.085 : 0.075 };
    words.push(t);
    buildTexts();
    const el = texts.querySelector(`[data-id="${t.id}"]`);
    el?.focus();
  }

  // Tray and surface switch ------------------------------------------------

  function pick(next, patch) {
    tool = next;
    if (patch) ctx.setConfig(patch);
    wrap.classList.toggle('texting', tool === 'hand' || tool === 'bubble');
    surface.style.cursor = tool === 'eraser' ? 'cell' : tool === 'pen' ? 'crosshair' : 'text';
    buildTray();
  }

  const tinted = (el, col) => { el.style.setProperty('--c', col); return el; };
  function buildTray() {
    const chalk = isChalk(c().surface);
    const items = [];
    if (chalk) {
      for (const [k, col] of Object.entries(CHALKS)) {
        items.push(tinted(h('button', { title: `${k[0].toUpperCase() + k.slice(1)} chalk`, 'aria-label': `${k} chalk`, class: `tool stick${tool === 'pen' && c().chalk === k ? ' on' : ''}`, onclick: () => pick('pen', { chalk: k }) }), col));
      }
    } else {
      for (const [k, col] of Object.entries(MARKERS)) {
        items.push(tinted(h('button', { title: `${k[0].toUpperCase() + k.slice(1)} marker`, 'aria-label': `${k} marker`, class: `tool marker${tool === 'pen' && c().marker === k ? ' on' : ''}`, onclick: () => pick('pen', { marker: k }) }), col));
      }
    }
    items.push(h('div.gap'));
    items.push(h('button', { class: `tool letter hand${tool === 'hand' ? ' on' : ''}`, title: 'Write in handwriting', onclick: () => pick('hand') }, 'Aa'));
    items.push(h('button', { class: `tool letter bubble${tool === 'bubble' ? ' on' : ''}`, title: 'Write in bubble letters', onclick: () => pick('bubble') }, 'Aa'));
    items.push(h('button', { class: `tool eraser${tool === 'eraser' ? ' on' : ''}`, title: 'Eraser', 'aria-label': 'Eraser', onclick: () => pick('eraser') }));
    tray.replaceChildren(...items);
    surfBar.replaceChildren(...Object.entries(SURFACES).map(([k, label]) => h('button', { class: `${k}${c().surface === k ? ' on' : ''}`, title: label, 'aria-label': label, onclick: () => ctx.setConfig({ surface: k }) || load() })));
  }

  function load() {
    const conf = c();
    wrap.className = `wb ${conf.surface || 'white'} ${isChalk(conf.surface) ? 'chalk' : ''}${tool === 'hand' || tool === 'bubble' ? ' texting' : ''}`;
    const next = JSON.stringify([conf.strokes, conf.texts]);
    if (next !== JSON.stringify([strokes, words])) {
      strokes = (conf.strokes || []).map((s) => ({ ...s, p: s.p.slice() }));
      words = (conf.texts || []).map((t) => ({ ...t }));
      buildTexts();
    }
    buildTray();
    placeTexts();
    redraw();
  }

  function undo() {
    if (!strokes.length) return;
    strokes.pop();
    redraw();
    save(true);
  }
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.target.closest?.('.txt')) { e.preventDefault(); undo(); }
  });

  new ResizeObserver(resize).observe(surface);
  load();
  return {
    noDoubleClickSettings: true,
    update: load,
    menu: () => [
      { label: 'Undo', action: 'undo', enabled: strokes.length > 0 },
      { label: 'Wipe the Board', action: 'wipe' },
      { type: 'separator' },
      ...Object.entries(SURFACES).map(([k, label]) => ({ label, action: `surface:${k}`, type: 'radio', checked: c().surface === k })),
    ],
    menuAction: (a) => {
      if (a === 'undo') undo();
      else if (a === 'wipe') { strokes = []; words = []; buildTexts(); redraw(); save(true); }
      else if (a.startsWith('surface:')) { ctx.setConfig({ surface: a.slice(8) }); load(); }
    },
  };
}
