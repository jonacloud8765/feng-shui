import { h } from '../dom.js';
import { fileUrl } from '../appearance.js';

// Films: what's already in the watch folder first (click to play in VLC),
// then the rest of a public Letterboxd watchlist (click to open its page).

const css = `
.films { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: var(--info); --poster: 96px; }
.films header { display: flex; align-items: center; gap: 10px; padding: var(--pad) var(--pad) 8px; flex: none; }
.films header .t { flex: 1; min-width: 0; }
.films header h1 { margin: 0; font: var(--weight) calc(20px * var(--scale)) / 1.1 var(--display); letter-spacing: 0.01em; }
.films header .sub { font-size: calc(11px * var(--scale)); opacity: 0.6; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.films .icon-btn svg { width: 1.05em; height: 1.05em; }
.films .icon-btn.spin svg { animation: films-spin 0.9s linear infinite; }
@keyframes films-spin { to { transform: rotate(360deg); } }
.films .scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 0 var(--pad) var(--pad); scrollbar-width: thin; }
.films .scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.films .scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 3px; }
.films h2 { font-size: calc(10.5px * var(--scale)); font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; opacity: 0.65; margin: 12px 0 8px; display: flex; gap: 6px; }
.films h2 .n { opacity: 0.6; font-weight: 500; }
.films h2:first-child { margin-top: 2px; }
.films .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--poster), 1fr)); gap: 12px 10px; }
.films.shelf .items { display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden; padding-bottom: 6px; }
.films.shelf .items .item { flex: 0 0 var(--poster); }
.films.list .items { display: flex; flex-direction: column; gap: 4px; }
.films .item { background: none; padding: 0; text-align: left; display: flex; flex-direction: column; gap: 5px; min-width: 0; border-radius: 8px; transition: transform 0.18s var(--ease); }
.films .item:hover { transform: translateY(-2px); }
.films .item:active { transform: scale(0.97); }
.films .art { position: relative; width: 100%; aspect-ratio: 2 / 3; border-radius: 7px; overflow: hidden; background: rgba(255,255,255,0.07); box-shadow: 0 4px 14px rgba(0,0,0,0.28), inset 0 0 0 0.5px rgba(255,255,255,0.12); }
.films .art img { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity 0.4s var(--ease); pointer-events: none; -webkit-user-drag: none; }
.films .art img.ready { opacity: 1; }
.films .art .card { position: absolute; inset: 0; display: flex; align-items: flex-end; padding: 8px; font: var(--weight) calc(12px * var(--scale)) / 1.15 var(--display); background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 35%, transparent), rgba(0,0,0,0.25)); }
.films .art .badge { z-index: 2; position: absolute; top: 5px; right: 5px; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,0.55); backdrop-filter: blur(6px); color: #fff; opacity: 0; transition: opacity 0.2s; }
.films .art .badge svg { width: 9px; height: 9px; margin-left: 1px; }
.films .local .item:hover .badge { opacity: 1; }
.films .name { font-size: calc(11.5px * var(--scale)); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.films .meta { font-size: calc(10px * var(--scale)); opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: -3px; }
.films.list .item { flex-direction: row; align-items: center; gap: 10px; padding: 4px; }
.films.list .item:hover { transform: none; background: rgba(255,255,255,0.07); }
.films.list .art { width: 34px; flex: none; border-radius: 4px; }
.films.list .art .card { font-size: 7px; padding: 3px; }
.films.list .art .badge { display: none; }
.films.list .text { min-width: 0; flex: 1; }
.films.list .meta { margin-top: 1px; }
.films .note { font-size: calc(12px * var(--scale)); opacity: 0.7; padding: 4px 0 8px; line-height: 1.4; }
.films .note.error { color: #ffc4ba; opacity: 1; }
.films .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; padding: var(--pad); font-size: 13px; }
.films .empty span { opacity: 0.65; }
.films .flash { position: absolute; left: 12px; right: 12px; bottom: 12px; padding: 8px 12px; border-radius: 10px; background: rgba(20,12,10,0.78); color: #ffd7cf; font-size: 12px; text-align: center; opacity: 0; transform: translateY(6px); transition: opacity 0.25s, transform 0.25s var(--ease); pointer-events: none; }
.films .flash.show { opacity: 1; transform: none; }
`;

const ICON_REFRESH = '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.6-3.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13.4 2.2v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 16 16"><path d="M4.5 2.8v10.4c0 .5.6.8 1 .5l8-5.2c.4-.2.4-.8 0-1l-8-5.2c-.4-.3-1 0-1 .5z" fill="currentColor"/></svg>';

const posterCache = new Map(); // film slug -> Promise<local path | null>

function ago(t) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
}

function size(bytes) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';

  const refreshBtn = h('button.icon-btn', { title: 'Refresh', 'aria-label': 'Refresh', html: ICON_REFRESH, onclick: () => load(true) });
  const sub = h('div.sub');
  const header = h('header', {}, h('div.t', {}, h('h1', {}, 'Films'), sub), refreshBtn);
  const scroll = h('div.scroll', { 'data-interactive': '' });
  const flashEl = h('div.flash', { role: 'status' });
  const wrap = h('div.films', {}, header, scroll, flashEl);
  root.append(wrap);

  let data = null;
  let token = 0;
  let observer = null;

  function style() {
    const c = ctx.config;
    wrap.classList.toggle('shelf', c.layout === 'shelf');
    wrap.classList.toggle('list', c.layout === 'list');
    wrap.style.setProperty('--poster', `${c.posterSize || 96}px`);
  }

  async function load(force = false) {
    style();
    const c = ctx.config;
    const mine = ++token;
    refreshBtn.classList.add('spin');
    refreshBtn.disabled = true;
    if (!data) sub.textContent = 'Looking for films and reading the watchlist…';
    const r = await ctx.api.films({ folder: c.folder, user: c.username, minSizeMB: c.minSizeMB, force });
    if (mine !== token) return;
    refreshBtn.classList.remove('spin');
    refreshBtn.disabled = false;
    if (!r.ok) {
      data = null;
      sub.textContent = '';
      scroll.replaceChildren(h('div.note.error', {}, r.error));
      return;
    }
    data = r.data;
    if (force && data.watchlistError) flash(`Couldn’t refresh the watchlist. ${data.watchlistError}`);
    paint();
  }

  function paint() {
    if (!data) return;
    const c = ctx.config;
    observer?.disconnect();
    observer = new IntersectionObserver(onVisible, { root: scroll, rootMargin: '300px' });

    const rest = data.watchlist.filter((f) => !f.downloaded);
    const bits = [`${data.local.length} downloaded`];
    if (data.user) bits.push(`${data.watchlist.length} on watchlist`);
    if (data.fetchedAt) bits.push(`updated ${ago(data.fetchedAt)}`);
    sub.textContent = bits.join(' · ');

    const out = [];
    if (data.folderError) out.push(h('div.note.error', {}, data.folderError));
    out.push(h('h2', {}, 'Already downloaded', h('span.n', {}, String(data.local.length))));
    if (data.local.length) out.push(h('div.items.local', {}, ...data.local.map(localItem)));
    else if (!data.folderError) out.push(h('div.note', {}, `No videos found in ${data.folder.split('/').pop() || data.folder}.`));

    if (c.showWatchlist) {
      out.push(h('h2', {}, 'On your watchlist', data.user ? h('span.n', {}, String(rest.length)) : null));
      if (!data.user) {
        out.push(h('div.note', {}, 'Add your Letterboxd username to see your watchlist. ',
          h('button.pill', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Add username')));
      } else if (data.watchlistError) {
        out.push(h('div.note.error', {}, data.watchlist.length
          ? `Showing the copy from ${ago(data.fetchedAt)}. ${data.watchlistError}`
          : `Couldn’t load @${data.user}’s watchlist. ${data.watchlistError}`));
      }
      if (rest.length) out.push(h('div.items.remote', {}, ...rest.map(remoteItem)));
      else if (data.user && !data.watchlistError) out.push(h('div.note', {}, data.watchlist.length ? 'You have everything on your watchlist.' : 'The watchlist is empty.'));
    }
    const top = scroll.scrollTop;
    scroll.replaceChildren(...out);
    scroll.scrollTop = top;
  }

  function art(title, { local, remote }) {
    const img = h('img', { alt: '', loading: 'lazy' });
    img.addEventListener('load', () => img.classList.add('ready'));
    img.addEventListener('error', () => img.remove());
    const box = h('div.art', {}, h('div.card', {}, title), img);
    if (local) img.src = fileUrl(local);
    else if (remote) { box.film = remote; observer.observe(box); }
    else img.remove();
    return box;
  }

  function onVisible(entries) {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      const { slug, poster, title, year } = e.target.film;
      const key = slug || `${title}|${year}`;
      const img = e.target.querySelector('img');
      if (!posterCache.has(key)) posterCache.set(key, ctx.api.filmPoster(slug ? { slug, poster } : { title, year }));
      posterCache.get(key).then((p) => { if (p && img) img.src = fileUrl(p); else img?.remove(); });
    }
  }

  function localItem(item) {
    const film = item.film;
    const label = item.label || item.title;
    const meta = item.kind === 'show'
      ? `${item.files.length} episode${item.files.length === 1 ? '' : 's'} · ${size(item.size)}`
      : [item.year, film ? 'on watchlist' : null, size(item.size)].filter(Boolean).join(' · ');
    const box = art(label, { local: item.art, remote: film || (item.kind === 'film' && item.year ? { title: item.title, year: item.year } : null) });
    box.append(h('div.badge', { html: ICON_PLAY }));
    const btn = h('button.item', { title: `Play ${label} in VLC`, 'aria-label': `Play ${label} in VLC` },
      box, h('div.text', {}, h('div.name', {}, label), h('div.meta', {}, meta)));
    btn.addEventListener('click', async () => {
      const err = await ctx.api.playFilm(item.files);
      if (err) flash(err);
    });
    return btn;
  }

  function remoteItem(film) {
    const btn = h('button.item', { title: `${film.title}${film.year ? ` (${film.year})` : ''} on Letterboxd`, 'aria-label': `Open ${film.title} on Letterboxd` },
      art(film.title, { remote: film }),
      h('div.text', {}, h('div.name', {}, film.title), h('div.meta', {}, film.year ? String(film.year) : '')));
    btn.addEventListener('click', () => ctx.api.openFilmPage(film.link));
    return btn;
  }

  let flashTimer;
  function flash(text) {
    flashEl.textContent = text;
    flashEl.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove('show'), 4500);
  }

  // Look for new downloads every 10 minutes; the watchlist itself is cached.
  setInterval(() => load(false), 10 * 60 * 1000);

  let prev = JSON.stringify(ctx.config);
  let debounce;
  load();
  return {
    update: (w) => {
      const c = w.config;
      const p = JSON.parse(prev);
      prev = JSON.stringify(c);
      style();
      if (p.folder !== c.folder || p.username !== c.username || p.minSizeMB !== c.minSizeMB) {
        // The username field saves on each keystroke; wait until typing stops.
        clearTimeout(debounce);
        debounce = setTimeout(() => load(false), 800);
      } else paint();
    },
    resume: () => load(false),
    menu: () => [{ label: 'Refresh Films', action: 'refresh' }],
    menuAction: (a) => a === 'refresh' && load(true),
  };
}
