'use strict';

// The Films widget's main-process side:
//   - scans a folder for video files and any artwork that sits beside them,
//   - reads a public Letterboxd watchlist (titles and posters) and caches it,
//   - matches the two, and opens local films in VLC.
// Nothing here invents data: when a fetch fails the caller gets the reason,
// plus the last cached copy if there is one.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const VIDEO = new Set(['.mkv', '.mp4', '.m4v', '.mov', '.avi', '.wmv', '.webm', '.mpg', '.mpeg', '.ts', '.m2ts', '.flv', '.ogv', '.divx']);
const IMAGE = ['.jpg', '.jpeg', '.png', '.webp'];
const ART_NAMES = ['poster', 'folder', 'cover', 'movie', 'thumb', 'thumbnail', 'fanart', 'backdrop'];
// Folders that hold bonus material rather than the film itself.
const SKIP_DIRS = /^(featurettes?|extras?|bonus|special features|behind the scenes|deleted scenes|interviews|trailers?|samples?|subs|subtitles|other|shorts)$/i;
const SKIP_FILES = /(^|[\s._-])(sample|trailer|featurette)([\s._-]|$)/i;
const MAX_DEPTH = 6;
const WATCHLIST_TTL = 12 * 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Morrow';

// Titles ----------------------------------------------------------------------

// Words that mark the end of the title in release-style file names.
const JUNK = /\b(2160p|1080p|720p|576p|480p|4k|uhd|hdr10?|dv|bluray|blu ray|brrip|bdrip|webrip|web dl|webdl|web|hdtv|dvdrip|dvd|remux|x264|x265|h 264|h 265|hevc|avc|aac|ac3|ddp?5 1|dts|10bit|8bit|yify|yts|rarbg|amzn|nf|repack|proper|extended|unrated|directors cut|imax|multi|subbed)\b/i;

function cleanName(raw) {
  return raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "The.Tree.of.Life.2011.720p.BrRip.x264" -> { title: 'The Tree of Life', year: 2011 }
function parseTitle(raw) {
  const name = cleanName(raw);
  const tv = /^(.*?)\s*\bS(\d{1,2})\s?E(\d{1,3})\b/i.exec(name)
    || /^(.*?)[\s-]*\b(\d{1,2})x(\d{2,3})\b/i.exec(name)
    || /^(.*?)\s*\bS(\d{1,2})\b(?=.*\b(complete|season)\b)/i.exec(name);
  if (tv) return { title: tidy(tv[1]), year: null, season: Number(tv[2]), episode: tv[3] && /^\d+$/.test(tv[3]) ? Number(tv[3]) : null };
  // A year in brackets, or a bare year followed by release junk or the end.
  let m = /^(.*?)\s*[([]\s*((?:19|20)\d{2})\s*[)\]]/.exec(name) || /^(.+?)\s+((?:19|20)\d{2})(?=\s|$)/.exec(name);
  if (m && tidy(m[1])) return { title: tidy(m[1]), year: Number(m[2]) };
  const j = JUNK.exec(name);
  return { title: tidy(j ? name.slice(0, j.index) : name), year: null };
}

function tidy(s) {
  return s.replace(/[\s(\-[]+$/, '').replace(/^[\s-]+/, '').trim();
}

// For matching: lower case, no accents or punctuation, "&" as "and", no leading article.
function normalize(title) {
  return String(title || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

// Letterboxd-style slug: "Amélie & Co." -> "amelie-co"
function slugify(title) {
  return String(title || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "The Color of Money (1986)" -> { title, year }
function splitDisplayName(s) {
  const m = /^(.*)\s+\((\d{4})\)$/.exec(s || '');
  return m ? { title: m[1], year: Number(m[2]) } : { title: s || '', year: null };
}

// Local folder ----------------------------------------------------------------

function defaultFolder() {
  return path.join(os.homedir(), 'Movies');
}

function expandHome(p) {
  if (!p) return defaultFolder();
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

function findArt(dir, base, names) {
  const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
  const pick = (stem) => {
    for (const ext of IMAGE) {
      const hit = lower.get((stem + ext).toLowerCase());
      if (hit) return path.join(dir, hit);
    }
    return null;
  };
  for (const stem of [base, `${base}-poster`, `${base}.poster`, `${base}-thumb`]) {
    const hit = pick(stem);
    if (hit) return hit;
  }
  for (const stem of ART_NAMES) {
    const hit = pick(stem);
    if (hit) return hit;
  }
  return null;
}

async function scanFolder(folder, { minSizeMB = 100 } = {}) {
  const root = expandHome(folder);
  try {
    if (!(await fs.promises.stat(root)).isDirectory()) throw new Error();
  } catch {
    throw new Error(`The folder ${root} can’t be opened.`);
  }
  const minBytes = Math.max(0, Number(minSizeMB) || 0) * 1024 * 1024;
  const files = [];

  async function walk(dir, depth) {
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    const names = entries.map((e) => e.name);
    let art = null;
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < MAX_DEPTH && !SKIP_DIRS.test(e.name) && !/\.(noindex|app|photoslibrary|fcpbundle|imovielibrary|tvlibrary|localized)$/i.test(e.name)) await walk(full, depth + 1);
        continue;
      }
      const ext = path.extname(e.name).toLowerCase();
      if (!VIDEO.has(ext) || SKIP_FILES.test(e.name)) continue;
      let st;
      try { st = await fs.promises.stat(full); } catch { continue; }
      if (st.size < minBytes) continue;
      const base = e.name.slice(0, -ext.length);
      if (art === null) art = findArt(dir, '\0', names) || '';
      files.push({ path: full, dir, base, size: st.size, mtime: st.mtimeMs, art: findArt(dir, base, names) || art || null, depth });
    }
  }
  await walk(root, 0);
  return group(files, root);
}

// One entry per film, and one per season of a show (its episodes in order).
function group(files, root) {
  const out = new Map();
  for (const f of files) {
    let p = parseTitle(f.base);
    // Generic file names ("movie.mkv") take the title from their folder.
    if ((!p.title || /^(movie|film|video|main|feature)$/i.test(p.title)) && f.dir !== root) p = parseTitle(path.basename(f.dir));
    if (!p.year && p.season == null && f.dir !== root) {
      const fromDir = parseTitle(path.basename(f.dir));
      if (fromDir.year && normalize(fromDir.title) === normalize(p.title)) p = { ...p, year: fromDir.year };
    }
    if (!p.title) continue;
    const isShow = p.season != null;
    const key = isShow ? `tv:${normalize(p.title)}:${p.season}` : `film:${normalize(p.title)}:${p.year || ''}`;
    const item = out.get(key) || {
      key,
      kind: isShow ? 'show' : 'film',
      title: p.title,
      year: p.year || null,
      season: isShow ? p.season : null,
      files: [],
      art: null,
      size: 0,
      added: 0,
    };
    item.files.push({ path: f.path, episode: p.episode ?? null });
    item.art = item.art || f.art;
    item.size += f.size;
    item.added = Math.max(item.added, f.mtime);
    out.set(key, item);
  }
  for (const item of out.values()) {
    item.files.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0) || a.path.localeCompare(b.path, undefined, { numeric: true }));
    item.files = item.files.map((f) => f.path);
    if (item.kind === 'show') item.label = `${item.title} · Season ${item.season}`;
  }
  return [...out.values()].sort((a, b) => b.added - a.added);
}

// Letterboxd --------------------------------------------------------------------

const decode = (s) => s
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

function attr(tag, name) {
  const m = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decode(m[1] ?? m[2]) : null;
}

// A film page's details: poster, year, genres, Letterboxd average, how many
// people rated it (used as popularity) and running time in minutes.
function parseFilmPage(html) {
  const img = /"image"\s*:\s*"(https:\/\/a\.ltrbxd\.com\/resized\/[^"]+)"/.exec(html);
  const year = /<meta property="og:title" content="[^"]*\((\d{4})\)"/.exec(html);
  let genres = [];
  try { genres = JSON.parse((/"genre"\s*:\s*(\[[^\]]*\])/.exec(html) || [])[1] || '[]').filter((g) => typeof g === 'string'); } catch {}
  const rating = /"ratingValue"\s*:\s*([\d.]+)/.exec(html);
  const count = /"ratingCount"\s*:\s*(\d+)/.exec(html);
  const runtime = /(\d+)(?:&nbsp;|\s)mins/.exec(html);
  return {
    poster: img ? img[1].replace(/\\\//g, '/').replace(/-0-\d+-0-\d+-crop\./, '-0-230-0-345-crop.') : null,
    year: year ? Number(year[1]) : null,
    genres,
    rating: rating ? Number(rating[1]) : null,
    ratingCount: count ? Number(count[1]) : 0,
    runtime: runtime ? Number(runtime[1]) : null,
  };
}

// "Watched" heading on a member's Films page: title="1,040&nbsp;films"
function parseWatchedCount(html) {
  const m = /title="([\d,]+)(?:&nbsp;|\s)films?"[^>]*>\s*Watched/.exec(html) || /title="([\d,]+)(?:&nbsp;|\s)films?"/.exec(html);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

// Letterboxd's poster CDN path is built from the film's numeric id.
function posterUrl(filmId, slug, cacheKey, w = 230, h = 345) {
  if (!/^\d+$/.test(filmId) || !/^[\w-]+$/.test(slug)) return null;
  const v = cacheKey && /^\w+$/.test(cacheKey) ? `?v=${cacheKey}` : '';
  return `https://a.ltrbxd.com/resized/film-poster/${filmId.split('').join('/')}/${filmId}-${slug}-0-${w}-0-${h}-crop.jpg${v}`;
}

function parseWatchlistPage(html) {
  const films = [];
  const tags = html.match(/<div[^>]*data-component-class="LazyPoster"[^>]*>/g) || [];
  for (const tag of tags) {
    const slug = attr(tag, 'data-item-slug');
    const display = attr(tag, 'data-item-full-display-name') || attr(tag, 'data-item-name');
    if (!slug || !display) continue;
    let filmId = null;
    let cacheKey = null;
    try {
      const ident = JSON.parse(attr(tag, 'data-postered-identifier') || '{}');
      filmId = /^film:(\d+)$/.exec(ident.uid || '')?.[1] || null;
      const res = JSON.parse(attr(tag, 'data-resolvable-poster-path') || '{}');
      cacheKey = res.cacheBustingKey || null;
    } catch {}
    const { title, year } = splitDisplayName(display);
    films.push({ slug, title, year, link: `https://letterboxd.com/film/${slug}/`, poster: filmId ? posterUrl(filmId, slug, cacheKey) : null });
  }
  const pages = [...html.matchAll(/\/watchlist\/page\/(\d+)\//g)].map((m) => Number(m[1]));
  return { films, lastPage: pages.length ? Math.max(...pages) : 1 };
}

async function getText(url, notFound = 'Letterboxd has no public watchlist for that username.') {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'Letterboxd took too long to answer.' : 'No connection to Letterboxd.');
  }
  const body = await res.text();
  if (res.status === 404) throw Object.assign(new Error(notFound), { notFound: true });
  if (/<title>Just a moment/i.test(body) || res.status === 403 || res.status === 429) {
    throw new Error('Letterboxd is asking for a browser check right now. Try again later.');
  }
  if (!res.ok) throw new Error(`Letterboxd answered with an error (${res.status}).`);
  return body;
}

function createMovies(dataDir, { openExternal } = {}) {
  const dir = path.join(dataDir, 'films');
  const posterDir = path.join(dir, 'posters');
  const inflight = new Map();
  const posterInflight = new Map();
  let active = 0;
  const waiting = [];

  const cacheFile = (user) => path.join(dir, `watchlist-${user.toLowerCase()}.json`);
  const readCache = (user) => {
    try { return JSON.parse(fs.readFileSync(cacheFile(user), 'utf8')); } catch { return null; }
  };

  async function fetchWatchlist(user) {
    const base = `https://letterboxd.com/${encodeURIComponent(user)}/watchlist/`;
    const first = parseWatchlistPage(await getText(base));
    const films = first.films;
    const last = Math.min(first.lastPage, 100);
    for (let page = 2; page <= last; page++) {
      // One page at a time, with a short pause, to stay polite to Letterboxd.
      await new Promise((r) => setTimeout(r, 250));
      films.push(...parseWatchlistPage(await getText(`${base}page/${page}/`)).films);
    }
    const seen = new Set();
    return films.filter((f) => !seen.has(f.slug) && seen.add(f.slug));
  }

  // Returns { films, fetchedAt, error? }. A failed refresh keeps the cached list.
  async function watchlist(user, { force = false } = {}) {
    user = String(user || '').trim().replace(/^@/, '');
    if (!user) return { films: [], fetchedAt: null, error: null, user };
    if (!/^[A-Za-z0-9_]{1,40}$/.test(user)) return { films: [], fetchedAt: null, error: 'That doesn’t look like a Letterboxd username.', user };
    const cached = readCache(user);
    if (!force && cached && Date.now() - cached.fetchedAt < WATCHLIST_TTL) return { ...cached, user };
    const key = user.toLowerCase();
    if (!inflight.has(key)) {
      inflight.set(key, (async () => {
        try {
          const films = await fetchWatchlist(user);
          const doc = { films, fetchedAt: Date.now() };
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(cacheFile(user), JSON.stringify(doc));
          return { ...doc, user };
        } catch (err) {
          return { films: cached?.films || [], fetchedAt: cached?.fetchedAt || null, error: err.message, user };
        } finally {
          inflight.delete(key);
        }
      })());
    }
    return inflight.get(key);
  }

  // Posters are downloaded once and kept on disk; a few at a time.
  async function slot(fn) {
    if (active >= 4) await new Promise((r) => waiting.push(r));
    active++;
    try { return await fn(); } finally { active--; waiting.shift()?.(); }
  }

  async function download(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) return null;
    return Buffer.from(await res.arrayBuffer());
  }

  // Some films' posters live under a different name than the one the
  // watchlist page implies. Their film page names the real one.
  async function filmPage(slug) {
    return parseFilmPage(await getText(`https://letterboxd.com/film/${slug}/`, 'No such film on Letterboxd.'));
  }

  // Film details (genres, ratings, length) for filtering and sorting the
  // watchlist. Letterboxd's filtered watchlist pages sit behind a browser
  // check, so each film's public page is read once, slowly, in the
  // background, and kept in films/details.json.
  const detailsFile = path.join(dir, 'details.json');
  let detailsMap = null;
  let detailsQueue = [];
  let detailsRunning = false;
  let detailsPausedUntil = 0;
  let detailsError = null;
  let detailsDirty = 0;

  function loadDetails() {
    if (!detailsMap) {
      try { detailsMap = JSON.parse(fs.readFileSync(detailsFile, 'utf8')); } catch { detailsMap = {}; }
    }
    return detailsMap;
  }

  function saveDetails() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(detailsFile + '.part', JSON.stringify(detailsMap));
      fs.renameSync(detailsFile + '.part', detailsFile);
      detailsDirty = 0;
    } catch {}
  }

  async function runDetails() {
    if (detailsRunning) return;
    detailsRunning = true;
    try {
      while (detailsQueue.length) {
        if (Date.now() < detailsPausedUntil) break;
        const slug = detailsQueue[0];
        if (detailsMap[slug]) { detailsQueue.shift(); continue; }
        try {
          const d = await filmPage(slug);
          detailsMap[slug] = { genres: d.genres, rating: d.rating, ratingCount: d.ratingCount, runtime: d.runtime, year: d.year };
          detailsError = null;
          detailsQueue.shift();
          if (++detailsDirty >= 10) saveDetails();
        } catch (err) {
          if (err.notFound) { detailsMap[slug] = { genres: [], rating: null, ratingCount: 0, runtime: null }; detailsQueue.shift(); continue; }
          // Blocked or offline: stop for a while and pick up where it left off.
          detailsError = err.message;
          detailsPausedUntil = Date.now() + 20 * 60 * 1000;
          setTimeout(runDetails, 20 * 60 * 1000 + 1000);
          break;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    } finally {
      if (detailsDirty) saveDetails();
      detailsRunning = false;
    }
  }

  // Returns what's known so far and starts reading any missing films.
  function details(slugs) {
    const map = loadDetails();
    const list = (Array.isArray(slugs) ? slugs : []).filter((x) => typeof x === 'string' && /^[\w-]+$/.test(x));
    detailsQueue = list.filter((x) => !map[x]);
    if (detailsQueue.length) runDetails();
    const known = {};
    for (const x of list) if (map[x]) known[x] = map[x];
    return { details: known, total: list.length, done: list.length - detailsQueue.length, error: detailsError };
  }

  async function save(file, buf) {
    fs.mkdirSync(posterDir, { recursive: true });
    fs.writeFileSync(file + '.part', buf);
    fs.renameSync(file + '.part', file);
    return file;
  }

  function once(file, job) {
    if (fs.existsSync(file)) return Promise.resolve(file);
    if (fs.existsSync(file + '.none')) return Promise.resolve(null);
    if (posterInflight.has(file)) return posterInflight.get(file);
    const p = slot(async () => {
      try {
        const buf = await job();
        if (buf) return await save(file, buf);
        // Remember films with no poster so they aren't looked up again.
        fs.mkdirSync(posterDir, { recursive: true });
        fs.writeFileSync(file + '.none', '');
        return null;
      } catch {
        return null; // a network problem: try again next time
      } finally {
        posterInflight.delete(file);
      }
    });
    posterInflight.set(file, p);
    return p;
  }

  // Posters are downloaded once and kept on disk, a few at a time.
  // A watchlist film comes with its slug; a local film that isn't on the
  // watchlist is looked up on Letterboxd by its title and year.
  // Returns the local file, or null when there's no poster.
  // Shows aren't on Letterboxd. Their artwork comes from TVmaze's free API:
  // the season's poster when it has one, otherwise the show's. A poster.jpg
  // in the season's folder always wins.
  async function getJson(url) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    } catch {
      throw new Error('No connection.');
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`The server answered with an error (${res.status}).`);
    return res.json();
  }

  async function showArtwork(show, season) {
    const data = await getJson(`https://api.tvmaze.com/singlesearch/shows?${new URLSearchParams({ q: show, embed: 'seasons' })}`);
    const seasons = data?._embedded?.seasons || [];
    const seasonImage = seasons.find((x) => x.number === season)?.image?.medium;
    const ok = (u) => typeof u === 'string' && u.startsWith('https://static.tvmaze.com/');
    let url = ok(seasonImage) ? seasonImage : null;
    if (!ok(url)) url = data?.image?.medium;
    return ok(url) ? download(url) : null;
  }

  function poster(film) {
    if (!film || typeof film !== 'object') return Promise.resolve(null);
    if (typeof film.show === 'string' && film.show.trim()) {
      const base = slugify(film.show);
      const season = Number(film.season);
      if (!base) return Promise.resolve(null);
      return once(path.join(posterDir, `season-${base}-s${Number.isInteger(season) ? season : 0}.jpg`), () => showArtwork(film.show, season));
    }
    if (typeof film.slug === 'string' && /^[\w-]+$/.test(film.slug)) {
      return once(path.join(posterDir, `${film.slug}.jpg`), async () => {
        let buf = typeof film.poster === 'string' && film.poster.startsWith('https://a.ltrbxd.com/resized/film-poster/') ? await download(film.poster) : null;
        if (!buf) {
          const page = await filmPage(film.slug);
          buf = page.poster ? await download(page.poster) : null;
        }
        return buf;
      });
    }
    const base = slugify(film.title);
    const year = Number(film.year);
    if (!base || !Number.isInteger(year)) return Promise.resolve(null);
    return once(path.join(posterDir, `local-${base}-${year}.jpg`), async () => {
      for (const slug of [`${base}-${year}`, base]) {
        let page;
        try { page = await filmPage(slug); } catch (err) { if (err.notFound) continue; throw err; }
        if (page.poster && page.year && Math.abs(page.year - year) <= 1) return download(page.poster);
      }
      return null;
    });
  }

  // Local films plus the watchlist, matched by title and year.
  async function library({ folder, user, minSizeMB, force = false }) {
    const [localResult, list] = await Promise.all([
      scanFolder(folder, { minSizeMB }).then((items) => ({ items }), (err) => ({ items: [], error: err.message })),
      watchlist(user, { force }),
    ]);
    const local = localResult.items;
    const byTitle = new Map();
    for (const f of list.films) {
      const k = normalize(f.title);
      if (!byTitle.has(k)) byTitle.set(k, []);
      byTitle.get(k).push(f);
    }
    const matched = new Set();
    for (const item of local) {
      if (item.kind !== 'film') continue;
      const candidates = byTitle.get(normalize(item.title)) || [];
      const hit = candidates.find((c) => item.year && c.year && Math.abs(c.year - item.year) <= 1) || (candidates.length === 1 && (!item.year || !candidates[0].year) ? candidates[0] : null);
      if (hit) {
        item.film = hit;
        matched.add(hit.slug);
      }
    }
    return {
      local,
      watchlist: list.films.map((f) => ({ ...f, downloaded: matched.has(f.slug) })),
      folder: expandHome(folder),
      user: list.user,
      fetchedAt: list.fetchedAt,
      folderError: localResult.error || null,
      watchlistError: list.error || null,
    };
  }

  function findVlc() {
    return new Promise((resolve) => {
      for (const p of ['/Applications/VLC.app', path.join(os.homedir(), 'Applications', 'VLC.app')]) if (fs.existsSync(p)) return resolve(p);
      execFile('/usr/bin/mdfind', ["kMDItemCFBundleIdentifier == 'org.videolan.vlc'"], { timeout: 4000 }, (err, out) => {
        resolve(err ? null : String(out).split('\n').find((p) => p.endsWith('.app') && fs.existsSync(p)) || null);
      });
    });
  }

  async function play(files) {
    const list = (Array.isArray(files) ? files : [files]).filter((f) => typeof f === 'string' && path.isAbsolute(f) && VIDEO.has(path.extname(f).toLowerCase()));
    if (!list.length) return 'Nothing to play.';
    const missing = list.filter((f) => !fs.existsSync(f));
    if (missing.length === list.length) return 'That file has been moved or deleted. Refresh to update the list.';
    const vlc = await findVlc();
    if (!vlc) return 'VLC isn’t installed. Get it free from videolan.org, then try again.';
    return new Promise((resolve) => {
      execFile('/usr/bin/open', ['-a', vlc, ...list.filter((f) => !missing.includes(f))], { timeout: 10000 }, (err) => resolve(err ? 'VLC couldn’t open that file.' : null));
    });
  }

  function openFilm(link) {
    if (typeof link === 'string' && /^https:\/\/letterboxd\.com\/film\/[\w-]+\/$/.test(link) && openExternal) openExternal(link);
  }

  // How many films a member has watched, from their public Films page.
  const WATCHED_TTL = 60 * 60 * 1000;
  async function watched(user, { force = false } = {}) {
    user = String(user || '').trim().replace(/^@/, '');
    if (!user) return { count: null, user, error: null };
    if (!/^[A-Za-z0-9_]{1,40}$/.test(user)) return { count: null, user, error: 'That doesn’t look like a Letterboxd username.' };
    const file = path.join(dir, `watched-${user.toLowerCase()}.json`);
    let cached = null;
    try { cached = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    if (!force && cached && Date.now() - cached.fetchedAt < WATCHED_TTL) return { ...cached, user, error: null };
    try {
      const html = await getText(`https://letterboxd.com/${user}/films/`, 'Letterboxd has no member with that username.');
      const count = parseWatchedCount(html);
      if (count == null) throw new Error('Letterboxd’s page didn’t include a film count.');
      const doc = { count, fetchedAt: Date.now() };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(doc));
      return { ...doc, user, error: null };
    } catch (err) {
      return { count: cached?.count ?? null, fetchedAt: cached?.fetchedAt ?? null, user, error: err.message };
    }
  }

  function openWatchlist(user) {
    if (typeof user !== 'string' || !/^[A-Za-z0-9_]{1,40}$/.test(user)) return;
    const url = `https://letterboxd.com/${user}/watchlist/`;
    // Chrome if it's installed, otherwise the default browser.
    execFile('/usr/bin/open', ['-a', 'Google Chrome', url], { timeout: 10000 }, (err) => { if (err && openExternal) openExternal(url); });
  }

  function openProfile(user) {
    if (typeof user === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(user) && openExternal) openExternal(`https://letterboxd.com/${user}/films/`);
  }

  return { library, watchlist, poster, play, openFilm, openWatchlist, openProfile, details, watched, dir };
}

module.exports = { createMovies, parseTitle, normalize, slugify, parseFilmPage, parseWatchedCount, parseWatchlistPage, splitDisplayName, posterUrl, scanFolder, defaultFolder };
