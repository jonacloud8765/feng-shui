'use strict';

// The Library's book data, without any Electron or network code so it can be
// tested on its own: readers for a Goodreads library export (CSV), a saved
// Amazon Wish List page, a public Goodreads profile and a Goodreads book page,
// and the rules that merge them into one catalogue.
//
// Where each category comes from:
//   Currently Reading  Goodreads, the "currently-reading" shelf
//   Read               Goodreads, the "read" shelf
//   Want to Read       the Amazon Wish List, and only the Wish List
//   Favorites          picked by hand in the Library; never changes a book's shelf
//
// A book is identified by ISBN-13 when one is known (ISBN-10s and Amazon ASINs
// that are ISBN-10s are converted), then by Goodreads id, then by Amazon ASIN,
// and only then by its title and first author. Different editions keep their
// own entries because their ISBNs differ.

const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const strip = (html) => decode(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// ------------------------------------------------------------ identifiers

function isbn10to13(isbn10) {
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}

function validIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

function validIsbn13(s) {
  if (!/^97[89]\d{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
}

// Any ISBN-like value (Goodreads exports wrap them as ="0140449043") → ISBN-13 or ''.
function isbn13(value) {
  const s = String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
  if (validIsbn13(s)) return s;
  if (validIsbn10(s)) return isbn10to13(s);
  return '';
}

// Titles and names compared loosely: case, accents, punctuation, a leading
// article and a subtitle after a colon don't matter.
function normTitle(t) {
  return String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ').split(/[:;]| - /)[0]
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^(the|a|an) /, '').trim();
}
function normName(n) {
  const s = String(n || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const parts = s.replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : ''; // the surname is what both sources agree on
}
// "The Filmmaker's Eye: Learning…" and "The Filmmaker's Eye: The Language of the Lens"
// are two books; a missing subtitle on one side still matches.
function sameSubtitle(a, b) {
  const sub = (t) => String(t || '').normalize('NFKD').toLowerCase().split(/[:;]| - /).slice(1).join(' ').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 14);
  const x = sub(a), y = sub(b);
  return !x || !y || x.startsWith(y) || y.startsWith(x);
}
const workKey = (b) => (normTitle(b.title) && `${normTitle(b.title)}|${normName(b.author)}`);

// ------------------------------------------------------------ Goodreads CSV

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const looksLikeGoodreadsCsv = (text) => /^﻿?Book Id,Title,Author/.test(String(text || '').slice(0, 200));

// The "Export Library" CSV from goodreads.com/review/import.
function parseGoodreadsCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('That file is empty.');
  const head = rows[0].map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  if (col('Book Id') < 0 || col('Title') < 0 || col('Exclusive Shelf') < 0) throw new Error('That isn’t a Goodreads library export.');
  const get = (r, name) => { const i = col(name); return i < 0 ? '' : String(r[i] || '').trim(); };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const date = (v) => (/^\d{4}\/\d{2}\/\d{2}$/.test(v) ? v.replace(/\//g, '-') : '');
  return rows.slice(1).filter((r) => r.length > 3).map((r) => {
    const shelves = get(r, 'Bookshelves').split(',').map((x) => x.trim()).filter(Boolean);
    const extra = get(r, 'Additional Authors').split(',').map((x) => x.trim()).filter(Boolean);
    const year = num(get(r, 'Original Publication Year')) || num(get(r, 'Year Published'));
    return {
      goodreadsId: get(r, 'Book Id'),
      title: get(r, 'Title'),
      author: get(r, 'Author'),
      authors: [get(r, 'Author'), ...extra].filter(Boolean),
      isbn: isbn13(get(r, 'ISBN13')) || isbn13(get(r, 'ISBN')),
      myRating: num(get(r, 'My Rating')),
      avgRating: num(get(r, 'Average Rating')),
      publisher: get(r, 'Publisher'),
      format: get(r, 'Binding'),
      pages: num(get(r, 'Number of Pages')),
      year,
      editionYear: num(get(r, 'Year Published')),
      dateRead: date(get(r, 'Date Read')),
      dateAdded: date(get(r, 'Date Added')),
      shelf: get(r, 'Exclusive Shelf'),
      shelves,
      review: strip(get(r, 'My Review')),
      readCount: num(get(r, 'Read Count')),
    };
  }).filter((b) => b.goodreadsId && b.title);
}

// ------------------------------------------------------------ Amazon Wish List

const looksLikeWishlist = (text) => /data-itemid=|id="itemName_/.test(String(text || ''));

// A Wish List page saved from the browser after scrolling to the end (Chrome:
// File › Save Page As… › Webpage, Complete). Each item is an <li data-itemid>.
function parseAmazonWishlist(html) {
  const s = String(html || '');
  const listName = strip((s.match(/id="profile-list-name"[^>]*>([\s\S]*?)</) || [])[1] || '');
  const listId = ((s.match(/wishlist\/ls\/([A-Z0-9]{8,16})/) || [])[1]) || '';
  const items = [];
  const seen = new Set();
  const re = /<li\b[^>]*\bdata-itemid="([^"]+)"[^>]*>([\s\S]*?)(?=<li\b[^>]*\bdata-itemid=|<\/ul>|$)/g;
  let m;
  while ((m = re.exec(s))) {
    const [whole, itemId, body] = m;
    if (seen.has(itemId)) continue;
    const params = decode((whole.match(/data-reposition-action-params="([^"]*)"/) || [])[1] || '');
    const asin = ((params.match(/ASIN:([A-Z0-9]{10})/) || [])[1]) || ((body.match(/\/dp\/([A-Z0-9]{10})/) || [])[1]) || '';
    const nameTag = body.match(/<a\b[^>]*id="itemName_[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    let title = nameTag ? (decode((nameTag[0].match(/\btitle="([^"]*)"/) || [])[1] || '') || strip(nameTag[1])) : '';
    if (!title) continue;
    const href = nameTag ? decode((nameTag[0].match(/\bhref="([^"]*)"/) || [])[1] || '') : '';
    const byline = strip((body.match(/id="item-byline-[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '');
    // "by Robert Greene (Hardcover)" or "by Plato, Walter Hamilton, et al. (Paperback)"
    const bm = byline.match(/^by\s+(.*?)\s*(?:\(([^)]*)\))?\s*$/i);
    const authors = bm ? bm[1].split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter((x) => x && !/^et al\.?$/i.test(x)) : [];
    const format = bm && bm[2] ? bm[2].trim() : '';
    const imgTag = (body.match(/<img\b[^>]*>/) || [''])[0];
    const img = decode((imgTag.match(/\bsrc="([^"]*)"/) || [])[1] || '');
    const price = Number((whole.match(/data-price="([^"]*)"/) || [])[1]);
    const added = strip((body.match(/id="itemAddedDate_[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '').replace(/^Item added\s*/i, '');
    seen.add(itemId);
    items.push({
      amazonItemId: itemId,
      asin,
      isbn: isbn13(asin),
      title: title.trim(),
      author: authors[0] || '',
      authors,
      format,
      amazonUrl: asin ? `https://www.amazon.com/dp/${asin}` : (/^https:\/\/www\.amazon\.[a-z.]+\//.test(href) ? href.split('?')[0] : ''),
      amazonImage: bigAmazonImage(img),
      price: Number.isFinite(price) && price > 0 ? price : null,
      addedOn: added,
    });
  }
  // Only books: a format such as Hardcover or Kindle, or an ISBN for an ASIN.
  const books = items.filter((b) => b.isbn || /hardcover|paperback|kindle|mass market|audiobook|audible|board book|library binding|spiral|leather|book/i.test(b.format));
  return { listName, listId, items: books, skipped: items.length - books.length };
}

// The Wish List's print view (amazon.com/hz/wishlist/printview/…), saved as a
// page or copied as text: each item is its title (on one or two lines, with
// the price, quantity and "has" columns after it) followed by "by Author (Format) |".
const htmlToText = (html) => decode(String(html || '')
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?>|<\/(td|tr|div|p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n');

const BYLINE = /^by\s+(.+?)\s*\(([^()]*(?:\([^)]*\)[^()]*)*)\)\s*\|?\s*$/i;
const looksLikeWishlistText = (text) => String(text || '').split(/\n/).filter((l) => BYLINE.test(l.trim()) && /\((hardcover|paperback|kindle edition|mass market paperback|audible audiobook|board book|spiral-bound|library binding)\)/i.test(l)).length >= 1;

function parseWishlistText(input) {
  const text = /<[a-z][\s\S]*>/i.test(input) ? htmlToText(input) : String(input || '');
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const items = [];
  let buf = [];
  const PRICE = /\s*(?:\$[\d,]+\.\d{2}|-)?\s+\d+\s+\d+\s*$/;
  for (const l of lines) {
    const m = l.match(BYLINE);
    if (!m) {
      if (!l || /^(title|comments|price|quantity|has|see more|books?)$/i.test(l) || /^https?:\/\//.test(l) || /^\d+\/\d+\/\d+,/.test(l) || /Amazon\.com\s*$/.test(l) || /^title\s+comments/i.test(l)) {
        if (!l) continue;
        buf = []; continue;
      }
      buf.push(l);
      continue;
    }
    let title = buf.join(' ');
    const pm = title.match(/\$([\d,]+\.\d{2})\s+\d+\s+\d+\s*$/);
    title = title.replace(PRICE, '').replace(/\s+/g, ' ').trim();
    buf = [];
    if (!title) continue;
    // "Adam Nayman, Telegramme Paper Co. (with Oliver Stafford and Jason Ngai)": names before any bracket.
    const authors = m[1].replace(/\([^)]*\)/g, '').split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter((x) => x && !/^et al\.?$/i.test(x));
    items.push({ title, author: authors[0] || '', authors, format: m[2].trim(), price: pm ? Number(pm[1].replace(/,/g, '')) : null, asin: '', isbn: '', amazonUrl: '', amazonImage: '' });
  }
  const listName = (text.match(/^\s*(.+?)\s*-\s*Amazon\.com\s*$/m) || [])[1] || '';
  const listId = (text.match(/wishlist\/(?:printview|ls)\/([A-Z0-9]{8,16})/) || [])[1] || '';
  const more = /^\s*see more\s*$/im.test(text);
  return { listName: listName.replace(/^\d+\/\d+\/\d+,.*?\s{2,}/, '').trim(), listId, items, skipped: 0, truncated: more };
}

// Amazon serves images at a size chosen in the file name (…_SS135_.jpg);
// dropping that part gives the full-size cover.
function bigAmazonImage(url) {
  if (!/^https:\/\/(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\/images\//.test(url || '')) return '';
  return url.replace(/\._[^/]*_\.(jpg|jpeg|png)$/i, '.$1');
}

// ------------------------------------------------------------ Goodreads pages

// The public profile page shows the featured shelf (by default a few books
// from "read") and up to three books being read. It's a sample, not the full
// shelves, which Goodreads only shows to signed-in visitors.
function parseGoodreadsProfile(html) {
  const s = String(html || '');
  const userId = (s.match(/\/user\/show\/(\d+)/) || [])[1] || '';
  const name = strip((s.match(/<title>\s*([^<]*?)\s*(?:-|\(|<)/) || [])[1] || '');
  const counts = {};
  for (const m of s.matchAll(/shelf=([a-z0-9-]+)"[^>]*>[^<]*?<\/a>\s*[^(<]*\((\d+)\)/g)) counts[m[1]] = Number(m[2]);
  for (const m of s.matchAll(/>\s*([a-z0-9-]+)\s*(?:&lrm;|‎)?\s*\((\d+)\)\s*</g)) if (!counts[m[1]]) counts[m[1]] = Number(m[2]);
  const book = (href, label, img) => {
    const id = (href.match(/\/book\/show\/(\d+)/) || [])[1];
    if (!id) return null;
    const bm = decode(label).match(/^(.*) by (.*)$/);
    return { goodreadsId: id, title: bm ? bm[1].trim() : decode(label).trim(), author: bm ? bm[2].trim() : '', goodreadsImage: img || '' };
  };
  const featured = [];
  let featuredShelf = '';
  const fm = s.match(/id="featured_shelf"[\s\S]*?shelf=([a-z0-9-]+)"[\s\S]*?<div class="imgGrid"[^>]*>([\s\S]*?)<\/div>/);
  if (fm) {
    featuredShelf = fm[1];
    for (const a of fm[2].matchAll(/<a href="([^"]+)"><img\b[^>]*\btitle="([^"]*)"[^>]*\bsrc="([^"]*)"/g)) {
      const b = book(a[1], a[2], a[3]);
      if (b) featured.push(b);
    }
  }
  const reading = [];
  const cm = s.match(/id="currentlyReadingReviews"([\s\S]*?)(?:id="yearInBooks"|class="bigBox"(?![\s\S]{0,40}currentlyReadingReviews)|$)/);
  if (cm) {
    for (const u of cm[1].split(/class="Updates/).slice(1)) {
      const t = u.match(/<a class="bookTitle" href="([^"]+)">([\s\S]*?)<\/a>/);
      if (!t) continue;
      const author = strip((u.match(/<a class="authorName"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
      const img = (u.match(/<img\b[^>]*\bsrc="([^"]*)"/) || [])[1] || '';
      const b = book(t[1], `${strip(t[2])} by ${author}`, img);
      if (b && !reading.some((x) => x.goodreadsId === b.goodreadsId)) reading.push(b);
    }
  }
  return { userId, name, counts, featuredShelf, featured, reading };
}

// A Goodreads book page carries its data as JSON (__NEXT_DATA__).
function parseGoodreadsBook(html) {
  const m = String(html || '').match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let state;
  try { state = JSON.parse(m[1]).props.pageProps.apolloState; } catch { return null; }
  if (!state) return null;
  const ref = (r) => (r && r.__ref ? state[r.__ref] : r);
  const root = state.ROOT_QUERY || {};
  let book = null;
  for (const [k, v] of Object.entries(root)) if (/^getBookByLegacyId/.test(k)) book = ref(v);
  if (!book) book = Object.entries(state).filter(([k, v]) => k.startsWith('Book:') && v && v.title && v.details).map(([, v]) => v)[0];
  if (!book) return null;
  const work = ref(book.work) || {};
  const author = ref(book.primaryContributorEdge && book.primaryContributorEdge.node) || {};
  const d = book.details || {};
  const yearOf = (ms) => (Number.isFinite(ms) ? new Date(ms).getUTCFullYear() : null);
  const stats = work.stats || {};
  return {
    goodreadsId: String(book.legacyId || ''),
    goodreadsUrl: book.webUrl || '',
    title: book.title || '',
    author: author.name || '',
    description: strip(book['description({"stripped":true})'] || book.description || ''),
    goodreadsImage: book.imageUrl || '',
    genres: (book.bookGenres || []).map((g) => g && g.genre && g.genre.name).filter(Boolean).slice(0, 6),
    isbn: isbn13(d.isbn13) || isbn13(d.isbn),
    asin: d.asin || '',
    format: d.format || '',
    pages: d.numPages || null,
    publisher: d.publisher || '',
    editionYear: yearOf(d.publicationTime),
    year: yearOf(work.details && work.details.publicationTime) || yearOf(d.publicationTime),
    avgRating: Number.isFinite(stats.averageRating) ? stats.averageRating : null,
    ratingsCount: Number.isFinite(stats.ratingsCount) ? stats.ratingsCount : null,
  };
}

// ------------------------------------------------------------ catalogue

function emptyCatalogue() {
  return {
    version: 1,
    books: {},          // id → book
    shelves: {},        // id → Goodreads exclusive shelf ("read", "currently-reading", "to-read", …)
    wishlist: [],       // ids on the Amazon Wish List, in list order
    favorites: [],      // ids, in the order they were added
    sources: { goodreads: {}, amazon: {} },
  };
}

const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Finds the book a record describes, or null.
function findBook(cat, rec) {
  const books = Object.values(cat.books);
  if (rec.isbn) { const b = books.find((x) => x.isbn === rec.isbn); if (b) return b; }
  if (rec.goodreadsId) { const b = books.find((x) => x.goodreadsId === rec.goodreadsId); if (b) return b; }
  if (rec.asin) { const b = books.find((x) => x.asin === rec.asin); if (b) return b; }
  const key = workKey(rec);
  if (!key) return null;
  // By title and author only when one side has no ISBN, so editions with
  // their own ISBNs stay apart.
  return books.find((x) => workKey(x) === key && (!x.isbn || !rec.isbn) && sameSubtitle(x.title, rec.title)) || null;
}

const FIELDS = ['title', 'author', 'authors', 'isbn', 'asin', 'goodreadsId', 'goodreadsUrl', 'amazonUrl', 'description', 'genres', 'format', 'pages', 'publisher', 'year', 'editionYear', 'avgRating', 'ratingsCount', 'myRating', 'review', 'dateRead', 'dateAdded', 'goodreadsImage', 'amazonImage', 'price', 'addedOn', 'readCount'];
const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

// Merges what a source knows into a book. `prefer` means this source wins
// where both have a value (a Goodreads export for ratings and shelves, a
// Goodreads book page for descriptions); otherwise only gaps are filled.
function absorb(book, rec, prefer) {
  for (const k of FIELDS) {
    if (empty(rec[k])) continue;
    if (prefer || empty(book[k])) book[k] = rec[k];
  }
  if (!book.goodreadsUrl && book.goodreadsId) book.goodreadsUrl = `https://www.goodreads.com/book/show/${book.goodreadsId}`;
  return book;
}

function upsert(cat, rec, prefer) {
  let b = findBook(cat, rec);
  if (!b) { b = { id: newId() }; cat.books[b.id] = b; }
  absorb(b, rec, prefer);
  return b;
}

// A Goodreads export is the whole truth about the Goodreads shelves: books no
// longer on a shelf leave it.
function applyGoodreadsCsv(cat, records, when = new Date().toISOString()) {
  const shelves = {};
  for (const r of records) {
    const b = upsert(cat, r, true);
    if (r.shelf) shelves[b.id] = r.shelf;
  }
  cat.shelves = shelves;
  cat.sources.goodreads = { ...cat.sources.goodreads, kind: 'export', importedAt: when, count: records.length, partial: false };
  return summarize(cat);
}

// The public profile is only a sample: it adds to the shelves and never
// removes anything, and it never overrides a full export.
function applyGoodreadsProfile(cat, profile, when = new Date().toISOString()) {
  const full = cat.sources.goodreads.kind === 'export';
  const put = (rec, shelf) => {
    const b = upsert(cat, rec, false);
    if (!full || !cat.shelves[b.id]) cat.shelves[b.id] = cat.shelves[b.id] || shelf;
    return b;
  };
  const touched = [];
  if (profile.featuredShelf) for (const r of profile.featured) touched.push(put(r, profile.featuredShelf).id);
  for (const r of profile.reading) {
    const b = upsert(cat, r, false);
    if (!full) cat.shelves[b.id] = 'currently-reading';
    touched.push(b.id);
  }
  cat.sources.goodreads = {
    ...cat.sources.goodreads,
    profileUserId: profile.userId || cat.sources.goodreads.profileUserId,
    profileCounts: profile.counts,
    profileSyncedAt: when,
    ...(full ? {} : { kind: 'profile', partial: true }),
  };
  return touched;
}

// The Wish List is the whole truth about Want to Read.
function applyAmazonWishlist(cat, list, when = new Date().toISOString()) {
  const ids = [];
  for (const r of list.items) {
    const b = upsert(cat, r, false);
    for (const k of ['amazonUrl', 'amazonImage', 'price', 'addedOn', 'asin']) if (!empty(r[k])) b[k] = r[k];
    if (!ids.includes(b.id)) ids.push(b.id);
  }
  cat.wishlist = ids;
  cat.sources.amazon = { importedAt: when, count: ids.length, listName: list.listName || '', listId: list.listId || '' };
  prune(cat);
  return summarize(cat);
}

// Goodreads page data fills gaps and refreshes community facts, but never
// touches personal ones (rating, review, dates, shelf).
function applyBookPage(book, page) {
  if (!page) return book;
  const { myRating, review, dateRead, dateAdded, ...rest } = page;
  absorb(book, { ...rest, title: book.title || rest.title, author: book.author || rest.author, isbn: book.isbn || rest.isbn }, false);
  for (const k of ['description', 'genres', 'avgRating', 'ratingsCount', 'year', 'goodreadsImage']) if (!empty(rest[k])) book[k] = rest[k];
  book.enrichedAt = new Date().toISOString();
  return book;
}

function setFavorite(cat, id, on) {
  if (!cat.books[id]) return false;
  const has = cat.favorites.includes(id);
  if (on && !has) cat.favorites.push(id);
  if (!on && has) cat.favorites = cat.favorites.filter((x) => x !== id);
  return cat.favorites.includes(id);
}

// Books that belong to no category any more are dropped (favorites keep theirs).
function prune(cat) {
  const keep = new Set([...Object.keys(cat.shelves), ...cat.wishlist, ...cat.favorites]);
  for (const id of Object.keys(cat.books)) if (!keep.has(id)) delete cat.books[id];
}

function categories(cat) {
  const order = Object.keys(cat.books);
  const on = (shelf) => order.filter((id) => cat.shelves[id] === shelf);
  const byDate = (ids, k) => ids.slice().sort((a, b) => String(cat.books[b][k] || '').localeCompare(String(cat.books[a][k] || '')));
  return {
    reading: on('currently-reading'),
    want: cat.wishlist.filter((id) => cat.books[id]),
    read: byDate(on('read'), 'dateRead'),
    favorites: cat.favorites.filter((id) => cat.books[id]),
  };
}

function summarize(cat) {
  const c = categories(cat);
  return { reading: c.reading.length, want: c.want.length, read: c.read.length, favorites: c.favorites.length };
}

// What a book's reading status is, in words, for the inspection panel.
function statusOf(cat, id) {
  const s = cat.shelves[id];
  if (s === 'currently-reading') return 'Currently reading';
  if (s === 'read') return 'Read';
  if (cat.wishlist.includes(id)) return 'Want to read';
  if (s === 'to-read') return 'On your Goodreads to-read shelf';
  if (s) return s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return '';
}

module.exports = {
  isbn13, normTitle, workKey, parseCsv, looksLikeGoodreadsCsv, parseGoodreadsCsv, looksLikeWishlist, parseAmazonWishlist, bigAmazonImage,
  looksLikeWishlistText, parseWishlistText, htmlToText,
  parseGoodreadsProfile, parseGoodreadsBook, emptyCatalogue, findBook, applyGoodreadsCsv, applyGoodreadsProfile,
  applyAmazonWishlist, applyBookPage, setFavorite, categories, summarize, statusOf, strip,
};
