'use strict';

// PDF: a careful rewrite, in the spirit of qpdf.
//
// The file is read object by object (cross-reference tables and streams,
// object streams, incremental updates). It is then written again with only
// the objects the document actually uses, with Flate-compressed streams
// recompressed at the highest setting, and with small objects packed into
// compressed object streams. Page content, fonts, images, forms, links,
// bookmarks and accessibility tags are carried across unchanged.
//
// Removed: the document information dictionary (author, creator, producer,
// title, dates), XMP metadata streams, application private data (PieceInfo,
// which holds editing history), embedded page thumbnails and the old file
// identifier. A PDF/A document keeps its conformance declaration.
//
// Encrypted and digitally signed PDFs are not rewritten: a rewrite would
// need the password, or would void the signature.

const zlib = require('zlib');
const crypto = require('crypto');

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

class Lexer {
  constructor(buf, pos = 0) { this.b = buf; this.p = pos; }
  skip() {
    const b = this.b;
    for (;;) {
      while (this.p < b.length && WS.has(b[this.p])) this.p++;
      if (b[this.p] === 37) { while (this.p < b.length && b[this.p] !== 10 && b[this.p] !== 13) this.p++; continue; }
      return;
    }
  }
  word() {
    const s = this.p;
    while (this.p < this.b.length && !WS.has(this.b[this.p]) && !DELIM.has(this.b[this.p])) this.p++;
    return this.b.toString('latin1', s, this.p);
  }
  // Parses one value. Returns undefined at a keyword such as "obj" or "stream".
  value() {
    this.skip();
    const b = this.b, c = b[this.p];
    if (c === undefined) throw new Error('The PDF ends in the middle of an object.');
    if (c === 47) { // name
      const s = this.p++;
      while (this.p < b.length && !WS.has(b[this.p]) && !DELIM.has(b[this.p])) this.p++;
      const raw = b.toString('latin1', s, this.p);
      return { t: 'name', raw, key: raw.slice(1).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) };
    }
    if (c === 40) { // literal string, kept exactly
      const s = this.p++;
      let depth = 1;
      while (this.p < b.length && depth) {
        const x = b[this.p++];
        if (x === 92) this.p++;
        else if (x === 40) depth++;
        else if (x === 41) depth--;
      }
      return { t: 'raw', raw: b.subarray(s, this.p) };
    }
    if (c === 60 && b[this.p + 1] === 60) { // dictionary
      this.p += 2;
      const map = new Map();
      for (;;) {
        this.skip();
        if (b[this.p] === 62 && b[this.p + 1] === 62) { this.p += 2; break; }
        const k = this.value();
        if (!k || k.t !== 'name') throw new Error('A PDF dictionary is malformed.');
        const v = this.value();
        if (v === undefined) throw new Error('A PDF dictionary is malformed.');
        map.set(k.key, v);
      }
      return { t: 'dict', map };
    }
    if (c === 60) { // hex string
      const s = this.p;
      while (this.p < b.length && b[this.p] !== 62) this.p++;
      this.p++;
      return { t: 'raw', raw: b.subarray(s, this.p) };
    }
    if (c === 91) {
      this.p++;
      const items = [];
      for (;;) {
        this.skip();
        if (b[this.p] === 93) { this.p++; break; }
        const v = this.value();
        if (v === undefined) throw new Error('A PDF array is malformed.');
        items.push(v);
      }
      return { t: 'arr', items };
    }
    const start = this.p;
    const w = this.word();
    if (!w) { this.p++; throw new Error('Unexpected character in the PDF.'); }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) {
      // "n g R" is a reference.
      if (/^\d+$/.test(w)) {
        const save = this.p;
        this.skip();
        const g = this.word();
        if (/^\d+$/.test(g)) {
          this.skip();
          if (this.b[this.p] === 82 && (this.p + 1 >= b.length || WS.has(b[this.p + 1]) || DELIM.has(b[this.p + 1]))) { this.p++; return { t: 'ref', n: Number(w), g: Number(g) }; }
        }
        this.p = save;
      }
      return { t: 'raw', raw: Buffer.from(w, 'latin1') };
    }
    if (w === 'true' || w === 'false' || w === 'null') return { t: 'raw', raw: Buffer.from(w, 'latin1') };
    this.p = start;
    return undefined;
  }
}

const get = (d, k) => (d && d.t === 'dict' ? d.map.get(k) : undefined);
const num = (v) => (v && v.t === 'raw' ? Number(v.raw.toString('latin1')) : NaN);
const isName = (v, n) => v && v.t === 'name' && v.key === n;

class Doc {
  constructor(buf) {
    this.b = buf;
    this.xref = new Map(); // n -> {type:1, off} | {type:2, stm, idx}
    this.cache = new Map();
    this.trailer = null;
    const head = buf.toString('latin1', 0, Math.min(1024, buf.length));
    const m = head.match(/%PDF-(\d\.\d)/);
    if (!m) throw new Error('This is not a PDF file.');
    this.version = m[1];
    try { this.readXrefChain(); } catch { this.xref.clear(); this.trailer = null; }
    if (!this.trailer || !get(this.trailer, 'Root')) this.scan();
  }

  readXrefChain() {
    const tail = this.b.toString('latin1', Math.max(0, this.b.length - 2048));
    const m = tail.match(/startxref\s+(\d+)\s+%%EOF[^]*$/) || [...tail.matchAll(/startxref\s+(\d+)/g)].pop();
    if (!m) throw new Error('no startxref');
    let off = Number(m[1]);
    const seen = new Set();
    while (Number.isFinite(off) && !seen.has(off)) {
      seen.add(off);
      const lx = new Lexer(this.b, off);
      lx.skip();
      let trailer;
      if (this.b.toString('latin1', lx.p, lx.p + 4) === 'xref') {
        lx.p += 4;
        for (;;) {
          lx.skip();
          if (this.b.toString('latin1', lx.p, lx.p + 7) === 'trailer') { lx.p += 7; break; }
          const start = Number(lx.word()); lx.skip();
          const count = Number(lx.word());
          if (!Number.isFinite(start) || !Number.isFinite(count)) throw new Error('bad xref');
          for (let i = 0; i < count; i++) {
            lx.skip();
            const o = Number(lx.word()); lx.skip();
            lx.word(); lx.skip();
            const kind = lx.word();
            if (!this.xref.has(start + i)) this.xref.set(start + i, kind === 'n' ? { type: 1, off: o } : { type: 0 });
          }
        }
        trailer = lx.value();
        const stm = num(get(trailer, 'XRefStm'));
        if (Number.isFinite(stm)) this.readXrefStream(stm);
      } else {
        trailer = this.readXrefStream(off);
      }
      if (!this.trailer) this.trailer = trailer;
      off = num(get(trailer, 'Prev'));
    }
  }

  readXrefStream(off) {
    const { value, data } = this.parseAt(off, null);
    if (!isName(get(value, 'Type'), 'XRef')) throw new Error('bad xref stream');
    const raw = decodeStream(value, data, this);
    const W = get(value, 'W').items.map(num);
    const size = num(get(value, 'Size'));
    const index = get(value, 'Index') ? get(value, 'Index').items.map(num) : [0, size];
    const rowLen = W[0] + W[1] + W[2];
    const field = (p, w) => { let v = 0; for (let i = 0; i < w; i++) v = v * 256 + raw[p + i]; return v; };
    let p = 0;
    for (let k = 0; k < index.length; k += 2) {
      for (let i = 0; i < index[k + 1]; i++, p += rowLen) {
        if (p + rowLen > raw.length) break;
        const type = W[0] ? field(p, W[0]) : 1;
        const a = field(p + W[0], W[1]), c = field(p + W[0] + W[1], W[2]);
        const n = index[k] + i;
        if (this.xref.has(n)) continue;
        this.xref.set(n, type === 1 ? { type: 1, off: a } : type === 2 ? { type: 2, stm: a, idx: c } : { type: 0 });
      }
    }
    return value;
  }

  // A damaged cross-reference: find every "n g obj" in the file instead.
  scan() {
    this.xref.clear();
    const text = this.b.toString('latin1');
    for (const m of text.matchAll(/(?:^|[\s>\]])(\d+)\s+(\d+)\s+obj\b/g)) {
      this.xref.set(Number(m[1]), { type: 1, off: m.index + m[0].indexOf(m[1]) });
    }
    let trailer = null;
    for (const m of text.matchAll(/trailer\s*<</g)) {
      try { trailer = new Lexer(this.b, m.index + 7).value(); } catch { /* keep looking */ }
    }
    if (!trailer || !get(trailer, 'Root')) {
      for (const [n] of this.xref) {
        const o = this.object(n);
        if (o && o.t === 'dict' && isName(get(o, 'Type'), 'XRef') && get(o, 'Root')) trailer = o;
      }
      if (!trailer) {
        for (const [n] of this.xref) {
          const o = this.object(n);
          if (o && o.t === 'dict' && isName(get(o, 'Type'), 'Catalog')) { trailer = { t: 'dict', map: new Map([['Root', { t: 'ref', n, g: 0 }]]) }; }
        }
      }
    }
    if (!trailer) throw new Error('The PDF has no document catalog.');
    this.trailer = trailer;
    this.cache.clear();
  }

  parseAt(off, expect) {
    const lx = new Lexer(this.b, off);
    const n = lx.value(), g = lx.value();
    lx.skip();
    if (this.b.toString('latin1', lx.p, lx.p + 3) !== 'obj') throw new Error('An object is not where the PDF says it is.');
    lx.p += 3;
    if (expect !== null && expect !== undefined && num(n) !== expect) throw new Error('An object number does not match.');
    const value = lx.value();
    lx.skip();
    let data = null;
    if (this.b.toString('latin1', lx.p, lx.p + 6) === 'stream') {
      let p = lx.p + 6;
      if (this.b[p] === 13) p++;
      if (this.b[p] === 10) p++;
      let len = this.resolveNum(get(value, 'Length'));
      const endOk = (q) => /^\s*endstream/.test(this.b.toString('latin1', q, q + 20));
      if (!Number.isFinite(len) || p + len > this.b.length || !endOk(p + len)) {
        const e = this.b.indexOf('endstream', p, 'latin1');
        if (e < 0) throw new Error('A stream in the PDF has no end.');
        len = e - p;
        while (len > 0 && (this.b[p + len - 1] === 10 || this.b[p + len - 1] === 13)) len--;
      }
      data = this.b.subarray(p, p + len);
    }
    return { value, data };
  }

  resolveNum(v) {
    if (!v) return NaN;
    if (v.t === 'ref') { const o = this.object(v.n); return num(o); }
    return num(v);
  }

  // The value of object n (a stream is its dictionary, with .data attached).
  object(n) {
    if (this.cache.has(n)) return this.cache.get(n);
    const e = this.xref.get(n);
    let out = null;
    try {
      if (e && e.type === 1) {
        const { value, data } = this.parseAt(e.off, n);
        out = value;
        if (data && value && value.t === 'dict') out = { t: 'dict', map: value.map, data };
      } else if (e && e.type === 2) {
        const stm = this.objStm(e.stm);
        out = stm ? stm.get(n) ?? null : null;
      }
    } catch (err) {
      if (this.strict) throw err;
      out = null;
    }
    this.cache.set(n, out);
    return out;
  }

  objStm(n) {
    this.stms = this.stms || new Map();
    if (this.stms.has(n)) return this.stms.get(n);
    const s = this.object(n);
    let map = null;
    if (s && s.data) {
      const raw = decodeStream(s, s.data, this);
      const count = num(get(s, 'N')), first = num(get(s, 'First'));
      const lx = new Lexer(raw, 0);
      const pairs = [];
      for (let i = 0; i < count; i++) { pairs.push([num(lx.value()), num(lx.value())]); }
      map = new Map();
      for (const [on, off] of pairs) { try { map.set(on, new Lexer(raw, first + off).value()); } catch { /* skip */ } }
    }
    this.stms.set(n, map);
    return map;
  }
}

function filters(dict) {
  const f = get(dict, 'Filter');
  if (!f) return [];
  return f.t === 'arr' ? f.items.map((x) => x.key) : [f.key];
}

function unpredict(data, parms) {
  const pred = num(get(parms, 'Predictor'));
  if (!(pred >= 10)) return data;
  const cols = num(get(parms, 'Columns')) || 1;
  const colors = num(get(parms, 'Colors')) || 1;
  const bpc = num(get(parms, 'BitsPerComponent')) || 8;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowBytes = Math.ceil((cols * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowBytes + 1));
  const out = Buffer.alloc(rows * rowBytes);
  for (let y = 0; y < rows; y++) {
    const f = data[y * (rowBytes + 1)];
    for (let x = 0; x < rowBytes; x++) {
      const raw = data[y * (rowBytes + 1) + 1 + x];
      const a = x >= bpp ? out[y * rowBytes + x - bpp] : 0;
      const b = y ? out[(y - 1) * rowBytes + x] : 0;
      const c = y && x >= bpp ? out[(y - 1) * rowBytes + x - bpp] : 0;
      let v = raw;
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * rowBytes + x] = v & 255;
    }
  }
  return out;
}

function decodeStream(dict, data) {
  const f = filters(dict);
  if (!f.length) return data;
  if (f.length !== 1 || f[0] !== 'FlateDecode') throw new Error('Unsupported stream filter for a structural stream.');
  return unpredict(zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH }), get(dict, 'DecodeParms'));
}

// ---- Writing --------------------------------------------------------------

function ser(v, map) {
  switch (v.t) {
    case 'raw': return v.raw.toString('latin1');
    case 'name': return v.raw;
    case 'ref': return map.has(v.n) ? `${map.get(v.n)} 0 R` : 'null';
    case 'arr': return `[${v.items.map((x) => ser(x, map)).join(' ')}]`;
    case 'dict': {
      let s = '<<';
      for (const [k, x] of v.map) s += `/${k.replace(/[^!-~]|[()<>[\]{}/%#]/g, (ch) => '#' + ch.charCodeAt(0).toString(16).padStart(2, '0'))} ${ser(x, map)}`;
      return s + '>>';
    }
    default: return 'null';
  }
}

function minimalPdfaXmp(xmp) {
  const part = xmp.match(/pdfaid:part(?:="|>)(\d)/), conf = xmp.match(/pdfaid:conformance(?:="|>)([A-Za-z])/);
  if (!part) return null;
  return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="${part[1]}"${conf ? ` pdfaid:conformance="${conf[1]}"` : ''}/>`
    + '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
}

function optimise(buf, { recompress = true, shouldStop } = {}) {
  const doc = new Doc(buf);
  const t = doc.trailer;
  if (get(t, 'Encrypt')) throw new Error('This PDF is encrypted, so it cannot be cleaned without its password. It was left alone.');
  const rootRef = get(t, 'Root');
  if (!rootRef || rootRef.t !== 'ref' || !doc.object(rootRef.n)) throw new Error('The PDF has no readable document catalog.');
  const removed = new Set();
  const notes = [];
  if (get(t, 'Info')) {
    const info = get(t, 'Info').t === 'ref' ? doc.object(get(t, 'Info').n) : get(t, 'Info');
    for (const k of info?.map?.keys() || []) {
      removed.add(k === 'Author' ? 'author' : k === 'Creator' || k === 'Producer' ? 'software' : /Date/.test(k) ? 'timestamps' : k === 'Title' ? 'title' : 'comments');
    }
  }
  // Walk everything the document uses, from its catalog.
  const order = [];
  const seen = new Set();
  const objs = new Map();
  let pdfa = null;
  const visit = (v, owner) => {
    if (!v) return;
    if (v.t === 'ref') {
      if (seen.has(v.n)) return;
      seen.add(v.n);
      const o = doc.object(v.n);
      if (o === null || o === undefined) { seen.delete(v.n); return; }
      objs.set(v.n, o);
      order.push(v.n);
      visit(o, v.n);
      return;
    }
    if (v.t === 'arr') { for (const x of v.items) visit(x, owner); return; }
    if (v.t !== 'dict') return;
    if (get(v, 'ByteRange') || (isName(get(v, 'Type'), 'Sig') && get(v, 'Contents'))) throw new Error('This PDF is digitally signed. Changing it would void the signature, so it was left alone.');
    for (const k of [...v.map.keys()]) {
      if (k === 'Metadata') {
        const m = v.map.get(k);
        const ms = m && m.t === 'ref' ? doc.object(m.n) : null;
        if (owner === rootRef.n && ms && ms.data) {
          try {
            const xmp = decodeStream(ms, ms.data).toString('utf8');
            const keep = minimalPdfaXmp(xmp);
            if (keep) pdfa = keep;
          } catch { /* unreadable XMP just goes */ }
        }
        v.map.delete(k);
        removed.add('xmp');
      } else if (k === 'PieceInfo') { v.map.delete(k); removed.add('history'); }
      else if (k === 'Thumb') { v.map.delete(k); removed.add('thumbnail'); }
      else if (k === 'LastModified') { v.map.delete(k); removed.add('timestamps'); }
    }
    for (const x of v.map.values()) visit(x, owner);
  };
  const root = doc.object(rootRef.n);
  seen.add(rootRef.n); objs.set(rootRef.n, root); order.push(rootRef.n);
  visit(root, rootRef.n);
  if (shouldStop?.()) throw new Error('Stopped.');

  // New numbers, in the order objects were found.
  const map = new Map();
  order.forEach((n, i) => map.set(n, i + 1));
  let next = order.length + 1;
  if (pdfa) {
    const xmpNo = next++;
    root.map.set('Metadata', { t: 'ref', n: -1 });
    map.set(-1, xmpNo);
    objs.set(-1, { t: 'dict', map: new Map([['Type', { t: 'name', raw: '/Type', key: 'Type' }], ['Subtype', { t: 'name', raw: '/XML', key: 'XML' }]]), data: Buffer.from(pdfa, 'utf8'), keepRaw: true });
    order.push(-1);
    notes.push('This is a PDF/A document: its conformance declaration was kept, and nothing else from its metadata.');
  }

  const streams = [], small = [];
  let recompressed = 0;
  for (const n of order) {
    const o = objs.get(n);
    if (o && o.t === 'dict' && o.data) streams.push(n);
    else small.push(n);
  }
  const parts = [];
  let len = 0;
  const push = (s) => { const b = typeof s === 'string' ? Buffer.from(s, 'latin1') : s; parts.push(b); len += b.length; };
  const version = Number(doc.version) < 1.5 ? '1.5' : doc.version;
  push(`%PDF-${version}\n%\xe2\xe3\xcf\xd3\n`);
  const offsets = new Map(); // new number -> offset | {stm, idx}

  for (const n of streams) {
    if (shouldStop?.()) throw new Error('Stopped.');
    const o = objs.get(n);
    const d = new Map(o.map);
    let data = o.data;
    const f = filters(o);
    const type = get(o, 'Type');
    if (recompress && !o.keepRaw && !get(o, 'F')) {
      try {
        if (f.length === 1 && f[0] === 'FlateDecode') {
          const plain = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
          const again = zlib.deflateSync(plain, { level: 9, memLevel: 9 });
          if (again.length < data.length && zlib.inflateSync(again).equals(plain)) { data = again; recompressed++; }
        } else if (!f.length && !isName(type, 'XRef') && !isName(type, 'ObjStm') && data.length > 64) {
          const again = zlib.deflateSync(data, { level: 9, memLevel: 9 });
          if (again.length + 20 < data.length) { data = again; d.set('Filter', { t: 'name', raw: '/FlateDecode', key: 'FlateDecode' }); recompressed++; }
        }
      } catch { data = o.data; }
    }
    d.delete('DL');
    d.set('Length', { t: 'raw', raw: Buffer.from(String(data.length)) });
    offsets.set(map.get(n), len);
    push(`${map.get(n)} 0 obj\n${ser({ t: 'dict', map: d }, map)}\nstream\n`);
    push(data);
    push('\nendstream\nendobj\n');
  }
  // Pack the rest into object streams of up to 100.
  for (let i = 0; i < small.length; i += 100) {
    const group = small.slice(i, i + 100);
    const bodies = group.map((n) => Buffer.from(ser(objs.get(n), map) + '\n', 'latin1'));
    let head = '', off = 0;
    group.forEach((n, k) => { head += `${map.get(n)} ${off} `; off += bodies[k].length; });
    const raw = Buffer.concat([Buffer.from(head + '\n', 'latin1'), ...bodies]);
    const data = zlib.deflateSync(raw, { level: 9, memLevel: 9 });
    const no = next++;
    group.forEach((n, k) => offsets.set(map.get(n), { stm: no, idx: k }));
    offsets.set(no, len);
    push(`${no} 0 obj\n<</Type/ObjStm/N ${group.length}/First ${head.length + 1}/Filter/FlateDecode/Length ${data.length}>>\nstream\n`);
    push(data);
    push('\nendstream\nendobj\n');
  }
  // Cross-reference stream.
  const xrefNo = next++;
  const size = next;
  offsets.set(xrefNo, len);
  const rows = Buffer.alloc(size * 7);
  for (let n = 0; n < size; n++) {
    const e = offsets.get(n);
    const r = n * 7;
    if (n === 0 || e === undefined) { rows[r] = 0; rows.writeUInt32BE(0, r + 1); rows.writeUInt16BE(n === 0 ? 65535 : 0, r + 5); }
    else if (typeof e === 'number') { rows[r] = 1; rows.writeUInt32BE(e, r + 1); rows.writeUInt16BE(0, r + 5); }
    else { rows[r] = 2; rows.writeUInt32BE(e.stm, r + 1); rows.writeUInt16BE(e.idx, r + 5); }
  }
  const xdata = zlib.deflateSync(rows, { level: 9 });
  const id = crypto.randomBytes(16).toString('hex');
  if (get(t, 'ID')) removed.add('identifiers');
  push(`${xrefNo} 0 obj\n<</Type/XRef/Size ${size}/W [1 4 2]/Root ${map.get(rootRef.n)} 0 R/ID [<${id}><${id}>]/Filter/FlateDecode/Length ${xdata.length}>>\nstream\n`);
  push(xdata);
  push(`\nendstream\nendobj\nstartxref\n${offsets.get(xrefNo)}\n%%EOF\n`);
  const out = Buffer.concat(parts);
  const dropped = doc.xref.size - order.length;
  if (dropped > 0) notes.push(`${dropped} unused object${dropped === 1 ? ' was' : 's were'} left out.`);
  return { buf: out, removed: [...removed], notes, lossless: 'rendered-identical', stats: { objects: order.length, recompressed } };
}

// What a PDF uses that must still be there afterwards.
function features(buf) {
  const doc = new Doc(buf);
  const root = doc.object(get(doc.trailer, 'Root')?.n);
  return {
    encrypted: !!get(doc.trailer, 'Encrypt'),
    tagged: !!get(root, 'StructTreeRoot'),
    forms: !!get(root, 'AcroForm'),
    outlines: !!get(root, 'Outlines'),
    names: !!get(root, 'Names'),
  };
}

module.exports = { optimise, features, Doc };
