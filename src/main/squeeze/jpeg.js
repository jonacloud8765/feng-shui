'use strict';

// JPEG: metadata is removed segment by segment, without decoding the picture.
// The compressed image data, its quantisation and Huffman tables, the colour
// profile and the Adobe colour transform are copied byte for byte. Orientation
// survives as a tiny EXIF block. Anything after the end of the main picture
// (an iPhone's HDR gain map, described by MPF) is kept, and the MPF offsets
// are corrected for the bytes removed in between.

const { readOrientation, orientationTiff, exifCategories } = require('./exif');

const SOI = 0xd8, EOI = 0xd9, SOS = 0xda;

function segments(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== SOI) throw new Error('This is not a JPEG file.');
  const segs = [];
  let p = 2;
  while (p < buf.length) {
    if (buf[p] !== 0xff) throw new Error('The JPEG structure is damaged.');
    let m = buf[p + 1];
    while (m === 0xff) { p++; m = buf[p + 1]; } // fill bytes
    if (m === SOS) { segs.push({ marker: m, start: p, end: buf.length, rest: true }); break; }
    if (m === EOI) { segs.push({ marker: m, start: p, end: buf.length, rest: true }); break; }
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { segs.push({ marker: m, start: p, end: p + 2 }); p += 2; continue; }
    if (p + 4 > buf.length) throw new Error('The JPEG ends early.');
    const len = buf.readUInt16BE(p + 2);
    if (len < 2 || p + 2 + len > buf.length) throw new Error('A JPEG segment runs past the end of the file.');
    segs.push({ marker: m, start: p, end: p + 2 + len, data: buf.subarray(p + 4, p + 2 + len) });
    p += 2 + len;
  }
  return segs;
}

const startsWith = (data, s) => data && data.length >= s.length && data.subarray(0, s.length).toString('latin1') === s;

function segment(marker, payload) {
  const b = Buffer.alloc(4 + payload.length);
  b[0] = 0xff; b[1] = marker;
  b.writeUInt16BE(payload.length + 2, 2);
  payload.copy(b, 4);
  return b;
}

// Fixes MPF entry offsets (relative to the MPF TIFF header) after `shift`
// bytes were removed between that header and the images it points to.
function patchMpf(payload, shift) {
  const out = Buffer.from(payload);
  const t = 4; // after "MPF\0"
  const le = out[t] === 0x49;
  const u16 = (o) => (le ? out.readUInt16LE(t + o) : out.readUInt16BE(t + o));
  const u32 = (o) => (le ? out.readUInt32LE(t + o) : out.readUInt32BE(t + o));
  const w32 = (o, v) => (le ? out.writeUInt32LE(v, t + o) : out.writeUInt32BE(v, t + o));
  const ifd = u32(4);
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (u16(e) !== 0xb002) continue; // MPEntry
    const count = u32(e + 4);
    const at = u32(e + 8);
    for (let k = 0; k < count / 16; k++) {
      const off = at + k * 16 + 8;
      const v = u32(off);
      if (v) w32(off, v - shift);
    }
  }
  return out;
}

// From an XMP packet, only what an HDR (gain map) photo needs to be drawn:
// hdrgm values and an Ultra HDR container directory. Everything else, such as
// dates, face regions and the editing tool, is left out.
const KEEP_PREFIXES = ['hdrgm', 'Container', 'Item'];
function functionalXmp(text) {
  const attrs = [];
  const ns = new Map();
  for (const m of text.matchAll(/xmlns:([A-Za-z][\w.-]*)="([^"]*)"/g)) ns.set(m[1], m[2]);
  const desc = text.match(/<rdf:Description\b([^>]*)>/);
  if (desc) {
    for (const m of desc[1].matchAll(/\b([A-Za-z][\w.-]*):([A-Za-z][\w.-]*)="([^"]*)"/g)) {
      if (KEEP_PREFIXES.includes(m[1])) attrs.push(`${m[1]}:${m[2]}="${m[3]}"`);
    }
  }
  const elements = [];
  for (const m of text.matchAll(/<(hdrgm|Container):([A-Za-z][\w.-]*)\b[\s\S]*?<\/\1:\2>/g)) elements.push(m[0]);
  if (!attrs.length && !elements.length) return '';
  const used = new Set(KEEP_PREFIXES.filter((p) => ns.has(p) && (attrs.some((a) => a.startsWith(p + ':')) || elements.some((e) => e.includes('<' + p + ':')))));
  if (elements.some((e) => e.includes('rdf:'))) used.add('rdf');
  const decl = [...used].filter((p) => p !== 'rdf').map((p) => `xmlns:${p}="${ns.get(p)}"`);
  return '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + `<rdf:Description rdf:about="" ${[...decl, ...attrs].join(' ')}>${elements.join('')}</rdf:Description></rdf:RDF></x:xmpmeta>`;
}

function clean(buf) {
  const segs = segments(buf);
  const removed = new Set();
  const notes = [];
  let orientation = 1;
  const keep = [];
  for (const s of segs) {
    const { marker: m, data } = s;
    if (s.rest) { keep.push(s); continue; }
    if (m === 0xe0) {
      // JFIF stays (it says how to read the colours); a JFXX thumbnail goes.
      if (startsWith(data, 'JFIF\0')) {
        if (data.length > 14 && (data[12] || data[13])) {
          const j = Buffer.from(data.subarray(0, 14)); j[12] = 0; j[13] = 0;
          keep.push({ ...s, replace: segment(0xe0, j) }); removed.add('thumbnail');
        } else keep.push(s);
      } else removed.add(startsWith(data, 'JFXX') ? 'thumbnail' : 'other');
      continue;
    }
    if (m === 0xe1) {
      if (startsWith(data, 'Exif\0')) {
        const tiff = data.subarray(6);
        orientation = readOrientation(tiff);
        for (const c of exifCategories(tiff)) removed.add(c);
        if (orientation !== 1) keep.push({ ...s, replace: segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), orientationTiff(orientation)])) });
        continue;
      }
      const text = data.toString('latin1');
      removed.add('xmp');
      if (/hdrgm:|Container:Directory/.test(text)) {
        const xmp = functionalXmp(data.toString('utf8'));
        if (xmp) {
          keep.push({ ...s, replace: segment(0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(xmp, 'utf8')])) });
          notes.push('The HDR gain map description was kept, and nothing else from XMP, so the photo still shows in HDR.');
        }
      }
      continue;
    }
    if (m === 0xe2) {
      if (startsWith(data, 'ICC_PROFILE\0') || startsWith(data, 'MPF\0') || startsWith(data, 'urn:iso:std:iso:ts:21496')) { keep.push(s); continue; }
      removed.add('other');
      continue;
    }
    if (m === 0xee) { keep.push(s); continue; } // Adobe colour transform
    if (m >= 0xe3 && m <= 0xef) { removed.add(m === 0xed ? 'iptc' : 'other'); continue; }
    if (m === 0xfe) { removed.add('comments'); continue; }
    keep.push(s);
  }
  // Rebuild, then fix MPF offsets for bytes removed after the MPF segment.
  const parts = [buf.subarray(0, 2)];
  let mpfIndex = -1, mpfOrigStart = -1, mpfNewStart = -1, len = 2;
  for (const s of keep) {
    const bytes = s.replace || buf.subarray(s.start, s.end);
    if (s.marker === 0xe2 && startsWith(s.data, 'MPF\0')) { mpfIndex = parts.length; mpfOrigStart = s.start; mpfNewStart = len; }
    parts.push(bytes);
    len += bytes.length;
  }
  if (mpfIndex >= 0) {
    // Where the first kept segment after the scan begins, before and after.
    const scan = keep.find((s) => s.rest);
    const shiftAfter = (scan.start - mpfOrigStart) - (len - (buf.length - scan.start) - mpfNewStart);
    if (shiftAfter) {
      const seg = parts[mpfIndex];
      parts[mpfIndex] = segment(0xe2, patchMpf(seg.subarray(4), shiftAfter));
    }
  }
  const out = Buffer.concat(parts);
  // The compressed picture itself must be untouched.
  const scan = keep.find((s) => s.rest);
  const tail = buf.length - scan.start;
  if (!out.subarray(out.length - tail).equals(buf.subarray(scan.start))) throw new Error('The JPEG picture data would change; stopping.');
  return { buf: out, removed: [...removed], notes, orientation, lossless: 'bit-exact' };
}

module.exports = { clean, segments, functionalXmp };
