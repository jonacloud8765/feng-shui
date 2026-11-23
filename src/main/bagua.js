'use strict';

// The Feng Shui layout's own arrangement: the desk read as a room.
//
// The Dock is the entrance and the far edge of the screen is the back wall.
// A 3x3 bagua is laid over the screen and every widget is given a zone, one of
// the Five Elements, a yin or yang leaning and a visual weight. Widgets are
// seated in their zone, sized from a modest preferred size, and then the
// balance rules are applied: no widget over 22% of the room, the largest at
// most 2.5x the smallest (where the widgets' minimum sizes allow it), Fire no
// more than Water + 1, at most one quiet widget in an open centre, even 8px
// gutters and a 16px margin on the 8px grid.
//
// This is used only while the Feng Shui layout is active; other layouts keep
// the column arrangement in fengshui.js.

const GRID = 8;
const MARGIN = 32;
const BAR = 40; // the layout bar along the top
const TITLE = 0; // the skin adds no title bar; kept so minimum heights stay explicit

// Zones by [column, row], seen from the Dock looking in.
const ZONES = {
  wealth: [0, 0], fame: [1, 0], love: [2, 0],
  family: [0, 1], center: [1, 1], children: [2, 1],
  knowledge: [0, 2], career: [1, 2], helpful: [2, 2],
};
// The element of each gua, for finding a neighbouring cell with a matching element.
const ZONE_ELEMENT = { wealth: 'wood', fame: 'fire', love: 'earth', family: 'wood', center: 'earth', children: 'metal', knowledge: 'earth', career: 'water', helpful: 'metal' };
const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
const HANZI = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };

// zone, element, yang?, preferred size (with the title bar), busy?
const MAP = {
  clock: ['knowledge', 'metal', true, [248, 128]],
  countdown: ['career', 'water', false, [248, 136]],
  stopwatch: ['children', 'metal', true, [224, 112]],
  worldclock: ['helpful', 'water', false, [248, 152]],
  weather: ['knowledge', 'wood', true, [232, 152]],
  random: ['wealth', 'water', false, [184, 152]],
  launcher: ['helpful', 'metal', true, [256, 112]],
  cabinet: ['knowledge', 'metal', true, [480, 384]],
  records: ['fame', 'fire', true, [560, 360], true],
  library: ['knowledge', 'wood', false, [640, 420], true],
  note: ['children', 'wood', true, [240, 232]],
  board: ['knowledge', 'metal', true, [400, 272]],
  cork: ['family', 'wood', true, [272, 344], true],
  image: ['family', 'earth', false, [272, 192]],
  films: ['children', 'fire', true, [400, 256], true],
  watched: ['fame', 'fire', true, [240, 152]],
  doughcon: ['fame', 'fire', false, [280, 136]],
  nuke: ['fame', 'fire', true, [208, 168]],
  neh: ['center', 'earth', false, [216, 184]],
  page: [null, null, false, [400, 304]],
};

// §4.1: classify a widget we have no row for (or a custom page) from words.
const KEYWORDS = [
  [/world|timezone|map|travel|flight/, 'helpful', 'water', false],
  [/countdown|deadline|service|enlist|remaining/, 'career', 'water', false],
  [/stopwatch|lap|sport/, 'children', 'metal', true],
  [/time|clock|timer|alarm|schedule|calendar/, 'knowledge', 'metal', true],
  [/film|movie|watchlist|cinema|\btv\b|trailer|episode/, 'children', 'fire', true],
  [/partner|love|wedding/, 'love', 'earth', false],
  [/photo|image|portrait|album|family|home/, 'family', 'earth', false],
  [/note|memo|list|todo|idea|draw|sketch|white|cork|pin/, 'children', 'wood', true],
  [/file|folder|disk|cabinet|archive|finder/, 'knowledge', 'metal', true],
  [/launch|apps|shortcut|dock|contacts|people/, 'helpful', 'metal', true],
  [/weather|forecast|moon|season|plant|garden/, 'knowledge', 'wood', true],
  [/random|dice|luck|fortune|coin|stock|money|price/, 'wealth', 'water', false],
  [/status|alert|warning|defcon|threat|missile|nuke|siren|heat/, 'fame', 'fire', true],
  [/nothing|empty|zen|calm|blank|breathe|health/, 'center', 'earth', false],
];

function words(w) {
  const c = w.config || {};
  const file = String(c.file || '').split('/').pop().replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ');
  return `${c.title || ''} ${c.label || ''} ${file} ${w.type}`.toLowerCase();
}

// A short, plain title for the widget (used in the arrangement report and tests).
function titleOf(w, typeName) {
  const c = w.config || {};
  const t = String(c.title || '').replace(/<[^>]*>/g, '').trim();
  if (t) return t;
  if (w.type === 'page' && c.file) {
    const f = String(c.file).split('/').pop().replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ').trim();
    const last = f.split(' ').filter(Boolean);
    // "something-service" reads best as its last word.
    if (/service|countdown/.test(f)) return last[last.length - 1].replace(/^./, (m) => m.toUpperCase());
    return f.replace(/\b\w/g, (m) => m.toUpperCase());
  }
  return typeName || w.type;
}

function classify(w) {
  const c = w.config || {};
  if (c.fsZone && ZONES[c.fsZone] && HANZI[c.fsElement]) return { zone: c.fsZone, element: c.fsElement, yang: !!c.fsYang };
  const row = MAP[w.type];
  if (row && row[0]) {
    // A photo of a partner belongs to Love; a poster or a prize to Fame.
    if (w.type === 'image' && /partner|love|wedding/.test(words(w))) return { zone: 'love', element: 'earth', yang: false };
    return { zone: row[0], element: row[1], yang: row[2] };
  }
  const text = words(w);
  for (const [re, zone, element, yang] of KEYWORDS) if (re.test(text)) return { zone, element, yang };
  return { zone: 'family', element: 'earth', yang: false }; // last resort: modest, beside the centre
}

const snap = (v) => Math.round(v / GRID) * GRID;
const area = (s) => s.width * s.height;

// §5.3 visual weight.
function weightOf(it) {
  const chroma = { fire: 0.9, wood: 0.5, water: 0.4, earth: 0.4, metal: 0.2 }[it.element] || 0.3;
  return area(it.size) * (1 + 0.35 * chroma + 0.25 * (it.busy ? 1 : 0) + 0.2 * (it.element === 'fire' ? 1 : 0));
}

// One step smaller: 16px off the longer side, keeping the shape.
function shrink(it) {
  const s = it.size;
  const aspect = s.width / s.height;
  let width = s.width, height = s.height;
  if (width >= height) { width -= 16; height = width / aspect; } else { height -= 16; width = height * aspect; }
  width = Math.max(it.min.width, snap(width));
  height = Math.max(it.min.height, snap(height));
  if (width === s.width && height === s.height) return false;
  it.size = { width, height };
  return true;
}

function grow(it, limit) {
  const s = it.size;
  const aspect = s.width / s.height;
  let width = s.width, height = s.height;
  if (width >= height) { width += 16; height = width / aspect; } else { height += 16; width = height * aspect; }
  width = snap(width); height = snap(height);
  if (width > limit.width || height > limit.height || (it.max && (width > it.max.width || height > it.max.height))) return false;
  it.size = { width, height };
  return true;
}

// widgets: [{ id, type, config, bounds, min, max }]; work: the screen's work area.
// Returns { placed: { [id]: bounds }, report } where report lists the checks.
function arrange(widgets, work) {
  if (!widgets.length) return { placed: {}, report: {} };
  // The room, inside the margin, with its edges on the 8px grid.
  const left = Math.ceil((work.x + MARGIN) / GRID) * GRID, top = Math.ceil((work.y + MARGIN + BAR) / GRID) * GRID;
  const right = Math.floor((work.x + work.width - MARGIN) / GRID) * GRID, bottomEdge = Math.floor((work.y + work.height - MARGIN) / GRID) * GRID;
  const content = { x: left, y: top, width: right - left, height: bottomEdge - top };
  // Generous gutters: liquid glass needs room to breathe.
  const gutter = work.width >= 1600 ? 32 : 24;
  const cellW = (content.width - 2 * gutter) / 3;
  const cellH = (content.height - 2 * gutter) / 3;
  const contentArea = content.width * content.height;
  const maxArea = 0.22 * contentArea;

  // 1. Classify.
  const items = widgets.map((w) => {
    const k = classify(w);
    const row = MAP[w.type] || [];
    let pref = row[3] || [w.bounds.width, w.bounds.height];
    // A custom page keeps its own shape.
    if (w.type === 'page') { const a = w.bounds.width / w.bounds.height; pref = [400, 400 / a]; }
    const up = (v) => Math.ceil(v / GRID) * GRID;
    const min = { width: up(Math.max(160, w.min?.width || 0)), height: up(Math.max(96, (w.min?.height || 0) + TITLE)) };
    const it = { ...w, ...k, busy: !!row[4], min, max: w.max, size: { width: snap(Math.max(min.width, pref[0])), height: snap(Math.max(min.height, pref[1])) } };
    // Never wider than one cell plus a gutter, nor taller than a cell (lists may fill a cell).
    const limW = cellW + (['cork', 'cabinet', 'films'].includes(w.type) ? 0 : gutter);
    // A portrait corkboard may hang down past its cell (Family spills toward Knowledge).
    const limH = w.type === 'cork' ? cellH * 1.5 : cellH;
    while ((it.size.width > limW || it.size.height > limH) && shrink(it));
    it.weight = weightOf(it);
    return it;
  });

  // 2. First seat, heaviest first, at most 3 to a cell.
  const occupancy = Object.fromEntries(Object.keys(ZONES).map((z) => [z, []]));
  const heaviest = Math.max(...items.map((it) => it.weight));
  const free = (z) => occupancy[z].length < 3 && occupancy[z].reduce((t, it) => t + area(it.size), 0) < maxArea;
  function nextBest(it) {
    const order = [];
    for (const [z, el] of Object.entries(ZONE_ELEMENT)) if (el === it.element) order.push(z);
    for (const [z, el] of Object.entries(ZONE_ELEMENT)) if (GENERATES[el] === it.element || GENERATES[it.element] === el) order.push(z);
    const rest = Object.keys(ZONES).filter((z) => z !== 'center').sort((a, b) => occupancy[a].length - occupancy[b].length);
    order.push(...rest);
    return order.find((z) => z !== 'center' && free(z)) || rest[0];
  }
  for (const it of [...items].sort((a, b) => b.weight - a.weight)) {
    let zone = it.zone;
    if (zone === 'center' && (occupancy.center.length || it.element === 'fire' || it.weight === heaviest || it.yang)) {
      zone = occupancy.family.length <= occupancy.knowledge.length ? 'family' : 'knowledge';
    }
    if (!free(zone)) zone = nextBest(it);
    it.cell = zone;
    occupancy[zone].push(it);
  }

  // Fire no more than Water + 1: seat a Fire widget in Career (a Water
  // sector restrains it), else make every Fire widget a step smaller.
  const count = (el) => items.filter((it) => it.element === el).length;
  if (count('fire') > count('water') + 1) {
    const fires = items.filter((it) => it.element === 'fire' && it.cell !== 'career').sort((a, b) => a.weight - b.weight);
    if (fires.length && free('career')) {
      const f = fires[0];
      occupancy[f.cell] = occupancy[f.cell].filter((x) => x !== f);
      f.cell = 'career';
      occupancy.career.push(f);
    } else for (const f of items.filter((it) => it.element === 'fire')) shrink(f);
  }

  // 3. Sizes: each cell's stack fits its cell; no widget over 22% of the room;
  // the largest at most 2.5x the smallest where minimum sizes allow it.
  for (const z of Object.keys(ZONES)) {
    const list = occupancy[z];
    let guard = 200;
    while (list.length && list.reduce((t, it) => t + it.size.height, 0) + gutter * (list.length - 1) > cellH * (list.length > 1 ? 1.5 : 1) && guard--) {
      const tall = list.reduce((a, b) => (b.size.height > a.size.height ? b : a));
      if (!shrink(tall)) break;
    }
  }
  for (const it of items) while (area(it.size) > maxArea && shrink(it));
  for (let guard = 0; guard < 400; guard++) {
    const sorted = [...items].sort((a, b) => area(a.size) - area(b.size));
    const small = sorted[0], big = sorted[sorted.length - 1];
    if (area(big.size) <= 2.5 * area(small.size)) break;
    if (shrink(big)) continue;
    if (!grow(small, { width: cellW, height: cellH })) break;
  }
  // The centre widget sits at or below the median size.
  if (occupancy.center.length) {
    const areas = items.map((it) => area(it.size)).sort((a, b) => a - b);
    const median = areas[Math.floor(areas.length / 2)];
    const c = occupancy.center[0];
    while (area(c.size) > median && shrink(c));
  }

  // Each screen column (its three cells) must fit the room's height.
  const COLUMN_ZONES = [['wealth', 'family', 'knowledge'], ['fame', 'center', 'career'], ['love', 'children', 'helpful']];
  for (const zones of COLUMN_ZONES) {
    const members = zones.flatMap((z) => occupancy[z]);
    const used = () => members.reduce((t, it) => t + it.size.height, 0) + gutter * Math.max(0, members.length - 1) + gutter * 2;
    let guard = 300;
    while (members.length && used() > content.height && guard--) {
      const tall = members.reduce((a, b) => (b.size.height > a.size.height ? b : a));
      if (!shrink(tall) && !members.some((m) => m !== tall && shrink(m))) break;
    }
  }

  // 4. Pack. Each screen column is one quiet stack: its widgets share one
  // width, sit an even distance apart, and the stack is centred in the room's
  // height, so the three columns mirror each other. The left column rests on
  // the left wall, the right column on the right wall, the middle is centred.
  const placed = {};
  const colX = [content.x, content.x + cellW + gutter, content.x + 2 * (cellW + gutter)];
  COLUMN_ZONES.forEach((zones, ci) => {
    const members = zones.flatMap((z) => occupancy[z]);
    if (!members.length) return;
    // One width for the column, where each widget's limits allow it.
    const colW = Math.min(snap(cellW), Math.max(...members.map((m) => m.size.width)));
    for (const m of members) {
      const w = Math.max(m.min.width, Math.min(colW, m.max?.width || colW));
      if (['cork', 'image', 'films', 'page', 'cabinet', 'board'].includes(m.type)) {
        // Shaped widgets keep their proportions.
        const a = m.size.width / m.size.height;
        m.size = { width: w, height: Math.max(m.min.height, snap(w / a)) };
      } else m.size = { width: w, height: m.size.height };
    }
    const used = () => members.reduce((t, m) => t + m.size.height, 0);
    let guard = 300;
    while (used() + gutter * (members.length - 1) > content.height && guard--) {
      const tall = members.reduce((a, b) => (b.size.height > a.size.height ? b : a));
      if (!shrink(tall)) break;
    }
    const free = content.height - used();
    const gap = members.length > 1 ? Math.max(gutter, Math.min(56, free / (members.length + 1))) : 0;
    let y = content.y + (content.height - used() - gap * (members.length - 1)) / 2;
    for (const it of members) {
      let x;
      if (ci === 0) x = colX[0];
      else if (ci === 2) x = colX[2] + cellW - it.size.width;
      else x = colX[1] + (cellW - it.size.width) / 2;
      placed[it.id] = { x: snap(x), y: snap(y), width: it.size.width, height: it.size.height };
      y += it.size.height + gap;
    }
  });

  // Keep everything inside the room after snapping.
  for (const b of Object.values(placed)) {
    b.x = snap(Math.max(content.x, Math.min(b.x, content.x + content.width - b.width)));
    b.y = snap(Math.max(content.y, Math.min(b.y, content.y + content.height - b.height)));
  }

  // Report the balance checks (used by the tests and for tuning).
  const total = items.reduce((t, it) => t + it.weight, 0);
  const mid = { x: content.x + content.width / 2, y: content.y + content.height / 2 };
  const quad = [0, 0, 0, 0];
  let cx = 0, cy = 0;
  for (const it of items) {
    const b = placed[it.id];
    const px = b.x + b.width / 2, py = b.y + b.height / 2;
    quad[(px < mid.x ? 0 : 1) + (py < mid.y ? 0 : 2)] += it.weight;
    cx += px * it.weight; cy += py * it.weight;
  }
  const report = {
    elements: Object.fromEntries(Object.keys(HANZI).map((e) => [e, count(e)])),
    yang: items.filter((it) => it.yang).length,
    yin: items.filter((it) => !it.yang).length,
    quadrants: quad.map((q) => q / total),
    centroid: { x: (cx / total - content.x) / content.width, y: (cy / total - content.y) / content.height },
    ratio: Math.max(...items.map((it) => area(it.size))) / Math.min(...items.map((it) => area(it.size))),
    cells: Object.fromEntries(items.map((it) => [it.id, it.cell])),
  };
  return { placed, report };
}

// What the skin needs to draw a widget: its element, seal and title.
function skinFor(w, typeName) {
  const k = classify(w);
  return { name: 'fengshui', element: k.element, seal: HANZI[k.element], title: titleOf(w, typeName), zone: k.zone };
}

const isFengShuiLayout = (layout) => !!layout && (layout.skin === 'fengshui' || (layout.skin == null && /feng\s*shui/i.test(layout.name)));

module.exports = { arrange, classify, skinFor, isFengShuiLayout, TITLE, HANZI };
