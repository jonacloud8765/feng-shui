import { h } from '../dom.js';

// Library: three floating sculptures made of your books (library/library.html)
// in a frame that fills the widget. The 3D room runs on its own page, like the
// Record Room; this side brings it the catalogue from the main process,
// passes on imports and favorites, and forwards the room's menu.

const css = `
.library { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; background: #0d0c0b; }
.library iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.library .grip {
  position: absolute; top: 4px; left: 50%; width: 54px; height: 14px; margin-left: -27px; z-index: 5;
  display: grid; place-items: center; border-radius: 7px; opacity: 0; transition: opacity 0.2s var(--ease), background-color 0.2s;
}
.library .grip::before { content: ''; width: 30px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.5); box-shadow: 0 1px 3px rgba(0,0,0,0.35); }
.library:hover .grip, .library .grip:hover { opacity: 1; }
.library .grip:hover { background: rgba(255,255,255,0.12); }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  const frame = h('iframe', { title: 'Library', src: 'library/library.html' });
  const grip = h('div.grip', { title: 'Drag to move · Right-click for options' });
  root.append(h('div.library', {}, frame, grip));

  let ready = false;
  const post = (msg) => { if (ready) frame.contentWindow?.postMessage(msg, '*'); };
  const settings = () => ({ type: 'settings', motion: ctx.config.motion || 'gentle', goodreads: !!ctx.config.goodreads, wishlist: ctx.config.wishlist || '' });

  async function load() {
    const r = await ctx.api.library('load');
    post(r.ok ? { type: 'data', data: r.data } : { type: 'error', error: r.error });
  }
  const off = ctx.api.onLibrary((data) => post({ type: 'data', data }));

  const menu = () => [
    { label: 'Import Goodreads Export…', action: 'import' },
    { label: 'Refresh from Goodreads Profile', action: 'sync' },
    { label: 'Look for Missing Covers Again', action: 'retry' },
    { type: 'separator' },
    { label: 'Reload Library', action: 'reload' },
  ];

  async function act(a) {
    if (a === 'import') post({ type: 'imported', result: await ctx.api.library('import-file') });
    if (a === 'sync') post({ type: 'synced', result: await ctx.api.library('sync') });
    if (a === 'retry') ctx.api.library('retry');
    if (a === 'reload') { ready = false; frame.src = 'library/library.html'; }
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== frame.contentWindow || !e.data || typeof e.data !== 'object') return;
    const m = e.data;
    if (m.type === 'ready') {
      ready = true;
      post(settings());
      load();
    } else if (m.type === 'favorite' && typeof m.id === 'string') {
      const r = await ctx.api.library('favorite', m.id, !!m.on);
      post({ type: 'favorited', id: m.id, favorite: r.ok ? r.favorite : !m.on });
    } else if (m.type === 'import-text' && typeof m.text === 'string') {
      post({ type: 'imported', result: await ctx.api.library('import-text', String(m.name || ''), m.text) });
    } else if (m.type === 'import-file') {
      act('import');
    } else if (m.type === 'open' && typeof m.url === 'string') {
      ctx.api.library('open', m.url);
    } else if (m.type === 'menu') {
      ctx.api.contextMenu(menu());
    } else if (m.type === 'settings') {
      ctx.api.openSettings(ctx.widget.id);
    }
  });

  return {
    update() { post(settings()); },
    menu,
    menuAction: act,
    destroy() { off?.(); },
  };
}
