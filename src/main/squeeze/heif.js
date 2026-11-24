'use strict';

// HEIC / HEIF (and AVIF): the photo's EXIF and XMP are separate items inside
// the file. They are overwritten in place, at exactly the same length, so the
// layout of the file (every offset, the picture data, the HDR gain map, depth
// and orientation boxes) stays byte for byte as it was. The EXIF item keeps
// only the orientation; XMP keeps only what an HDR photo needs. The file does
// not get smaller, but nothing personal is left in it.

const { readOrientation, orientationTiff, exifCategories } = require('./exif');
const { functionalXmp } = require('./jpeg');

function boxes(buf, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let header = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); header = 16; }
    else if (size === 0) size = end - p;
    if (size < header || p + size > end) throw new Error(`The ${type} box runs past the end of the file.`);
    out.push({ type, start: p, end: p + size, body: p + header });
    p += size;
  }
  return out;
}

const uint = (buf, o, n) => (n === 0 ? 0 : n === 2 ? buf.readUInt16BE(o) : n === 4 ? buf.readUInt32BE(o) : n === 8 ? Number(buf.readBigUInt64BE(o)) : (() => { throw new Error('Unsupported field size.'); })());

function parseMeta(buf) {
  const top = boxes(buf, 0, buf.length);
  if (!top.length || top[0].type !== 'ftyp') throw new Error('This is not a HEIF file.');
  const meta = top.find((b) => b.type === 'meta');
  if (!meta) throw new Error('This HEIF file has no item list.');
  const kids = boxes(buf, meta.body + 4, meta.end);
  const get = (t) => kids.find((b) => b.type === t);
  const pitm = get('pitm');
  const primary = pitm ? (buf[pitm.body] === 0 ? buf.readUInt16BE(pitm.body + 4) : buf.readUInt32BE(pitm.body + 4)) : 0;
  // Item types.
  const items = new Map();
  const iinf = get('iinf');
  if (iinf) {
    const v = buf[iinf.body];
    const at = iinf.body + 4 + (v === 0 ? 2 : 4);
    for (const infe of boxes(buf, at, iinf.end)) {
      if (infe.type !== 'infe') continue;
      const iv = buf[infe.body];
      if (iv < 2) continue;
      let q = infe.body + 4;
      const id = iv === 2 ? buf.readUInt16BE(q) : buf.readUInt32BE(q);
      q += iv === 2 ? 2 : 4;
      q += 2; // protection index
      const type = buf.toString('latin1', q, q + 4);
      q += 4;
      const nameEnd = buf.indexOf(0, q);
      let contentType = '';
      if (type === 'mime' && nameEnd >= 0 && nameEnd + 1 < infe.end) {
        const ctEnd = buf.indexOf(0, nameEnd + 1);
        contentType = buf.toString('latin1', nameEnd + 1, ctEnd < 0 || ctEnd > infe.end ? infe.end : ctEnd);
      }
      items.set(id, { id, type, contentType, extents: [], describes: [] });
    }
  }
  // Where each item's bytes are.
  const idat = get('idat');
  const iloc = get('iloc');
  if (!iloc) throw new Error('This HEIF file has no item locations.');
  {
    const v = buf[iloc.body];
    let q = iloc.body + 4;
    const offSize = buf[q] >> 4, lenSize = buf[q] & 15, baseSize = buf[q + 1] >> 4, idxSize = v ? buf[q + 1] & 15 : 0;
    q += 2;
    const count = v < 2 ? buf.readUInt16BE(q) : buf.readUInt32BE(q);
    q += v < 2 ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const id = v < 2 ? buf.readUInt16BE(q) : buf.readUInt32BE(q);
      q += v < 2 ? 2 : 4;
      let method = 0;
      if (v) { method = buf.readUInt16BE(q) & 15; q += 2; }
      q += 2; // data reference index
      const base = uint(buf, q, baseSize); q += baseSize;
      const n = buf.readUInt16BE(q); q += 2;
      const extents = [];
      for (let k = 0; k < n; k++) {
        if (v && idxSize) q += idxSize;
        const off = uint(buf, q, offSize); q += offSize;
        const len = uint(buf, q, lenSize); q += lenSize;
        extents.push({ method, start: (method === 1 ? (idat ? idat.body : NaN) : 0) + base + off, length: len });
      }
      const it = items.get(id);
      if (it) it.extents = extents;
    }
  }
  // Which item a metadata item describes.
  const iref = get('iref');
  if (iref) {
    const v = buf[iref.body];
    for (const r of boxes(buf, iref.body + 4, iref.end)) {
      let q = r.body;
      const from = v === 0 ? buf.readUInt16BE(q) : buf.readUInt32BE(q); q += v === 0 ? 2 : 4;
      const n = buf.readUInt16BE(q); q += 2;
      const to = [];
      for (let k = 0; k < n; k++) { to.push(v === 0 ? buf.readUInt16BE(q) : buf.readUInt32BE(q)); q += v === 0 ? 2 : 4; }
      if (r.type === 'cdsc' && items.has(from)) items.get(from).describes.push(...to);
    }
  }
  return { primary, items };
}

function readItem(buf, it) {
  return Buffer.concat(it.extents.map((e) => {
    if (it.extents.some((x) => x.method === 2) || !Number.isFinite(e.start) || e.start + e.length > buf.length) throw new Error('A metadata item is stored in a way this cannot rewrite safely.');
    return buf.subarray(e.start, e.start + e.length);
  }));
}

function writeItem(out, it, data) {
  let p = 0;
  for (const e of it.extents) { data.copy(out, e.start, p, p + e.length); p += e.length; }
}

function clean(buf) {
  const { primary, items } = parseMeta(buf);
  const out = Buffer.from(buf);
  const removed = new Set();
  const notes = [];
  let touched = 0;
  for (const it of items.values()) {
    const forPrimary = !it.describes.length || it.describes.includes(primary);
    if (it.type === 'Exif') {
      const data = readItem(buf, it);
      if (data.length < 4) continue;
      const tiffAt = 4 + data.readUInt32BE(0);
      if (tiffAt >= data.length) continue;
      const tiff = data.subarray(tiffAt);
      if (tiff.length >= 8 && !(tiff.length >= 26 && tiff.subarray(0, 26).equals(orientationTiff(readOrientation(tiff))) && tiff.subarray(26).every((x) => x === 0))) {
        for (const c of exifCategories(tiff)) removed.add(c);
        const fresh = Buffer.alloc(data.length);
        data.copy(fresh, 0, 0, tiffAt);
        const small = orientationTiff(readOrientation(tiff));
        if (small.length <= fresh.length - tiffAt) small.copy(fresh, tiffAt);
        writeItem(out, it, fresh);
        touched++;
      }
    } else if (it.type === 'mime' && /rdf\+xml/i.test(it.contentType)) {
      const data = readItem(buf, it);
      const text = data.toString('utf8');
      if (!forPrimary) continue; // XMP of the HDR gain map image describes how to apply it
      const keep = /hdrgm:|HDRGainMap/.test(text) ? functionalXmp(text) : '';
      const xml = keep || '<x:xmpmeta xmlns:x="adobe:ns:meta/"/>';
      const fresh = Buffer.alloc(data.length, 0x20);
      if (Buffer.byteLength(xml) > data.length) continue;
      fresh.write(xml, 0, 'utf8');
      if (!fresh.equals(data)) { writeItem(out, it, fresh); removed.add('xmp'); touched++; }
      if (keep) notes.push('The HDR description was kept so the photo still shows in HDR.');
    }
  }
  if (touched) notes.push('Metadata was overwritten in place, so the file keeps its exact layout and size.');
  return { buf: out, removed: [...removed], notes, lossless: 'bit-exact' };
}

module.exports = { clean, parseMeta };
