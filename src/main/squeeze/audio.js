'use strict';

// Audio files whose tags can be removed without touching the sound: MP3 and
// AAC (ADTS) tags around the frames, FLAC metadata blocks, and WAV chunks.
// The audio bytes are copied exactly and checked to be identical afterwards.
//
// Options: keepTags keeps song details (title, artist, album, track, year,
// genre); keepArt keeps the album artwork. Everything else goes: encoder,
// comments, lyrics, private frames, purchase and user identifiers.

// ---- ID3 ------------------------------------------------------------------

const syncsafe = (b, o) => ((b[o] & 127) << 21) | ((b[o + 1] & 127) << 14) | ((b[o + 2] & 127) << 7) | (b[o + 3] & 127);
const toSyncsafe = (n) => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);

const TAG_FRAMES = { TIT2: 1, TPE1: 1, TALB: 1, TRCK: 1, TPOS: 1, TCON: 1, TPE2: 1, TYER: 'TDRC', TDRC: 1, TDAT: 0 };
const V22 = { TT2: 'TIT2', TP1: 'TPE1', TAL: 'TALB', TRK: 'TRCK', TPA: 'TPOS', TCO: 'TCON', TP2: 'TPE2', TYE: 'TDRC' };

function frameLabel(id) {
  if (/^(TIT|TPE|TAL|TRC|TPO|TCO|TYE|TDR|TT2|TP1|TAL|TRK|TCO)/.test(id)) return 'tags';
  if (id === 'APIC' || id === 'PIC') return 'artwork';
  if (/^(COMM|COM|USLT|ULT|SYLT)/.test(id)) return 'comments';
  if (/^(TENC|TSSE|TEN|TSS|TOO)/.test(id)) return 'software';
  if (/^(PRIV|UFID|UFI|TXXX|TXX|WXXX|GEOB|MCDI|USER|OWNE|COMR)/.test(id)) return 'identifiers';
  if (/^(TCOM|TEXT|TOLY|TOPE|TCOP|TPUB|WOAR)/.test(id)) return 'author';
  if (/^(TDEN|TDTG|TDOR|TORY|TRDA|TIME)/.test(id)) return 'timestamps';
  return 'other';
}

// Reads one ID3v2 tag at `at`; returns its end and the frames worth keeping.
function readId3(buf, at, opts, removed) {
  const ver = buf[at + 3];
  const flags = buf[at + 5];
  const size = syncsafe(buf, at + 6);
  const end = at + 10 + size + (flags & 0x10 ? 10 : 0);
  if (end > buf.length) throw new Error('The ID3 tag runs past the end of the file.');
  const kept = [];
  if (flags & 0x80 && ver < 4) { removed.add('tags'); return { end, kept }; } // unsynchronised tag: not copied
  let p = at + 10;
  if (flags & 0x40) p += ver === 3 ? 4 + buf.readUInt32BE(p) : syncsafe(buf, p);
  const stop = at + 10 + size;
  while (p + (ver === 2 ? 6 : 10) <= stop) {
    if (buf[p] === 0) break; // padding
    let id, fsize, fflags = 0, hdr;
    if (ver === 2) { id = buf.toString('latin1', p, p + 3); fsize = buf.readUIntBE(p + 3, 3); hdr = 6; }
    else { id = buf.toString('latin1', p, p + 4); fsize = ver === 4 ? syncsafe(buf, p + 4) : buf.readUInt32BE(p + 4); fflags = buf.readUInt16BE(p + 8); hdr = 10; }
    if (!/^[A-Z0-9]{3,4}$/.test(id) || p + hdr + fsize > stop) break;
    const data = buf.subarray(p + hdr, p + hdr + fsize);
    const name = ver === 2 ? V22[id] || id : id;
    const label = frameLabel(id);
    const plain = (fflags & 0x00ff) === 0 && ver !== 2 ? true : ver === 2;
    let keep = false;
    if (opts.keepTags && TAG_FRAMES[name] && plain) keep = true;
    if (opts.keepArt && name === 'APIC' && plain) keep = true;
    if (keep) {
      const target = TAG_FRAMES[name] === 'TDRC' ? 'TDRC' : name;
      // Text in ISO-8859-1 or UTF-16 is valid in ID3v2.4 as it is.
      kept.push({ id: target, data });
    } else removed.add(label);
    p += hdr + fsize;
  }
  return { end, kept };
}

function writeId3(frames) {
  if (!frames.length) return Buffer.alloc(0);
  const seen = new Set();
  const parts = [];
  for (const f of frames) {
    if (f.id !== 'APIC' && seen.has(f.id)) continue;
    seen.add(f.id);
    const h = Buffer.alloc(10);
    h.write(f.id, 0, 'latin1');
    toSyncsafe(f.data.length).copy(h, 4);
    parts.push(h, f.data);
  }
  const body = Buffer.concat(parts);
  const head = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  toSyncsafe(body.length).copy(head, 6);
  return Buffer.concat([head, body]);
}

// Tags that sit at the end of MP3/AAC files: ID3v1 (and its extended form),
// APEv2 and Lyrics3. Returns where the audio really ends.
function trailingTags(buf, end, removed) {
  let changed = true;
  while (changed) {
    changed = false;
    if (end >= 128 && buf.toString('latin1', end - 128, end - 125) === 'TAG') {
      end -= 128; removed.add('tags'); changed = true;
      if (end >= 227 && buf.toString('latin1', end - 227, end - 223) === 'TAG+') end -= 227;
    }
    if (end >= 32 && buf.toString('latin1', end - 32, end - 24) === 'APETAGEX') {
      const size = buf.readUInt32LE(end - 20);
      const hasHeader = buf.readUInt32LE(end - 12) & 0x80000000;
      end -= size + (hasHeader ? 32 : 0); removed.add('tags'); changed = true;
    }
    if (end >= 15 && buf.toString('latin1', end - 9, end) === 'LYRICS200') {
      const size = Number(buf.toString('latin1', end - 15, end - 9));
      if (Number.isFinite(size)) { end -= 15 + size; removed.add('comments'); changed = true; }
    }
    if (end >= 10 && buf.toString('latin1', end - 10, end - 7) === '3DI') {
      end -= 20 + syncsafe(buf, end - 4); removed.add('tags'); changed = true;
    }
  }
  return end;
}

function leadingId3(buf, opts, removed) {
  let p = 0;
  const kept = [];
  while (buf.length >= p + 10 && buf.toString('latin1', p, p + 3) === 'ID3' && buf[p + 3] >= 2 && buf[p + 3] <= 4) {
    const r = readId3(buf, p, opts, removed);
    kept.push(...r.kept);
    p = r.end;
  }
  return { start: p, kept };
}

function frameSync(buf, p, adts) {
  if (p + 4 > buf.length || buf[p] !== 0xff) return false;
  return adts ? (buf[p + 1] & 0xf6) === 0xf0 : (buf[p + 1] & 0xe0) === 0xe0 && (buf[p + 1] & 0x18) !== 0x08 && (buf[p + 1] & 0x06) !== 0 && (buf[p + 2] & 0xf0) !== 0xf0;
}

function cleanFramed(buf, opts, adts) {
  const removed = new Set();
  const { start, kept } = leadingId3(buf, opts, removed);
  // Some files have padding between the tag and the first frame.
  let s = start;
  while (s < buf.length && buf[s] === 0 && s - start < 64 * 1024) s++;
  if (!frameSync(buf, s, adts)) throw new Error(adts ? 'No AAC audio frames were found where they should start.' : 'No MP3 audio frames were found where they should start.');
  const end = trailingTags(buf, buf.length, removed);
  if (end <= s) throw new Error('There is no audio left once the tags are taken away.');
  const audio = buf.subarray(s, end);
  const head = writeId3(kept);
  const out = Buffer.concat([head, audio]);
  return { buf: out, removed: [...removed], notes: kept.length ? ['Song details were kept.'] : [], lossless: 'bit-exact', audio: { start: head.length, length: audio.length, origStart: s } };
}

// ---- FLAC -----------------------------------------------------------------

function cleanFlac(buf, opts) {
  const removed = new Set();
  let p = 0;
  const lead = leadingId3(buf, { keepTags: false, keepArt: false }, removed);
  p = lead.start;
  if (buf.toString('latin1', p, p + 4) !== 'fLaC') throw new Error('This is not a FLAC file.');
  p += 4;
  const blocks = [];
  let last = false;
  while (!last) {
    if (p + 4 > buf.length) throw new Error('The FLAC header ends early.');
    last = !!(buf[p] & 0x80);
    const type = buf[p] & 0x7f;
    const len = buf.readUIntBE(p + 1, 3);
    if (p + 4 + len > buf.length) throw new Error('A FLAC metadata block runs past the end of the file.');
    blocks.push({ type, data: buf.subarray(p + 4, p + 4 + len) });
    p += 4 + len;
  }
  if (!blocks.length || blocks[0].type !== 0) throw new Error('The FLAC file has no stream information.');
  const keep = [];
  for (const b of blocks) {
    if (b.type === 0 || b.type === 3 || b.type === 5) { keep.push(b); continue; } // stream info, seek table, cue sheet
    if (b.type === 4) {
      // Vorbis comments: an empty vendor string and, optionally, song details.
      const d = b.data;
      let q = 4 + d.readUInt32LE(0);
      const n = d.readUInt32LE(q); q += 4;
      const fields = [];
      for (let i = 0; i < n; i++) {
        const l = d.readUInt32LE(q); const f = d.subarray(q + 4, q + 4 + l); q += 4 + l;
        const key = f.toString('utf8').split('=')[0].toUpperCase();
        if (opts.keepTags && ['TITLE', 'ARTIST', 'ALBUM', 'ALBUMARTIST', 'TRACKNUMBER', 'TRACKTOTAL', 'DISCNUMBER', 'DATE', 'GENRE'].includes(key)) fields.push(f);
        else removed.add(/COMMENT|DESCRIPTION|LYRICS/.test(key) ? 'comments' : /ENCODER|ENCODED/.test(key) ? 'software' : key ? (['TITLE', 'ARTIST', 'ALBUM', 'DATE', 'GENRE'].includes(key) ? 'tags' : 'other') : 'other');
      }
      if (d.readUInt32LE(0)) removed.add('software');
      const parts = [Buffer.alloc(4), Buffer.alloc(4)];
      parts[1].writeUInt32LE(fields.length);
      for (const f of fields) { const l = Buffer.alloc(4); l.writeUInt32LE(f.length); parts.push(l, f); }
      keep.push({ type: 4, data: Buffer.concat(parts) });
      continue;
    }
    if (b.type === 6 && opts.keepArt) { keep.push(b); continue; }
    removed.add(b.type === 6 ? 'artwork' : b.type === 1 ? 'padding' : 'other');
  }
  const head = [Buffer.from('fLaC', 'latin1')];
  keep.forEach((b, i) => {
    const h = Buffer.alloc(4);
    h[0] = (i === keep.length - 1 ? 0x80 : 0) | b.type;
    h.writeUIntBE(b.data.length, 1, 3);
    head.push(h, b.data);
  });
  const end = trailingTags(buf, buf.length, removed);
  const audio = buf.subarray(p, end);
  if (audio.length < 2 || audio[0] !== 0xff || (audio[1] & 0xfc) !== 0xf8) throw new Error('The FLAC audio frames do not start where they should.');
  const top = Buffer.concat(head);
  removed.delete('padding');
  return { buf: Buffer.concat([top, audio]), removed: [...removed], notes: [], lossless: 'bit-exact', audio: { start: top.length, length: audio.length, origStart: p } };
}

// ---- WAV ------------------------------------------------------------------

const WAV_KEEP = new Set(['fmt ', 'data', 'fact', 'cue ', 'smpl', 'inst', 'plst', 'acid', 'cset']);

function cleanWav(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') {
    if (['RF64', 'BW64'].includes(buf.toString('latin1', 0, 4))) throw new Error('Very large (RF64) WAV files are left alone, to be safe.');
    throw new Error('This is not a WAV file.');
  }
  const removed = new Set();
  const notes = [];
  const end = Math.min(buf.length, 8 + buf.readUInt32LE(4));
  const parts = [];
  let p = 12, dataChunk = null, fmt = false;
  while (p + 8 <= end) {
    const id = buf.toString('latin1', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const stop = Math.min(end, p + 8 + size);
    const next = p + 8 + size + (size & 1);
    if (id === 'fmt ') fmt = true;
    if (id === 'data') dataChunk = { start: p + 8, length: stop - p - 8 };
    if (WAV_KEEP.has(id)) parts.push(buf.subarray(p, Math.min(next, end)));
    else if (id === 'LIST' && buf.toString('latin1', p + 8, p + 12) === 'adtl') parts.push(buf.subarray(p, Math.min(next, end))); // cue labels
    else if (id === 'bext') {
      // Broadcast WAV: keep the timeline position (needed by editors), blank who/when/what.
      const c = Buffer.from(buf.subarray(p, Math.min(next, end)));
      c.fill(0, 8, 8 + 256 + 32 + 32 + 10 + 8); // description, originator, reference, date, time
      if (c.length >= 8 + 602) c.fill(0, 8 + 348, 8 + 412); // UMID
      parts.push(c.subarray(0, 8 + Math.min(size, 602)));
      const h = parts[parts.length - 1]; h.writeUInt32LE(h.length - 8, 4);
      removed.add('author');
      notes.push('The Broadcast WAV timeline position was kept; who made it, when and with what were cleared.');
    } else if (id === 'JUNK' || id === 'PAD ' || id === 'FLLR' || id === 'pad ') { /* padding */ }
    else removed.add(id === 'LIST' ? 'tags' : id === 'iXML' || id === '_PMX' ? 'xmp' : id.toLowerCase() === 'id3 ' ? 'tags' : 'other');
    if (next <= p) break;
    p = next;
  }
  if (!fmt || !dataChunk) throw new Error('The WAV file is missing its format or audio data.');
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(4 + body.length, 4);
  head.write('WAVE', 8, 'latin1');
  const out = Buffer.concat([head, body]);
  const at = out.indexOf(buf.subarray(dataChunk.start - 8, dataChunk.start));
  return { buf: out, removed: [...removed], notes, lossless: 'bit-exact', audio: { start: at + 8, length: dataChunk.length, origStart: dataChunk.start } };
}

// ---- AIFF -----------------------------------------------------------------

const AIFF_KEEP = new Set(['COMM', 'SSND', 'FVER', 'MARK', 'INST']);

function cleanAiff(buf) {
  const form = buf.toString('latin1', 8, 12);
  if (buf.toString('latin1', 0, 4) !== 'FORM' || (form !== 'AIFF' && form !== 'AIFC')) throw new Error('This is not an AIFF file.');
  const removed = new Set();
  const end = Math.min(buf.length, 8 + buf.readUInt32BE(4));
  const parts = [];
  let p = 12, ssnd = null;
  while (p + 8 <= end) {
    const id = buf.toString('latin1', p, p + 4);
    const size = buf.readUInt32BE(p + 4);
    const next = p + 8 + size + (size & 1);
    if (id === 'SSND') ssnd = { start: p + 8, length: Math.min(end, p + 8 + size) - p - 8 };
    if (AIFF_KEEP.has(id)) parts.push(buf.subarray(p, Math.min(next, end)));
    else removed.add(id === 'NAME' ? 'tags' : id === 'AUTH' || id === '(c) ' ? 'author' : id === 'ANNO' || id === 'COMT' ? 'comments' : id === 'ID3 ' ? 'tags' : 'other');
    if (next <= p) break;
    p = next;
  }
  if (!ssnd || !parts.some((b) => b.toString('latin1', 0, 4) === 'COMM')) throw new Error('The AIFF file is missing its format or audio data.');
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.write('FORM', 0, 'latin1');
  head.writeUInt32BE(4 + body.length, 4);
  head.write(form, 8, 'latin1');
  const out = Buffer.concat([head, body]);
  const at = out.indexOf(buf.subarray(ssnd.start - 8, ssnd.start));
  return { buf: out, removed: [...removed], notes: [], lossless: 'bit-exact', audio: { start: at + 8, length: ssnd.length, origStart: ssnd.start } };
}

function clean(kind, buf, opts = {}) {
  if (kind === 'aiff') return cleanAiff(buf);
  if (kind === 'mp3') return cleanFramed(buf, opts, false);
  if (kind === 'aac') return cleanFramed(buf, opts, true);
  if (kind === 'flac') return cleanFlac(buf, opts);
  if (kind === 'wav') return cleanWav(buf);
  throw new Error('Unknown audio kind.');
}

// The audio must be byte for byte the same.
function sameAudio(orig, result) {
  const a = result.audio;
  if (!a) return true;
  return orig.subarray(a.origStart, a.origStart + a.length).equals(result.buf.subarray(a.start, a.start + a.length));
}

module.exports = { clean, sameAudio };
