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
.note textarea {
  position: relative; flex: 1; margin: calc(var(--pad) + 6px) var(--pad) var(--pad);
  border: 0; outline: none; resize: none; background: transparent;
  color: var(--ink, var(--text));
  font-family: var(--note-font); font-size: calc(var(--note-size) * var(--scale)); line-height: 1.45;
  text-align: var(--align);
  user-select: text; cursor: text; padding: 0;
  caret-color: var(--accent);
}
.note textarea::placeholder { color: var(--ink, var(--text)); opacity: 0.35; }
.note textarea::-webkit-scrollbar { width: 0; }
.note.lined textarea {
  background-image: repeating-linear-gradient(180deg, transparent 0, transparent calc(1.45em - 1px), color-mix(in srgb, var(--ink, var(--text)) 18%, transparent) calc(1.45em - 1px), color-mix(in srgb, var(--ink, var(--text)) 18%, transparent) 1.45em);
  background-attachment: local;
  background-position: 0 -0.1em;
}
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const paper = h('div.paper');
  const tape = h('div.tape');
  const area = h('textarea', { placeholder: 'Write something…', spellcheck: 'true', 'aria-label': 'Note' });
  const note = h('div.note', {}, paper, tape, area);
  // The note fills the whole glass, ignoring the widget padding wrapper.
  root.style.padding = '0';
  root.append(note);

  let timer;
  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => ctx.setConfig({ text: area.value }), 400);
  });
  area.addEventListener('blur', () => {
    clearTimeout(timer);
    if (area.value !== ctx.config.text) ctx.setConfig({ text: area.value });
  });

  function load() {
    const c = ctx.config;
    const p = PAPERS[c.paper] || PAPERS.glass;
    paper.classList.toggle('on', !!p.bg);
    note.style.setProperty('--paper', p.bg || 'transparent');
    if (p.ink) note.style.setProperty('--ink', p.ink); else note.style.removeProperty('--ink');
    const fonts = ctx.registry.FONTS;
    note.style.setProperty('--note-font', (fonts[c.font] || fonts.noteworthy).stack);
    note.style.setProperty('--note-size', `${c.size}px`);
    note.classList.toggle('lined', !!c.lined);
    tape.style.display = c.tape ? '' : 'none';
    if (document.activeElement !== area && area.value !== c.text) area.value = c.text;
  }
  load();
  return { update: load };
}
