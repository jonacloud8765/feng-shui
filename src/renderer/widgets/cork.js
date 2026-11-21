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
  background: ${CORK_FLECK}, ${CORK_GRAIN}, ${CORK_BLOTCH},
    radial-gradient(120% 90% at 30% 20%, #c99a68, #b4824f 60%, #a2713f);
  box-shadow: inset 0 2px 5px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.25), inset 0 0 40px rgba(60,30,10,0.25);
}
.cork .item {
  position: absolute; transform-origin: 50% 0; cursor: grab;
  box-shadow: 0 1px 1.5px rgba(0,0,0,0.25), 0 6px 10px -4px rgba(0,0,0,0.35), 0 14px 18px -12px rgba(0,0,0,0.4);
}
.cork .item.dragging { cursor: grabbing; box-shadow: 0 2px 3px rgba(0,0,0,0.25), 0 16px 26px -8px rgba(0,0,0,0.45); }
.cork .note-item {
  border-radius: 1.5px; padding: 24px 12px 12px; color: var(--ink);
  background: linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 40%), linear-gradient(200deg, rgba(0,0,0,0) 70%, rgba(0,0,0,0.07)), var(--paper);
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
.cork .empty { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(40,20,5,0.55); font: 500 13px system-ui; text-align: center; pointer-events: none; }
`;

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
  const wrap = h('div.corkwrap', {}, h('div.cork-frame'), board);
  root.append(wrap);

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
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Bring to the front.
    items = [...items.filter((i) => i !== it), it];
    board.insertBefore(els.get(it.id), strSvg);
    const el = els.get(it.id);
    el.classList.add('dragging');
    const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
    const bw = board.clientWidth, bh = board.clientHeight;
    const move = (ev) => {
      it.x = Math.round(Math.min(bw - 30, Math.max(-it.w + 30, ox + ev.clientX - sx)));
      it.y = Math.round(Math.min(bh - 30, Math.max(0, oy + ev.clientY - sy)));
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
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const box = board.getBoundingClientRect();
    let tying = false;
    const move = (ev) => {
      if (!tying && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      tying = true;
      drawStrings({ a: pinPoint(it), b: { x: ev.clientX - box.left, y: ev.clientY - box.top } });
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
    board.replaceChildren();
    pinLayer.replaceChildren();
    for (const it of items) {
      let el;
      if (it.kind === 'photo') {
        const cap = h('div.cap', { contenteditable: 'true', spellcheck: 'false' }, it.caption || '');
        cap.addEventListener('input', () => { it.caption = cap.textContent; save(); });
        el = h('div.item.photo-item', { 'data-item': it.id, 'data-interactive': '' }, h('img', { src: fileUrl(it.file), alt: '' }), cap);
      } else {
        const p = PAPERS[it.paper] || PAPERS.butter;
        const text = h('div.text', { contenteditable: 'true', spellcheck: 'true', html: clean(it.html || '') });
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
      board.append(el);
      pinLayer.append(pin);
      place(it);
    }
    board.append(strSvg, pinLayer);
    if (!items.length) board.append(h('div.empty', {}, 'Right-click to pin a note or a photo.'));
    drawStrings();
  }

  function load() {
    const c = ctx.config;
    const fonts = ctx.registry.FONTS;
    wrap.style.setProperty('--note-font', (fonts[c.font] || fonts.scrawl).stack);
    wrap.style.setProperty('--note-size', `${c.size}px`);
    const next = JSON.stringify([c.items, c.strings]);
    if (next === JSON.stringify([items, strings])) return;
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

  load();
  return {
    noDoubleClickSettings: true,
    update: load,
    menu: () => [
      { label: 'Add Note', action: 'note' },
      { label: 'Add Photo…', action: 'photo' },
      ...(strings.length ? [{ label: 'Cut All Strings', action: 'cut' }] : []),
    ],
    menuAction: (a) => {
      if (a === 'note') addNote();
      else if (a === 'photo') addPhoto();
      else if (a === 'cut') { strings = []; drawStrings(); save(true); }
    },
  };
}
