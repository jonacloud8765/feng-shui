'use strict';

// Feng Shui: turns a layout into a calm, deliberate dashboard that uses the
// whole screen.
//
// Every widget gets a share of the space that suits what it shows: content
// that rewards room (Films, the Whiteboard, a custom page, a big photo) is
// given a lot of it, glanceable readings (a clock, a counter, a dial) stay
// compact. Widgets are set out in columns that run the full height of the
// screen, like a designed grid: each column is as wide as its widgets need,
// and each widget is as tall as its shape asks for. A widget with a share (the
// corkboard) stands the full height of one side and covers at least that
// fraction of the screen. Many arrangements are tried and scored on how well
// each widget keeps its natural shape, gets the room it deserves and how much
// of the screen is put to use. Each press can step to the next best one.

const MARGIN = 32;
const GAP = 22;
const BOTTOM = 24; // a little breathing room above the Dock edge
const BAR = 40; // kept clear at the top for the layout bar

// weight: how much room the widget deserves; aspect: the shape it looks best in
// (width / height). A missing aspect means "keep the shape it has now".
const PROFILE = {
  films: { weight: 3.2, aspect: 1.75, band: true },
  board: { weight: 4.2, aspect: 1.65 },
  page: { weight: 3, aspect: null },
  image: { weight: 1.5, aspect: null },
  cork: { weight: 2.6, aspect: 0.8 },
  note: { weight: 1.2, aspect: 1.1, cap: [380, 380] },
  neh: { weight: 1.4, aspect: 1.38, cap: [430, 320] },
  doughcon: { weight: 1, aspect: 2.6, cap: [440, 170] },
  weather: { weight: 1.1, aspect: 1.6, cap: [390, 245] },
  worldclock: { weight: 1, aspect: 1.5, cap: [400, 270] },
  clock: { weight: 0.85, aspect: 2, cap: [380, 190] },
  watched: { weight: 0.5, aspect: 1.65, cap: [230, 140] }, // just a small ticket
  stopwatch: { weight: 0.8, aspect: 1.8, cap: [340, 190] },
  countdown: { weight: 0.8, aspect: 1.8, cap: [340, 190] },
  random: { weight: 0.6, aspect: 1.2, cap: [230, 190] },
  launcher: { weight: 1, aspect: 4.6, cap: [660, 140] },
  cabinet: { weight: 3.6, aspect: 1.42 },
  nuke: { weight: 0.5, aspect: 1.25, cap: [230, 185] },
};
// A cap is the size past which a glanceable widget shows nothing more: it stays
// compact and leaves the rest of the screen to the widgets that use it.
const TOLERANCE = 1.3; // a cell may stretch a widget's shape by this much before it floats inside it

const area = (s) => s.width * s.height;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function profile(w) {
  const p = PROFILE[w.type] || {};
  const now = w.bounds.width / w.bounds.height;
  let weight = p.weight ?? Math.sqrt(area(w.bounds) / 60000);
  // Photos differ a lot in importance; let their current size speak too.
  let cap = p.cap ? { width: p.cap[0], height: p.cap[1] } : null;
  if (w.type === 'image') {
    weight *= clamp(Math.sqrt(area(w.bounds) / 90000), 0.6, 1.8);
    cap = { width: Math.max(320, w.bounds.width * 2.2), height: Math.max(320, w.bounds.height * 2.2) };
  }
  if (cap && w.max) cap = { width: Math.min(cap.width, w.max.width), height: Math.min(cap.height, w.max.height) };
  return { weight, aspect: p.aspect || now, cap };
}

// The largest rectangle of (about) the given shape inside a cell, within the
// widget's minimum and maximum size.
function fitCell(cell, aspect, min, max) {
  const ca = cell.width / cell.height;
  let width = cell.width;
  let height = cell.height;
  if (ca > aspect * TOLERANCE) width = height * aspect * TOLERANCE;
  else if (ca < aspect / TOLERANCE) height = width / (aspect / TOLERANCE);
  if (max) { width = Math.min(width, max.width); height = Math.min(height, max.height); }
  width = Math.max(width, min.width);
  height = Math.max(height, min.height);
  return { width: Math.round(width), height: Math.round(height) };
}

// A small seeded random generator, so the same layout always gives the same answers.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Scale a set of lengths to their total, but no length past its limit: what a
// limited one can't take goes to the others.
function spread(want, limit) {
  const total = want.reduce((t, x) => t + x, 0);
  const out = want.slice();
  let free = out.map((_, i) => i);
  for (let pass = 0; pass < want.length; pass++) {
    const fixed = out.reduce((t, x, i) => t + (free.includes(i) ? 0 : x), 0);
    const base = free.reduce((t, i) => t + want[i], 0);
    if (!base) break;
    let changed = false;
    for (const i of free) out[i] = ((total - fixed) * want[i]) / base;
    for (const i of free) if (out[i] > limit[i]) { out[i] = limit[i]; changed = true; }
    if (!changed) break;
    free = free.filter((i) => out[i] < limit[i]);
    if (!free.length) break;
  }
  return out;
}

// Lay out columns of items inside a region. Returns placements and a score
// (lower is better).
function layoutColumns(cols, region, totalWeight) {
  const C = cols.length;
  const availW = region.width - GAP * (C - 1);
  // A column wants the width that lets its widgets keep their shapes at full
  // height, and a share of the screen that matches its weight; blend the two.
  const nat = cols.map((col) => (region.height - GAP * (col.length - 1)) / col.reduce((t, it) => t + 1 / it.aspect, 0));
  const wt = cols.map((col) => col.reduce((t, it) => t + it.weight, 0));
  const natSum = nat.reduce((t, x) => t + x, 0);
  const wtSum = wt.reduce((t, x) => t + x, 0);
  const widths = spread(cols.map((_, c) => availW * (0.55 * nat[c] / natSum + 0.45 * wt[c] / wtSum)),
    cols.map((col) => (col.every((it) => it.cap) ? Math.max(...col.map((it) => it.cap.width)) : Infinity)));
  const out = [];
  let score = 0;
  let used = 0;
  let x = region.x;
  cols.forEach((col, c) => {
    const cw = widths[c];
    const availH = region.height - GAP * (col.length - 1);
    const inv = col.reduce((t, it) => t + 1 / it.aspect, 0);
    const wsum = wt[c];
    const heights = spread(col.map((it) => availH * (0.65 * (1 / it.aspect) / inv + 0.35 * it.weight / wsum)),
      col.map((it) => (it.cap ? Math.min(it.cap.height, cw / it.aspect * TOLERANCE) : Infinity)));
    // Whatever height is left over (a column of compact widgets) is shared out
    // as even space around them, so they sit centred as a group.
    const spare = Math.max(0, availH - heights.reduce((t, x) => t + x, 0));
    let y = region.y + spare / (col.length + 1);
    col.forEach((it, i) => {
      const ch = heights[i];
      const lim = it.cap ? { width: Math.min(it.cap.width, it.max ? it.max.width : Infinity), height: Math.min(it.cap.height, it.max ? it.max.height : Infinity) } : it.max;
      const size = fitCell({ width: cw, height: ch }, it.aspect, it.min, lim);
      // Too small for the widget: it would spill out of its cell.
      if (size.width > cw + 1 || size.height > ch + 1) score += 25;
      if (!it.cap) score += it.weight * Math.abs(Math.log(cw / ch / it.aspect)) * 1.2;
      let share = (it.weight / totalWeight) * region.width * region.height;
      if (it.cap) share = Math.min(share, area(it.cap));
      // A compact widget squeezed well under its comfortable size gets hard to read.
      if (it.cap && area(size) < 0.6 * area(it.cap)) score += 4 * Math.log((0.6 * area(it.cap)) / Math.max(1, area(size)));
      const ratio = Math.log(Math.max(1, area(size)) / share);
      // Content widgets that end up cramped cost the most: they are the point.
      score += it.cap ? 0.8 * Math.abs(ratio) : 0.8 * Math.abs(ratio) + (ratio < 0 ? it.weight * 1.4 * -ratio : 0);
      const width = Math.min(size.width, Math.round(cw));
      const height = Math.min(size.height, Math.round(ch));
      used += width * height * (it.cap ? 0.5 : 1);
      out.push({ id: it.id, x: Math.round(x + (cw - width) / 2), y: Math.round(y + (ch - height) / 2), width, height });
      y += ch + GAP + spare / (col.length + 1);
    });
    x += cw + GAP;
  });
  // Reward putting the screen to use, and a calm number of columns.
  score -= 6 * (used / (region.width * region.height));
  score += 0.15 * C;
  return { out, score };
}

// The best few distinct arrangements of the free widgets in the region, best first.
function candidates(items, region) {
  const totalWeight = items.reduce((t, it) => t + it.weight, 0);
  const results = [];
  const seen = new Set();
  const rand = rng(items.length * 7919 + Math.round(region.width));
  const maxC = Math.min(5, items.length);
  for (let C = 1; C <= maxC; C++) {
    for (let trial = 0; trial < 500; trial++) {
      // Heaviest first, each into the lightest column, with a little chance.
      const order = items.map((it) => ({ it, k: it.weight * (0.6 + rand() * 0.8) })).sort((a, b) => b.k - a.k).map((o) => o.it);
      const cols = Array.from({ length: C }, () => []);
      const load = new Array(C).fill(0);
      for (const it of order) {
        let best = 0;
        for (let c = 1; c < C; c++) if (load[c] + rand() * 0.6 < load[best]) best = c;
        if (trial % 3 === 0) best = Math.floor(rand() * C);
        cols[best].push(it);
        load[best] += it.weight;
      }
      if (cols.some((col) => !col.length)) continue;
      // Inside a column the heaviest widget sits in the middle.
      for (const col of cols) {
        col.sort((a, b) => b.weight - a.weight);
        const m = [];
        col.forEach((it, i) => (i % 2 ? m.unshift(it) : m.push(it)));
        if (rand() < 0.3) m.reverse();
        col.splice(0, col.length, ...m);
      }
      // The heaviest column in the middle of the screen.
      const byLoad = cols.map((col) => ({ col, w: col.reduce((t, it) => t + it.weight, 0) })).sort((a, b) => b.w - a.w);
      const arranged = [];
      byLoad.forEach((o, i) => (i % 2 ? arranged.unshift(o.col) : arranged.push(o.col)));
      if (rand() < 0.5) arranged.reverse();
      const key = arranged.map((col) => col.map((it) => it.id).join(',')).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const r = layoutColumns(arranged, region, totalWeight);
      results.push({ ...r, group: arranged.map((col) => col.map((it) => it.id).sort().join(',')).sort().join('|') });
    }
  }
  results.sort((a, b) => a.score - b.score);
  // Keep the best of each distinct grouping so the next press shows something new.
  const distinct = [];
  const groups = new Set();
  for (const r of results) {
    if (groups.has(r.group)) continue;
    // Only offer arrangements nearly as good as the best one.
    if (distinct.length && r.score > distinct[0].score + 2.5) break;
    groups.add(r.group);
    distinct.push(r);
    if (distinct.length >= 4) break;
  }
  return distinct;
}

function prepare(widgets, work) {
  const box = { x: work.x + MARGIN, y: work.y + MARGIN + BAR, width: work.width - MARGIN * 2, height: work.height - MARGIN * 2 - BAR - BOTTOM };
  const items = widgets.map((w) => ({ ...w, ...profile(w), min: w.min || { width: 80, height: 60 }, max: w.max }));
  // A widget with a share (the corkboard) stands the full height of one side.
  const anchored = items.filter((it) => it.share).map((it) => {
    const width = clamp(Math.ceil((it.share * work.width * work.height) / box.height), it.min.width, box.width * 0.45);
    return { ...it, size: { width: Math.round(width), height: Math.round(box.height) } };
  });
  let free = items.filter((it) => !it.share);
  let region = { ...box };
  const placed = {};
  anchored.forEach((it, i) => {
    const left = i % 2 === 0;
    placed[it.id] = { x: left ? region.x : region.x + region.width - it.size.width, y: box.y, ...it.size };
    region = { ...region, x: left ? region.x + it.size.width + GAP : region.x, width: region.width - it.size.width - GAP };
  });
  // A wide widget (Films) gets a full-width band across the top of what is
  // left, so its posters run in long rows; the rest are set out below it.
  const bands = free.filter((it) => PROFILE[it.type]?.band);
  if (bands.length && free.length > bands.length) {
    free = free.filter((it) => !bands.includes(it));
    for (const it of bands) {
      // The fewer widgets below, the deeper the band.
      const others = free.length;
      const h = Math.round(clamp(region.width / it.aspect, region.height * 0.4, region.height * clamp(0.64 - 0.025 * others, 0.42, 0.64)));
      const width = Math.round(it.max ? Math.min(region.width, it.max.width) : region.width);
      placed[it.id] = { x: Math.round(region.x + (region.width - width) / 2), y: region.y, width, height: h };
      region = { ...region, y: region.y + h + GAP, height: region.height - h - GAP };
    }
  }
  return { placed, free, region };
}

// widgets: [{ id, type, bounds, min, max?, share? }]; work: {x,y,width,height}.
// variant picks the next best arrangement (variant / 2), mirrored on odd ones.
// Returns { [id]: bounds }.
function arrange(widgets, work, { variant = 0 } = {}) {
  if (!widgets.length) return {};
  const { placed, free, region } = prepare(widgets, work);
  const out = { ...placed };
  if (free.length) {
    const list = candidates(free, region);
    const pick = list[Math.floor(variant / 2) % list.length];
    for (const b of pick.out) out[b.id] = { x: b.x, y: b.y, width: b.width, height: b.height };
  }
  if (variant % 2 === 1) {
    for (const b of Object.values(out)) b.x = Math.round(2 * work.x + work.width - b.x - b.width);
  }
  return out;
}

// How many different arrangements a press can cycle through (each also mirrored).
function variants(widgets, work = { x: 0, y: 25, width: 1440, height: 790 }) {
  const { free, region } = prepare(widgets, work);
  return free.length ? candidates(free, region).length * 2 : 2;
}

module.exports = { arrange, variants };
