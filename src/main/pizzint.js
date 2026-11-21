'use strict';

// PizzINT Watch readings: the DOUGHCON level (pizzint.watch) and the Nothing
// Ever Happens Index (pizzint.watch/nothingeverhappens).
//
// Both come from the JSON endpoints the site's own pages use. Nothing here is
// invented: a failed request keeps the last good reading (also kept on disk
// so it survives restarts) and marks it stale. Each source is independent,
// cached for a few minutes, and a forced refresh is throttled so a burst of
// clicks makes one request.

const fs = require('fs');
const path = require('path');

const BASE = 'https://www.pizzint.watch';
const TTL = 5 * 60 * 1000; // automatic refreshes reuse a reading this fresh
const MIN_GAP = 20 * 1000; // a forced refresh never hits the site more often than this
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) FengShui';

// The Nothing Ever Happens classifications, as the site defines them.
const NEH_BANDS = [
  { min: 0, max: 29, label: 'Nothing Ever Happens' },
  { min: 30, max: 64, label: 'Something Might Happen' },
  { min: 65, max: 98, label: 'Something Is Happening' },
  { min: 99, max: 100, label: 'It Happened' },
];
const band = (v) => (v <= 29 ? 0 : v <= 64 ? 1 : v <= 98 ? 2 : 3);

const DOUGHCON = {
  1: 'Maximum Readiness',
  2: 'Next Step to Maximum Readiness',
  3: 'Increase in Force Readiness',
  4: 'Increased Intelligence Watch',
  5: 'Lowest State of Readiness',
};

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'PizzINT took too long to answer.' : 'No connection to PizzINT.');
  }
  if (!res.ok) throw new Error(`PizzINT answered with an error (${res.status}).`);
  try {
    return await res.json();
  } catch {
    throw new Error('PizzINT sent something that isn’t data.');
  }
}

// DOUGHCON from the dashboard feed. DEFCON follows it one to one.
async function readDoughcon() {
  const d = await getJson(`${BASE}/api/dashboard-data`);
  const level = Number(d && d.defcon_level);
  if (!d || d.success === false || !Number.isInteger(level) || level < 1 || level > 5) throw new Error('PizzINT didn’t publish a DOUGHCON level.');
  return {
    level,
    defcon: level,
    description: DOUGHCON[level],
    publishedAt: Date.parse(d.timestamp || d.defcon_details?.at_time || '') || null,
  };
}

// The index is the highest escalation probability among the markets the site
// monitors, worked out exactly as its page does.
function nehFromMarkets(markets) {
  const list = (markets || []).map((m) => {
    let price = 'current_price' in m ? m.current_price : m.price;
    let valid = true;
    if (m.escalation_polarity === 'no_escalates') { valid = false; price = 1 - price; } else if (m.escalation_polarity === 'neutral') valid = false;
    return { ...m, price: Number(price), valid };
  }).filter((m) => Number.isFinite(m.price));
  if (!list.length) return null;
  const candidates = list.filter((m) => m.valid).sort((a, b) => b.price - a.price);
  const champion = candidates[0] || list.sort((a, b) => b.price - a.price)[0];
  const value = Math.round(100 * champion.price);
  return { value, raw: 100 * champion.price, band: band(value), label: NEH_BANDS[band(value)].label, driver: champion.label || '', markets: list.length };
}

async function readNeh() {
  const d = await getJson(`${BASE}/api/neh-index/doomsday`);
  const r = nehFromMarkets(d && d.markets);
  if (!r) throw new Error('PizzINT didn’t publish any markets for the index.');
  return { ...r, publishedAt: Date.parse(d.timestamp || '') || null };
}

const SOURCES = { doughcon: readDoughcon, neh: readNeh };

function createPizzint(dataDir) {
  const file = path.join(dataDir, 'pizzint.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch {}
  const inflight = new Map();
  const lastTry = new Map();

  const persist = () => fs.promises.writeFile(file, JSON.stringify(saved, null, 2)).catch(() => {});

  // Returns { reading, updatedAt, stale, error, changed, throttled }.
  async function get(kind, { force = false } = {}) {
    const read = SOURCES[kind];
    if (!read) throw new Error('Unknown PizzINT reading.');
    const last = saved[kind];
    const now = Date.now();
    const fresh = last && now - last.updatedAt < TTL;
    if (!force && fresh) return { ...last, stale: false, changed: false };
    if (force && now - (lastTry.get(kind) || 0) < MIN_GAP && last) {
      return { ...last, stale: !fresh && !!last.error, changed: false, throttled: true };
    }
    if (inflight.has(kind)) return inflight.get(kind);
    lastTry.set(kind, now);
    const p = read().then(
      (reading) => {
        const changed = !last || JSON.stringify(last.reading) !== JSON.stringify(reading);
        saved[kind] = { reading, updatedAt: Date.now() };
        persist();
        return { ...saved[kind], stale: false, changed };
      },
      (err) => {
        if (!last) throw err;
        // Keep showing the last good reading, marked stale.
        return { ...last, stale: true, error: err.message, changed: false };
      },
    ).finally(() => inflight.delete(kind));
    inflight.set(kind, p);
    return p;
  }

  return { get };
}

module.exports = { createPizzint, nehFromMarkets, NEH_BANDS, DOUGHCON };
