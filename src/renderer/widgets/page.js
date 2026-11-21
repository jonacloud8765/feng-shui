import { h } from '../dom.js';
import { fileUrl } from '../appearance.js';

// Custom Widget: shows a single HTML file in a frame that fills the widget.
// Clicks go to the page, so a small grip at the top moves the widget, and
// right-clicking the grip opens Morrow's widget menu.

const css = `
.page { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; }
.page iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: normal; }
.page .grip {
  position: absolute; top: 4px; left: 50%; width: 54px; height: 14px; margin-left: -27px; z-index: 5;
  display: grid; place-items: center; border-radius: 7px; opacity: 0; transition: opacity 0.2s var(--ease), background-color 0.2s;
}
.page .grip::before { content: ''; width: 30px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.55); box-shadow: 0 1px 3px rgba(0,0,0,0.35); }
.page:hover .grip, .page .grip:hover { opacity: 1; }
.page .grip:hover { background: rgba(255,255,255,0.12); }
.page .empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; font-family: var(--info); font-size: 13px; text-align: center; padding: 16px; }
.page .empty span { opacity: 0.65; }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  const frame = h('iframe', { title: 'Custom widget' });
  const grip = h('div.grip', { title: 'Drag to move · Right-click for options' });
  const empty = h('div.empty', {},
    h('span', {}, 'Show your own HTML widget here.'),
    h('button.pill', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Choose a file…'));
  root.append(h('div.page', {}, frame, grip, empty));

  function load() {
    const file = ctx.config.file;
    empty.style.display = file ? 'none' : '';
    frame.style.display = file ? '' : 'none';
    const src = file ? fileUrl(file) : '';
    if (frame.dataset.src !== src) {
      frame.dataset.src = src;
      if (src) frame.src = src; else frame.removeAttribute('src');
    }
  }
  load();
  return {
    update: load,
    resume: () => { if (ctx.config.file) frame.contentWindow?.dispatchEvent(new Event('focus')); },
    menu: () => [{ label: 'Reload Page', action: 'reload' }],
    menuAction: (a) => { if (a === 'reload' && ctx.config.file) frame.src = fileUrl(ctx.config.file); },
  };
}
