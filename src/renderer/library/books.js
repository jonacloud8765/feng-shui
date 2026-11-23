// Books for the Library: each one a separate 3D object with front and back
// covers, a spine, a page block with page edges and, for hardcovers, boards
// that overhang the pages, a rounded spine and headbands.
//
// Geometry is shared (unit shapes scaled per book); each book has its own
// front, back and spine materials and two levels of detail: the full model
// for books near the camera, a single textured block for books further away.
//
// Front covers are the real cover images. Spines and backs are drawn here
// from the book's own details (title, author, publisher, description, ISBN
// barcode) in the cover's colour, and the inspection panel says that they are
// approximations.

import * as T from '../records/three.js';

// ---------------------------------------------------------------- helpers

export function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const css = ([r, g, b], k = 1) => `rgb(${clamp(Math.round(r * k), 0, 255)},${clamp(Math.round(g * k), 0, 255)},${clamp(Math.round(b * k), 0, 255)})`;
const SERIF = '"New York", "Iowan Old Style", ui-serif, Georgia, serif';
const SANS = '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif';

// A quiet colour for a book with no cover image, chosen from its title.
const QUIET = [[86, 52, 44], [44, 58, 72], [62, 70, 54], [118, 96, 70], [40, 40, 44], [140, 120, 98], [72, 46, 62], [30, 54, 56], [164, 150, 128], [96, 34, 30]];
export function toneOf(b) {
  if (Array.isArray(b.tone) && b.tone.length === 3) return b.tone;
  return QUIET[hash(b.title) % QUIET.length];
}

// ---------------------------------------------------------------- dimensions

export function kindOf(b) {
  const f = String(b.format || '').toLowerCase();
  if (/hardcover|hardback|library binding|leather/.test(f)) return 'hardcover';
  if (/mass market/.test(f)) return 'mass';
  return 'paperback';
}

// Real proportions: height by binding, width from the cover image's shape,
// thickness from the page count. Without a page count, a middling thickness
// that varies a little from book to book.
export function dimsOf(b) {
  const kind = kindOf(b);
  const r = rng(hash(b.id || b.title));
  const H = kind === 'hardcover' ? 0.236 + r() * 0.012 : kind === 'mass' ? 0.175 : 0.2 + r() * 0.016;
  const aspect = clamp(Number(b.coverAspect) || 0.655 + r() * 0.04, 0.5, 0.86);
  const W = H * aspect;
  const pages = Number(b.pages) || 220 + Math.floor(r() * 180);
  const T0 = pages * 0.000062 + (kind === 'hardcover' ? 0.0062 : 0.0014);
  return { kind, W, H, T: clamp(T0, 0.007, 0.075) };
}

// ---------------------------------------------------------------- shared geometry & materials

const unitBox = new T.BoxGeometry(1, 1, 1);
const unitPlane = new T.PlaneGeometry(1, 1);
// A rounded spine: x from 0 at the boards out to -1 in the middle, z across the thickness.
const roundSpine = (() => {
  const g = new T.PlaneGeometry(1, 1, 14, 1);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const z = u - 0.5;
    p.setXYZ(i, -Math.sqrt(Math.max(0, 1 - (2 * z) * (2 * z))), v - 0.5, z);
  }
  g.computeVertexNormals();
  return g;
})();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true) {
  const t = new T.CanvasTexture(c);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Page edges: fine lines of paper, slightly uneven, darker towards the covers.
function pagesTexture(vertical) {
  const S = 512, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#d8ccb3'; x.fillRect(0, 0, S, S);
  const r = rng(vertical ? 7 : 11);
  for (let i = 0; i < S; i += 1) {
    const a = 0.05 + r() * 0.12;
    x.fillStyle = r() < 0.5 ? `rgba(120,100,70,${a})` : `rgba(255,252,240,${a})`;
    if (vertical) x.fillRect(i, 0, 1, S); else x.fillRect(0, i, S, 1);
  }
  const g = vertical ? x.createLinearGradient(0, 0, S, 0) : x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(70,55,35,0.28)'); g.addColorStop(0.06, 'rgba(70,55,35,0)'); g.addColorStop(0.94, 'rgba(70,55,35,0)'); g.addColorStop(1, 'rgba(70,55,35,0.28)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return tex(c);
}

export const shared = {
  pagesV: new T.MeshStandardMaterial({ map: pagesTexture(true), roughness: 0.92 }),
  pagesH: new T.MeshStandardMaterial({ map: pagesTexture(false), roughness: 0.92 }),
  endpaper: new T.MeshStandardMaterial({ color: '#e9dfca', roughness: 0.9 }),
  headband: new T.MeshStandardMaterial({ color: '#8c2f2a', roughness: 0.6 }),
};

// ---------------------------------------------------------------- textures drawn from the book's details

function wrap(x, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// A plain typographic cover for a book with no cover image.
export function typographicCover(b, aspect) {
  const Wp = 600, Hp = Math.round(Wp / aspect), c = canvas(Wp, Hp), x = c.getContext('2d');
  const tone = toneOf(b), light = lum(tone) > 0.55;
  x.fillStyle = css(tone); x.fillRect(0, 0, Wp, Hp);
  const g = x.createLinearGradient(0, 0, Wp, Hp); g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
  x.fillStyle = g; x.fillRect(0, 0, Wp, Hp);
  const ink = light ? '#1c1814' : '#f3ecdf';
  x.strokeStyle = light ? 'rgba(28,24,20,0.35)' : 'rgba(243,236,223,0.35)'; x.lineWidth = 2;
  x.strokeRect(34, 34, Wp - 68, Hp - 68);
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  let size = 64;
  let lines;
  do { x.font = `400 ${size}px ${SERIF}`; lines = wrap(x, b.title || 'Untitled', Wp - 140); size -= 4; } while (lines.length > 4 && size > 30);
  let y = Hp * 0.36;
  for (const l of lines) { x.fillText(l, Wp / 2, y); y += size * 1.2; }
  x.fillRect(Wp / 2 - 30, y + 8, 60, 2);
  x.font = `600 26px ${SANS}`;
  x.letterSpacing = '6px';
  x.fillText(String(b.author || '').toUpperCase(), Wp / 2, Hp - 90);
  return tex(c);
}

// The spine: title reading top to bottom, the author's surname, and for a
// hardcover two thin gilt bands.
export function spineTexture(b, d) {
  const Hp = 1024, Wp = clamp(Math.round(Hp * d.T / d.H), 40, 360), c = canvas(Wp, Hp), x = c.getContext('2d');
  const tone = Array.isArray(b.edgeTone) ? b.edgeTone : toneOf(b);
  const light = lum(tone) > 0.55, ink = light ? '#1d1915' : '#f1e9da';
  x.fillStyle = css(tone, 0.92); x.fillRect(0, 0, Wp, Hp);
  const g = x.createLinearGradient(0, 0, Wp, 0); g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
  x.fillStyle = g; x.fillRect(0, 0, Wp, Hp);
  if (d.kind === 'hardcover') {
    x.fillStyle = 'rgba(214,180,110,0.85)';
    for (const y of [44, 52, Hp - 56, Hp - 48]) x.fillRect(0, y, Wp, 3);
  }
  x.save();
  x.translate(Wp / 2, 0); x.rotate(Math.PI / 2);
  x.fillStyle = ink; x.textBaseline = 'middle'; x.textAlign = 'left';
  const cap = Wp * 0.5;
  const surname = String(b.author || '').split(/\s+/).pop() || '';
  x.font = `600 ${Math.min(cap * 0.62, 30)}px ${SANS}`;
  const aW = x.measureText(surname.toUpperCase()).width;
  const room = Hp - 160 - aW - 60;
  let size = Math.min(cap, 60);
  const title = String(b.title || '').split(/:\s/)[0];
  do { x.font = `400 ${size}px ${SERIF}`; size -= 2; } while (x.measureText(title).width > room && size > 9);
  x.fillText(title, 90, 0, room);
  x.font = `600 ${Math.min(cap * 0.62, 30)}px ${SANS}`;
  x.globalAlpha = 0.85;
  x.fillText(surname.toUpperCase(), Hp - 90 - aW, 0);
  x.restore();
  return tex(c);
}

// EAN-13 bars for an ISBN-13, drawn as a real, scannable barcode.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = L.map((p) => p.replace(/./g, (c) => (c === '0' ? '1' : '0')));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function ean13(code) {
  const d = code.split('').map(Number), p = PARITY[d[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (p[i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + '101';
}

// The back: the opening of the book's description, its publisher and its ISBN
// barcode, in the cover's colour. A small line at the foot says it's drawn.
export function backTexture(b, d, quality = 1) {
  const Wp = Math.round(560 * quality), Hp = Math.round(Wp * d.H / d.W), c = canvas(Wp, Hp), x = c.getContext('2d');
  const s = Wp / 560;
  const tone = toneOf(b), back = tone.map((v) => v * 0.82);
  const light = lum(back) > 0.55, ink = light ? '#1e1a16' : '#efe7d8', dim = light ? 'rgba(30,26,22,0.62)' : 'rgba(239,231,216,0.6)';
  x.fillStyle = css(back); x.fillRect(0, 0, Wp, Hp);
  const g = x.createLinearGradient(0, 0, 0, Hp); g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.14)');
  x.fillStyle = g; x.fillRect(0, 0, Wp, Hp);
  const pad = 52 * s;
  let y = pad + 20 * s;
  x.fillStyle = ink; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.font = `600 ${15 * s}px ${SANS}`; x.letterSpacing = `${3 * s}px`;
  x.fillText(String(b.author || '').toUpperCase(), pad, y);
  x.letterSpacing = '0px';
  y += 40 * s;
  const words = String(b.description || '').replace(/\s+/g, ' ').trim();
  const blurb = words ? (words.length > 620 ? words.slice(0, 620).replace(/\s+\S*$/, '') + '…' : words) : '';
  if (blurb) {
    x.font = `400 ${21 * s}px ${SERIF}`;
    const lines = wrap(x, blurb, Wp - pad * 2);
    const maxLines = Math.floor((Hp - y - 230 * s) / (30 * s));
    for (const [i, l] of lines.slice(0, maxLines).entries()) { x.fillText(i === maxLines - 1 && lines.length > maxLines ? l.replace(/\s+\S*$/, '…') : l, pad, y); y += 30 * s; }
  } else {
    x.font = `italic 400 ${30 * s}px ${SERIF}`;
    for (const l of wrap(x, b.title || '', Wp - pad * 2)) { x.fillText(l, pad, y); y += 38 * s; }
  }
  // Foot: publisher at the left, barcode at the right.
  const foot = Hp - pad;
  x.fillStyle = dim; x.font = `500 ${13 * s}px ${SANS}`;
  if (b.publisher) x.fillText(String(b.publisher), pad, foot - 46 * s);
  const genre = (b.genres || [])[0];
  if (genre) x.fillText(genre.toUpperCase(), pad, foot - 26 * s);
  x.font = `400 ${10 * s}px ${SANS}`;
  x.fillText('Back cover drawn by Feng Shui', pad, foot);
  if (/^97[89]\d{10}$/.test(b.isbn || '')) {
    const bits = ean13(b.isbn), m = 2.1 * s, bw = bits.length * m, bh = 70 * s;
    const bx = Wp - pad - bw - 18 * s, by = foot - bh - 22 * s;
    x.fillStyle = '#fbf8f1'; x.fillRect(bx - 14 * s, by - 26 * s, bw + 28 * s, bh + 54 * s);
    x.fillStyle = '#111';
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') x.fillRect(bx + i * m, by, m, bh + (i < 3 || (i >= 45 && i < 50) || i >= 92 ? 6 * s : 0));
    x.font = `500 ${10 * s}px ${SANS}`; x.textAlign = 'center';
    x.fillText(`ISBN ${b.isbn.replace(/^(\d{3})(\d)(\d{3})(\d{5})(\d)$/, '$1-$2-$3-$4-$5')}`, bx + bw / 2, by - 9 * s);
    x.fillText(b.isbn, bx + bw / 2, by + bh + 20 * s);
  }
  return tex(c);
}

// ---------------------------------------------------------------- the book object

const coverLoader = new T.TextureLoader();
const coverCache = new Map(); // url → Promise<Texture>
export function loadCover(url) {
  if (!coverCache.has(url)) {
    coverCache.set(url, new Promise((resolve, reject) => coverLoader.load(url, (t) => { t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; resolve(t); }, undefined, reject)));
  }
  return coverCache.get(url);
}

function coverMaterial(kind, map) {
  return new T.MeshPhysicalMaterial({
    map, roughness: kind === 'hardcover' ? 0.5 : 0.42, clearcoat: kind === 'hardcover' ? 0.18 : 0.32, clearcoatRoughness: 0.4,
    emissive: new T.Color('#fff3df'), emissiveIntensity: 0,
  });
}

export class Book {
  constructor(data, fileUrl) {
    this.data = data;
    this.id = data.id;
    this.d = dimsOf(data);
    this.fileUrl = fileUrl;
    const { kind, W, H, T: th } = this.d;
    this.group = new T.Group();
    this.group.userData.book = this;
    const aspect = W / H;

    this.coverIsReal = false;
    this.front = coverMaterial(kind, typographicCover(data, aspect));
    this.back = coverMaterial(kind, backTexture(data, this.d, 0.5));
    this.spine = coverMaterial(kind, spineTexture(data, this.d));
    const tone = Array.isArray(data.edgeTone) ? data.edgeTone : toneOf(data);
    this.edge = new T.MeshStandardMaterial({ color: new T.Color(css(tone, 0.62)), roughness: 0.75, emissive: new T.Color('#fff3df'), emissiveIntensity: 0 });
    this.hoverMats = [this.front, this.back, this.spine, this.edge];

    // Far: one block with the right picture on each side.
    this.simple = new T.Mesh(unitBox, [shared.pagesV, this.spine, shared.pagesH, shared.pagesH, this.front, this.back]);
    this.simple.scale.set(W, H, th);
    // Near: the full model.
    this.detail = new T.Group();
    if (kind === 'hardcover') {
      const bt = 0.0026, ov = 0.0032, bulge = th * 0.16;
      const pw = W - ov - 0.0035, ph = H - ov * 2, pt = th - bt * 2;
      const board = (z, mats) => { const m = new T.Mesh(unitBox, mats); m.scale.set(W, H, bt); m.position.set(0, 0, z); return m; };
      this.detail.add(board(th / 2 - bt / 2, [this.edge, this.edge, this.edge, this.edge, this.front, shared.endpaper]));
      this.detail.add(board(-th / 2 + bt / 2, [this.edge, this.edge, this.edge, this.edge, shared.endpaper, this.back]));
      const block = new T.Mesh(unitBox, [shared.pagesV, shared.endpaper, shared.pagesH, shared.pagesH, shared.endpaper, shared.endpaper]);
      block.scale.set(pw, ph, pt); block.position.set(-W / 2 + 0.0035 + pw / 2, 0, 0);
      this.detail.add(block);
      const sp = new T.Mesh(roundSpine, this.spine);
      sp.scale.set(bulge, H, th); sp.position.set(-W / 2, 0, 0);
      this.detail.add(sp);
      for (const s of [-1, 1]) {
        const hb = new T.Mesh(unitBox, shared.headband);
        hb.scale.set(0.004, 0.0024, pt * 0.96); hb.position.set(-W / 2 + 0.0055, s * (ph / 2 + 0.0008), 0);
        this.detail.add(hb);
      }
    } else {
      const ct = 0.0007;
      const block = new T.Mesh(unitBox, [shared.pagesV, shared.endpaper, shared.pagesH, shared.pagesH, shared.endpaper, shared.endpaper]);
      block.scale.set(W - 0.0006, H - 0.0008, th - ct * 2); block.position.x = 0.0003 - 0.0006 / 2 + 0.0003;
      this.detail.add(block);
      const cover = (z, mats) => { const m = new T.Mesh(unitBox, mats); m.scale.set(W, H, ct); m.position.z = z; return m; };
      this.detail.add(cover(th / 2 - ct / 2, [this.edge, this.edge, this.edge, this.edge, this.front, shared.endpaper]));
      this.detail.add(cover(-th / 2 + ct / 2, [this.edge, this.edge, this.edge, this.edge, shared.endpaper, this.back]));
      const sp = new T.Mesh(unitPlane, this.spine);
      sp.scale.set(th, H, 1); sp.rotation.y = -Math.PI / 2; sp.position.x = -W / 2 - 0.0002;
      this.detail.add(sp);
    }
    this.group.add(this.simple, this.detail);
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.setDetail(false);

    // What the pointer hits.
    this.hit = new T.Mesh(unitBox, new T.MeshBasicMaterial({ visible: false }));
    this.hit.scale.set(W * 1.02, H * 1.02, Math.max(th, 0.012) * 1.1);
    this.hit.userData.book = this;
    this.group.add(this.hit);

    this.hoverT = 0;
    this.backQuality = 0.5;
  }

  setDetail(on) {
    if (this.detailed === on) return;
    this.detailed = on;
    this.detail.visible = on;
    this.simple.visible = !on;
  }

  // Loads the real cover; the spine and back are redrawn once its colour is known.
  async loadCover() {
    if (this.coverPromise) return this.coverPromise;
    const file = this.data.cover;
    if (!file) return null;
    this.coverPromise = loadCover(this.fileUrl(file)).then((t) => {
      this.front.map = t; this.front.needsUpdate = true;
      this.coverIsReal = true;
      return t;
    }).catch(() => null);
    return this.coverPromise;
  }

  // The inspected book gets a sharper back.
  sharpenBack() {
    if (this.backQuality >= 1) return;
    this.backQuality = 1;
    const old = this.back.map;
    this.back.map = backTexture(this.data, this.d, 1);
    this.back.needsUpdate = true;
    old?.dispose();
  }

  // New details from the catalogue (a description or a cover arrived).
  refresh(data) {
    const before = this.data;
    this.data = data;
    if (data.cover && data.cover !== before.cover) { this.coverPromise = null; this.loadCover(); }
    if (JSON.stringify([before.tone, before.edgeTone, before.description, before.publisher, before.isbn, before.genres]) !== JSON.stringify([data.tone, data.edgeTone, data.description, data.publisher, data.isbn, data.genres])) {
      const s = this.spine.map; this.spine.map = spineTexture(data, this.d); this.spine.needsUpdate = true; s?.dispose();
      const b = this.back.map; this.back.map = backTexture(data, this.d, this.backQuality); this.back.needsUpdate = true; b?.dispose();
      const tone = Array.isArray(data.edgeTone) ? data.edgeTone : toneOf(data);
      this.edge.color.set(css(tone, 0.62));
      if (!this.coverIsReal) { const f = this.front.map; this.front.map = typographicCover(data, this.d.W / this.d.H); this.front.needsUpdate = true; f?.dispose(); }
    }
  }

  setGlow(v) {
    if (Math.abs(v - this.hoverT) < 0.002) return;
    this.hoverT = v;
    for (const m of this.hoverMats) m.emissiveIntensity = v * 0.16;
  }
}
