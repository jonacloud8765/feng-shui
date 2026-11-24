'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jpeg = require('../src/main/squeeze/jpeg');
const png = require('../src/main/squeeze/png');
const webp = require('../src/main/squeeze/webp');
const gif = require('../src/main/squeeze/gif');
const svg = require('../src/main/squeeze/svg');
const audio = require('../src/main/squeeze/audio');
const pdf = require('../src/main/squeeze/pdf');
const { orientationTiff, readOrientation } = require('../src/main/squeeze/exif');
const { sniff } = require('../src/main/squeeze/engine');

// Small made-up files, built byte by byte: these tests are about structure.

const seg = (m, payload) => { const b = Buffer.alloc(4); b[0] = 0xff; b[1] = m; b.writeUInt16BE(payload.length + 2, 2); return Buffer.concat([b, payload]); };
function exifWithGps(orientation) {
  // IFD0: Orientation, Make, GPS pointer.
  const t = Buffer.alloc(8 + 2 + 3 * 12 + 4);
  t.write('MM', 0, 'latin1'); t.writeUInt16BE(42, 2); t.writeUInt32BE(8, 4); t.writeUInt16BE(3, 8);
  let e = 10;
  for (const [tag, type, val] of [[0x0112, 3, orientation << 16], [0x010f, 2, 0], [0x8825, 4, 0]]) { t.writeUInt16BE(tag, e); t.writeUInt16BE(type, e + 2); t.writeUInt32BE(1, e + 4); t.writeUInt32BE(val >>> 0, e + 8); e += 12; }
  return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]);
}
const scan = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56, 0xff, 0x00, 0x78, 0xff, 0xd9]);
const sampleJpeg = (o = 6) => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')), seg(0xe1, exifWithGps(o)), seg(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><dc:creator>Ann</dc:creator></x:xmpmeta>', 'latin1')), seg(0xfe, Buffer.from('a comment')), seg(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01profile', 'latin1')), seg(0xdb, Buffer.alloc(65, 1)), scan]);

test('JPEG: personal segments go, orientation, colour profile and the picture data stay', () => {
  const src = sampleJpeg(6);
  const r = jpeg.clean(src);
  for (const k of ['location', 'camera', 'xmp', 'comments']) assert.ok(r.removed.includes(k), k);
  const out = r.buf;
  assert.ok(!out.includes('a comment') && !out.includes('Ann'));
  assert.ok(out.includes('ICC_PROFILE'));
  assert.ok(out.subarray(out.length - scan.length).equals(scan));
  const exif = jpeg.segments(out).find((s) => s.marker === 0xe1);
  assert.strictEqual(readOrientation(exif.data.subarray(6)), 6);
  // Upright photos need no EXIF at all.
  assert.ok(!jpeg.segments(jpeg.clean(sampleJpeg(1)).buf).some((s) => s.marker === 0xe1));
});

test('JPEG: HDR gain map XMP keeps only the hdrgm values', () => {
  const x = jpeg.functionalXmp('<x:xmpmeta><rdf:RDF><rdf:Description rdf:about="" xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" hdrgm:Version="1.0" xmp:CreatorTool="Phone 1.0"/></rdf:RDF></x:xmpmeta>');
  assert.match(x, /hdrgm:Version="1.0"/);
  assert.doesNotMatch(x, /CreatorTool|Phone/);
});

const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(png.crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
function samplePng(w = 16, h = 16, alpha = 255) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = (x * 16) & 255; raw[o + 1] = (y * 16) & 255; raw[o + 2] = 128; raw[o + 3] = alpha; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('Author\0Ann')), chunk('pHYs', Buffer.alloc(9)), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}

test('PNG: text goes, physical size stays, recompression keeps every pixel', () => {
  const src = samplePng();
  const c = png.clean(src);
  assert.ok(c.removed.includes('author'));
  assert.deepStrictEqual(png.chunks(c.buf).map((x) => x.type), ['IHDR', 'pHYs', 'IDAT', 'IEND']);
  const o = png.optimise(src);
  assert.ok(o.buf.length < src.length);
  assert.deepStrictEqual(Buffer.from(png.decode(o.buf).rgba().buffer), Buffer.from(png.decode(src).rgba().buffer));
  // Translucent pixels keep their alpha.
  const t = png.optimise(samplePng(16, 16, 77));
  assert.deepStrictEqual(Buffer.from(png.decode(t.buf).rgba().buffer), Buffer.from(png.decode(samplePng(16, 16, 77)).rgba().buffer));
});

test('PNG: a damaged chunk is refused rather than rewritten', () => {
  const src = samplePng();
  src[src.length - 20] ^= 0xff;
  assert.throws(() => png.clean(src), /damaged/);
});

test('WebP: EXIF and XMP chunks and flags go', () => {
  const ch = (id, d) => { const b = Buffer.alloc(8 + d.length + (d.length & 1)); b.write(id, 0, 'latin1'); b.writeUInt32LE(d.length, 4); d.copy(b, 8); return b; };
  const vp8x = Buffer.alloc(10); vp8x[0] = 0x08 | 0x04;
  const body = Buffer.concat([ch('VP8X', vp8x), ch('VP8L', Buffer.from([0x2f, 1, 2, 3, 4])), ch('EXIF', exifWithGps(1).subarray(6)), ch('XMP ', Buffer.from('<x/>'))]);
  const head = Buffer.alloc(12); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(4 + body.length, 4); head.write('WEBP', 8, 'latin1');
  const r = webp.clean(Buffer.concat([head, body]));
  assert.ok(!r.buf.includes('EXIF') && !r.buf.includes('XMP '));
  assert.strictEqual(r.buf[20] & 0x0c, 0);
  assert.strictEqual(r.buf.readUInt32LE(4), r.buf.length - 8);
});

test('GIF: comments go, frames and the loop stay', () => {
  const g = Buffer.concat([
    Buffer.from('GIF89a', 'latin1'), Buffer.from([1, 0, 1, 0, 0x80, 0, 0]), Buffer.alloc(6),
    Buffer.from([0x21, 0xff, 11]), Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([3, 1, 0, 0, 0]),
    Buffer.from([0x21, 0xfe, 5]), Buffer.from('hello', 'latin1'), Buffer.from([0]),
    Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0]), Buffer.from([0x3b]),
  ]);
  const r = gif.clean(g);
  assert.ok(!r.buf.includes('hello') && r.buf.includes('NETSCAPE2.0'));
  assert.deepStrictEqual(r.removed, ['comments']);
});

test('SVG: metadata and editor data go, drawing and text spacing stay', () => {
  const s = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="x"><!-- by Ann --><metadata><dc:creator>Ann</dc:creator></metadata><text x="1"> a  b </text><rect inkscape:label="r" width="2"/></svg>';
  const r = svg.clean(Buffer.from(s));
  const out = r.buf.toString();
  assert.doesNotMatch(out, /Ann|inkscape/);
  assert.match(out, /<text x="1"> a {2}b <\/text>/);
  assert.match(out, /<rect width="2"\/>/);
});

function id3(frames) {
  const parts = frames.map(([id, text]) => { const d = Buffer.concat([Buffer.from([3]), Buffer.from(text)]); const h = Buffer.alloc(10); h.write(id, 0, 'latin1'); h.writeUInt32BE(d.length, 4); return Buffer.concat([h, d]); });
  const body = Buffer.concat(parts);
  const head = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
  const n = body.length; head[6] = (n >> 21) & 127; head[7] = (n >> 14) & 127; head[8] = (n >> 7) & 127; head[9] = n & 127;
  return Buffer.concat([head, body]);
}
const mp3Frames = Buffer.concat(Array.from({ length: 4 }, (_, i) => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413, i + 1)])));

test('MP3: tags go, the audio frames are copied exactly; song details can stay', () => {
  const src = Buffer.concat([id3([['TIT2', 'Song'], ['TPE1', 'Band'], ['COMM', 'eng\0secret'], ['TENC', 'Encoder 9'], ['PRIV', 'id']]), mp3Frames, Buffer.concat([Buffer.from('TAG', 'latin1'), Buffer.alloc(125)])]);
  const bare = audio.clean('mp3', src, {});
  assert.ok(bare.buf.equals(mp3Frames));
  assert.ok(audio.sameAudio(src, bare));
  const kept = audio.clean('mp3', src, { keepTags: true });
  assert.ok(kept.buf.includes('Song') && kept.buf.includes('Band') && !kept.buf.includes('secret') && !kept.buf.includes('Encoder'));
  assert.ok(kept.buf.subarray(kept.buf.length - mp3Frames.length).equals(mp3Frames));
});

test('WAV: INFO tags and padding go, format and audio stay', () => {
  const ch = (id, d) => { const b = Buffer.alloc(8 + d.length + (d.length & 1)); b.write(id, 0, 'latin1'); b.writeUInt32LE(d.length, 4); d.copy(b, 8); return b; };
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1); fmt.writeUInt16LE(2, 2); fmt.writeUInt32LE(48000, 4); fmt.writeUInt32LE(192000, 8); fmt.writeUInt16LE(4, 12); fmt.writeUInt16LE(16, 14);
  const data = Buffer.alloc(400, 7);
  const body = Buffer.concat([ch('fmt ', fmt), ch('LIST', Buffer.concat([Buffer.from('INFOIART', 'latin1'), Buffer.from([4, 0, 0, 0]), Buffer.from('Ann\0')])), ch('JUNK', Buffer.alloc(28)), ch('data', data)]);
  const head = Buffer.alloc(12); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(4 + body.length, 4); head.write('WAVE', 8, 'latin1');
  const src = Buffer.concat([head, body]);
  const r = audio.clean('wav', src);
  assert.ok(!r.buf.includes('Ann') && !r.buf.includes('JUNK'));
  assert.ok(audio.sameAudio(src, r));
  assert.strictEqual(r.buf.readUInt32LE(4), r.buf.length - 8);
});

test('FLAC: vendor, comments and padding go; stream info and frames stay', () => {
  const block = (type, d, last) => { const h = Buffer.alloc(4); h[0] = (last ? 0x80 : 0) | type; h.writeUIntBE(d.length, 1, 3); return Buffer.concat([h, d]); };
  const vc = (() => { const vendor = Buffer.from('libFLAC 1.4'); const f1 = Buffer.from('TITLE=Song'); const f2 = Buffer.from('COMMENT=secret'); const b = Buffer.alloc(4); b.writeUInt32LE(vendor.length); const n = Buffer.alloc(4); n.writeUInt32LE(2); const l1 = Buffer.alloc(4); l1.writeUInt32LE(f1.length); const l2 = Buffer.alloc(4); l2.writeUInt32LE(f2.length); return Buffer.concat([b, vendor, n, l1, f1, l2, f2]); })();
  const frames = Buffer.concat([Buffer.from([0xff, 0xf8]), Buffer.alloc(100, 9)]);
  const src = Buffer.concat([Buffer.from('fLaC'), block(0, Buffer.alloc(34, 1)), block(4, vc), block(1, Buffer.alloc(500), true), frames]);
  const r = audio.clean('flac', src, { keepTags: true });
  assert.ok(r.buf.includes('TITLE=Song') && !r.buf.includes('secret') && !r.buf.includes('libFLAC'));
  assert.ok(r.buf.subarray(r.buf.length - frames.length).equals(frames));
  assert.ok(r.buf.length < src.length - 500);
});

function samplePdf() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R /Metadata 5 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /PieceInfo << /Illustrator << /Private 6 0 R >> >> >>',
    null, // content stream
    '<< /Type /Metadata /Subtype /XML /Length 30 >>\nstream\n<x:xmpmeta>Ann Author</x:xmpmeta>\nendstream',
    '<< /Length 4000 >>\nstream\n' + 'x'.repeat(4000) + '\nendstream',
    '<< /Author (Ann Author) /Producer (Tool 1.0) >>',
  ];
  const content = '0 0 1 rg 10 10 50 50 re f\n'.repeat(20);
  objs[3] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R /ID [<aa><aa>] >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('PDF: information, XMP, private data and old identifiers go; pages stay', () => {
  const src = samplePdf();
  const r = pdf.optimise(src);
  const text = r.buf.toString('latin1');
  assert.doesNotMatch(text, /Ann Author|Tool 1\.0|xxxx|<aa>/);
  for (const k of ['author', 'software', 'xmp', 'history', 'identifiers']) assert.ok(r.removed.includes(k), k);
  assert.ok(r.buf.length < src.length);
  // It reads back with one page and the same drawing instructions.
  const doc = new pdf.Doc(r.buf);
  const root = doc.object(doc.trailer.map.get('Root').n);
  const pages = doc.object(root.map.get('Pages').n);
  const page = doc.object(pages.map.get('Kids').items[0].n);
  const contents = doc.object(page.map.get('Contents').n);
  assert.strictEqual(zlib.inflateSync(contents.data).toString(), '0 0 1 rg 10 10 50 50 re f\n'.repeat(20));
});

test('PDF: encrypted and signed documents are left alone', () => {
  const enc = Buffer.from(samplePdf().toString('latin1').replace('/Root 1 0 R', '/Root 1 0 R /Encrypt << /Filter /Standard >>'), 'latin1');
  assert.throws(() => pdf.optimise(enc), /encrypted/);
  const signed = Buffer.from(samplePdf().toString('latin1').replace('/Count 1 >>', '/Count 1 /Sig << /ByteRange [0 1 2 3] >> >>'), 'latin1');
  assert.throws(() => pdf.optimise(signed), /signed/);
});

test('EXIF orientation round trip', () => {
  for (let o = 1; o <= 8; o++) assert.strictEqual(readOrientation(orientationTiff(o)), o);
});

test('files are recognised by their contents, not their names', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squeeze-'));
  const put = (n, b) => { const p = path.join(dir, n); fs.writeFileSync(p, b); return p; };
  assert.strictEqual((await sniff(put('photo.png', sampleJpeg()))).format, 'jpeg');
  assert.strictEqual((await sniff(put('x.bin', samplePng()))).format, 'png');
  assert.strictEqual((await sniff(put('d.pdf', samplePdf()))).format, 'pdf');
  assert.ok((await sniff(put('v.mkv', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0])))).unsupported);
  assert.ok((await sniff(put('e.txt', Buffer.alloc(0)))).unsupported);
  fs.rmSync(dir, { recursive: true, force: true });
});
