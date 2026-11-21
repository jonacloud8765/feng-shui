'use strict';

// Feng Shui: rearranges a layout into a calm, balanced composition.
//
// One widget is the heart of the desktop and sits in the middle: the one
// already nearest the centre, as long as it's a substantial widget, otherwise
// the largest. Long, low widgets (a dock of apps, a world clock strip) rest in
// a row beneath the heart. Everything else is shared between the left and the
// right so both sides carry about the same visual weight; a side that's too
// crowded for one column flows into two. Each group is centred top to bottom
// with even breathing room. Sizes are kept where they fit and gently reduced
// where they don't (never below a widget's minimum). The lower-right corner is
// left clear for the Feng Shui button itself.

const MARGIN = 32;
const GAP = 22;
const BUTTON = 56; // kept clear at the bottom for the Feng Shui button

const area = (s) => s.width * s.height;

// Scale a size down to fit maxW x maxH, keeping its shape. A widget is never
// made smaller than its minimum, so it may stay a little larger than asked.
function fit(size, maxW, maxH, min) {
  let k = Math.min(1, maxW / size.width, maxH / size.height);
  k = Math.max(k, min.width / size.width, min.height / size.height);
  return { width: Math.round(size.width * k), height: Math.round(size.height * k) };
}

// Choose the heart: nearest the centre among widgets at least half the size of
// the largest one.
function pickHeart(widgets, box) {
  const biggest = Math.max(...widgets.map((w) => area(w.bounds)));
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dist = (w) => Math.hypot(w.bounds.x + w.bounds.width / 2 - cx, w.bounds.y + w.bounds.height / 2 - cy);
  return widgets
    .filter((w) => area(w.bounds) >= biggest / 2)
    .sort((a, b) => dist(a) - dist(b) || area(b.bounds) - area(a.bounds))[0];
}

// Every way of sharing items between n non-empty columns (small n and lists only).
function* partitions(items, n) {
  const pick = new Array(items.length).fill(0);
  const total = n ** items.length;
  for (let code = 0; code < total; code++) {
    let c = code;
    for (let i = 0; i < items.length; i++) { pick[i] = c % n; c = Math.floor(c / n); }
    if (pick[0] !== 0) continue; // mirror images are the same layout
    const cols = Array.from({ length: n }, () => []);
    items.forEach((it, i) => cols[pick[i]].push(it));
    if (cols.every((col) => col.length)) yield cols;
  }
}

// Share a strip's width between columns: each gets at least its widest
// minimum, and the rest in proportion to how wide its widgets want to be.
function widthsFor(cols, avail) {
  const mins = cols.map((col) => Math.max(...col.map((w) => w.min.width)));
  const nat = cols.map((col) => Math.max(...col.map((w) => w.bounds.width)));
  const spare = avail - mins.reduce((t, x) => t + x, 0);
  if (spare < 0) return null;
  const want = nat.reduce((t, x, i) => t + Math.max(0, x - mins[i]), 0) || 1;
  return mins.map((m, i) => Math.min(nat[i], m + (spare * Math.max(0, nat[i] - m)) / want));
}

// Lay out one column of items inside width x height; returns sizes and how much
// they had to shrink (1 = not at all).
function column(col, width, height) {
  let s = col.map((w) => fit(w.bounds, width, height, w.min));
  const sum = () => s.reduce((t, x) => t + x.height, 0);
  for (let n = 0; n < 6 && sum() + GAP * (s.length - 1) > height; n++) {
    const k = (height - GAP * (s.length - 1)) / sum();
    s = s.map((x, j) => fit(x, x.width * k, x.height * k, col[j].min));
  }
  const over = s.reduce((t, x) => t + x.height, 0) + GAP * (s.length - 1) > height + 1 || s.some((x) => x.width > width + 1);
  // How much of each widget's size survives, counted per widget so a small one
  // matters as much as a big one.
  return { s, area: s.reduce((t, x, j) => t + x.width / col[j].bounds.width, 0), over };
}

// Order a column so its largest widget sits in the middle, like a mountain.
function mountain(s) {
  const idx = s.map((_, i) => i).sort((a, b) => area(s[b]) - area(s[a]));
  const order = [];
  idx.forEach((i, n) => (n % 2 ? order.unshift(i) : order.push(i)));
  return order;
}

// Find the best way to stack one side as one to three columns. Fewer columns
// win a near tie because they read calmer.
function plan(items, strip) {
  if (!items.length) return { cols: [], score: 0 };
  let best = null;
  const tries = items.length <= 5 ? Math.min(3, items.length) : Math.min(2, items.length);
  for (let n = 1; n <= tries; n++) {
    for (const parts of partitions(items, n)) {
      const ws = widthsFor(parts, strip.width - GAP * (n - 1));
      if (!ws && n > 1) continue;
      const cols = parts.map((col, i) => ({ col, ...column(col, ws ? ws[i] : strip.width, strip.height) }));
      const score = cols.reduce((t, c) => t + c.area, 0) * (cols.some((c) => c.over) ? 0.3 : 1) * (1 - 0.04 * (n - 1));
      if (!best || score > best.score) best = { cols, score };
    }
  }
  return best;
}

// Place a planned side inside its strip, packed against the heart.
function side(best, strip, hugRight, out, bounds) {
  if (!best.cols.length) return;
  const widths = best.cols.map((c) => Math.max(...c.s.map((x) => x.width)));
  const total = widths.reduce((t, x) => t + x, 0) + GAP * (widths.length - 1);
  // Columns are packed against the heart; the outermost ends near the margin.
  let x = hugRight ? strip.x : strip.x + strip.width - total;
  x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - total));
  // The first column on the right / last on the left touches the heart; put
  // the busiest (tallest) column there so the composition tapers outward.
  const byHeight = [...best.cols.keys()].sort((a, b) => best.cols[b].s.reduce((t, q) => t + q.height, 0) - best.cols[a].s.reduce((t, q) => t + q.height, 0));
  const slots = hugRight ? byHeight : [...byHeight].reverse();
  for (const ci of slots) {
    const { col, s } = best.cols[ci];
    const cw = widths[ci];
    const seq = mountain(s);
    const h = seq.reduce((t, i) => t + s[i].height, 0) + GAP * (seq.length - 1);
    let y = strip.y + Math.max(0, (strip.height - h) / 2);
    for (const i of seq) {
      out[col[i].id] = { x: Math.round(x + (cw - s[i].width) / 2), y: Math.round(y), ...s[i] };
      y += s[i].height + GAP;
    }
    x += cw + GAP;
  }
}

// widgets: [{ id, bounds, min: {width,height} }]; work: {x,y,width,height}.
// Returns { [id]: bounds }.
function arrange(widgets, work) {
  const out = {};
  if (!widgets.length) return out;
  const box = { x: work.x + MARGIN, y: work.y + MARGIN, width: work.width - MARGIN * 2, height: work.height - MARGIN * 2 - BUTTON };
  const heart = pickHeart(widgets, box);
  let rest = widgets.filter((w) => w !== heart);

  // Long, low widgets rest beneath the heart, at most two of them.
  const low = rest.filter((w) => w.bounds.width / w.bounds.height >= 2.6).sort((a, b) => b.bounds.width - a.bounds.width).slice(0, 2);
  rest = rest.filter((w) => !low.includes(w));

  const hs = fit(heart.bounds, box.width * (rest.length ? 0.42 : 0.8), box.height * (low.length ? 0.66 : 0.82), heart.min);
  const lows = low.map((w) => fit(w.bounds, Math.max(hs.width * 1.25, w.min.width), box.height * 0.16, w.min));
  const below = lows.reduce((t, s) => t + s.height + GAP, 0);

  // With a crowded desk, one or two small, wide widgets (a clock, a counter)
  // crown the heart in a row above it, using the space the middle has left.
  let top = [];
  let tops = [];
  const free = box.height - hs.height - below - GAP;
  if (rest.length >= 4 && free >= 70) {
    const wide = rest.filter((w) => w.bounds.width / w.bounds.height >= 1.5 && w.min.height <= free);
    const rowOf = (set) => {
      const sizes = set.map((w) => fit(w.bounds, hs.width, free, w.min));
      const k = Math.min(1, (hs.width - GAP * (set.length - 1)) / sizes.reduce((t, x) => t + x.width, 0));
      const out = sizes.map((x, i) => fit(x, x.width * k, x.height * k, set[i].min));
      const fits = out.reduce((t, x) => t + x.width, 0) + GAP * (set.length - 1) <= hs.width + 1 && out.every((x) => x.height <= free + 1);
      const kept = out.reduce((t, x, i) => t + area(x) / area(set[i].bounds), 0);
      return { set, out, fits, kept };
    };
    let best = null;
    for (let i = 0; i < wide.length; i++) {
      for (const set of [[wide[i]], ...wide.slice(i + 1).map((b) => [wide[i], b])]) {
        const r = rowOf(set);
        if (r.fits && (!best || r.kept > best.kept)) best = r;
      }
    }
    if (best) { top = best.set; tops = best.out; }
  }
  rest = rest.filter((w) => !top.includes(w));

  const rowH = tops.length ? Math.max(...tops.map((s) => s.height)) + GAP : 0;
  const stack = rowH + hs.height + below;
  const heartX = Math.round(box.x + (box.width - hs.width) / 2);
  let y = Math.round(box.y + Math.max(0, (box.height - stack) / 2));
  if (tops.length) {
    const rowW = tops.reduce((t, s) => t + s.width, 0) + GAP * (tops.length - 1);
    let x = box.x + (box.width - rowW) / 2;
    top.forEach((w, i) => {
      out[w.id] = { x: Math.round(x), y: Math.round(y + rowH - GAP - tops[i].height), ...tops[i] };
      x += tops[i].width + GAP;
    });
    y += rowH;
  }
  out[heart.id] = { x: heartX, y, ...hs };
  y += hs.height + GAP;
  low.forEach((w, i) => {
    out[w.id] = { x: Math.round(box.x + (box.width - lows[i].width) / 2), y, ...lows[i] };
    y += lows[i].height + GAP;
  });

  // The sides are as wide as the widest thing in the middle allows.
  const middle = Math.max(hs.width, ...lows.map((s) => s.width));
  const midX = box.x + (box.width - middle) / 2;
  const sideW = Math.max(0, midX - box.x - GAP);

  // Share the rest between left and right: try every split that keeps the
  // two sides close in weight, and keep the one where widgets stay largest.
  const leftStrip = { x: box.x, y: box.y, width: sideW, height: box.height };
  const rightStrip = { x: midX + middle + GAP, y: box.y, width: sideW, height: box.height };
  const total = rest.reduce((t, w) => t + area(w.bounds), 0);
  let best = null;
  const n = Math.min(rest.length, 12);
  for (let mask = 0; mask < 1 << n; mask++) {
    const L = rest.filter((_, i) => i < n && mask & (1 << i)).concat(rest.slice(n).filter((_, i) => i % 2 === 0));
    const R = rest.filter((w) => !L.includes(w));
    if (Math.abs(L.length - R.length) > 2) continue;
    const wl = L.reduce((t, w) => t + area(w.bounds), 0);
    if (total && Math.abs(wl / total - 0.5) > 0.2) continue;
    const pl = plan(L, leftStrip);
    const pr = plan(R, rightStrip);
    const score = pl.score + pr.score - Math.abs(wl / (total || 1) - 0.5);
    if (!best || score > best.score) best = { score, pl, pr };
  }
  if (!best) best = { pl: plan(rest, leftStrip), pr: plan([], rightStrip) };
  side(best.pl, leftStrip, false, out, box);
  side(best.pr, rightStrip, true, out, box);
  return out;
}

module.exports = { arrange };
