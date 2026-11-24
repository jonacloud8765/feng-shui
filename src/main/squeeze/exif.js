'use strict';

// The one piece of EXIF that matters for drawing a photo is its orientation.
// These helpers read it out of a TIFF/EXIF block and write a tiny EXIF block
// that carries nothing else.

// `buf` starts at the TIFF header ("II*\0" or "MM\0*").
function readOrientation(buf) {
  try {
    if (buf.length < 8) return 1;
    const le = buf[0] === 0x49 && buf[1] === 0x49;
    if (!le && !(buf[0] === 0x4d && buf[1] === 0x4d)) return 1;
    const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
    const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
    if (u16(2) !== 42) return 1;
    const ifd = u32(4);
    if (ifd + 2 > buf.length) return 1;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > buf.length) break;
      if (u16(e) === 0x0112) {
        const v = u16(e + 8);
        return v >= 1 && v <= 8 ? v : 1;
      }
    }
  } catch { /* a damaged block means no orientation */ }
  return 1;
}

// A TIFF block holding only the orientation (big-endian, one IFD entry).
function orientationTiff(orientation) {
  const b = Buffer.alloc(26);
  b.write('MM', 0, 'latin1');
  b.writeUInt16BE(42, 2);
  b.writeUInt32BE(8, 4);
  b.writeUInt16BE(1, 8);
  b.writeUInt16BE(0x0112, 10); // Orientation
  b.writeUInt16BE(3, 12); // SHORT
  b.writeUInt32BE(1, 14);
  b.writeUInt16BE(orientation, 18);
  b.writeUInt32BE(0, 22); // no next IFD
  return b;
}

// What kinds of information an EXIF block holds, from its first IFD: the
// labels shown under "Metadata removed".
function exifCategories(buf) {
  const out = new Set(['exif']);
  try {
    const le = buf[0] === 0x49;
    const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
    const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
    const ifd = u32(4);
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const tag = u16(ifd + 2 + i * 12);
      if (tag === 0x8825) out.add('location');
      else if (tag === 0x010f || tag === 0x0110) out.add('camera');
      else if (tag === 0x0131 || tag === 0x013c) out.add('software');
      else if (tag === 0x013b || tag === 0x8298) out.add('author');
      else if (tag === 0x0132) out.add('timestamps');
      else if (tag === 0x010e) out.add('comments');
      else if (tag === 0x8769) out.add('timestamps'); // the EXIF sub-IFD holds capture times and lens details
    }
    if (u32(ifd + 2 + n * 12)) out.add('thumbnail');
  } catch { /* partial information is fine */ }
  return out;
}

module.exports = { readOrientation, orientationTiff, exifCategories };
