'use strict';

// Record Room crates: the tracks of a SoundCloud profile.
//
// SoundCloud's API needs a registered app key, but every profile also has a
// public RSS feed (the one podcast apps use), which lists its tracks with
// titles, links and artwork. The profile page gives the numeric user id the
// feed needs. Audio is never downloaded here: the room plays each track
// through SoundCloud's own embedded player.
//
// A profile's crate is cached on disk for a few hours, and a failed request
// keeps the last good crate (marked stale), so the room works offline.

const fs = require('fs');
const path = require('path');

const TTL = 6 * 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_TRACKS = 300;

const unxml = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? unxml(m[1]).trim() : ''; };
const small = (url) => (url || '').replace(/-(original|t\d+x\d+|large|crop)\./, '-t300x300.');

// "https://soundcloud.com/name", "soundcloud.com/name/tracks", "@name" or "name".
// Short links (on.soundcloud.com/…) are followed to the profile they point at.
function normalize(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (/^on\.soundcloud\.com\//i.test(s)) s = 'https://' + s;
  if (/^https?:\/\/on\.soundcloud\.com\//i.test(s)) return { url: s, slug: null };
  s = s.replace(/^@/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?soundcloud\.com\/([^/?#\s]+)/i) || s.match(/^([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  return { url: `https://soundcloud.com/${slug}`, slug };
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(res.status === 404 ? 'That SoundCloud profile can’t be found.' : `SoundCloud answered ${res.status}.`);
  return res;
}

async function fetchCrate(input) {
  const n = normalize(input);
  if (!n) throw new Error('That doesn’t look like a SoundCloud profile link.');
  const page = await get(n.url);
  const html = await page.text();
  const slug = n.slug || (new URL(page.url).pathname.split('/')[1] || '').toLowerCase();
  const id = (html.match(/soundcloud:users:(\d+)/) || [])[1];
  if (!id) throw new Error('That link isn’t a SoundCloud profile.');

  let feed = `https://feeds.soundcloud.com/users/soundcloud:users:${id}/sounds.rss`;
  let head = '';
  const items = [];
  for (let pageNo = 0; feed && pageNo < 6 && items.length < MAX_TRACKS; pageNo++) {
    const xml = await (await get(feed)).text();
    if (!head) head = xml.split('<item>')[0];
    items.push(...xml.split('<item>').slice(1));
    const next = xml.match(/<atom:link href="([^"]+)" rel="next"/);
    feed = next ? unxml(next[1]) : null;
  }
  const avatar = small((head.match(/<itunes:image href="([^"]+)"/) || [])[1]);
  const seen = new Set();
  const tracks = [];
  for (const it of items) {
    const tid = (it.match(/tracks\/(\d+)/) || [])[1];
    const link = tag(it, 'link');
    if (!tid || !link || seen.has(tid)) continue;
    seen.add(tid);
    tracks.push({
      id: tid,
      title: tag(it, 'title'),
      url: link,
      duration: tag(it, 'itunes:duration'),
      art: small((it.match(/<itunes:image href="([^"]+)"/) || [])[1]) || avatar,
    });
    if (tracks.length >= MAX_TRACKS) break;
  }
  return { slug, name: tag(head, 'title') || slug, profile: `https://soundcloud.com/${slug}`, avatar, tracks };
}

function createSoundCloud(dataDir) {
  const file = path.join(dataDir, 'soundcloud.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cache = {}; }
  const pending = new Map();
  const save = () => fs.promises.writeFile(file, JSON.stringify(cache)).catch(() => {});

  async function crate(input, { force = false } = {}) {
    const key = String(input || '').trim().toLowerCase();
    if (!key) return null;
    const hit = cache[key];
    if (hit && !force && Date.now() - hit.at < TTL) return hit.data;
    if (pending.has(key)) return pending.get(key);
    const p = fetchCrate(input).then((data) => {
      cache[key] = { at: Date.now(), data };
      save();
      return data;
    }).catch((err) => {
      if (hit) return { ...hit.data, stale: true };
      return { error: String(err.message || err), input: String(input) };
    }).finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  }

  return { crate, crates: (inputs, opts) => Promise.all(inputs.map((x) => crate(x, opts))) };
}

module.exports = { createSoundCloud, normalize };
