import { h } from '../dom.js';

// Paper colors sit over the glass at high opacity, so the note still picks up
// a little of the wallpaper. "glass" keeps the widget's own glass style.
export const PAPERS = {
  glass: { label: 'Glass', bg: null, ink: null },
  butter: { label: 'Butter', bg: '#f5e6a6', ink: '#3b3221' },
  rose: { label: 'Rose', bg: '#f1cdc6', ink: '#3f2624' },
  sage: { label: 'Sage', bg: '#d2e1c5', ink: '#24321f' },
  sky: { label: 'Sky', bg: '#c9dcee', ink: '#1f2d3b' },
  lavender: { label: 'Lavender', bg: '#dcd2f1', ink: '#2c2540' },
  kraft: { label: 'Kraft', bg: '#d9c19a', ink: '#352816' },
  ink: { label: 'Midnight', bg: '#1b2234', ink: '#efe8da' },
};

// Pushpin heads: [light, base, shadow].
export const PINS = {
  red: { label: 'Red', c: ['#ff8a7a', '#d8382c', '#7e1912'] },
  blue: { label: 'Blue', c: ['#8fc2ff', '#2f6fd6', '#163a7a'] },
  yellow: { label: 'Yellow', c: ['#fff2a0', '#f0c419', '#8a6a06'] },
  green: { label: 'Green', c: ['#a6e8a0', '#3aa64a', '#1b5a24'] },
  white: { label: 'Pearl', c: ['#ffffff', '#e4e1da', '#9b968c'] },
  black: { label: 'Black', c: ['#7a7a7a', '#2a2a2a', '#000000'] },
};

// Long paper fibres, stretched sideways like real pulp.
const FIBRE = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="520" height="260"><filter id="f"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.09" numOctaves="4" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.34  0 0 0 0 0.25  0 0 0 0.26 -0.1"/></filter><rect width="520" height="260" filter="url(#f)"/></svg>')}")`;

// Paper grain, shared by every note.
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0.17 0"/></filter><rect width="180" height="180" filter="url(#n)"/></svg>')}")`;

// A few specks of dust and a stray fibre, placed the same way every time for a given note.
function dust(seed) {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  let out = '';
  for (let i = 0; i < 14; i++) {
    out += `<circle cx="${(rnd() * 400).toFixed(1)}" cy="${(rnd() * 400).toFixed(1)}" r="${(0.35 + rnd() * 0.9).toFixed(2)}" fill="rgba(${rnd() < 0.7 ? '60,50,40' : '255,255,255'},${(0.18 + rnd() * 0.3).toFixed(2)})"/>`;
  }
  for (let i = 0; i < 2; i++) {
    const sx = rnd() * 380, sy = rnd() * 380;
    out += `<path d="M${sx.toFixed(0)} ${sy.toFixed(0)} q ${(rnd() * 14 - 7).toFixed(1)} ${(rnd() * 10 - 5).toFixed(1)} ${(rnd() * 22 - 11).toFixed(1)} ${(rnd() * 16 - 8).toFixed(1)}" stroke="rgba(70,60,50,0.16)" stroke-width="0.5" fill="none"/>`;
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">${out}</svg>`)}")`;
}

const css = `
/* ---- Physical paper: the note sits inside the window with room around it
   for its shadow and for a pin that pokes out past the paper's edge. ---- */
:root.paper-note .glass { overflow: visible; border-radius: 0; }
:root.paper-note .glass > .layer { display: none; }
.note.real { inset: 20px 14px 22px 12px; --curl: 24px; }
.note.real { transform: rotate(var(--tilt, 0deg)); }
.note.real .paper, .note.real .paper.on {
  border-radius: 1.5px; opacity: 1;
  /* The bottom-right corner is curled up, so the paper is cut away there. */
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - var(--curl)), calc(100% - var(--curl)) 100%, 0 100%);
  background:
    radial-gradient(140% 70% at 30% -15%, rgba(255,255,255,0.36), transparent 55%),
    linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.0) 3px, rgba(255,255,255,0.08) 3px, rgba(0,0,0,0) 17%),
    linear-gradient(185deg, rgba(255,255,255,0) 55%, rgba(0,0,0,0.05) 85%, rgba(0,0,0,0.11) 100%),
    linear-gradient(90deg, rgba(0,0,0,0.035), rgba(0,0,0,0) 6%, rgba(0,0,0,0) 94%, rgba(0,0,0,0.04)),
    var(--dust), ${GRAIN}, ${FIBRE},
    var(--paper);
  background-size: auto, auto, auto, auto, 400px 400px, 180px 180px, 520px 260px, auto;
  background-blend-mode: normal, normal, normal, normal, normal, multiply, multiply, normal;
  box-shadow: 0 0.5px 0 rgba(255,255,255,0.65) inset, 0 -0.5px 0 rgba(0,0,0,0.12) inset;
}
/* Shadows live on a box behind the paper so the curled corner can cut the paper. */
.note.real .lift {
  position: absolute; inset: 0; pointer-events: none; z-index: -1;
  clip-path: polygon(-40px -40px, calc(100% + 40px) -40px, calc(100% + 40px) calc(100% - var(--curl) + 6px), calc(100% - var(--curl) + 6px) calc(100% + 40px), -40px calc(100% + 40px));
  box-shadow:
    0 0 0 0.5px rgba(0,0,0,0.10),
    0 1px 1.5px rgba(0,0,0,0.2),
    0 4px 7px -2px rgba(0,0,0,0.18),
    0 16px 26px -12px rgba(0,0,0,0.38);
}
.note.real .lift::before, .note.real .lift::after {
  content: ''; position: absolute; bottom: 10px; width: 46%; height: 22%;
  box-shadow: 0 14px 12px rgba(0,0,0,0.30);
}
.note.real .lift::before { left: 8px; transform: rotate(-3.2deg); }
.note.real .lift::after { right: 14px; transform: rotate(4.4deg); box-shadow: 0 18px 14px rgba(0,0,0,0.34); }
.note:not(.real) .lift { display: none; }
/* The curled-up corner: the paper's paler underside, folded over, with its own shadow. */
.note.real .curl {
  position: absolute; right: 0; bottom: 0; width: var(--curl); height: var(--curl); pointer-events: none;
  filter: drop-shadow(-2px -1px 2.5px rgba(0,0,0,0.22));
}
.note.real .curl::before {
  content: ''; position: absolute; inset: 0;
  clip-path: polygon(0 0, 100% 0, 0 100%);
  border-bottom-right-radius: 60% 60%;
  background:
    linear-gradient(135deg, rgba(0,0,0,0.0) 0, rgba(0,0,0,0.0) 30%, rgba(255,255,255,0.55) 62%, rgba(0,0,0,0.10) 100%),
    var(--paper);
  filter: saturate(0.7) brightness(1.04);
}
.note:not(.real) .curl { display: none; }
/* Window buttons, revealed by hovering the top-left corner. */
.note .lights { position: absolute; left: 0; top: 0; padding: 9px 10px; display: flex; gap: 7px; z-index: 4; opacity: 0; transition: opacity 0.18s; }
.note .lights:hover, .note .lights:focus-within { opacity: 1; }
.note .lights button {
  width: 12px; height: 12px; padding: 0; border-radius: 50%; border: 0.5px solid rgba(0,0,0,0.22);
  display: grid; place-items: center; cursor: default; color: rgba(0,0,0,0.55); font: 700 9px/1 system-ui;
}
.note .lights button span { opacity: 0; }
.note .lights:hover button span { opacity: 1; }
.note .lights .close { background: #ff5f57; }
.note .lights .min { background: #febc2e; }
.note .lights .zoom { background: #28c840; }
/* Resize grip in the top-right corner. */
.note .grip.handle {
  position: absolute; right: 0; top: 0; left: auto; bottom: auto; width: 22px; height: 22px; z-index: 4;
  cursor: nesw-resize; opacity: 0; transition: opacity 0.18s;
  background:
    linear-gradient(225deg, transparent 0 5px, color-mix(in srgb, var(--ink, var(--text)) 45%, transparent) 5px 6px, transparent 6px 9px,
      color-mix(in srgb, var(--ink, var(--text)) 45%, transparent) 9px 10px, transparent 10px);
}
.note:hover .grip.handle { opacity: 0.8; }
.note.collapsed .body, .note.collapsed .curl { display: none; }
.note.real .tape { top: -9px; opacity: 0.9; background: linear-gradient(90deg, rgba(250,246,236,0.78), rgba(240,234,220,0.62)); box-shadow: 0 1px 2px rgba(0,0,0,0.14); }
.note.real .pushpin { top: -13px; filter: drop-shadow(1.5px 3px 1.5px rgba(0,0,0,0.38)); }
.note .pushpin .tip { display: none; }
.note:not(.real) .pushpin .tip { display: inline; }
.note:not(.real) .pushpin { top: 4px; }

.note { position: absolute; inset: 0; display: flex; flex-direction: column; }
.note .paper { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; transition: background-color 0.4s var(--ease); }
.note .paper.on {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 40%),
    radial-gradient(130% 90% at 100% 100%, rgba(0,0,0,0.07), transparent 60%),
    var(--paper);
  opacity: 0.92;
}
.note .tape {
  position: absolute; top: -2px; left: 50%; width: 34%; max-width: 110px; height: 18px;
  transform: translateX(-50%) rotate(-2.5deg);
  background: linear-gradient(90deg, rgba(255,255,255,0.55), rgba(255,255,255,0.35));
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  opacity: 0.75; border-radius: 1px;
  -webkit-mask: linear-gradient(90deg, transparent 0 2px, #000 2px calc(100% - 2px), transparent calc(100% - 2px));
  pointer-events: none;
}
.note .pushpin {
  position: absolute; top: 4px; left: 50%; width: 26px; height: 36px; transform: translateX(-50%) rotate(8deg);
  pointer-events: none; z-index: 2; filter: drop-shadow(1px 3px 2px rgba(0,0,0,0.28));
}
.note .sheet {
  position: relative; flex: 1; min-height: 0; overflow-y: auto;
  margin: calc(var(--pad) + 6px) var(--pad) var(--pad);
  display: flex; flex-direction: column; gap: 0.15em;
  color: var(--ink, var(--text)); text-align: var(--align);
}
.note .sheet::-webkit-scrollbar { width: 0; }
.note .title, .note .body {
  outline: none; user-select: text; cursor: text; caret-color: var(--accent);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.note .title {
  font-family: var(--title-font); font-size: calc(var(--note-size) * 1.45 * var(--scale)); line-height: 1.25;
}
.note .title.hidden { display: none; }
.note .body {
  flex: 1; font-family: var(--note-font); font-size: calc(var(--note-size) * var(--scale)); line-height: 1.45;
}
.note .title:empty::before, .note .body:empty::before { content: attr(data-placeholder); opacity: 0.35; pointer-events: none; }
/* Handwriting fonts sit low with long tails, so the underline goes well below and skips the tails. */
.note u { text-decoration-thickness: 0.055em; text-underline-offset: 0.32em; text-decoration-skip-ink: all; }
.note.lined .body ul { margin: 0; }
.note.lined .body {
  background-image: repeating-linear-gradient(180deg, transparent 0, transparent calc(1.45em - 1px), color-mix(in srgb, var(--ink, var(--text)) 18%, transparent) calc(1.45em - 1px), color-mix(in srgb, var(--ink, var(--text)) 18%, transparent) 1.45em);
  background-position: 0 0.06em;
}
.note .fmt {
  position: absolute; z-index: 3; display: none; gap: 2px; padding: 3px;
  border-radius: 9px; background: rgba(20,20,24,0.86); box-shadow: 0 4px 14px rgba(0,0,0,0.25);
  transform: translate(-50%, calc(-100% - 6px));
}
.note .fmt.on { display: flex; }
/* While typing, the bar rests quietly in the corner. */
.note .fmt.dock { display: flex; transform: none; left: auto !important; top: auto !important; right: 8px; bottom: 8px; opacity: 0.55; transition: opacity 0.2s; }
.note .fmt.dock:hover { opacity: 1; }
.note .fmt button {
  width: 26px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: #fff;
  font: 600 14px/1 system-ui; cursor: pointer;
}
.note .fmt button:hover { background: rgba(255,255,255,0.16); }
.note .fmt button.active { background: rgba(255,255,255,0.28); }
.note .fmt .u { text-decoration: underline; }
.note .fmt .i { font-style: italic; font-family: Georgia, serif; }
.note .fmt .sep { width: 1px; margin: 3px 2px; background: rgba(255,255,255,0.2); }
.note ul { margin: 0.1em 0; padding-left: 1.25em; }
.note ul li { padding-left: 0.1em; }
.note ul[data-check] { list-style: none; padding-left: 1.55em; }
.note ul[data-check] li { position: relative; }
.note ul[data-check] li::before {
  content: ''; position: absolute; left: -1.45em; top: 0.32em; width: 0.8em; height: 0.8em; box-sizing: border-box;
  border: 1.5px solid currentColor; border-radius: 0.22em; opacity: 0.7; cursor: pointer;
}
.note ul[data-check] li[data-done]::before {
  opacity: 0.85; background: var(--ink, var(--text)); border-color: var(--ink, var(--text));
}
.note ul[data-check] li[data-done]::after {
  content: ''; position: absolute; left: -1.2em; top: 0.42em; width: 0.22em; height: 0.42em;
  border: solid var(--paper-bg, #fff); border-width: 0 0.12em 0.12em 0; transform: rotate(45deg); pointer-events: none;
}
.note ul[data-check] li[data-done] { color: color-mix(in srgb, var(--ink, var(--text)) 50%, transparent); text-decoration: line-through; text-decoration-thickness: 0.06em; }
`;

// Notes are stored as a small subset of HTML so underline, bold and italic
// survive. Anything else pasted in is reduced to its text.
const KEEP = new Set(['U', 'B', 'STRONG', 'I', 'EM', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI']);
// The only attributes kept: which lists are checklists, and which items are ticked.
const ATTRS = { UL: 'data-check', LI: 'data-done' };

export function clean(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }
      walk(child);
      if (KEEP.has(child.tagName)) {
        for (const a of [...child.attributes]) if (a.name !== ATTRS[child.tagName]) child.removeAttribute(a.name);
        if (child.hasAttribute(ATTRS[child.tagName])) child.setAttribute(ATTRS[child.tagName], '');
      } else {
        child.replaceWith(...child.childNodes);
      }
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

const escape = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>');

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const paper = h('div.paper');
  const tape = h('div.tape');
  const pin = h('div.pushpin', { html: `<svg viewBox="0 0 22 30" width="26" height="36" aria-hidden="true">
    <defs><radialGradient id="pinhead" cx="35%" cy="30%" r="70%"><stop offset="0" style="stop-color:var(--pin-1)"/><stop offset="0.55" style="stop-color:var(--pin-2)"/><stop offset="1" style="stop-color:var(--pin-3)"/></radialGradient>
      <linearGradient id="pinneck" x1="0" x2="1"><stop offset="0" style="stop-color:var(--pin-3)"/><stop offset="0.45" style="stop-color:var(--pin-2)"/><stop offset="1" style="stop-color:var(--pin-3)"/></linearGradient>
      <linearGradient id="needle" x1="0" x2="1"><stop offset="0" stop-color="#6d7277"/><stop offset="0.5" stop-color="#e6e9ec"/><stop offset="1" stop-color="#7d8287"/></linearGradient></defs>
    <ellipse cx="11.6" cy="23.4" rx="1.6" ry="0.7" fill="rgba(0,0,0,0.35)"/>
    <path d="M10.3 17 L10.7 23.2 L11.3 23.2 L11.7 17 z" fill="url(#needle)"/>
    <path class="tip" d="M10.7 23 L10.9 29.4 L11.1 29.4 L11.3 23 z" fill="url(#needle)"/>
    <ellipse cx="11" cy="17" rx="6" ry="2.2" style="fill:var(--pin-3)"/>
    <path d="M7 9 h8 l1.5 7.4 h-11 z" fill="url(#pinneck)"/>
    <circle cx="11" cy="7.5" r="6.5" fill="url(#pinhead)"/>
    <ellipse cx="8.6" cy="5.2" rx="2" ry="1.3" fill="rgba(255,255,255,0.65)"/></svg>` });
  const title = h('div.title', { contenteditable: 'true', spellcheck: 'true', 'data-placeholder': 'Title', 'aria-label': 'Note title' });
  const body = h('div.body', { contenteditable: 'true', spellcheck: 'true', 'data-placeholder': 'Write something…', 'aria-label': 'Note' });
  const btn = (cls, cmd, label, tip) => h(`button.${cls}`, {
    title: tip, onmousedown: (e) => { e.preventDefault(); document.execCommand(cmd); save(); place(); },
  }, label);
  const listBtn = (cls, kind, label, tip) => h(`button.${cls}`, {
    title: tip, onmousedown: (e) => { e.preventDefault(); toggleList(kind); },
  }, label);
  const fmt = h('div.fmt', {}, btn('u', 'underline', 'U', 'Underline (⌘U)'), btn('b', 'bold', 'B', 'Bold (⌘B)'), btn('i', 'italic', 'I', 'Italic (⌘I)'),
    h('span.sep'), listBtn('l', 'bullets', '•', 'Bulleted list (⌘⇧7)'), listBtn('c', 'check', '☐', 'Checklist (⌘⇧L)'));
  const sheet = h('div.sheet', {}, title, body);
  const light = (cls, glyph, tip, fn) => h(`button.${cls}`, { title: tip, 'aria-label': tip, onclick: (e) => { e.stopPropagation(); fn(); } }, h('span', {}, glyph));
  const lights = h('div.lights', {},
    light('close', '×', 'Hide note (show it again from Settings)', () => ctx.api.updateWidget(ctx.widget.id, { visible: false })),
    light('min', '–', 'Fold the note down to its title', () => collapse()),
    light('zoom', '+', 'Zoom the note', () => zoom()));
  const grip = h('div.grip.handle', { 'data-edge': 'ne', title: 'Resize' });
  const note = h('div.note', {}, h('div.lift'), paper, h('div.curl'), tape, pin, sheet, fmt, lights, grip);
  // The note fills the whole glass, ignoring the widget padding wrapper.
  root.style.padding = '0';
  root.append(note);

  const read = (el) => (el.textContent.trim() ? clean(el.innerHTML) : '');
  let timer;
  function save() {
    clearTimeout(timer);
    const patch = { title: read(title), body: read(body), text: '' };
    if (patch.title !== (ctx.config.title || '') || patch.body !== (ctx.config.body || '')) ctx.setConfig(patch);
  }
  for (const el of [title, body]) {
    el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 400); });
    el.addEventListener('blur', save);
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    el.addEventListener('keydown', (e) => {
      if (e.metaKey && e.shiftKey && (e.code === 'Digit7' || e.code === 'KeyL')) {
        e.preventDefault(); toggleList(e.code === 'KeyL' ? 'check' : 'bullets'); return;
      }
      if (!e.metaKey) return;
      const cmd = { u: 'underline', b: 'bold', i: 'italic' }[e.key.toLowerCase()];
      if (cmd) { e.preventDefault(); document.execCommand(cmd); save(); place(); }
    });
  }
  // Lists live only in the body. A checklist is a bulleted list marked data-check.
  const listAt = () => {
    const n = document.getSelection().anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    return el && body.contains(el) ? el.closest('ul') : null;
  };
  function toggleList(kind) {
    if (!body.contains(document.getSelection().anchorNode)) body.focus();
    const ul = listAt();
    if (ul && (kind === 'check') !== ul.hasAttribute('data-check')) {
      // Switch the list's kind in place.
      ul.toggleAttribute('data-check', kind === 'check');
      if (kind !== 'check') ul.querySelectorAll('li[data-done]').forEach((li) => li.removeAttribute('data-done'));
    } else {
      document.execCommand('insertUnorderedList');
      const made = listAt();
      if (made && kind === 'check') made.setAttribute('data-check', '');
    }
    save(); place();
  }
  // Tick a checklist item by clicking its box.
  body.addEventListener('mousedown', (e) => {
    const li = e.target.closest?.('ul[data-check] > li');
    if (!li || e.clientX > li.getBoundingClientRect().left) return;
    e.preventDefault();
    li.toggleAttribute('data-done');
    save();
  });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // A new checklist line starts unticked.
      setTimeout(() => { const n = document.getSelection().anchorNode; (n?.nodeType === 1 ? n : n?.parentElement)?.closest('li')?.removeAttribute('data-done'); });
    }
    if (e.key === ' ') {
      // "- " or "* " starts a bulleted list, "[] " a checklist.
      const sel = document.getSelection();
      const n = sel.anchorNode;
      if (!sel.isCollapsed || n?.nodeType !== 3 || listAt()) return;
      const before = n.textContent.slice(0, sel.anchorOffset);
      const kind = before === '-' || before === '*' ? 'bullets' : before === '[]' ? 'check' : null;
      if (!kind) return;
      const lineStart = !n.previousSibling || n.previousSibling.nodeName === 'BR';
      if (!lineStart) return;
      e.preventDefault();
      sel.setBaseAndExtent(n, 0, n, sel.anchorOffset);
      document.execCommand('delete');
      toggleList(kind);
    }
  });

  body.addEventListener('blur', () => fmt.classList.remove('dock'));

  // Enter in the title moves on to the body.
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });

  // A small format bar floats above any selection inside the note.
  function place() {
    const sel = document.getSelection();
    const inNote = sel.rangeCount && !sel.isCollapsed && sheet.contains(sel.anchorNode);
    fmt.classList.toggle('on', !!inNote);
    fmt.classList.toggle('dock', !inNote && document.activeElement === body);
    if (!inNote) { updateActive(); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const box = note.getBoundingClientRect();
    fmt.style.left = `${Math.min(Math.max(r.left + r.width / 2 - box.left, 44), box.width - 44)}px`;
    fmt.style.top = `${Math.max(r.top - box.top, 36)}px`;
    updateActive();
  }
  function updateActive() {
    for (const [b, cmd] of [[fmt.children[0], 'underline'], [fmt.children[1], 'bold'], [fmt.children[2], 'italic']]) {
      b.classList.toggle('active', document.queryCommandState(cmd));
    }
    const ul = listAt();
    fmt.children[4].classList.toggle('active', !!ul && !ul.hasAttribute('data-check'));
    fmt.children[5].classList.toggle('active', !!ul?.hasAttribute('data-check'));
  }
  document.addEventListener('selectionchange', place);
  let lastRange = null;
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (sel.rangeCount && body.contains(sel.anchorNode)) lastRange = sel.getRangeAt(0).cloneRange();
  });
  function restore() {
    body.focus();
    if (lastRange) { const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(lastRange); }
  }

  function underlineSelection() {
    const sel = document.getSelection();
    if (sel.rangeCount && !sel.isCollapsed && sheet.contains(sel.anchorNode)) { document.execCommand('underline'); save(); }
  }

  function load() {
    const c = ctx.config;
    const p = PAPERS[c.paper] || PAPERS.glass;
    paper.classList.toggle('on', !!p.bg);
    // Paper notes are drawn as real paper; the glass note keeps the glass look.
    note.classList.toggle('real', !!p.bg);
    document.documentElement.classList.toggle('paper-note', !!p.bg);
    note.style.setProperty('--dust', dust(ctx.widget.id || 'note'));
    // Every note sits very slightly askew, the same way each time.
    let t = 0;
    for (const ch of ctx.widget.id || '') t = (t * 33 + ch.charCodeAt(0)) % 1000;
    note.style.setProperty('--tilt', `${((t / 1000) * 1.2 - 0.6).toFixed(2)}deg`);
    note.classList.toggle('collapsed', !!c.collapsed);
    const pc = (PINS[c.pinColor] || PINS.red).c;
    pc.forEach((v, i) => note.style.setProperty(`--pin-${i + 1}`, v));
    note.style.setProperty('--paper', p.bg || 'transparent');
    note.style.setProperty('--paper-bg', p.bg || '#fff');
    if (p.ink) note.style.setProperty('--ink', p.ink); else note.style.removeProperty('--ink');
    const fonts = ctx.registry.FONTS;
    const bodyFont = (fonts[c.font] || fonts.noteworthy).stack;
    note.style.setProperty('--note-font', bodyFont);
    note.style.setProperty('--title-font', fonts[c.titleFont]?.stack || bodyFont);
    fit();
    note.classList.toggle('lined', !!c.lined);
    title.classList.toggle('hidden', !c.showTitle);
    // Older notes only had a tape on/off switch; carry "off" over once.
    let pinned = c.pin;
    if (c.tape === false && c.pin === 'tape') { pinned = 'none'; ctx.setConfig({ pin: 'none', tape: true }); }
    tape.style.display = pinned === 'tape' ? '' : 'none';
    pin.style.display = pinned === 'pushpin' ? '' : 'none';
    // Older notes kept plain text; show it as the body until it's edited.
    const html = c.body != null && c.body !== '' ? c.body : escape(c.text || '');
    if (document.activeElement !== body && body.innerHTML !== html) body.innerHTML = clean(html);
    if (document.activeElement !== title && title.innerHTML !== (c.title || '')) title.innerHTML = clean(c.title || '');
  }
  // Yellow folds the note to a strip showing its title; again restores it.
  function collapse() {
    const c = ctx.config;
    const b = { ...ctx.widget.bounds };
    if (c.collapsed) {
      ctx.setConfig({ collapsed: null });
      ctx.api.updateWidget(ctx.widget.id, { bounds: { ...b, height: c.collapsed } });
    } else {
      ctx.setConfig({ collapsed: b.height });
      ctx.api.updateWidget(ctx.widget.id, { bounds: { ...b, height: 96 } });
    }
    load();
  }
  // Green zooms to a larger copy (text scales with it); again goes back.
  function zoom() {
    const c = ctx.config;
    const b = { ...ctx.widget.bounds };
    if (c.zoomed) {
      ctx.setConfig({ zoomed: null });
      ctx.api.updateWidget(ctx.widget.id, { bounds: { ...b, width: c.zoomed.width, height: c.zoomed.height } });
    } else {
      const max = ctx.registry.TYPES.note.max;
      const k = Math.min(1.7, max.width / b.width, max.height / b.height, (screen.availWidth - 20) / b.width, (screen.availHeight - 20) / b.height);
      ctx.setConfig({ zoomed: { width: b.width, height: b.height } });
      ctx.api.updateWidget(ctx.widget.id, { bounds: { ...b, width: Math.round(b.width * k), height: Math.round(b.height * k) } });
    }
  }

  // Text follows the note's size without changing the saved text size: the
  // size is remembered with the dimensions it was chosen at, and scaled from there.
  function fit() {
    const c = ctx.config;
    if (c.collapsed) return; // a folded note keeps its text size
    const w = window.innerWidth, hgt = window.innerHeight;
    let base = c.base;
    if (!base || base.size !== c.size) {
      base = { w, h: hgt, size: c.size };
      ctx.setConfig({ base });
    }
    const f = Math.max(0.35, Math.min(3, Math.min(w / base.w, hgt / base.h)));
    // Zoom keeps the wrapping identical, so shrinking reads like shrinking a photo of the note.
    note.style.setProperty('--note-size', `${c.size}px`);
    sheet.style.zoom = f.toFixed(3);
  }
  window.addEventListener('resize', fit);
  load();
  return {
    update: load,
    menu: () => [
      { label: 'Underline Selection', action: 'underline' },
      { label: 'Bulleted List', action: 'bullets' },
      { label: 'Checklist', action: 'check' },
    ],
    menuAction: (a) => {
      if (a === 'underline') underlineSelection();
      else if (a === 'bullets' || a === 'check') { restore(); toggleList(a); }
    },
  };
}
