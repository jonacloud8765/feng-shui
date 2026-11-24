import { h } from '../dom.js';

// Music Player: a 3D music player (records/player.html) in a frame that fills
// the widget. The player runs on its own page because it embeds SoundCloud's
// player; this side fetches the artists' tracks through the main process and
// passes them in.

const css = `
.records { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; background: #0b0a0d; }
.records iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.records .grip {
  position: absolute; top: 4px; left: 50%; width: 54px; height: 14px; margin-left: -27px; z-index: 5;
  display: grid; place-items: center; border-radius: 7px; opacity: 0; transition: opacity 0.2s var(--ease), background-color 0.2s;
}
.records .grip::before { content: ''; width: 30px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.55); box-shadow: 0 1px 3px rgba(0,0,0,0.35); }
.records:hover .grip, .records .grip:hover { opacity: 1; }
.records .grip:hover { background: rgba(255,255,255,0.12); }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  const frame = h('iframe', { title: 'Music Player', src: 'records/player.html', allow: 'autoplay; encrypted-media; fullscreen' });
  const grip = h('div.grip', { title: 'Drag to move · Right-click for options' });
  root.append(h('div.records', {}, frame, grip));

  let ready = false;
  let crates = null;
  const post = (msg) => { if (ready) frame.contentWindow?.postMessage(msg, '*'); };
  const settings = () => ({ autoplay: ctx.config.autoplay !== false });
  const key = () => [ctx.config.crate1, ctx.config.crate2, ctx.config.crate3].join('|');
  let loadedKey = '';

  async function load(force) {
    loadedKey = key();
    post({ type: 'loading' });
    const r = await ctx.api.records(force);
    crates = r.ok ? r.data : [null, null, null].map(() => ({ error: r.error }));
    post({ type: 'crates', crates });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || !e.data || typeof e.data !== 'object') return;
    const m = e.data;
    if (m.type === 'ready') {
      ready = true;
      post({ type: 'settings', ...settings() });
      if (crates) post({ type: 'crates', crates }); else load(false);
    } else if (m.type === 'settings') {
      ctx.api.openSettings(ctx.widget.id);
    } else if (m.type === 'open' && typeof m.url === 'string') {
      ctx.api.recordsOpen(m.url);
    }
  });

  return {
    update() {
      post({ type: 'settings', ...settings() });
      if (key() !== loadedKey) load(false);
    },
    menu: () => [{ label: 'Refresh Tracks', action: 'refresh' }, { label: 'Reload Player', action: 'reload' }],
    menuAction: (a) => {
      if (a === 'refresh') load(true);
      if (a === 'reload') { ready = false; frame.src = 'records/player.html'; }
    },
  };
}
