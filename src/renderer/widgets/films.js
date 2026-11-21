import { h } from '../dom.js';
import { fileUrl } from '../appearance.js';

// Films: what's already in the watch folder first (click to play in VLC),
// then the rest of a public Letterboxd watchlist (click to open its page).

const css = `
.films { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: var(--info); --poster: 96px; }
.films header { display: flex; align-items: center; gap: 10px; padding: var(--pad) var(--pad) 8px; flex: none; }
.films header .t { flex: 1; min-width: 0; text-align: left; }
.films header .title { font: var(--weight) calc(22px * var(--scale)) / 1.1 var(--display); letter-spacing: 0.01em; margin-bottom: 4px; }
.films header .sub { font-size: calc(11px * var(--scale)); opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
.films h2 .link { background: none; padding: 0; font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px; border-bottom: 1px solid transparent; }
.films h2 .link:hover { border-bottom-color: currentColor; }
.films h2 .link svg { width: 9px; height: 9px; opacity: 0.8; }
.films .split { display: flex; gap: 14px; align-items: stretch; }
.films .split .col { min-width: calc(var(--poster) + 4px); display: flex; flex-direction: column; gap: 6px; }
.films .split .col h3 { margin: 0; font-size: calc(10px * var(--scale)); font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.5; }
.films .split .divider { flex: none; width: 1px; background: linear-gradient(180deg, transparent, rgba(255,255,255,0.28) 12%, rgba(255,255,255,0.28) 88%, transparent); }
.films.list .split .col { min-width: 0; flex: 1 1 0 !important; }
.films .filters { display: flex; flex-wrap: wrap; gap: 6px; margin: -2px 0 10px; }
.films .filters select, .films .filters input {
  font: 500 calc(11px * var(--scale)) var(--info); color: inherit; background: rgba(255,255,255,0.09);
  border: 0; border-radius: 999px; padding: 4px 10px; outline: none; min-width: 0;
  box-shadow: inset 0 0 0 0.5px rgba(255,255,255,0.14);
}
.films .filters select { appearance: none; padding-right: 20px; background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%); background-position: calc(100% - 11px) 52%, calc(100% - 7px) 52%; background-size: 4px 4px; background-repeat: no-repeat; }
.films .filters select.on { background-color: color-mix(in srgb, var(--accent) 32%, transparent); }
.films .filters input { flex: 1 1 90px; }
.films .filters input::placeholder { color: inherit; opacity: 0.5; }
.films .filters option { color: #111; }
/* Shows: each show's seasons together, at half the movie poster size. */
.films .shows { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px 22px; }
.films .show { flex: 0 1 auto; min-width: calc(var(--poster) * 1.2); max-width: 100%; }
.films .show .items.seasons { display: flex; flex-wrap: wrap; }
.films .show .items.seasons .item { width: calc(var(--poster) / 2); }
.films .show-head { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; min-width: 0; }
.films .show-t { flex: 1; min-width: 0; text-align: left; }
.films .show-head .meta { margin-top: 1px; }
.films .playall { flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; padding: 0; background: rgba(255,255,255,0.1); color: inherit; opacity: 0.7; transition: opacity 0.2s, background-color 0.2s; }
.films .playall:hover { opacity: 1; background: rgba(255,255,255,0.18); }
.films .playall svg { width: 9px; height: 9px; margin-left: 1px; }
.films .items.seasons { grid-template-columns: repeat(auto-fill, minmax(calc(var(--poster) / 2), calc(var(--poster) / 2))); gap: 8px 7px; }
.films.shelf .items.seasons .item { flex: 0 0 calc(var(--poster) / 2); }
.films .seasons .art { border-radius: 4px; }
.films .seasons .art .card { font-size: calc(10px * var(--scale)); padding: 4px; }
.films .seasons .art .badge { width: 14px; height: 14px; top: 3px; right: 3px; }
.films .seasons .art .badge svg { width: 7px; height: 7px; }
.films .seasons .name { font-size: calc(9px * var(--scale)); letter-spacing: -0.01em; }
.films .seasons .meta { font-size: calc(9px * var(--scale)); }
.films.list .items.seasons { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.films.list .seasons .art { width: 22px; }
.films .progress { font-size: calc(10.5px * var(--scale)); opacity: 0.6; margin: -4px 0 8px; text-align: left; line-height: 1.4; }
`;

const ICON_LINK = '<svg viewBox="0 0 16 16"><path d="M6 3h7v7M13 3 4 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const DECADES = ['upcoming', ...Array.from({ length: 16 }, (_, i) => `${2020 - i * 10}s`)];
const GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'TV Movie', 'War', 'Western'];
const SORTS = {
  added: 'When added (newest)',
  'added-earliest': 'When added (earliest)',
  name: 'Film name',
  popular: 'Popularity',
  shuffle: 'Shuffle',
  release: 'Release date (newest)',
  'release-earliest': 'Release date (earliest)',
  rating: 'Average rating (highest)',
  'rating-lowest': 'Average rating (lowest)',
  shortest: 'Film length (shortest)',
  longest: 'Film length (longest)',
};
// Sorts and filters that need each film's page read first.
const NEEDS_DETAILS = new Set(['popular', 'rating', 'rating-lowest', 'shortest', 'longest']);

const ICON_REFRESH = '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.6-3.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13.4 2.2v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 16 16"><path d="M4.5 2.8v10.4c0 .5.6.8 1 .5l8-5.2c.4-.2.4-.8 0-1l-8-5.2c-.4-.3-1 0-1 .5z" fill="currentColor"/></svg>';

// Case- and accent-insensitive text for search: "Amélie" matches "amelie".
const fold = (t) => String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

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
  const titleEl = h('div.title');
  const header = h('header', {}, h('div.t', {}, titleEl, sub), refreshBtn);
  const scroll = h('div.scroll', { 'data-interactive': '' });
  const flashEl = h('div.flash', { role: 'status' });
  const wrap = h('div.films', {}, header, scroll, flashEl);
  root.append(wrap);

  let data = null;
  let token = 0;
  let observer = null;
  let details = {};
  let detailsInfo = null;
  let detailsTimer = null;
  let search = '';
  let shuffleSeed = Math.random();
  let watchlistBox = null;
  let lastList = null;

  function style() {
    const c = ctx.config;
    titleEl.textContent = c.title || '';
    titleEl.style.display = c.title ? '' : 'none';
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
    if (force) shuffleSeed = Math.random();
    if (force && data.watchlistError) flash(`Couldn’t refresh the watchlist. ${data.watchlistError}`);
    paint();
    pollDetails();
  }

  // Genres, ratings and lengths arrive in the background, a film at a time.
  async function pollDetails() {
    clearTimeout(detailsTimer);
    if (!data || !data.watchlist.length || !ctx.config.showWatchlist) return;
    const info = await ctx.api.filmDetails(data.watchlist.map((f) => f.slug));
    const grew = Object.keys(info.details).length !== Object.keys(details).length;
    details = info.details;
    detailsInfo = info;
    if (grew && needsDetails()) paintWatchlist();
    else updateProgress();
    if (info.done < info.total) detailsTimer = setTimeout(pollDetails, 15000);
  }

  const needsDetails = () => !!ctx.config.wlGenre || NEEDS_DETAILS.has(ctx.config.wlSort) || !!search.trim();

  function paint() {
    if (!data) return;
    const c = ctx.config;
    observer?.disconnect();
    observer = new IntersectionObserver(onVisible, { root: scroll, rootMargin: '300px' });

    const rest = data.watchlist.filter((f) => !f.downloaded);
    const bits = c.showDownloads !== false ? [`${data.local.length} downloaded`] : [];
    if (data.user) bits.push(`${data.watchlist.length} on watchlist`);
    if (data.fetchedAt) bits.push(`updated ${ago(data.fetchedAt)}`);
    sub.textContent = bits.join(' · ');

    const out = [];
    if (c.showDownloads !== false) {
      if (data.folderError) out.push(h('div.note.error', {}, data.folderError));
      // A panel titled by its owner and showing only downloads needs no second heading.
      if (!(c.title && !c.showWatchlist)) out.push(h('h2', {}, 'Already downloaded', h('span.n', {}, String(data.local.length))));
      if (data.local.length) out.push(downloads());
      else if (!data.folderError) out.push(h('div.note', {}, `No videos found in ${data.folder.split('/').pop() || data.folder}.`));
    }

    watchlistBox = null;
    if (c.showWatchlist) {
      const title = data.user
        ? h('button.link', { title: `Open @${data.user}’s watchlist in Chrome`, onclick: () => ctx.api.openWatchlist(data.user) }, 'On your watchlist', h('span', { html: ICON_LINK }))
        : 'On your watchlist';
      out.push(h('h2', {}, title, data.user ? h('span.n', {}, String(rest.length)) : null));
      if (!data.user) {
        out.push(h('div.note', {}, 'Add your Letterboxd username to see your watchlist. ',
          h('button.pill', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Add username')));
      } else {
        if (data.watchlistError) {
          out.push(h('div.note.error', {}, data.watchlist.length
            ? `Showing the copy from ${ago(data.fetchedAt)}. ${data.watchlistError}`
            : `Couldn’t load @${data.user}’s watchlist. ${data.watchlistError}`));
        }
        if (rest.length) {
          out.push(filters());
          watchlistBox = h('div');
          out.push(watchlistBox);
        } else if (!data.watchlistError) out.push(h('div.note', {}, data.watchlist.length ? 'You have everything on your watchlist.' : 'The watchlist is empty.'));
      }
    }
    const top = scroll.scrollTop;
    scroll.replaceChildren(...out);
    if (watchlistBox) paintWatchlist();
    scroll.scrollTop = top;
  }

  // Movies on the left, a divider, then shows. Every season of a show sits
  // together under the show, first season first, at half the poster size.
  function downloads() {
    const movies = data.local.filter((x) => x.kind !== 'show');
    const shows = groupShows(data.local.filter((x) => x.kind === 'show'));
    const showsBox = h('div.shows', {}, ...shows.map(showGroup));
    if (!shows.length) return h('div.items.local', {}, ...movies.map(localItem));
    if (!movies.length) return showsBox;
    const seasons = shows.reduce((t, g) => t + g.length, 0);
    return h('div.split', {},
      h('div.col', { style: { flex: `${Math.max(1, movies.length)} 1 0` } }, h('h3', {}, 'Movies'), h('div.items.local', {}, ...movies.map(localItem))),
      h('div.divider'),
      h('div.col', { style: { flex: `${Math.max(1, Math.ceil(seasons / 2))} 1 0` } }, h('h3', {}, 'Shows'), showsBox));
  }

  // Seasons grouped by show; the most recently added show first.
  function groupShows(list) {
    const by = new Map();
    for (const s of list) {
      const k = s.showKey || s.title.toLowerCase();
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(s);
    }
    const groups = [...by.values()].map((g) => g.sort((a, b) => (a.season ?? 0) - (b.season ?? 0)));
    return groups.sort((a, b) => Math.max(...b.map((s) => s.added || 0)) - Math.max(...a.map((s) => s.added || 0)));
  }

  function showGroup(seasons) {
    const title = seasons[0].title;
    const episodes = seasons.reduce((t, s) => t + s.files.length, 0);
    const bytes = seasons.reduce((t, s) => t + (s.size || 0), 0);
    const all = seasons.flatMap((s) => s.files);
    const play = h('button.playall', { title: `Play ${title} from the first season in VLC`, 'aria-label': `Play all of ${title} in VLC`, html: ICON_PLAY });
    play.addEventListener('click', async () => { const err = await ctx.api.playFilm(all); if (err) flash(err); });
    const meta = `${seasons.length === 1 ? `Season ${seasons[0].season}` : `${seasons.length} seasons`} · ${episodes} episode${episodes === 1 ? '' : 's'} · ${size(bytes)}`;
    return h('div.show', {},
      h('div.show-head', {}, h('div.show-t', {}, h('div.name', {}, title), h('div.meta', {}, meta)), play),
      h('div.items.local.seasons', {}, ...seasons.map(seasonItem)));
  }

  function seasonItem(item) {
    const box = art(`S${item.season}`, { local: item.art, remote: { show: item.title, season: item.season } });
    box.append(h('div.badge', { html: ICON_PLAY }));
    const n = item.files.length;
    const btn = h('button.item', { title: `Play ${item.label} in VLC (${n} episode${n === 1 ? '' : 's'})`, 'aria-label': `Play ${item.label} in VLC` },
      box, h('div.text', {}, h('div.name', {}, `S${item.season} · ${n} ep`)));
    btn.addEventListener('click', async () => {
      const err = await ctx.api.playFilm(item.files);
      if (err) flash(err);
    });
    return btn;
  }

  function filters() {
    const c = ctx.config;
    const sel = (key, value, options, label) => {
      const el = h('select', { 'aria-label': label, title: label },
        ...Object.entries(options).map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
      el.classList.toggle('on', key === 'wlSort' ? value !== 'added' : !!value);
      el.addEventListener('change', () => {
        if (key === 'wlSort' && el.value === 'shuffle') shuffleSeed = Math.random();
        ctx.setConfig({ [key]: el.value });
        el.classList.toggle('on', key === 'wlSort' ? el.value !== 'added' : !!el.value);
        paintWatchlist();
      });
      return el;
    };
    const decades = { '': 'Any decade', ...Object.fromEntries(DECADES.map((d) => [d, d === 'upcoming' ? 'Upcoming' : d])) };
    const genres = { '': 'Any genre', ...Object.fromEntries(GENRES.map((g) => [g, g])) };
    const input = h('input', { type: 'search', placeholder: 'Film, actor or director', value: search, 'aria-label': 'Search your watchlist by film, actor or director' });
    input.addEventListener('input', () => { search = input.value; paintWatchlist(); });
    return h('div', {},
      h('div.filters', {}, sel('wlDecade', c.wlDecade || '', decades, 'Decade'), sel('wlGenre', c.wlGenre || '', genres, 'Genre'), sel('wlSort', c.wlSort || 'added', SORTS, 'Sort by'), input),
      h('div.progress'));
  }

  // Total running time of the films shown, plus progress while details load.
  function updateProgress(list = lastList) {
    const el = scroll.querySelector('.progress');
    if (!el || !list) return;
    const i = detailsInfo;
    let minutes = 0;
    let timed = 0;
    for (const f of list) {
      const m = details[f.slug]?.runtime;
      if (m) { minutes += m; timed++; }
    }
    const parts = [];
    if (timed) {
      const hrs = Math.floor(minutes / 60);
      const total = `${hrs.toLocaleString()} h ${minutes % 60} min`;
      const days = minutes >= 2880 ? ` (about ${Math.round(minutes / 1440)} days)` : '';
      parts.push(timed === list.length
        ? `${total} to watch${days}`
        : `At least ${total} to watch${days}, from ${timed} of ${list.length} films timed so far`);
    }
    if (i && i.done < i.total) {
      parts.push(i.error
        ? `Film details paused (${i.error}), ${i.done} of ${i.total} read`
        : `Reading film details: ${i.done} of ${i.total}${needsDetails() ? '. Films not read yet are left out or listed last' : ''}`);
    }
    el.textContent = parts.join('. ');
    el.style.display = parts.length ? '' : 'none';
  }

  function filtered() {
    const c = ctx.config;
    const year = new Date().getFullYear();
    const q = search.trim().toLowerCase();
    let list = data.watchlist.map((f, i) => ({ ...f, order: i })).filter((f) => !f.downloaded);
    if (c.wlDecade === 'upcoming') list = list.filter((f) => !f.year || f.year > year);
    else if (c.wlDecade) {
      const start = Number(c.wlDecade.slice(0, 4));
      list = list.filter((f) => f.year >= start && f.year < start + 10);
    }
    if (c.wlGenre) list = list.filter((f) => details[f.slug]?.genres?.includes(c.wlGenre));
    if (q) {
      list = list.filter((f) => {
        const d = details[f.slug] || {};
        const hit = (names) => (names || []).find((n) => fold(n).includes(fold(q)));
        f.why = null;
        if (fold(f.title).includes(fold(q))) return true;
        const dir = hit(d.directors);
        if (dir) { f.why = `dir. ${dir}`; return true; }
        const actor = hit(d.cast);
        if (actor) { f.why = `with ${actor}`; return true; }
        return false;
      });
    }
    const d = (f) => details[f.slug] || {};
    // Unknown values always sort last.
    const by = (get, dir) => (a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return a.order - b.order;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir || a.order - b.order;
    };
    const hash = (str) => { let n = Math.floor(shuffleSeed * 2 ** 31); for (const ch of str) n = (n * 31 + ch.charCodeAt(0)) | 0; return n; };
    const sorts = {
      added: (a, b) => a.order - b.order,
      'added-earliest': (a, b) => b.order - a.order,
      name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', ignorePunctuation: true }),
      popular: by((f) => d(f).ratingCount ?? null, -1),
      shuffle: (a, b) => hash(a.slug) - hash(b.slug),
      release: by((f) => f.year ?? null, -1),
      'release-earliest': by((f) => f.year ?? null, 1),
      rating: by((f) => d(f).rating ?? null, -1),
      'rating-lowest': by((f) => d(f).rating ?? null, 1),
      shortest: by((f) => d(f).runtime ?? null, 1),
      longest: by((f) => d(f).runtime ?? null, -1),
    };
    return list.sort(sorts[c.wlSort] || sorts.added);
  }

  function paintWatchlist() {
    if (!watchlistBox) return;
    observer?.disconnect();
    observer = new IntersectionObserver(onVisible, { root: scroll, rootMargin: '300px' });
    // Downloaded entries that still need their poster.
    scroll.querySelectorAll('.local .art').forEach((el) => { if (el.film && !el.querySelector('img.ready')) observer.observe(el); });
    const list = filtered();
    lastList = list;
    const n = scroll.querySelector('h2 .link + .n');
    if (n) n.textContent = String(list.length);
    watchlistBox.replaceChildren(list.length
      ? h('div.items.remote', {}, ...list.map(remoteItem))
      : h('div.note', {}, needsDetails() && detailsInfo && detailsInfo.done < detailsInfo.total ? 'No matches among the films read so far.' : 'No films match.'));
    updateProgress();
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
      const { slug, poster, title, year, show, season } = e.target.film;
      const key = slug || (show ? `show|${show}|${season}` : `${title}|${year}`);
      const img = e.target.querySelector('img');
      if (!posterCache.has(key)) posterCache.set(key, ctx.api.filmPoster(slug ? { slug, poster } : show ? { show, season } : { title, year }));
      posterCache.get(key).then((p) => { if (p && img) img.src = fileUrl(p); else img?.remove(); });
    }
  }

  function localItem(item) {
    const film = item.film;
    const label = item.label || item.title;
    const meta = item.kind === 'show'
      ? `${item.files.length} episode${item.files.length === 1 ? '' : 's'} · ${size(item.size)}`
      : [item.year, film ? 'on watchlist' : null, size(item.size)].filter(Boolean).join(' · ');
    const box = art(label, { local: item.art, remote: film || (item.kind === 'show' ? { show: item.title, season: item.season } : item.year ? { title: item.title, year: item.year } : null) });
    box.append(h('div.badge', { html: ICON_PLAY }));
    const btn = h('button.item', { title: `Play ${label} in VLC`, 'aria-label': `Play ${label} in VLC` },
      box, h('div.text', {}, h('div.name', {}, label), h('div.meta', {}, meta)));
    btn.addEventListener('click', async () => {
      const err = await ctx.api.playFilm(item.files);
      if (err) flash(err);
    });
    return btn;
  }

  function meta(film) {
    const d = details[film.slug] || {};
    const sort = ctx.config.wlSort;
    const bits = [film.year];
    if (film.why) bits.push(film.why);
    if ((sort === 'rating' || sort === 'rating-lowest') && d.rating) bits.push(`★ ${d.rating.toFixed(1)}`);
    if ((sort === 'shortest' || sort === 'longest') && d.runtime) bits.push(`${d.runtime} min`);
    if (ctx.config.wlGenre && d.genres) bits.push(d.genres.slice(0, 2).join(', '));
    return bits.filter(Boolean).join(' · ');
  }

  function remoteItem(film) {
    const btn = h('button.item', { title: `${film.title}${film.year ? ` (${film.year})` : ''} on Letterboxd`, 'aria-label': `Open ${film.title} on Letterboxd` },
      art(film.title, { remote: film }),
      h('div.text', {}, h('div.name', {}, film.title), h('div.meta', {}, meta(film))));
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
      } else if (p.wlDecade !== c.wlDecade || p.wlGenre !== c.wlGenre || p.wlSort !== c.wlSort) {
        paintWatchlist();
      } else {
        paint();
        if (!p.showWatchlist && c.showWatchlist) pollDetails();
      }
    },
    resume: () => load(false),
    menu: () => [{ label: 'Refresh Films', action: 'refresh' }],
    menuAction: (a) => a === 'refresh' && load(true),
  };
}
