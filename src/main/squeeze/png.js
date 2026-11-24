'use strict';

// PNG: always lossless.
//
// clean()     removes text, dates, EXIF and other descriptive chunks, and
//             keeps everything that affects how the picture looks (colour
//             profile, gamma, transparency, physical size, HDR and animation
//             chunks). The compressed picture data is untouched.
// optimise()  also recompresses the picture: it decodes the pixels, tries
//             several standard filter and compression settings, stores
//             RGBA as RGB when nothing is transparent and as a palette when
//             there are 256 colours or fewer, and keeps the smallest. The
//             result is decoded again here and must give exactly the same
//             pixels, or it is thrown away.

const zlib = require('zlib');
const { readOrientation, orientationTiff, exifCategories } = require('./exif');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('This is not a PNG file.');
  const out = [];
  let p = 8;
  while (p + 12 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    if (p + 12 + len > buf.length) throw new Error(`The ${type} chunk runs past the end of the file.`);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (crc32(buf.subarray(p + 4, p + 8 + len)) !== buf.readUInt32BE(p + 8 + len)) throw new Error(`The ${type} chunk is damaged (its checksum does not match).`);
    out.push({ type, data, start: p, end: p + 12 + len });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  if (!out.length || out[0].type !== 'IHDR' || out[out.length - 1].type !== 'IEND') throw new Error('The PNG structure is incomplete.');
  return out;
}

function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, 'latin1');
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}

// Chunks that change how the picture is drawn.
const FUNCTIONAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'cICP', 'mDCv', 'cLLi', 'mDCV', 'cLLI', 'pHYs', 'acTL', 'fcTL', 'fdAT', 'bKGD', 'gmAP', 'gdAT']);
const LABEL = { tEXt: 'comments', zTXt: 'comments', iTXt: 'comments', tIME: 'timestamps', eXIf: 'exif', iDOT: 'other', sPLT: 'other', hIST: 'other', dSIG: 'other', caBX: 'other' };

function textLabel(c) {
  const key = c.data.toString('latin1', 0, Math.max(0, c.data.indexOf(0))).toLowerCase();
  if (key === 'xml:com.adobe.xmp') return 'xmp';
  if (key === 'software') return 'software';
  if (key === 'author' || key === 'copyright') return 'author';
  if (key === 'creation time') return 'timestamps';
  return 'comments';
}

function header(ihdr) {
  return { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), depth: ihdr[8], color: ihdr[9], interlace: ihdr[12] };
}

function strip(list) {
  const removed = new Set();
  let orientation = 1;
  const kept = [];
  for (const c of list) {
    if (FUNCTIONAL.has(c.type)) { kept.push(c); continue; }
    const critical = (c.type.charCodeAt(0) & 0x20) === 0;
    if (critical) throw new Error(`This PNG has a chunk (${c.type}) that is needed to draw it but is not understood here.`);
    if (c.type === 'eXIf') {
      orientation = readOrientation(c.data);
      for (const l of exifCategories(c.data)) removed.add(l);
      if (orientation !== 1) kept.push({ type: 'eXIf', fresh: orientationTiff(orientation) });
      continue;
    }
    removed.add(c.type.endsWith('TXt') || c.type === 'tEXt' ? textLabel(c) : LABEL[c.type] || 'other');
  }
  return { kept, removed, orientation };
}

function build(list) {
  return Buffer.concat([SIG, ...list.map((c) => (c.fresh !== undefined ? chunk(c.type, c.fresh) : c.raw || chunk(c.type, c.data)))]);
}

function clean(buf) {
  const list = chunks(buf);
  const { kept, removed } = strip(list);
  // iDOT points at byte offsets of IDAT chunks, which change when anything
  // before them is removed; it is only a decoding speed hint, so it goes.
  const out = build(kept.map((c) => (c.fresh !== undefined ? c : { ...c, raw: buf.subarray(c.start, c.end) })));
  return { buf: out, removed: [...removed], notes: [], lossless: 'bit-exact' };
}

// ---- Pixels ---------------------------------------------------------------

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Filtered scanlines -> raw scanlines (no filter bytes).
function unfilter(data, width, height, bpp, rowBytes) {
  const out = Buffer.alloc(rowBytes * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const f = data[p++];
    const row = y * rowBytes, prev = row - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const raw = data[p++];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y ? out[prev + x] : 0;
      const c = y && x >= bpp ? out[prev + x - bpp] : 0;
      let v;
      switch (f) {
        case 0: v = raw; break;
        case 1: v = raw + a; break;
        case 2: v = raw + b; break;
        case 3: v = raw + ((a + b) >> 1); break;
        case 4: v = raw + paeth(a, b, c); break;
        default: throw new Error('The PNG picture data uses an unknown filter.');
      }
      out[row + x] = v & 255;
    }
  }
  if (p > data.length) throw new Error('The PNG picture data is shorter than its size says.');
  return out;
}

function filterRow(type, raw, row, prev, bpp, rowBytes, dst, at) {
  dst[at] = type;
  for (let x = 0; x < rowBytes; x++) {
    const v = raw[row + x];
    const a = x >= bpp ? raw[row + x - bpp] : 0;
    const b = prev >= 0 ? raw[prev + x] : 0;
    const c = prev >= 0 && x >= bpp ? raw[prev + x - bpp] : 0;
    let o;
    switch (type) {
      case 0: o = v; break;
      case 1: o = v - a; break;
      case 2: o = v - b; break;
      case 3: o = v - ((a + b) >> 1); break;
      default: o = v - paeth(a, b, c);
    }
    dst[at + 1 + x] = o & 255;
  }
}

// mode: a filter number 0..4, or 'adaptive' (the usual minimum-sum heuristic).
function refilter(raw, height, bpp, rowBytes, mode) {
  const out = Buffer.alloc((rowBytes + 1) * height);
  const tmp = Buffer.alloc(rowBytes + 1);
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes, prev = y ? row - rowBytes : -1, at = y * (rowBytes + 1);
    if (mode !== 'adaptive') { filterRow(mode, raw, row, prev, bpp, rowBytes, out, at); continue; }
    let best = Infinity;
    for (let t = 0; t < 5; t++) {
      filterRow(t, raw, row, prev, bpp, rowBytes, tmp, 0);
      let sum = 0;
      for (let i = 1; i <= rowBytes; i++) { const v = tmp[i]; sum += v < 128 ? v : 256 - v; if (sum >= best) break; }
      if (sum < best) { best = sum; tmp.copy(out, at); }
    }
  }
  return out;
}

// Raw 8-bit RGB/RGBA rows -> palette when it fits; RGBA -> RGB when opaque.
function reduce(raw, h, list) {
  const { width, height, depth, color } = h;
  if (depth !== 8 || (color !== 2 && color !== 6)) return null;
  if (list.some((c) => c.type === 'tRNS' || c.type === 'acTL')) return null;
  // With a colour profile, macOS colour-manages palette images along a
  // slightly different path (off by one level here and there), so those keep
  // their full colour form.
  const managed = list.some((c) => c.type === 'iCCP' || c.type === 'cICP');
  const ch = CHANNELS[color];
  const n = width * height;
  let opaque = true;
  if (color === 6) for (let i = 3; i < raw.length; i += 4) if (raw[i] !== 255) { opaque = false; break; }
  // Count colours (stop past 256).
  const map = new Map();
  for (let i = 0; i < n && map.size <= 256; i++) {
    const o = i * ch;
    const key = color === 6 ? raw.readUInt32BE(o) : (raw[o] << 16) | (raw[o + 1] << 8) | raw[o + 2];
    if (!map.has(key)) map.set(key, map.size);
  }
  const results = [];
  if (map.size <= 256 && !managed) {
    const count = map.size;
    const bits = count <= 2 ? 1 : count <= 4 ? 2 : count <= 16 ? 4 : 8;
    const plte = Buffer.alloc(count * 3);
    const alpha = [];
    for (const [key, idx] of map) {
      if (color === 6) { plte[idx * 3] = key >>> 24; plte[idx * 3 + 1] = (key >>> 16) & 255; plte[idx * 3 + 2] = (key >>> 8) & 255; alpha[idx] = key & 255; }
      else { plte[idx * 3] = key >>> 16; plte[idx * 3 + 1] = (key >>> 8) & 255; plte[idx * 3 + 2] = key & 255; }
    }
    const rowBytes = Math.ceil((width * bits) / 8);
    const px = Buffer.alloc(rowBytes * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * ch;
        const key = color === 6 ? raw.readUInt32BE(o) : (raw[o] << 16) | (raw[o + 1] << 8) | raw[o + 2];
        const idx = map.get(key);
        const bit = x * bits;
        px[y * rowBytes + (bit >> 3)] |= idx << (8 - bits - (bit & 7));
      }
    }
    let trns = null;
    if (color === 6 && !opaque) {
      let last = alpha.length - 1;
      while (last >= 0 && alpha[last] === 255) last--;
      trns = Buffer.from(alpha.slice(0, last + 1));
    }
    results.push({ color: 3, depth: bits, raw: px, rowBytes, bpp: 1, plte, trns });
  }
  if (color === 6 && opaque) {
    const rgb = Buffer.alloc(n * 3);
    for (let i = 0, o = 0; i < raw.length; i += 4, o += 3) { rgb[o] = raw[i]; rgb[o + 1] = raw[i + 1]; rgb[o + 2] = raw[i + 2]; }
    results.push({ color: 2, depth: 8, raw: rgb, rowBytes: width * 3, bpp: 3 });
  }
  return results;
}

// Any PNG's raw rows -> 8- or 16-bit RGBA, for comparing two files.
function toRGBA(raw, h, plte, trns) {
  const { width, height, depth, color } = h;
  const ch = CHANNELS[color];
  const rowBytes = Math.ceil((width * ch * depth) / 8);
  const deep = depth === 16;
  const out = deep ? new Uint16Array(width * height * 4) : new Uint8Array(width * height * 4);
  const sample = (row, idx) => {
    if (depth === 16) return raw.readUInt16BE(row + idx * 2);
    if (depth === 8) return raw[row + idx];
    const bit = idx * depth;
    return (raw[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const scale = (v) => (depth >= 8 ? v : Math.round((v * 255) / ((1 << depth) - 1)));
  const max = deep ? 65535 : 255;
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (color === 3) {
        const i = sample(row, x);
        out[o] = plte[i * 3]; out[o + 1] = plte[i * 3 + 1]; out[o + 2] = plte[i * 3 + 2];
        out[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (color === 0 || color === 4) {
        const g = sample(row, x * ch);
        out[o] = out[o + 1] = out[o + 2] = color === 0 ? scale(g) : g;
        out[o + 3] = color === 4 ? sample(row, x * ch + 1) : max;
      } else {
        out[o] = sample(row, x * ch); out[o + 1] = sample(row, x * ch + 1); out[o + 2] = sample(row, x * ch + 2);
        out[o + 3] = color === 6 ? sample(row, x * ch + 3) : max;
      }
    }
  }
  return out;
}

function decode(buf) {
  const list = chunks(buf);
  const h = header(list[0].data);
  if (h.interlace) return null;
  const idat = Buffer.concat(list.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const ch = CHANNELS[h.color];
  const bpp = Math.max(1, (ch * h.depth) >> 3);
  const rowBytes = Math.ceil((h.width * ch * h.depth) / 8);
  const raw = unfilter(zlib.inflateSync(idat), h.width, h.height, bpp, rowBytes);
  const plte = list.find((c) => c.type === 'PLTE')?.data;
  const trns = list.find((c) => c.type === 'tRNS')?.data;
  return { h, raw, rgba: () => toRGBA(raw, h, plte, trns) };
}

function idatChunks(data) {
  const parts = [];
  for (let p = 0; p < data.length; p += 1 << 20) parts.push({ type: 'IDAT', fresh: data.subarray(p, Math.min(data.length, p + (1 << 20))) });
  return parts;
}

// `level`: 'quick' tries a couple of settings; 'thorough' tries more.
function optimise(buf, { level = 'quick', shouldStop } = {}) {
  const list = chunks(buf);
  const h = header(list[0].data);
  const { kept, removed } = strip(list);
  const base = { buf: clean(buf).buf, removed: [...removed], notes: [], lossless: 'bit-exact' };
  if (list.some((c) => c.type === 'acTL')) { base.notes.push('Animated PNG: metadata removed; the frames were left exactly as they were.'); return base; }
  const idat = Buffer.concat(list.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const filtered = zlib.inflateSync(idat);
  const ch = CHANNELS[h.color];
  const bpp = Math.max(1, (ch * h.depth) >> 3);
  const rowBytes = Math.ceil((h.width * ch * h.depth) / 8);
  const deflate = (d, strategy) => zlib.deflateSync(d, { level: 9, memLevel: 9, strategy });
  const candidates = [];
  const tryOne = (fmt, data) => { if (!shouldStop?.()) candidates.push({ fmt, data }); };
  // Same filters, stronger compression.
  tryOne(null, deflate(filtered, zlib.constants.Z_DEFAULT_STRATEGY));
  if (!h.interlace) {
    const raw = unfilter(filtered, h.width, h.height, bpp, rowBytes);
    const big = h.width * h.height > 24e6;
    const formats = [{ color: h.color, depth: h.depth, raw, rowBytes, bpp }, ...(big ? [] : reduce(raw, h, list) || [])];
    for (const f of formats) {
      const modes = f.color === 3 || f.depth < 8 ? [0, 'adaptive'] : level === 'thorough' && !big ? ['adaptive', 0] : ['adaptive'];
      for (const m of modes) {
        const data = refilter(f.raw, h.height, f.bpp, f.rowBytes, m);
        tryOne(f, deflate(data, zlib.constants.Z_DEFAULT_STRATEGY));
        if (level === 'thorough' && !big) tryOne(f, deflate(data, zlib.constants.Z_FILTERED));
      }
    }
  }
  candidates.sort((a, b) => a.data.length - b.data.length);
  for (const best of candidates) {
    let chunksOut;
    if (!best.fmt || (best.fmt.color === h.color && best.fmt.depth === h.depth)) {
      chunksOut = [];
      let placed = false;
      for (const c of kept) {
        if (c.type === 'IDAT') { if (!placed) { chunksOut.push(...idatChunks(best.data)); placed = true; } continue; }
        chunksOut.push(c.fresh !== undefined ? c : { ...c, raw: buf.subarray(c.start, c.end) });
      }
    } else {
      const ihdr = Buffer.from(list[0].data);
      ihdr[8] = best.fmt.depth; ihdr[9] = best.fmt.color;
      chunksOut = [{ type: 'IHDR', fresh: ihdr }];
      // Colour type specific chunks no longer apply in the new form.
      const drop = new Set(['IHDR', 'IDAT', 'IEND', 'sBIT', 'bKGD', 'PLTE', 'tRNS', 'hIST']);
      for (const c of kept) if (!drop.has(c.type)) chunksOut.push(c.fresh !== undefined ? c : { ...c, raw: buf.subarray(c.start, c.end) });
      if (best.fmt.plte) chunksOut.push({ type: 'PLTE', fresh: best.fmt.plte });
      if (best.fmt.trns) chunksOut.push({ type: 'tRNS', fresh: best.fmt.trns });
      chunksOut.push(...idatChunks(best.data), { type: 'IEND', fresh: Buffer.alloc(0) });
    }
    const out = build(chunksOut);
    if (out.length >= base.buf.length) break;
    // Proof: the new file decodes to exactly the same pixels.
    if (!h.interlace) {
      const a = decode(buf), b = decode(out);
      if (!b || !Buffer.from(a.rgba().buffer).equals(Buffer.from(b.rgba().buffer))) continue;
    } else if (!zlib.inflateSync(Buffer.concat(chunks(out).filter((c) => c.type === 'IDAT').map((c) => c.data))).equals(filtered)) continue;
    const notes = [];
    if (best.fmt && best.fmt.color === 3 && h.color !== 3) notes.push(`Stored as a ${2 ** best.fmt.depth > 255 ? 256 : 2 ** best.fmt.depth}-or-fewer colour palette: same pixels, fewer bytes.`);
    if (best.fmt && best.fmt.color === 2 && h.color === 6) notes.push('Nothing was transparent, so the unused alpha channel was dropped. Same pixels.');
    return { buf: out, removed: [...removed], notes, lossless: 'pixel-exact' };
  }
  return base;
}

module.exports = { clean, optimise, chunks, decode, crc32 };
