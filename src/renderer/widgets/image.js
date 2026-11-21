import { h } from '../dom.js';
import { fileUrl } from '../appearance.js';

const FILTERS = {
  none: 'none',
  mono: 'grayscale(1) contrast(1.05)',
  warm: 'sepia(0.25) saturate(1.15) hue-rotate(-8deg)',
  cool: 'saturate(0.9) hue-rotate(10deg) brightness(1.02)',
  fade: 'contrast(0.88) saturate(0.8) brightness(1.06) sepia(0.12)',
};

const css = `
.photo { position: absolute; inset: 0; border-radius: inherit; }
.photo .frame { position: absolute; inset: var(--inset); border-radius: calc(var(--radius) - var(--inset) * 0.6); overflow: hidden; transition: inset 0.3s var(--ease); }
.photo img { width: 100%; height: 100%; display: block; object-fit: var(--fit); transition: filter 0.4s var(--ease), opacity 0.5s var(--ease); pointer-events: none; -webkit-user-drag: none; }
.photo img.loading { opacity: 0; }
.photo .caption {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 28px 14px 11px;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,0.45));
  font-family: var(--display); font-style: italic; font-size: calc(clamp(12px, 7cqmin, 20px) * var(--scale));
  color: #fbf7ef; text-align: var(--align); text-shadow: 0 1px 6px rgba(0,0,0,0.35);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
}
.photo .empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; font-family: var(--info); font-size: 13px; text-align: center; padding: 16px; }
.photo .empty span { opacity: 0.6; }
.photo .drop { position: absolute; inset: 6px; border-radius: calc(var(--radius) - 4px); border: 1.5px dashed color-mix(in srgb, var(--accent) 80%, transparent); background: color-mix(in srgb, var(--accent) 12%, transparent); display: none; place-items: center; font-family: var(--info); font-size: 13px; pointer-events: none; }
.photo.dragover .drop { display: grid; }
.photo .err { position: absolute; left: 10px; right: 10px; bottom: 10px; font-family: var(--info); font-size: 12px; color: #ffd2cb; text-align: center; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }

/* ---- Frames. Everything except Glass draws its own frame and shadow, with
   the desktop showing around it. ---- */
:root.self-drawn .glass { overflow: visible; border-radius: 0; }
:root.self-drawn .glass > .layer { display: none; }
.photo.framed { inset: 8px 10px 14px 10px; }
.photo.f-polaroid { background: linear-gradient(180deg, #fdfcf8, #f3f1ea); border-radius: 2px; padding: 12px 12px 52px;
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.2), 0 10px 22px -8px rgba(0,0,0,0.45); }
.photo.f-polaroid .frame { position: relative; inset: auto; width: 100%; height: 100%; border-radius: 1px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12); }
.photo.f-polaroid .caption { background: none; color: #2b2a28; text-shadow: none; padding: 0 14px; bottom: 13px; font-family: "Nothing You Could Do", "Bradley Hand", cursive; font-style: normal; font-size: calc(clamp(13px, 6cqmin, 22px) * var(--scale)); text-align: center; }
.photo.f-gallery { background: linear-gradient(135deg, #2a2420, #120f0d 60%, #241e1a); padding: 14px; border-radius: 2px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 3px rgba(0,0,0,0.3), 0 14px 26px -10px rgba(0,0,0,0.55); }
.photo.f-gallery .mat { position: relative; width: 100%; height: 100%; background: #f6f2ea; padding: 7%; box-sizing: border-box; box-shadow: inset 0 2px 6px rgba(0,0,0,0.35); }
.photo.f-gallery img { object-fit: cover; }
.photo.f-gallery .frame { position: relative; inset: auto; width: 100%; height: 100%; border-radius: 0; box-shadow: 0 0 0 1px rgba(0,0,0,0.25), inset 0 1px 3px rgba(0,0,0,0.3); }
.photo.f-gallery .caption { background: none; color: #ece6da; text-shadow: none; padding: 0; bottom: -1px; font-size: 10px; font-family: var(--info); font-style: normal; letter-spacing: 0.18em; text-transform: uppercase; text-align: center; opacity: 0.8; }
.photo.f-poster { border-radius: 3px; overflow: hidden; background: #0c0d10;
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.4), 0 2px 3px rgba(0,0,0,0.25), 0 14px 26px -10px rgba(0,0,0,0.55); }
.photo.f-poster .frame { inset: 0; border-radius: 0; }
.photo.f-poster .frame::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.25), transparent 22%, transparent 48%, rgba(5,6,8,0.92) 86%); }
.photo.f-poster .tagline { position: absolute; top: 7%; left: 0; right: 0; text-align: center; font: 500 calc(clamp(7px, 2.6cqmin, 11px) * var(--scale)) "Avenir Next", system-ui; letter-spacing: 0.42em; text-transform: uppercase; color: rgba(255,255,255,0.75); }
.photo.f-poster .caption { background: none; padding: 0 8%; bottom: 15%; text-align: center; font-family: Futura, "Avenir Next", system-ui; font-style: normal; font-weight: 700;
  font-size: calc(clamp(16px, 11cqmin, 52px) * var(--scale)); letter-spacing: 0.06em; text-transform: uppercase; color: #f4ede1; text-shadow: 0 2px 12px rgba(0,0,0,0.6); white-space: normal; line-height: 1; }
.photo.f-poster .credits { position: absolute; left: 8%; right: 8%; bottom: 5%; text-align: center; font: 500 calc(clamp(5px, 1.7cqmin, 8px) * var(--scale)) "Avenir Next Condensed", "Avenir Next", system-ui; letter-spacing: 0.12em; line-height: 1.5; text-transform: uppercase; color: rgba(244,237,225,0.55); }
.photo.f-bare { border-radius: 14px; overflow: hidden; box-shadow: 0 10px 24px -10px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.2); }
.photo.f-bare .frame { inset: 0; border-radius: inherit; }
.photo .tagline, .photo .credits { display: none; }
.photo.f-poster .tagline, .photo.f-poster .credits { display: block; }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  const img = h('img', { alt: '' });
  const frame = h('div.frame', {}, img);
  const mat = h('div.mat');
  const tagline = h('div.tagline', {}, 'A Morrow Picture');
  const credits = h('div.credits', {}, 'Directed by you · Starring the people in this photo · Music by the moment · Coming soon to your desktop');
  const caption = h('div.caption');
  const empty = h('div.empty', {},
    h('span', {}, 'Drop a photo here'),
    h('button.pill', { onclick: () => choose() }, 'Choose photo…'));
  const drop = h('div.drop', {}, 'Drop to use this photo');
  const err = h('div.err');
  const wrap = h('div.photo', {}, frame, tagline, caption, credits, empty, drop, err);
  root.append(wrap);

  async function choose() {
    const r = await ctx.api.pickPhoto();
    if (r.ok) use(r.data);
    else if (!r.canceled) showError(r.error);
  }

  function use({ file, name }) {
    ctx.setConfig({ file, name, aspect: null });
    load();
  }

  let errTimer;
  function showError(text) {
    err.textContent = text;
    clearTimeout(errTimer);
    errTimer = setTimeout(() => (err.textContent = ''), 4000);
  }

  // Drag a photo from Finder or Photos onto the widget.
  let depth = 0;
  wrap.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { depth++; wrap.classList.add('dragover'); } });
  wrap.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; wrap.classList.remove('dragover'); } });
  wrap.addEventListener('dragover', (e) => e.preventDefault());
  wrap.addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0;
    wrap.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const p = ctx.api.pathForFile(file);
    if (!p) return showError('That item isn’t a file on this Mac.');
    const r = await ctx.api.importImage(p);
    if (r.ok) use(r.data); else showError(r.error);
  });

  img.addEventListener('load', () => {
    img.classList.remove('loading');
    const aspect = +(img.naturalWidth / img.naturalHeight).toFixed(4);
    if (aspect && ctx.config.aspect !== aspect) ctx.setConfig({ aspect });
  });
  img.addEventListener('error', () => {
    if (ctx.config.file) showError('This photo is no longer available. Choose it again.');
    empty.style.display = '';
  });

  function load() {
    const c = ctx.config;
    const f = ['polaroid', 'gallery', 'poster', 'bare'].includes(c.frame) ? c.frame : 'glass';
    wrap.className = `photo f-${f}${f === 'glass' ? '' : ' framed'}`;
    document.documentElement.classList.toggle('self-drawn', f !== 'glass');
    // The gallery frame puts the photo on a mat.
    if (f === 'gallery' && frame.parentNode !== mat) { mat.append(frame); wrap.prepend(mat); }
    if (f !== 'gallery' && frame.parentNode === mat) { wrap.prepend(frame); mat.remove(); }
    wrap.style.setProperty('--fit', c.fit === 'contain' ? 'contain' : 'cover');
    wrap.style.setProperty('--inset', `${c.inset || 0}px`);
    img.style.filter = FILTERS[c.filter] || 'none';
    caption.textContent = c.caption || '';
    caption.style.display = c.caption ? '' : 'none';
    empty.style.display = c.file ? 'none' : '';
    frame.style.display = c.file ? '' : 'none';
    const src = c.file ? fileUrl(c.file) : '';
    if (src && img.dataset.src !== src) {
      img.dataset.src = src;
      img.classList.add('loading');
      img.src = src;
    }
  }
  load();

  return {
    update: load,
    menu: () => [{ label: 'Choose Photo…', action: 'choose' }],
    menuAction: (a) => a === 'choose' && choose(),
  };
}
