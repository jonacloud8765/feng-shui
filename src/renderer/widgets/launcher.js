import { h } from '../dom.js';

const css = `
.launcher { width: 100%; height: 100%; display: grid; place-content: center; overflow: hidden; }
.launcher .grid { display: grid; grid-template-columns: repeat(var(--cols), auto); gap: var(--gap); justify-content: var(--justify); }
.launcher .app {
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  background: none; padding: 0; border-radius: 12px;
  transition: transform 0.18s var(--ease), opacity 0.2s;
}
.launcher .app img { width: var(--icon); height: var(--icon); display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.22)); pointer-events: none; }
.launcher .app:hover { transform: translateY(-2px) scale(1.04); }
.launcher .app:active { transform: scale(0.93); }
.launcher .app.launching img { animation: pop 0.5s var(--ease); }
@keyframes pop { 40% { transform: scale(0.88); } }
.launcher .app .name { font-family: var(--info); font-size: calc(clamp(9px, var(--icon) * 0.22, 13px) * var(--scale)); max-width: calc(var(--icon) + var(--gap)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; }
.launcher .app.missing { opacity: 0.35; }
.launcher .app.missing::after { content: '?'; position: absolute; font: 600 12px var(--info); }
.launcher .app.dragging { opacity: 0.3; }
.launcher .app.over img { transform: translateX(4px); transition: transform 0.15s; }
.launcher .placeholder { width: var(--icon); height: var(--icon); border-radius: 22%; background: rgba(255,255,255,0.08); }
.launcher .msg { font-size: 12px; color: #ffb3a8; text-align: center; margin-top: 6px; min-height: 1em; }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const grid = h('div.grid');
  const msg = h('div.msg');
  const wrap = h('div.launcher', {}, grid, msg);
  root.append(wrap);

  let resolved = [];
  let dragFrom = -1;
  let token = 0;

  function style() {
    const c = ctx.config;
    wrap.style.setProperty('--cols', String(Math.max(1, Math.min(c.columns, c.apps.length || 1))));
    wrap.style.setProperty('--icon', `${c.iconSize}px`);
    wrap.style.setProperty('--gap', `${c.spacing}px`);
  }

  async function load() {
    style();
    const c = ctx.config;
    const mine = ++token;
    if (!c.apps.length) {
      grid.replaceChildren(h('button.pill', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Choose apps'));
      return;
    }
    // Show placeholders at once, then real icons as they resolve.
    if (!resolved.length) grid.replaceChildren(...c.apps.map(() => h('div.placeholder')));
    const list = await ctx.api.resolveApps(c.apps, Math.max(32, c.iconSize));
    if (mine !== token) return;
    resolved = list;
    paint();
  }

  function paint() {
    const c = ctx.config;
    grid.replaceChildren(...resolved.map((a, i) => {
      const btn = h(`button.app${a.missing ? '.missing' : ''}`, {
        title: a.missing ? `${a.name} can’t be found. It may have been moved or deleted.` : a.name,
        'aria-label': a.missing ? `${a.name}, not found` : `Open ${a.name}`,
        draggable: 'true',
      },
      a.icon ? h('img', { src: a.icon, alt: '' }) : h('div.placeholder'),
      c.labels ? h('span.name', {}, a.name) : null);
      btn.addEventListener('click', () => open(a, btn));
      btn.addEventListener('dragstart', (e) => {
        dragFrom = i;
        btn.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      btn.addEventListener('dragend', () => { btn.classList.remove('dragging'); dragFrom = -1; });
      btn.addEventListener('dragover', (e) => { if (dragFrom >= 0) { e.preventDefault(); btn.classList.add('over'); } });
      btn.addEventListener('dragleave', () => btn.classList.remove('over'));
      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.classList.remove('over');
        if (dragFrom < 0 || dragFrom === i) return;
        const apps = c.apps.slice();
        const [moved] = apps.splice(dragFrom, 1);
        apps.splice(i, 0, moved);
        const r = resolved.slice();
        const [mr] = r.splice(dragFrom, 1);
        r.splice(i, 0, mr);
        resolved = r;
        ctx.setConfig({ apps });
        paint();
      });
      return btn;
    }));
  }

  async function open(a, btn) {
    if (a.missing) {
      flash(`${a.name} can’t be found.`);
      return;
    }
    btn.classList.remove('launching');
    void btn.offsetWidth;
    btn.classList.add('launching');
    const err = await ctx.api.launch(a.path);
    if (err) flash(err);
  }

  let flashTimer;
  function flash(text) {
    msg.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (msg.textContent = ''), 3500);
  }

  load();
  return {
    update: () => { resolved = []; load(); },
    resume: load,
  };
}
