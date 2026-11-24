'use strict';

// WebP: the EXIF and XMP chunks go, the VP8X flags are updated to match,
// and everything that draws the picture (VP8/VP8L data, alpha, animation
// frames, colour profile) is copied byte for byte.

const { readOrientation, orientationTiff, exifCategories } = require('./exif');

const KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);

function riff(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') throw new Error('This is not a WebP file.');
  const end = Math.min(buf.length, 8 + buf.readUInt32LE(4));
  const out = [];
  let p = 12;
  while (p + 8 <= end) {
    const id = buf.toString('latin1', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const next = p + 8 + size + (size & 1);
    if (p + 8 + size > end) throw new Error(`The ${id.trim()} chunk runs past the end of the file.`);
    out.push({ id, start: p, end: Math.min(next, end), data: buf.subarray(p + 8, p + 8 + size) });
    p = next;
  }
  return out;
}

function chunk(id, data) {
  const b = Buffer.alloc(8 + data.length + (data.length & 1));
  b.write(id, 0, 'latin1');
  b.writeUInt32LE(data.length, 4);
  data.copy(b, 8);
  return b;
}

function clean(buf) {
  const list = riff(buf);
  const removed = new Set();
  const parts = [];
  let exifKept = null;
  for (const c of list) {
    if (c.id === 'EXIF') {
      const tiff = c.data.toString('latin1', 0, 6) === 'Exif\0\0' ? c.data.subarray(6) : c.data;
      for (const l of exifCategories(tiff)) removed.add(l);
      const o = readOrientation(tiff);
      if (o !== 1) exifKept = chunk('EXIF', orientationTiff(o));
      continue;
    }
    if (c.id === 'XMP ') { removed.add('xmp'); continue; }
    if (!KEEP.has(c.id)) { removed.add('other'); continue; }
    parts.push({ c, bytes: buf.subarray(c.start, c.end) });
  }
  const body = [];
  for (const { c, bytes } of parts) {
    if (c.id === 'VP8X') {
      const d = Buffer.from(c.data);
      d[0] &= ~(0x08 | 0x04); // EXIF and XMP flags
      if (exifKept) d[0] |= 0x08;
      body.push(chunk('VP8X', d));
    } else body.push(bytes);
  }
  if (exifKept) body.push(exifKept);
  const content = Buffer.concat(body);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(4 + content.length, 4);
  head.write('WEBP', 8, 'latin1');
  return { buf: Buffer.concat([head, content]), removed: [...removed], notes: [], lossless: 'bit-exact' };
}

module.exports = { clean };
