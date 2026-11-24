'use strict';

// GIF: comments and application blocks that only carry metadata (XMP and
// the like) go. Frames, palettes, timing, the loop count and any colour
// profile are copied byte for byte.

function subBlocksEnd(buf, p) {
  while (p < buf.length) {
    const n = buf[p];
    if (n === 0) return p + 1;
    p += 1 + n;
  }
  throw new Error('The GIF ends in the middle of a block.');
}

function clean(buf) {
  const sig = buf.toString('latin1', 0, 6);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('This is not a GIF file.');
  const removed = new Set();
  const out = [];
  const flags = buf[10];
  let p = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  out.push(buf.subarray(0, p));
  let frames = 0;
  while (p < buf.length) {
    const b = buf[p];
    if (b === 0x3b) { out.push(buf.subarray(p, p + 1)); p++; break; }
    if (b === 0x2c) {
      const lf = buf[p + 9];
      let q = p + 10 + (lf & 0x80 ? 3 * (1 << ((lf & 7) + 1)) : 0);
      q = subBlocksEnd(buf, q + 1); // after the LZW code size
      out.push(buf.subarray(p, q));
      frames++;
      p = q;
      continue;
    }
    if (b === 0x21) {
      const label = buf[p + 1];
      const end = subBlocksEnd(buf, p + 2);
      if (label === 0xfe) { removed.add('comments'); p = end; continue; }
      if (label === 0xff) {
        const app = buf.toString('latin1', p + 3, p + 14);
        if (app === 'NETSCAPE2.0' || app === 'ANIMEXTS1.0' || app === 'ICCRGBG1012') { out.push(buf.subarray(p, end)); p = end; continue; }
        removed.add(app.startsWith('XMP') ? 'xmp' : 'other');
        p = end;
        continue;
      }
      out.push(buf.subarray(p, end)); // graphic control, plain text
      p = end;
      continue;
    }
    throw new Error('The GIF has an unknown block; it was left alone.');
  }
  if (!frames) throw new Error('The GIF has no frames.');
  return { buf: Buffer.concat(out), removed: [...removed], notes: [], lossless: 'bit-exact' };
}

module.exports = { clean };
