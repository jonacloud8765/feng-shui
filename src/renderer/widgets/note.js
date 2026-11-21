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
.note .fmt button {
  width: 26px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: #fff;
  font: 600 14px/1 system-ui; cursor: pointer;
}
.note .fmt button:hover { background: rgba(255,255,255,0.16); }
.note .fmt button.active { background: rgba(255,255,255,0.28); }
.note .fmt .u { text-decoration: underline; }
.note .fmt .i { font-style: italic; font-family: Georgia, serif; }
`;

// Notes are stored as a small subset of HTML so underline, bold and italic
// survive. Anything else pasted in is reduced to its text.
const KEEP = new Set(['U', 'B', 'STRONG', 'I', 'EM', 'BR', 'DIV', 'P']);

export function clean(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }
      walk(child);
      if (KEEP.has(child.tagName)) {
        for (const a of [...child.attributes]) child.removeAttribute(a.name);
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
  const title = h('div.title', { contenteditable: 'true', spellcheck: 'true', 'data-placeholder': 'Title', 'aria-label': 'Note title' });
  const body = h('div.body', { contenteditable: 'true', spellcheck: 'true', 'data-placeholder': 'Write something…', 'aria-label': 'Note' });
  const btn = (cls, cmd, label, tip) => h(`button.${cls}`, {
    title: tip, onmousedown: (e) => { e.preventDefault(); document.execCommand(cmd); save(); place(); },
  }, label);
  const fmt = h('div.fmt', {}, btn('u', 'underline', 'U', 'Underline (⌘U)'), btn('b', 'bold', 'B', 'Bold (⌘B)'), btn('i', 'italic', 'I', 'Italic (⌘I)'));
  const sheet = h('div.sheet', {}, title, body);
  const note = h('div.note', {}, paper, tape, sheet, fmt);
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
      if (!e.metaKey) return;
      const cmd = { u: 'underline', b: 'bold', i: 'italic' }[e.key.toLowerCase()];
      if (cmd) { e.preventDefault(); document.execCommand(cmd); save(); place(); }
    });
  }
  // Enter in the title moves on to the body.
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });

  // A small format bar floats above any selection inside the note.
  function place() {
    const sel = document.getSelection();
    const inNote = sel.rangeCount && !sel.isCollapsed && sheet.contains(sel.anchorNode);
    fmt.classList.toggle('on', !!inNote);
    if (!inNote) return;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const box = note.getBoundingClientRect();
    fmt.style.left = `${Math.min(Math.max(r.left + r.width / 2 - box.left, 44), box.width - 44)}px`;
    fmt.style.top = `${Math.max(r.top - box.top, 36)}px`;
    for (const [b, cmd] of [[fmt.children[0], 'underline'], [fmt.children[1], 'bold'], [fmt.children[2], 'italic']]) {
      b.classList.toggle('active', document.queryCommandState(cmd));
    }
  }
  document.addEventListener('selectionchange', place);

  function underlineSelection() {
    const sel = document.getSelection();
    if (sel.rangeCount && !sel.isCollapsed && sheet.contains(sel.anchorNode)) { document.execCommand('underline'); save(); }
  }

  function load() {
    const c = ctx.config;
    const p = PAPERS[c.paper] || PAPERS.glass;
    paper.classList.toggle('on', !!p.bg);
    note.style.setProperty('--paper', p.bg || 'transparent');
    if (p.ink) note.style.setProperty('--ink', p.ink); else note.style.removeProperty('--ink');
    const fonts = ctx.registry.FONTS;
    const bodyFont = (fonts[c.font] || fonts.noteworthy).stack;
    note.style.setProperty('--note-font', bodyFont);
    note.style.setProperty('--title-font', fonts[c.titleFont]?.stack || bodyFont);
    note.style.setProperty('--note-size', `${c.size}px`);
    note.classList.toggle('lined', !!c.lined);
    title.classList.toggle('hidden', !c.showTitle);
    tape.style.display = c.tape ? '' : 'none';
    // Older notes kept plain text; show it as the body until it's edited.
    const html = c.body != null && c.body !== '' ? c.body : escape(c.text || '');
    if (document.activeElement !== body && body.innerHTML !== html) body.innerHTML = clean(html);
    if (document.activeElement !== title && title.innerHTML !== (c.title || '')) title.innerHTML = clean(c.title || '');
  }
  load();
  return {
    update: load,
    menu: () => [{ label: 'Underline Selection', action: 'underline' }],
    menuAction: (a) => a === 'underline' && underlineSelection(),
  };
}
