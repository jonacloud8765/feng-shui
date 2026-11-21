import { h } from '../dom.js';
import { fileUrl } from '../appearance.js';
import { PAPERS, PINS, clean } from './note.js';

// Corkboard: notes and photos pinned to a framed cork board, with red string
// run between pins like a detective's board.
//   - Drag a note or photo by its paper to move it; click its text to write.
//   - Click a pin to change its color; drag from a pin to another item to
//     tie a string; click a string to cut it.

const PIN_ORDER = Object.keys(PINS);
const PAPER_ORDER = Object.keys(PAPERS).filter((k) => k !== 'glass' && k !== 'ink');

// Cork: a warm base with dark granules, pale flecks and a few larger blotches.
const svg = (w, hgt, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}">${body}</svg>`)}")`;
const CORK_GRAIN = svg(220, 220, '<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="2" seed="4" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.30  0 0 0 0 0.18  0 0 0 0 0.08  0 0 0 2.6 -1.15"/></filter><rect width="220" height="220" filter="url(#g)"/>');
const CORK_FLECK = svg(260, 260, '<filter id="f"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="11" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.93  0 0 0 0 0.80  0 0 0 0 0.60  0 0 0 3.2 -1.9"/></filter><rect width="260" height="260" filter="url(#f)"/>');
const CORK_BLOTCH = svg(480, 480, '<filter id="b"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.10  0 0 0 0.9 -0.35"/></filter><rect width="480" height="480" filter="url(#b)"/>');

// Wear and tear of a board that has seen a few cases: a bullet hole with
// splintered cork, a couple of cigarette burns and ash smudges, and grime
// along the bottom where hands rest.
const BULLET = svg(70, 70, `
  <defs><radialGradient id="r" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0d0805"/><stop offset="0.32" stop-color="#1c120a"/><stop offset="0.45" stop-color="#5a3a1e"/><stop offset="0.62" stop-color="#d9b48a" stop-opacity="0.55"/><stop offset="1" stop-color="#d9b48a" stop-opacity="0"/></radialGradient>
  <filter id="j"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="3.2"/></filter></defs>
  <g filter="url(#j)">
    <circle cx="35" cy="35" r="15" fill="url(#r)"/>
    <path d="M35 35 L52 27 M35 35 L49 47 M35 35 L22 49 M35 35 L18 26 M35 35 L37 16" stroke="#3b2412" stroke-width="0.9" stroke-linecap="round" opacity="0.55"/>
    <circle cx="35" cy="35" r="4.4" fill="#070403"/>
  </g>`);
const BURN = svg(60, 60, `
  <defs><radialGradient id="b" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#1a0f08" stop-opacity="0.85"/><stop offset="0.35" stop-color="#3d2512" stop-opacity="0.7"/><stop offset="0.6" stop-color="#6b4320" stop-opacity="0.35"/><stop offset="1" stop-color="#6b4320" stop-opacity="0"/></radialGradient>
  <filter id="w"><feTurbulence type="fractalNoise" baseFrequency="0.25" numOctaves="2" seed="9"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter></defs>
  <ellipse cx="30" cy="30" rx="24" ry="19" fill="url(#b)" filter="url(#w)"/>`);
const ASH = svg(140, 60, `
  <defs><filter id="a"><feTurbulence type="fractalNoise" baseFrequency="0.08 0.3" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 0.42  0 0 0 0 0.40  0 0 0 0 0.38  0 0 0 1.3 -0.55"/><feGaussianBlur stdDeviation="0.6"/></filter>
  <radialGradient id="m"><stop offset="0.3" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="k"><rect width="140" height="60" fill="url(#m)"/></mask></defs>
  <rect width="140" height="60" filter="url(#a)" mask="url(#k)"/>`);
const WEAR = [
  `${BULLET} 52% 47% / 54px 54px no-repeat`,
  `${BURN} 9% 95% / 70px 66px no-repeat`,
  `${BURN} 93% 72% / 52px 48px no-repeat`,
  `${ASH} 22% 99% / 130px 52px no-repeat`,
  `${ASH} 74% 100% / 110px 44px no-repeat`,
  'linear-gradient(0deg, rgba(45,25,8,0.5), rgba(45,25,8,0.16) 12%, transparent 28%)',
  'radial-gradient(40% 18% at 6% 100%, rgba(30,15,5,0.35), transparent 70%)',
  'radial-gradient(36% 16% at 96% 100%, rgba(30,15,5,0.3), transparent 70%)',
].join(', ');

const css = `
:root.paper-note .glass { overflow: visible; border-radius: 0; }
:root.paper-note .glass > .layer { display: none; }
.corkwrap { position: absolute; inset: 6px 10px 16px 8px; }
.cork-frame {
  position: absolute; inset: 0; border-radius: 7px; padding: 13px;
  background:
    repeating-linear-gradient(92deg, rgba(255,255,255,0) 0 7px, rgba(255,255,255,0.05) 7px 8px, rgba(0,0,0,0) 8px 15px, rgba(0,0,0,0.06) 15px 16px),
    linear-gradient(180deg, #a77a4c, #8a5e36 45%, #73492a);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.35),
    inset 1px 0 0 rgba(255,255,255,0.15), inset -1px 0 0 rgba(0,0,0,0.25),
    0 1px 2px rgba(0,0,0,0.3), 0 8px 18px -6px rgba(0,0,0,0.45), 0 22px 30px -18px rgba(0,0,0,0.5);
}
.cork {
  position: absolute; inset: 13px; border-radius: 2px; overflow: hidden;
  background: ${WEAR}, ${CORK_FLECK}, ${CORK_GRAIN}, ${CORK_BLOTCH},
    radial-gradient(120% 90% at 30% 20%, #c99a68, #b4824f 60%, #a2713f);
  box-shadow: inset 0 2px 5px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.25), inset 0 0 40px rgba(60,30,10,0.25);
}
.cork .layer { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.cork .item {
  position: absolute; transform-origin: 50% 0; cursor: grab;
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.08), 0 1px 1.5px rgba(0,0,0,0.22), 0 4px 8px -2px rgba(0,0,0,0.2), 0 14px 22px -10px rgba(0,0,0,0.42);
}
.cork .item.dragging { cursor: grabbing; box-shadow: 0 2px 3px rgba(0,0,0,0.25), 0 16px 26px -8px rgba(0,0,0,0.45); }
.cork .note-item {
  border-radius: 1.5px; padding: 24px 12px 12px; color: var(--ink);
  /* The same clean paper as the Sticky Note widget. */
  background:
    radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.32), transparent 55%),
    linear-gradient(180deg, rgba(0,0,0,0.045), rgba(0,0,0,0) 16%),
    linear-gradient(200deg, rgba(255,255,255,0) 70%, rgba(0,0,0,0.06) 92%, rgba(0,0,0,0.12) 100%),
    var(--paper);
}
.cork .note-item::after {
  /* The lifted corner catches a little light. */
  content: ''; position: absolute; right: 0; bottom: 0; width: 30px; height: 30px; pointer-events: none;
  background: linear-gradient(315deg, rgba(255,255,255,0.0) 0, rgba(255,255,255,0.22) 30%, rgba(0,0,0,0.05) 52%, transparent 60%);
}
.cork .note-item .text {
  height: 100%; overflow: hidden; outline: none; cursor: text; user-select: text;
  font-family: var(--note-font); font-size: calc(var(--note-size) * var(--scale)); line-height: 1.3;
  white-space: pre-wrap; overflow-wrap: anywhere; caret-color: #8a5a2a; text-align: left;
}
.cork .note-item .text:empty::before { content: 'Write…'; opacity: 0.35; }
.cork .note-item ul { margin: 0; padding-left: 1.1em; }
.cork .note-item u { text-underline-offset: 0.3em; text-decoration-skip-ink: all; }
.cork .photo-item { background: #fbfaf6; padding: 10px 10px 30px; border-radius: 1px; }
.cork .photo-item img { display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; filter: saturate(0.92) contrast(1.02); }
.cork .photo-item .cap { position: absolute; left: 10px; right: 10px; bottom: 6px; font-family: var(--note-font); font-size: 13px; color: #333; text-align: center; outline: none; cursor: text; user-select: text; white-space: nowrap; overflow: hidden; }
.cork .item .x {
  position: absolute; right: -7px; top: -7px; width: 18px; height: 18px; border-radius: 50%; border: 0;
  background: rgba(30,20,10,0.78); color: #fff; font: 600 11px/18px system-ui; padding: 0; opacity: 0; transition: opacity 0.15s; cursor: default;
}
.cork .item:hover .x { opacity: 1; }
.cork svg.strings { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.cork svg.strings path.s { fill: none; stroke: #b3121b; stroke-width: 1.8; stroke-linecap: round; filter: drop-shadow(1px 2px 1px rgba(0,0,0,0.35)); }
.cork svg.strings path.hit { fill: none; stroke: transparent; stroke-width: 12; pointer-events: stroke; cursor: pointer; }
.cork svg.strings path.hit:hover + path.s, .cork svg.strings path.s.cut { stroke: #e2343d; stroke-dasharray: 5 4; }
.cork svg.strings path.temp { fill: none; stroke: #b3121b; stroke-width: 1.8; stroke-dasharray: 2 3; opacity: 0.8; }
.cork .pin {
  position: absolute; width: 22px; height: 30px; margin: -18px 0 0 -11px; cursor: pointer; z-index: 3;
  filter: drop-shadow(1.5px 3px 1.5px rgba(0,0,0,0.4));
}
.cork .pin:hover { transform: translateY(-1px); }
.corkwrap .orient {
  position: absolute; right: 18px; top: 2px; z-index: 6; display: flex; gap: 2px; padding: 2px; border-radius: 7px;
  background: rgba(40,24,12,0.82); box-shadow: 0 1px 3px rgba(0,0,0,0.35); opacity: 0; transition: opacity 0.18s;
}
.corkwrap:hover .orient { opacity: 1; }
.corkwrap .orient button {
  width: 24px; height: 18px; border: 0; border-radius: 5px; padding: 0; background: transparent; display: grid; place-items: center; cursor: default;
}
.corkwrap .orient button i { display: block; border: 1.4px solid rgba(255,240,220,0.85); border-radius: 1.5px; }
.corkwrap .orient .p i { width: 8px; height: 11px; }
.corkwrap .orient .l i { width: 12px; height: 8px; }
.corkwrap .orient button.on { background: rgba(255,240,220,0.22); }
.cork .item { --sx: 0px; --sy: 4px; }
.corkwrap.lit .cork .item, .corkwrap.dark .cork .item {
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.1), calc(var(--sx) * 0.4) calc(var(--sy) * 0.4) 2px rgba(0,0,0,0.3), var(--sx) var(--sy) 9px rgba(0,0,0,0.38), calc(var(--sx) * 2) calc(var(--sy) * 2) 20px -4px rgba(0,0,0,0.42); }
.corkwrap.dark .cork .item { box-shadow: 0 0 0 0.5px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.3); }
.corkwrap.locked .cork .item, .corkwrap.locked .cork .pin { cursor: default; }
.corkwrap.locked .cork .item .x, .corkwrap.locked .orient { display: none; }
.corkwrap.locked .cork .pin, .corkwrap.locked .cork svg.strings path.hit { pointer-events: none !important; }
/* The desk lamp and the light it throws. */
.corkwrap .room { position: absolute; inset: 0; border-radius: 7px; pointer-events: none; z-index: 5; transition: background .35s ease, opacity .35s ease; }
.corkwrap.lit .room { background:
  radial-gradient(circle at var(--lx) var(--ly), rgba(255,238,196,0.42) 0, rgba(255,222,160,0.18) 22%, rgba(255,210,150,0) 48%),
  radial-gradient(circle at var(--lx) var(--ly), rgba(0,0,0,0) 34%, rgba(12,9,6,0.32) 66%, rgba(8,6,4,0.66) 100%); }
.corkwrap.dark .room { background: radial-gradient(circle at var(--lx) var(--ly), rgba(10,13,22,0.74), rgba(4,5,10,0.9) 75%); }
.corkwrap.haslamp { top: 62px; }
.corkwrap .lamp { position: absolute; right: 4%; top: -68px; width: 30%; max-width: 230px; aspect-ratio: 200 / 150; z-index: 7; cursor: pointer; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.55)); }
.corkwrap .lamp svg { width: 100%; height: 100%; overflow: visible; display: block; }
.corkwrap .lamp .halo { opacity: 0; transition: opacity .3s ease; }
.corkwrap.lit .lamp .halo { opacity: 1; }
.corkwrap .lamp .bulb { fill: #6d6a63; transition: fill .3s ease; }
.corkwrap.lit .lamp .bulb { fill: #fff8e2; }
.cork .empty { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(40,20,5,0.55); font: 500 13px system-ui; text-align: center; pointer-events: none; }
`;

const LAMP = `<svg viewBox="0 0 200 150" aria-hidden="true">
  <defs>
    <radialGradient id="lh" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.95"/><stop offset="0.35" stop-color="#ffd98a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
    <linearGradient id="ls" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b3e44"/><stop offset="0.45" stop-color="#17191c"/><stop offset="1" stop-color="#050506"/></linearGradient>
    <linearGradient id="la" x1="0" x2="1"><stop offset="0" stop-color="#2a2c30"/><stop offset="0.5" stop-color="#55585e"/><stop offset="1" stop-color="#1a1b1e"/></linearGradient>
  </defs>
  <ellipse class="halo" cx="86" cy="78" rx="70" ry="44" fill="url(#lh)"/>
  <path d="M206 -6 L150 34" stroke="url(#la)" stroke-width="7" stroke-linecap="round"/>
  <path d="M150 34 L120 22" stroke="url(#la)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="150" cy="34" r="6" fill="#2b2d31" stroke="#5a5d63" stroke-width="1.2"/>
  <circle cx="120" cy="22" r="5" fill="#2b2d31" stroke="#5a5d63" stroke-width="1.2"/>
  <g transform="rotate(-14 86 46)">
    <path d="M38 70 C 40 40, 58 20, 86 18 C 114 20, 132 40, 134 70 Z" fill="url(#ls)"/>
    <path d="M52 36 C 62 26, 74 22, 86 21" stroke="rgba(255,255,255,0.35)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <rect x="80" y="10" width="12" height="10" rx="2" fill="#2b2d31"/>
    <ellipse cx="86" cy="70" rx="48" ry="7.5" fill="#0b0b0c"/>
    <ellipse class="bulb" cx="86" cy="70.5" rx="30" ry="5.2"/>
  </g>
</svg>`;

const uid = () => Math.random().toString(36).slice(2, 10);

function pinSvg(id, colorKey) {
  const c = (PINS[colorKey] || PINS.red).c;
  return `<svg viewBox="0 0 22 30" width="22" height="30" aria-hidden="true">
    <defs><radialGradient id="h${id}" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="${c[0]}"/><stop offset="0.55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>
    <linearGradient id="n${id}" x1="0" x2="1"><stop offset="0" stop-color="${c[2]}"/><stop offset="0.45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient></defs>
    <ellipse cx="11.6" cy="22.6" rx="1.6" ry="0.7" fill="rgba(0,0,0,0.4)"/>
    <path d="M10.3 16.5 L10.7 22.4 L11.3 22.4 L11.7 16.5 z" fill="#c9cdd1"/>
    <ellipse cx="11" cy="16.5" rx="6" ry="2.2" fill="${c[2]}"/>
    <path d="M7 9 h8 l1.5 7 h-11 z" fill="url(#n${id})"/>
    <circle cx="11" cy="7.5" r="6.5" fill="url(#h${id})"/>
    <ellipse cx="8.6" cy="5.2" rx="2" ry="1.3" fill="rgba(255,255,255,0.65)"/></svg>`;
}

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  document.documentElement.classList.add('paper-note');
  const board = h('div.cork');
  // Everything pinned lives on a layer drawn at the board's own size and
  // scaled to fit, so a smaller or larger corkboard keeps its whole case.
  const layer = h('div.layer');
  board.append(layer);
  let scale = 1;
  const design = () => ({ w: ctx.config.boardW || board.clientWidth, h: ctx.config.boardH || board.clientHeight });
  function fitLayer() {
    const d = design();
    if (!d.w || !d.h || !board.clientWidth) return;
    // In the Feng Shui layout the board is kept small, so it fits its width
    // and scrolls instead of shrinking the notes past reading.
    const scroll = document.body.classList.contains('fs') && board.clientHeight / d.h < board.clientWidth / d.w;
    scale = scroll ? board.clientWidth / d.w : Math.min(board.clientWidth / d.w, board.clientHeight / d.h);
    const ox = (board.clientWidth - d.w * scale) / 2, oy = scroll ? 0 : (board.clientHeight - d.h * scale) / 2;
    board.classList.toggle('scrolls', scroll);
    Object.assign(layer.style, { width: `${d.w}px`, height: `${d.h}px`, transform: `translate(${ox}px, ${oy}px) scale(${scale})` });
  }
  const orientBtn = (cls, tip, portrait) => h(`button.${cls}`, { title: tip, 'aria-label': tip, 'data-interactive': '', onmousedown: (e) => e.stopPropagation(), onclick: () => orient(portrait) }, h('i'));
  const orientBar = h('div.orient', { 'data-interactive': '' }, orientBtn('p', 'Portrait', true), orientBtn('l', 'Landscape', false));
  const room = h('div.room');
  const lamp = h('div.lamp', { 'data-interactive': '', title: 'Click to switch the lamp on or off', html: LAMP, onmousedown: (e) => e.stopPropagation(), onclick: () => { ctx.setConfig({ lamp: ctx.config.lamp === 'on' ? 'off' : 'on' }); light(); } });
  const wrap = h('div.corkwrap', {}, h('div.cork-frame'), board, orientBar, room, lamp);
  root.append(wrap);
  const locked = () => !!ctx.config.locked;

  // Light from the lamp's bulb: the room around it falls dark, and every
  // note and photo casts its shadow away from the bulb.
  function light() {
    const mode = ctx.config.lamp;
    wrap.classList.toggle('lit', mode === 'on');
    wrap.classList.toggle('dark', mode === 'off');
    lamp.style.display = mode === 'on' || mode === 'off' ? '' : 'none';
    wrap.classList.toggle('haslamp', !lamp.style.display);
    fitLayer();
    room.style.display = lamp.style.display;
    if (lamp.style.display === 'none') return;
    const bulb = lamp.querySelector('.bulb').getBoundingClientRect();
    const w = room.getBoundingClientRect();
    const bx = bulb.left + bulb.width / 2, by = bulb.top + bulb.height / 2 + 6;
    room.style.setProperty('--lx', `${bx - w.left}px`);
    room.style.setProperty('--ly', `${by - w.top}px`);
    const lr = layer.getBoundingClientRect();
    const lx = (bx - lr.left) / scale, ly = (by - lr.top) / scale;
    for (const it of items) {
      const el = els.get(it.id);
      if (!el) continue;
      const dx = it.x + it.w / 2 - lx, dy = it.y + it.h / 2 - ly;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(16, 4 + d * 0.012);
      el.style.setProperty('--sx', `${((dx / d) * k).toFixed(1)}px`);
      el.style.setProperty('--sy', `${((dy / d) * k).toFixed(1)}px`);
    }
  }

  let items = [];
  let strings = [];
  const els = new Map(); // item id -> element
  const strSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  strSvg.classList.add('strings');
  const pinLayer = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });

  let saveTimer;
  const save = (now) => {
    clearTimeout(saveTimer);
    const run = () => ctx.setConfig({ items: items.map((i) => ({ ...i })), strings: strings.map((s) => ({ ...s })) });
    if (now) run(); else saveTimer = setTimeout(run, 350);
  };

  const pinPoint = (it) => ({ x: it.x + it.w / 2, y: it.y + 6 });

  function stringPath(a, b) {
    // A little slack: the string sags under its own weight.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 + Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.08);
    return `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`;
  }

  function drawStrings(temp) {
    const ns = 'http://www.w3.org/2000/svg';
    strSvg.replaceChildren();
    for (const s of strings) {
      const a = items.find((i) => i.id === s.a);
      const b = items.find((i) => i.id === s.b);
      if (!a || !b) continue;
      const d = stringPath(pinPoint(a), pinPoint(b));
      const hit = document.createElementNS(ns, 'path');
      hit.setAttribute('d', d);
      hit.classList.add('hit');
      const t = document.createElementNS(ns, 'title');
      t.textContent = 'Click to cut the string';
      hit.append(t);
      hit.addEventListener('mousedown', (e) => e.stopPropagation());
      hit.addEventListener('click', () => { strings = strings.filter((x) => x !== s); drawStrings(); save(true); });
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.classList.add('s');
      strSvg.append(hit, p);
    }
    if (temp) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', stringPath(temp.a, temp.b));
      p.classList.add('temp');
      strSvg.append(p);
    }
  }

  function place(it) {
    const el = els.get(it.id);
    if (!el) return;
    Object.assign(el.style, { left: `${it.x}px`, top: `${it.y}px`, width: `${it.w}px`, height: `${it.h}px`, transform: `rotate(${it.rot || 0}deg)` });
    const pin = el.pinEl;
    const p = pinPoint(it);
    Object.assign(pin.style, { left: `${p.x}px`, top: `${p.y}px` });
  }

  function itemAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      const host = el.closest?.('[data-item]');
      if (host) return host.dataset.item;
      const pin = el.closest?.('[data-pin]');
      if (pin) return pin.dataset.pin;
    }
    return null;
  }

  function startDrag(e, it) {
    if (e.button !== 0 || locked()) return;
    e.preventDefault();
    e.stopPropagation();
    // Bring to the front.
    items = [...items.filter((i) => i !== it), it];
    layer.insertBefore(els.get(it.id), strSvg);
    const el = els.get(it.id);
    el.classList.add('dragging');
    const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
    const { w: bw, h: bh } = design();
    const move = (ev) => {
      it.x = Math.round(Math.min(bw - 30, Math.max(-it.w + 30, ox + (ev.clientX - sx) / scale)));
      it.y = Math.round(Math.min(bh - 30, Math.max(0, oy + (ev.clientY - sy) / scale)));
      place(it);
      drawStrings();
    };
    const up = () => {
      el.classList.remove('dragging');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      save(true);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function pinDown(e, it) {
    if (e.button !== 0 || locked()) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const box = layer.getBoundingClientRect();
    let tying = false;
    const move = (ev) => {
      if (!tying && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      tying = true;
      drawStrings({ a: pinPoint(it), b: { x: (ev.clientX - box.left) / scale, y: (ev.clientY - box.top) / scale } });
    };
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!tying) {
        // A plain click cycles the pin's color.
        it.pin = PIN_ORDER[(PIN_ORDER.indexOf(it.pin) + 1) % PIN_ORDER.length];
        els.get(it.id).pinEl.innerHTML = pinSvg(it.id, it.pin);
        save(true);
        return;
      }
      const target = itemAt(ev.clientX, ev.clientY);
      if (target && target !== it.id && !strings.some((s) => (s.a === it.id && s.b === target) || (s.a === target && s.b === it.id))) {
        strings.push({ a: it.id, b: target });
        save(true);
      }
      drawStrings();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function remove(it) {
    items = items.filter((i) => i !== it);
    strings = strings.filter((s) => s.a !== it.id && s.b !== it.id);
    build();
    save(true);
  }

  function build() {
    const focused = document.activeElement?.closest?.('[data-item]')?.dataset.item;
    if (focused) return; // never rebuild under the cursor while typing
    els.clear();
    layer.replaceChildren();
    pinLayer.replaceChildren();
    for (const it of items) {
      let el;
      if (it.kind === 'photo') {
        const cap = h('div.cap', { contenteditable: locked() ? 'false' : 'true', spellcheck: 'false' }, it.caption || '');
        cap.addEventListener('input', () => { it.caption = cap.textContent; save(); });
        el = h('div.item.photo-item', { 'data-item': it.id, 'data-interactive': '' }, h('img', { src: fileUrl(it.file), alt: '' }), cap);
      } else {
        const p = PAPERS[it.paper] || PAPERS.butter;
        const text = h('div.text', { contenteditable: locked() ? 'false' : 'true', spellcheck: 'true', html: clean(it.html || '') });
        text.addEventListener('input', () => { it.html = clean(text.innerHTML); save(); });
        text.addEventListener('blur', () => save(true));
        text.addEventListener('keydown', (e) => {
          if (!e.metaKey) return;
          const cmd = { u: 'underline', b: 'bold', i: 'italic' }[e.key.toLowerCase()];
          if (cmd) { e.preventDefault(); document.execCommand(cmd); it.html = clean(text.innerHTML); save(); }
        });
        el = h('div.item.note-item', { 'data-item': it.id, 'data-interactive': '' }, text);
        el.style.setProperty('--paper', p.bg);
        el.style.setProperty('--ink', p.ink);
      }
      const x = h('button.x', { title: 'Take it off the board', onmousedown: (e) => e.stopPropagation(), onclick: () => remove(it) }, '×');
      el.append(x);
      el.addEventListener('mousedown', (e) => {
        if (e.target.closest('[contenteditable], button')) return;
        startDrag(e, it);
      });
      const pin = h('div.pin', { 'data-pin': it.id, 'data-interactive': '', title: 'Click to change color · drag to another note to tie a string', html: pinSvg(it.id, it.pin) });
      pin.style.pointerEvents = 'auto';
      pin.addEventListener('mousedown', (e) => pinDown(e, it));
      el.pinEl = pin;
      els.set(it.id, el);
      layer.append(el);
      pinLayer.append(pin);
      place(it);
    }
    layer.append(strSvg, pinLayer);
    if (!items.length) layer.append(h('div.empty', {}, 'Right-click to pin a note or a photo.'));
    drawStrings();
    light();
  }

  function load() {
    const c = ctx.config;
    const fonts = ctx.registry.FONTS;
    wrap.style.setProperty('--note-font', (fonts[c.font] || fonts.scrawl).stack);
    wrap.style.setProperty('--note-size', `${c.size}px`);
    // Boards made before scaling existed are drawn at the size they are now.
    if (!c.boardW && board.clientWidth) ctx.setConfig({ boardW: board.clientWidth, boardH: board.clientHeight });
    fitLayer();
    const wasLocked = wrap.classList.contains('locked');
    wrap.classList.toggle('locked', locked());
    const next = JSON.stringify([c.items, c.strings]);
    if (next === JSON.stringify([items, strings]) && wasLocked === locked()) { light(); return; }
    items = (c.items || []).map((i) => ({ ...i }));
    strings = (c.strings || []).map((s) => ({ ...s }));
    build();
  }

  function addNote() {
    const n = items.length;
    const paper = PAPER_ORDER[n % PAPER_ORDER.length];
    const it = { id: uid(), kind: 'note', x: 30 + (n % 4) * 24, y: 26 + (n % 4) * 20, w: 170, h: 150, rot: Math.round((Math.random() * 4 - 2) * 10) / 10, paper, pin: PIN_ORDER[n % PIN_ORDER.length], html: '' };
    items.push(it);
    build();
    save(true);
    setTimeout(() => els.get(it.id)?.querySelector('.text')?.focus(), 50);
  }

  async function addPhoto() {
    const r = await ctx.api.pickPhoto();
    if (!r || !r.ok) return;
    const n = items.length;
    items.push({ id: uid(), kind: 'photo', x: 60 + (n % 4) * 24, y: 40 + (n % 4) * 20, w: 160, h: 170, rot: Math.round((Math.random() * 6 - 3) * 10) / 10, pin: PIN_ORDER[(n + 2) % PIN_ORDER.length], file: r.data.file, caption: '' });
    build();
    save(true);
  }

  // Portrait / landscape: swap the board's sides and spread everything
  // pinned on it proportionally into the new shape.
  function markOrient() {
    const portrait = window.innerHeight >= window.innerWidth;
    orientBar.children[0].classList.toggle('on', portrait);
    orientBar.children[1].classList.toggle('on', !portrait);
  }
  function orient(portrait) {
    const b = { ...ctx.widget.bounds };
    if ((b.height >= b.width) === portrait) return;
    const nb = { ...b, width: b.height, height: b.width };
    const { w: ow, h: oh } = design();
    const nw = oh, nh = ow;
    for (const it of items) {
      const cx = (it.x + it.w / 2) / ow, cy = (it.y + it.h / 2) / oh;
      it.x = Math.round(Math.min(nw - it.w, Math.max(0, cx * nw - it.w / 2)));
      it.y = Math.round(Math.min(nh - it.h, Math.max(0, cy * nh - it.h / 2)));
    }
    ctx.setConfig({ items: items.map((i) => ({ ...i })), strings: strings.map((x) => ({ ...x })), boardW: nw, boardH: nh });
    ctx.api.updateWidget(ctx.widget.id, { bounds: nb });
    for (const it of items) place(it);
    drawStrings();
  }
  window.addEventListener('resize', () => { markOrient(); fitLayer(); drawStrings(); light(); });
  markOrient();

  load();
  return {
    noDoubleClickSettings: true,
    update: load,
    menu: () => [
      ...(locked() ? [] : [{ label: 'Add Note', action: 'note' }, { label: 'Add Photo…', action: 'photo' }]),
      ...(strings.length && !locked() ? [{ label: 'Cut All Strings', action: 'cut' }] : []),
      { label: 'Lock the Board', type: 'checkbox', checked: locked(), action: 'lock' },
      { label: 'Desk Lamp', type: 'checkbox', checked: ctx.config.lamp === 'on' || ctx.config.lamp === 'off', action: 'lamp' },
    ],
    menuAction: (a) => {
      // setConfig doesn't echo back to this window, so repaint here.
      if (a === 'lock') { ctx.setConfig({ locked: !locked() }); load(); }
      else if (a === 'lamp') { ctx.setConfig({ lamp: ctx.config.lamp === 'on' || ctx.config.lamp === 'off' ? 'none' : 'on' }); light(); }
      else if (a === 'note') addNote();
      else if (a === 'photo') addPhoto();
      else if (a === 'cut') { strings = []; drawStrings(); save(true); }
    },
  };
}
