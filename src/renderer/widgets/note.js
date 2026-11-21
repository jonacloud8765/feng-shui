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

const css = `
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
.note u { text-decoration-thickness: 0.06em; text-underline-offset: 0.14em; }
.note.lined .body {
  background-image: repeating-linear-gradient(180deg, transparent 0, transparent calc(1.45em - 1px), color-mix(in srgb, var(--ink, var(--text)) 18%, transparent) calc(1.45em - 1px), color-mix(in srgb, var(--ink, var(--text)) 18%, transparent) 1.45em);
  background-position: 0 -0.1em;
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
    <defs><radialGradient id="pinhead" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ff8a7a"/><stop offset="0.55" stop-color="#d8382c"/><stop offset="1" stop-color="#8e1d16"/></radialGradient></defs>
    <path d="M11 17 L11 29" stroke="#9aa0a6" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="11" cy="17" rx="6" ry="2.2" fill="#a8261d"/>
    <path d="M7 9 h8 l1.5 7 h-11 z" fill="#c22f24"/>
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
  const note = h('div.note', {}, paper, tape, pin, sheet, fmt);
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
    note.style.setProperty('--paper', p.bg || 'transparent');
    note.style.setProperty('--paper-bg', p.bg || '#fff');
    if (p.ink) note.style.setProperty('--ink', p.ink); else note.style.removeProperty('--ink');
    const fonts = ctx.registry.FONTS;
    const bodyFont = (fonts[c.font] || fonts.noteworthy).stack;
    note.style.setProperty('--note-font', bodyFont);
    note.style.setProperty('--title-font', fonts[c.titleFont]?.stack || bodyFont);
    note.style.setProperty('--note-size', `${c.size}px`);
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
