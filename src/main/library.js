'use strict';

// The Library's catalogue on disk, its imports, and the slow background work
// that fills in details and covers.
//
// Everything lives in <data>/library: library.json (the catalogue, see
// library-data.js) and covers/ (one image per book, downloaded once). Book
// details and covers come from each book's public Goodreads page, read one at
// a time with a pause between them; a book with no Goodreads page falls back
// to the Amazon image from the Wish List, then to Open Library by ISBN.
// Nothing is made up: a book without a cover gets a plain typographic one in
// the Library, and the inspection panel says so.

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const D = require('./library-data');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GOODREADS = 'https://www.goodreads.com';
const PAUSE = 1200;               // between Goodreads requests
const PROFILE_TTL = 12 * 3600e3;  // re-read the public profile twice a day
const COVER_HOSTS = /^https:\/\/(i\.gr-assets\.com|m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|images\.gr-assets\.com|covers\.openlibrary\.org)\//;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "goodreads.com/user/show/12345678-name", "12345678" or a review/list link → "12345678".
function profileId(input) {
  const s = String(input || '').trim();
  const m = s.match(/goodreads\.com\/(?:user\/show|review\/list)\/(\d+)/i) || s.match(/^(\d{3,})(?:-[\w-]+)?$/);
  return m ? m[1] : '';
}

// Goodreads cover links carry a size (…/1354._SX98_.jpg); without it the image is full size.
function bigGoodreadsImage(url) {
  if (!url || /nophoto/i.test(url)) return '';
  return url.replace(/\._[A-Z]{2}\d+_\.(jpg|png)$/i, '.$1').replace(/(\/books\/\d+)[a-z](\/)/, '$1i$2');
}

function createLibrary(dataDir, { nativeImage } = {}) {
  const dir = path.join(dataDir, 'library');
  const coverDir = path.join(dir, 'covers');
  const file = path.join(dir, 'library.json');
  const bus = new EventEmitter();
  let cat = load();
  let saveTimer = null, changeTimer = null;
  let working = false;
  let status = '';

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ...D.emptyCatalogue(), ...raw, sources: { goodreads: {}, amazon: {}, ...(raw.sources || {}) } };
    } catch (err) {
      if (err.code !== 'ENOENT' && fs.existsSync(file)) {
        try { fs.renameSync(file, file.replace(/\.json$/, `.corrupt-${Date.now()}.json`)); } catch {}
      }
      return D.emptyCatalogue();
    }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }
  function flush() {
    clearTimeout(saveTimer);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(cat, null, 1));
    fs.renameSync(file + '.tmp', file);
  }
  function changed(now) {
    save();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => bus.emit('change'), now ? 0 : 700);
  }
  function setStatus(s) { status = s; bus.emit('status', s); }

  async function get(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Goodreads answered ${res.status}.`);
    return res.text();
  }

  // ---------------------------------------------------------------- view

  function view() {
    const c = D.categories(cat);
    const ids = new Set([...c.reading, ...c.want, ...c.read, ...c.favorites]);
    const books = {};
    for (const id of ids) {
      const b = cat.books[id];
      books[id] = {
        ...b,
        status: D.statusOf(cat, id),
        shelf: cat.shelves[id] || '',
        wishlist: cat.wishlist.includes(id),
        favorite: cat.favorites.includes(id),
        cover: b.coverFile && fs.existsSync(path.join(coverDir, b.coverFile)) ? path.join(coverDir, b.coverFile) : '',
      };
    }
    return { books, categories: c, sources: cat.sources, working, status };
  }

  // ---------------------------------------------------------------- imports

  // A dropped or chosen file: a Goodreads export (CSV) or a saved Wish List page.
  function importText(name, text) {
    let summary, what;
    if (D.looksLikeGoodreadsCsv(text) || /\.csv$/i.test(name || '')) {
      const recs = D.parseGoodreadsCsv(text);
      summary = D.applyGoodreadsCsv(cat, recs);
      what = `Goodreads: ${recs.length} books`;
    } else if (D.looksLikeWishlist(text)) {
      const list = D.parseAmazonWishlist(text);
      if (!list.items.length) throw new Error('No books were found on that Wish List page.');
      summary = D.applyAmazonWishlist(cat, list);
      what = `Wish List: ${list.items.length} books${list.skipped ? ` (${list.skipped} other items left out)` : ''}`;
    } else if (D.looksLikeWishlistText(/<[a-z][\s\S]*>/i.test(text) ? D.htmlToText(text) : text)) {
      const list = D.parseWishlistText(text);
      if (!list.items.length) throw new Error('No books were found on that Wish List page.');
      summary = D.applyAmazonWishlist(cat, list);
      what = `Wish List: ${list.items.length} books${list.truncated ? ' (the page ended at “See more”, so there may be more)' : ''}`;
    } else {
      throw new Error('That isn’t a Goodreads library export (.csv) or a saved Amazon Wish List page (.html).');
    }
    flush();
    changed(true);
    enrichSoon();
    return { ok: true, what, summary };
  }

  async function syncProfile(input, { force } = {}) {
    const id = profileId(input);
    if (!id) return { ok: false, error: 'That doesn’t look like a Goodreads profile link.' };
    const g = cat.sources.goodreads;
    if (!force && g.profileUserId === id && g.profileSyncedAt && Date.now() - Date.parse(g.profileSyncedAt) < PROFILE_TTL) return { ok: true, cached: true };
    try {
      setStatus('Reading your Goodreads profile…');
      const profile = D.parseGoodreadsProfile(await get(`${GOODREADS}/user/show/${id}`));
      if (!profile.featured.length && !profile.reading.length) throw new Error('That Goodreads profile shows no books (it may be private).');
      D.applyGoodreadsProfile(cat, profile);
      for (const r of [...profile.featured, ...profile.reading]) {
        const b = D.findBook(cat, r);
        if (b && !b.goodreadsImage && r.goodreadsImage) b.goodreadsImage = r.goodreadsImage;
      }
      flush();
      changed(true);
      enrichSoon();
      return { ok: true, profile: { featured: profile.featured.length, reading: profile.reading.length, counts: profile.counts } };
    } catch (err) {
      setStatus('');
      return { ok: false, error: err.message };
    }
  }

  function favorite(id, on) {
    const r = D.setFavorite(cat, id, !!on);
    changed(true);
    return r;
  }

  // ---------------------------------------------------------------- details & covers

  let enrichTimer = null;
  function enrichSoon() { clearTimeout(enrichTimer); enrichTimer = setTimeout(enrich, 300); }

  async function pageFor(b) {
    if (b.goodreadsId) return D.parseGoodreadsBook(await get(`${GOODREADS}/book/show/${b.goodreadsId}`));
    const isbns = [b.isbn, b.asin && /^\d{9}[\dX]$/.test(b.asin) ? b.asin : ''].filter(Boolean);
    for (const i of isbns) {
      try { const p = D.parseGoodreadsBook(await get(`${GOODREADS}/book/isbn/${i}`)); if (p) return p; } catch {}
      await sleep(PAUSE);
    }
    // No ISBN (a Kindle edition, say): search, and only trust a result whose title and author match.
    // Goodreads search finds nothing for a full title with a long subtitle, so
    // ask with the short title and surname first, then the short title alone.
    const short = String(b.title || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').split(/[:;]| - /)[0].trim();
    const surname = String(b.author || '').trim().split(/\s+/).pop() || '';
    let hit = null;
    for (const q of [...new Set([`${short} ${surname}`.trim(), short])]) {
      if (!q) continue;
      const html = await get(`${GOODREADS}/search?q=${encodeURIComponent(q)}`);
      hit = [...html.matchAll(/<a class="bookTitle"[^>]*href="(\/book\/show\/\d+[^"?]*)[^"]*"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<a class="authorName"[^>]*><span[^>]*>([\s\S]*?)<\/span>/g)]
        .find((m) => D.workKey({ title: D.strip(m[2]), author: D.strip(m[3]) }) === D.workKey(b));
      if (hit) break;
      await sleep(PAUSE);
    }
    if (!hit) return null;
    await sleep(PAUSE);
    return D.parseGoodreadsBook(await get(GOODREADS + hit[1]));
  }

  async function fetchCover(b) {
    const candidates = [bigGoodreadsImage(b.goodreadsImage), b.amazonImage, b.isbn ? `https://covers.openlibrary.org/b/isbn/${b.isbn}-L.jpg?default=false` : '']
      .filter((u) => u && COVER_HOSTS.test(u));
    for (const url of candidates) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1500) continue; // a 1×1 "no image"
        const ext = /png/.test(res.headers.get('content-type') || '') ? 'png' : 'jpg';
        fs.mkdirSync(coverDir, { recursive: true });
        const name = `${b.id}.${ext}`;
        fs.writeFileSync(path.join(coverDir, name), buf);
        b.coverFile = name;
        b.coverSource = /openlibrary/.test(url) ? 'Open Library' : /media-amazon|ssl-images-amazon/.test(url) && url === b.amazonImage ? 'Amazon' : 'Goodreads';
        measure(b);
        return true;
      } catch {}
    }
    b.coverTried = new Date().toISOString();
    return false;
  }

  // The cover's shape gives the book its proportions, and its average colour the spine's.
  function measure(b) {
    if (!nativeImage || !b.coverFile) return;
    try {
      const img = nativeImage.createFromPath(path.join(coverDir, b.coverFile));
      const { width, height } = img.getSize();
      if (width && height) b.coverAspect = Math.round((width / height) * 1000) / 1000;
      const px = img.resize({ width: 4, height: 6, quality: 'good' }).toBitmap();
      // BGRA. The middle third of the left edge is closest to what wraps onto the spine.
      const avg = (cols) => {
        let r = 0, g = 0, bl = 0, n = 0;
        for (let y = 0; y < 6; y++) for (const x of cols) { const i = (y * 4 + x) * 4; bl += px[i]; g += px[i + 1]; r += px[i + 2]; n++; }
        return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
      };
      b.tone = avg([0, 1, 2, 3]);
      b.edgeTone = avg([0]);
    } catch {}
  }

  async function enrich() {
    if (working) return;
    working = true;
    bus.emit('change');
    try {
      const c = D.categories(cat);
      const queue = [...new Set([...c.reading, ...c.favorites, ...c.want, ...c.read])].map((id) => cat.books[id]).filter(Boolean);
      let n = 0;
      for (const b of queue) {
        const needsPage = !b.enrichedAt && !b.enrichFailed;
        const needsCover = !b.coverFile && !b.coverTried;
        if (!needsPage && !needsCover) { if (b.coverFile && !b.tone) measure(b); continue; }
        n++;
        setStatus(`Finding details and covers… ${n}`);
        if (needsPage) {
          try {
            const page = await pageFor(b);
            if (page) D.applyBookPage(b, page); else b.enrichFailed = new Date().toISOString();
          } catch { b.enrichFailed = new Date().toISOString(); }
          await sleep(PAUSE);
        }
        if (!b.coverFile) await fetchCover(b);
        changed();
      }
    } finally {
      working = false;
      setStatus('');
      flush();
      bus.emit('change');
    }
  }

  // Covers measured before a nativeImage was around (or by an older version).
  for (const b of Object.values(cat.books)) if (b.coverFile && !b.tone) measure(b);
  enrichSoon();

  return {
    view, importText, syncProfile, favorite, flush,
    retry() { for (const b of Object.values(cat.books)) { delete b.enrichFailed; delete b.coverTried; } enrichSoon(); },
    on: (ev, fn) => bus.on(ev, fn),
    get status() { return status; },
  };
}

module.exports = { createLibrary, profileId, bigGoodreadsImage };
