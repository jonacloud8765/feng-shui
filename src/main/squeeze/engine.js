'use strict';

// SQUEEZE engine: the queue, the per-format plans, verification and safe
// saving.
//
// Safety rules, in the order they are applied to every file:
//   1. The original is only ever opened for reading. Its size and change
//      time are noted before and checked again after.
//   2. All work happens in temporary files in a private work folder. The
//      result is saved next to its original under a new name
//      ("photo (squeezed).jpg"); the original keeps its name and contents.
//   3. Every result is opened again and checked: the right kind of file, the
//      same dimensions, pages, duration and tracks, and for lossless results
//      the same pixels, page renderings, text or audio/video samples.
//   4. A result that fails a check is deleted and the next safer option is
//      tried; if none passes, the file is skipped with the reason.
//   5. The finished file is moved into place with a hard link, which fails
//      rather than replace anything already there (across disks it is first
//      copied to a hidden temporary name beside it); then the temporary file
//      is removed. A file that cannot get any smaller or cleaner gets no
//      copy at all. Nothing is ever overwritten, and originals are never
//      moved, changed or deleted.

const { EventEmitter } = require('events');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Worker } = require('worker_threads');

const HELPER = path.join(__dirname, '..', '..', '..', 'native', 'build', 'squeeze-helper');

const FORMATS = {
  jpeg: { kind: 'image', label: 'JPEG' },
  png: { kind: 'image', label: 'PNG' },
  heif: { kind: 'image', label: 'HEIC' },
  webp: { kind: 'image', label: 'WebP' },
  gif: { kind: 'image', label: 'GIF' },
  svg: { kind: 'image', label: 'SVG' },
  tiff: { kind: 'image', label: 'TIFF' },
  pdf: { kind: 'document', label: 'PDF' },
  mp4: { kind: 'video', label: 'MP4' },
  mov: { kind: 'video', label: 'MOV' },
  m4v: { kind: 'video', label: 'M4V' },
  m4a: { kind: 'audio', label: 'M4A' },
  mp3: { kind: 'audio', label: 'MP3' },
  aac: { kind: 'audio', label: 'AAC' },
  flac: { kind: 'audio', label: 'FLAC' },
  wav: { kind: 'audio', label: 'WAV' },
  aiff: { kind: 'audio', label: 'AIFF' },
};

const UNSUPPORTED = {
  mkv: 'MKV and WebM need tools macOS does not include, so they were left alone rather than risk damaging them.',
  avi: 'AVI files cannot be rewritten safely with what macOS includes, so it was left alone.',
  raw: 'Camera RAW files were left alone: rewriting them could lose data your photo editor needs.',
  office: 'Word, Excel and PowerPoint files are not optimised yet; they were left alone.',
  other: 'This kind of file is not one SQUEEZE knows how to optimise safely, so it was left alone.',
  empty: 'This file is empty.',
};

const LABELS = {
  location: 'GPS location', camera: 'Camera make & model', exif: 'EXIF data', xmp: 'XMP data', iptc: 'IPTC data', comments: 'Comments & descriptions',
  thumbnail: 'Embedded thumbnail', software: 'Software & device', author: 'Author & copyright', timestamps: 'Capture & edit times', title: 'Document title',
  identifiers: 'Identifiers', history: 'Editing history', tags: 'Song details', artwork: 'Album artwork', other: 'Other metadata',
};

// ---- Detection --------------------------------------------------------------

async function sniff(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const head = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(head, 0, 4096, 0);
    const b = head.subarray(0, bytesRead);
    const ext = path.extname(file).slice(1).toLowerCase();
    const s = (a, z) => b.toString('latin1', a, z);
    if (!b.length) return { unsupported: 'empty' };
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { format: 'jpeg' };
    if (s(0, 8) === '\x89PNG\r\n\x1a\n') return { format: 'png' };
    if (s(0, 4) === 'GIF8') return { format: 'gif' };
    if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return { format: 'webp' };
    if (s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE') return { format: 'wav' };
    if (s(0, 4) === 'RIFF' && s(8, 12) === 'AVI ') return { unsupported: 'avi' };
    if (['RF64', 'BW64'].includes(s(0, 4))) return { format: 'wav' };
    if (s(0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(s(8, 12))) return { format: 'aiff' };
    if (s(0, 4) === 'fLaC') return { format: 'flac' };
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { unsupported: 'mkv' };
    if (b.indexOf('%PDF-', 0, 'latin1') >= 0 && b.indexOf('%PDF-', 0, 'latin1') < 1024) return { format: 'pdf' };
    if (s(4, 8) === 'ftyp') {
      const brands = s(8, Math.min(b.length, 8 + b.readUInt32BE(0) - 8));
      if (/heic|heix|heim|heis|hevc|hevx|mif1|msf1|avif|avis/.test(s(8, 12)) || (/mif1/.test(brands) && !/qt {2}/.test(brands))) return { format: 'heif' };
      if (s(8, 12) === 'qt  ') return { format: 'mov' };
      if (/^M4A |^M4B /.test(s(8, 12)) || ext === 'm4a') return { format: 'm4a' };
      if (s(8, 12) === 'M4V ' || ext === 'm4v') return { format: 'm4v' };
      if (ext === 'mov') return { format: 'mov' };
      return { format: 'mp4' };
    }
    if (['dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2'].includes(ext)) return { unsupported: 'raw' };
    if (s(0, 4) === 'II*\0' || s(0, 4) === 'MM\0*') return { format: 'tiff' };
    if (s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) {
      if (ext === 'aac' || (b[0] === 0xff && (b[1] & 0xf6) === 0xf0)) return { format: 'aac' };
      if (ext === 'aac') return { format: 'aac' };
      return { format: 'mp3' };
    }
    if (['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'pages', 'key', 'numbers'].includes(ext)) return { unsupported: 'office' };
    if (ext === 'svg' || /<svg[\s>]/i.test(b.toString('utf8'))) return /<svg[\s>]/i.test(b.toString('utf8')) || ext === 'svg' ? { format: 'svg' } : { unsupported: 'other' };
    if (['webm', 'mkv'].includes(ext)) return { unsupported: 'mkv' };
    return { unsupported: 'other' };
  } finally {
    await fh.close();
  }
}

// ---- Engine -----------------------------------------------------------------

// "photo (squeezed).jpg", "photo (squeezed) (2).jpg": SQUEEZE's own results.
const SQUEEZED = / \(squeezed\)( \(\d+\))?(\.[^.]*)?$/;

// The deepest folder that contains every one of the given folders.
function commonDir(dirs) {
  if (!dirs.length) return os.homedir();
  let parts = dirs[0].split(path.sep);
  for (const d of dirs.slice(1)) {
    const q = d.split(path.sep);
    let i = 0;
    while (i < parts.length && i < q.length && parts[i] === q[i]) i++;
    parts = parts.slice(0, i);
  }
  return parts.join(path.sep) || path.sep;
}

const human = (n) => {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1000 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0)} ${u[i]}`;
};

class Engine extends EventEmitter {
  constructor({ dataDir }) {
    super();
    this.dataDir = dataDir;
    this.previewDir = path.join(dataDir, 'squeeze-previews');
    this.items = [];
    this.batch = null;
    this.running = false;
    this.paused = false;
    this.canceled = false;
    this.child = null;
    this.worker = null;
    this.workerCalls = new Map();
    this.nextCall = 1;
    this.timer = null;
    fs.rmSync(this.previewDir, { recursive: true, force: true });
  }

  get helperAvailable() { return fs.existsSync(HELPER); }

  // ---- State sent to the window ----
  snapshot() {
    const items = this.items.map((it) => ({
      id: it.id, name: it.name, rel: it.rel, size: it.size, format: it.format, formatLabel: it.format ? FORMATS[it.format].label : '', kind: it.kind,
      status: it.status, progress: it.progress, phase: it.phase, reason: it.reason, info: it.info, found: (it.found || []).map((k) => LABELS[k] || k),
      result: it.result,
    }));
    const done = this.items.filter((i) => i.status === 'done');
    const totals = {
      files: this.items.length,
      done: done.length,
      failed: this.items.filter((i) => i.status === 'failed').length,
      skipped: this.items.filter((i) => i.status === 'skipped' || i.status === 'unsupported').length,
      canceled: this.items.filter((i) => i.status === 'canceled').length,
      original: done.reduce((a, i) => a + i.size, 0),
      result: done.reduce((a, i) => a + i.result.size, 0),
      queuedBytes: this.items.filter((i) => ['ready', 'queued', 'working', 'done'].includes(i.status) || (i.status === 'failed')).reduce((a, i) => a + i.size, 0),
      cleaned: done.filter((i) => i.result.removed.length).length,
      verified: done.every((i) => i.result.verified),
      lossy: done.filter((i) => i.result.lossy).length,
    };
    const work = this.items.filter((i) => i.inBatch);
    const workBytes = work.reduce((a, i) => a + Math.max(i.size, 1), 0);
    const doneBytes = work.reduce((a, i) => a + Math.max(i.size, 1) * (['done', 'failed', 'skipped', 'canceled'].includes(i.status) ? 1 : i.status === 'working' ? i.progress : 0), 0);
    return {
      items, totals, running: this.running, paused: this.paused,
      overall: workBytes ? doneBytes / workBytes : 0,
      batch: this.batch && { dir: this.batch.dir, name: path.basename(this.batch.dir), finished: this.batch.finished, mode: this.batch.mode, started: this.batch.started },
      helper: this.helperAvailable,
    };
  }

  changed() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.emit('change', this.snapshot()); }, 80);
  }

  // ---- Adding files ----
  async add(paths) {
    const found = [];
    const walk = async (p, base, depth) => {
      let st;
      try { st = await fsp.lstat(p); } catch { return; }
      if (st.isSymbolicLink()) return;
      if (depth > 0 && SQUEEZED.test(path.basename(p))) return; // earlier results inside an added folder
      if (st.isDirectory()) {
        if (depth > 12 || /\.(app|bundle|photoslibrary|framework|pkg|lproj|xcassets)$/i.test(p)) return;
        let names = [];
        try { names = await fsp.readdir(p); } catch { return; }
        names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        for (const n of names) {
          if (n.startsWith('.')) continue;
          if (found.length >= 5000) return;
          await walk(path.join(p, n), base, depth + 1);
        }
      } else if (st.isFile()) {
        found.push({ file: p, rel: base ? path.relative(base, p) : path.basename(p), size: st.size });
      }
    };
    for (const p of paths) {
      const abs = path.resolve(String(p));
      let st;
      try { st = await fsp.lstat(abs); } catch { continue; }
      if (st.isDirectory()) await walk(abs, path.dirname(abs), 0);
      else await walk(abs, null, 0);
    }
    const added = [];
    for (const f of found) {
      if (this.items.some((i) => i.path === f.file && !i.inBatch)) continue;
      const it = { id: crypto.randomUUID(), path: f.file, name: path.basename(f.file), rel: f.rel, size: f.size, status: 'analysing', progress: 0, phase: 'Looking inside…' };
      this.items.push(it);
      added.push(it);
    }
    this.changed();
    for (const it of added) this.analyse(it).catch(() => {});
    return { ok: true, added: added.length };
  }

  async analyse(it) {
    try {
      const d = await sniff(it.path);
      if (d.unsupported) { it.status = 'unsupported'; it.reason = UNSUPPORTED[d.unsupported]; it.phase = ''; this.changed(); return; }
      it.format = d.format;
      it.kind = FORMATS[d.format].kind;
      it.info = {};
      if (this.helperAvailable) {
        const cmd = it.kind === 'image' ? (it.format === 'svg' ? null : 'image-info') : it.kind === 'document' ? 'pdf-info' : 'av-info';
        if (cmd) {
          const r = await this.helper([cmd, it.path], { timeout: 60000, track: false });
          if (!r.ok) throw new Error(r.error);
          it.info = r;
          it.found = (r.metadata || []).filter((m) => m !== 'other' || it.kind !== 'av');
          if (it.kind === 'document' && r.encrypted) { it.status = 'unsupported'; it.reason = 'This PDF is encrypted, so it cannot be cleaned without its password. It was left alone.'; it.phase = ''; this.changed(); return; }
        }
      }
      it.status = 'ready';
      it.phase = '';
    } catch (err) {
      it.status = 'unsupported';
      it.reason = `macOS could not read this file (${String(err.message || err).replace(/\.$/, '')}), so it was left alone.`;
      it.phase = '';
    }
    this.changed();
  }

  remove(id) {
    const i = this.items.findIndex((x) => x.id === id);
    if (i >= 0 && this.items[i].status !== 'working') this.items.splice(i, 1);
    this.changed();
  }

  clear() {
    if (this.running) return;
    this.items = [];
    this.batch = null;
    fs.rmSync(this.previewDir, { recursive: true, force: true });
    this.changed();
  }

  // ---- Helper and worker processes ----
  helper(args, { onProgress, timeout = 0, track = true } = {}) {
    return new Promise((resolve) => {
      const child = spawn(HELPER, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      if (track) this.child = child;
      let out = '', err = '', timer = null;
      if (timeout) timer = setTimeout(() => child.kill('SIGKILL'), timeout);
      child.stdout.on('data', (d) => {
        out += d;
        if (onProgress) {
          const lines = out.split('\n');
          for (const l of lines.slice(-3)) if (l.startsWith('P ')) onProgress(Number(l.slice(2)));
        }
      });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (track && this.child === child) this.child = null;
        const last = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
        if (last) { try { return resolve(JSON.parse(last)); } catch { /* fall through */ } }
        resolve({ ok: false, error: signal ? (this.canceled ? 'Canceled.' : 'The helper stopped.') : (err.trim().split('\n').pop() || `The helper failed (${code}).`) });
      });
    });
  }

  tool(cmd, args) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      this.child = child;
      let err = '';
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', (e) => resolve({ ok: false, error: e.message }));
      child.on('close', (code) => { if (this.child === child) this.child = null; resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `${path.basename(cmd)} failed.` }); });
    });
  }

  work(msg) {
    if (!this.worker) {
      this.worker = new Worker(path.join(__dirname, 'worker.js'));
      this.worker.on('message', (m) => { const c = this.workerCalls.get(m.id); if (c) { this.workerCalls.delete(m.id); c(m); } });
      this.worker.on('error', () => {});
      this.worker.on('exit', () => {
        for (const c of this.workerCalls.values()) c({ ok: false, error: this.canceled ? 'Canceled.' : 'The worker stopped.' });
        this.workerCalls.clear();
        this.worker = null;
      });
    }
    return new Promise((resolve) => {
      const id = this.nextCall++;
      this.workerCalls.set(id, (m) => resolve(m.ok ? { ok: true, ...m.result } : { ok: false, error: m.error }));
      this.worker.postMessage({ id, ...msg });
    });
  }

  // ---- Control ----
  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    if (this.child) try { this.child.kill('SIGSTOP'); } catch { /* gone */ }
    this.changed();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.child) try { this.child.kill('SIGCONT'); } catch { /* gone */ }
    if (this.resumeWait) { this.resumeWait(); this.resumeWait = null; }
    this.changed();
  }

  cancel() {
    if (!this.running) return;
    this.canceled = true;
    if (this.child) { try { this.child.kill('SIGCONT'); this.child.kill('SIGKILL'); } catch { /* gone */ } }
    if (this.worker) this.worker.terminate();
    this.paused = false;
    if (this.resumeWait) { this.resumeWait(); this.resumeWait = null; }
    this.changed();
  }

  async waitIfPaused() {
    while (this.paused && !this.canceled) await new Promise((r) => { this.resumeWait = r; });
  }

  // ---- Running a batch ----
  async start({ mode = 'quick', options = {} }) {
    if (this.running) return { ok: false, error: 'Already squeezing.' };
    if (!this.helperAvailable) return { ok: false, error: 'The SQUEEZE helper is missing from this build.' };
    const todo = this.items.filter((i) => i.status === 'ready');
    if (!todo.length) return { ok: false, error: 'There is nothing ready to squeeze.' };
    if (mode === 'maximum' && !options.approved) return { ok: false, error: 'Maximum Squeeze needs your approval of the quality trade-offs first.' };
    // Results go beside their originals; "the output folder" is the folder
    // all of this batch's originals share.
    const dir = commonDir(todo.map((i) => path.dirname(i.path)));
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'squeeze-work-'));
    this.batch = { dir, workDir, mode, options, started: Date.now(), finished: null };
    this.running = true;
    this.canceled = false;
    this.paused = false;
    for (const it of todo) { it.status = 'queued'; it.inBatch = true; it.progress = 0; it.phase = 'Waiting'; }
    // Files from earlier batches stay listed but do not count towards this one.
    for (const it of this.items) if (!todo.includes(it)) it.inBatch = false;
    this.changed();
    (async () => {
      for (const it of todo) {
        await this.waitIfPaused();
        if (this.canceled) { it.status = 'canceled'; it.phase = 'Canceled; the original is untouched.'; continue; }
        it.status = 'working';
        it.phase = 'Starting';
        this.changed();
        try {
          await this.processOne(it);
        } catch (err) {
          const msg = String(err.message || err);
          if (this.canceled) { it.status = 'canceled'; it.phase = 'Canceled; the original is untouched.'; }
          else { it.status = err.skip ? 'skipped' : 'failed'; it.reason = msg; it.phase = ''; }
        }
        await this.cleanTemp(it);
        this.changed();
      }
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
      this.batch.finished = Date.now();
      this.running = false;
      this.paused = false;
      if (this.worker) { this.worker.terminate(); this.worker = null; }
      this.changed();
      this.emit('finished', this.snapshot());
    })();
    return { ok: true, dir };
  }

  temp(it, ext) {
    const p = path.join(this.batch.workDir, `${it.id}-${(it.temps = (it.temps || 0) + 1)}${ext}`);
    (it.tempFiles = it.tempFiles || []).push(p);
    return p;
  }

  async cleanTemp(it) {
    for (const p of it.tempFiles || []) await fsp.rm(p, { force: true }).catch(() => {});
    it.tempFiles = [];
  }

  step(it, phase, progress) {
    it.phase = phase;
    if (progress !== undefined) it.progress = progress;
    this.changed();
  }

  async processOne(it) {
    const before = await fsp.stat(it.path);
    if (before.size !== it.size) it.size = before.size;
    const ext = path.extname(it.name);
    const plan = await this.plan(it, ext);
    if (this.canceled) throw new Error('Canceled.');
    const after = await fsp.stat(it.path);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('The original changed while it was being read (another app is writing to it), so the result was thrown away.');
    this.step(it, 'Saving', 0.98);
    const dest = plan.file ? await this.place(plan.file, path.join(path.dirname(it.path), `${path.basename(it.name, ext)} (squeezed)${plan.ext || ext}`)) : it.path;
    it.result = {
      size: plan.size, path: dest, name: path.basename(dest), saved: it.size - plan.size, percent: it.size ? (1 - plan.size / it.size) * 100 : 0,
      removed: [...new Set(plan.removed)].map((k) => LABELS[k] || k), remaining: plan.remaining || [], method: plan.method, quality: plan.quality, lossy: !!plan.lossy,
      verified: true, checks: plan.checks, notes: [...new Set(plan.notes || [])], unchanged: !!plan.unchanged, noCopy: !plan.file, after: plan.after || null,
    };
    it.status = 'done';
    it.progress = 1;
    it.phase = '';
  }

  // Moves a finished temporary file to its place without ever replacing anything.
  async place(file, dest) {
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const ext = path.extname(dest), stem = dest.slice(0, dest.length - ext.length);
    for (let n = 1; n < 1000; n++) {
      const target = n === 1 ? dest : `${stem} (${n})${ext}`;
      try {
        await fsp.link(file, target);
        await fsp.rm(file, { force: true });
        return target;
      } catch (err) {
        if (err.code === 'EEXIST') continue;
        if (err.code === 'EXDEV' || err.code === 'EPERM' || err.code === 'ENOTSUP') {
          // Another disk: copy to a hidden name beside the target, check it,
          // then link it into place so a half-written file never shows.
          const hidden = path.join(path.dirname(dest), `.${path.basename(dest)}.squeeze-${crypto.randomUUID()}`);
          try {
            await fsp.copyFile(file, hidden, fs.constants.COPYFILE_EXCL);
            if ((await hashFile(hidden)) !== (await hashFile(file))) throw new Error('The result was damaged while it was being saved, so it was thrown away.');
            for (let m = n; m < 1000; m++) {
              const t = m === 1 ? dest : `${stem} (${m})${ext}`;
              try { await fsp.link(hidden, t); await fsp.rm(file, { force: true }); return t; } catch (e) { if (e.code !== 'EEXIST') throw e; }
            }
            throw new Error('Could not find a free name for the result.');
          } finally {
            await fsp.rm(hidden, { force: true }).catch(() => {});
          }
        }
        throw err;
      }
    }
    throw new Error('Could not find a free name for the result.');
  }

  // ---- Per-format plans ----

  async plan(it, ext) {
    const mode = this.batch.mode;
    const o = this.batch.options || {};
    const lossyOk = mode === 'maximum' && o.approved;
    this.step(it, 'Reading', 0.05);
    const k = it.kind;
    let best = null;
    const tryLossless = async () => {
      if (k === 'image') return this.losslessImage(it, ext, mode);
      if (k === 'document') return this.pdfPlan(it, mode);
      if (it.format === 'mp4' || it.format === 'mov' || it.format === 'm4v' || it.format === 'm4a') return this.remux(it, ext, o);
      return this.audioClean(it, ext, o);
    };
    // HEIC photos become JPG when that setting is on (it is by default).
    if (it.format === 'heif' && o.convertHeic) {
      try {
        return await this.heicToJpeg(it, mode === 'maximum' && o.approved && o.lossyImages ? (o.imageQuality || 0.85) : 0.92);
      } catch (err) {
        if (this.canceled) throw err;
        best = await tryLossless();
        best.notes.push(`It stayed a HEIC: ${err.message}.`);
        return best;
      }
    }
    best = await tryLossless();
    // Maximum Squeeze: an approved lossy (or format-changing) step, kept only
    // when it is clearly smaller and passes its checks.
    if (lossyOk && !this.canceled) {
      let alt = null;
      try {
        if (it.format === 'jpeg' && o.lossyImages) alt = await this.reencodeImage(it, 'public.jpeg', '.jpg', o.imageQuality || 0.85);
        else if (it.format === 'heif' && o.lossyImages) alt = await this.reencodeImage(it, 'public.heic', ext, o.imageQuality || 0.85);
        else if (it.kind === 'video' && o.video) alt = await this.reencodeVideo(it, ext);
        else if ((it.format === 'wav' || it.format === 'aiff') && o.flac) alt = await this.toFlac(it, o);
        else if ((it.format === 'wav' || it.format === 'aiff' || it.format === 'flac') && o.aac) alt = await this.toAac(it);
      } catch (err) {
        if (this.canceled) throw err;
        (best ? best.notes : []).push(`The stronger option was not used: ${err.message}`);
      }
      if (alt && best && alt.size < best.size * 0.95) {
        alt.removed = [...new Set([...(best.removed || []), ...(alt.removed || [])])];
        best = alt;
      } else if (alt && best) {
        best.notes.push('The stronger setting would not have saved enough to be worth the quality cost, so the lossless result was kept.');
      } else if (alt && !best) best = alt;
    }
    if (!best) throw Object.assign(new Error('No safe way to optimise this file was found.'), { skipOnly: true });
    // Nothing gained and nothing removed: hand back an exact copy.
    if (best.size >= it.size && !best.removed.length && !best.lossy && !best.converted) return this.copyPlan(it, ext, best.notes);
    if (best.size > it.size * 1.02 && !best.lossy) {
      if (best.removed.length) best.notes.push('The file grew slightly because its structure was rewritten; it was kept because personal metadata was removed.');
      else return this.copyPlan(it, ext, best.notes);
    }
    return best;
  }

  // Nothing to gain: no second, identical file is made next to the original.
  async copyPlan(it, ext, notes = []) {
    return {
      file: null, size: it.size, removed: [], method: 'Already as small and clean as it safely gets, so no copy was made', quality: 'Identical (the original, untouched)', unchanged: true,
      checks: ['Original left exactly as it was'], notes,
    };
  }

  async verifyImage(it, file, { svg = false, lossless = true } = {}) {
    this.step(it, 'Verifying', 0.85);
    const cmp = await this.helper(['image-compare', it.path, file, ...(svg ? ['--svg'] : [])]);
    if (!cmp.ok) throw new Error(cmp.error);
    if (!cmp.opens) throw new Error(cmp.reason || 'The result does not open.');
    if (cmp.reason) throw new Error(cmp.reason);
    const checks = [`Opens as a ${FORMATS[it.format].label}`, `Same size: ${cmp.width} × ${cmp.height}${cmp.frames > 1 ? `, ${cmp.frames} frames` : ''}`];
    if (!svg) {
      const info = await this.helper(['image-info', file]);
      if (!info.ok) throw new Error('The result does not open as an image.');
      const want = it.info || {};
      if (want.orientation && info.orientation !== want.orientation) throw new Error('The orientation would change.');
      if (JSON.stringify(want.auxiliary || []) !== JSON.stringify(info.auxiliary || [])) throw new Error('HDR, depth or matte data would be lost.');
      if ((want.profile || '') !== (info.profile || '')) throw new Error('The colour profile would change.');
      checks.push('Orientation, colour profile and HDR data kept');
      if (want.auxiliary?.length) checks.push(`Kept: ${want.auxiliary.map((a) => ({ gainmap: 'HDR gain map', isogainmap: 'HDR gain map', depth: 'depth', disparity: 'depth', matte: 'portrait matte' })[a] || a).filter((v, i, l) => l.indexOf(v) === i).join(', ')}`);
      it.afterInfo = info;
    }
    if (lossless) {
      if (!cmp.identical) throw new Error('The pixels would change.');
      checks.push(svg ? 'Draws identically' : 'Every pixel identical');
    }
    return { cmp, checks };
  }

  async losslessImage(it, ext, mode) {
    this.step(it, 'Removing metadata', 0.2);
    if (it.format === 'tiff') {
      const file = this.temp(it, ext);
      const r = await this.helper(['image-encode', it.path, file, '--type', 'public.tiff', '--lzw']);
      if (!r.ok) throw new Error(r.error);
      const { checks } = await this.verifyImage(it, file);
      const size = (await fsp.stat(file)).size;
      return { file, size, removed: it.found || [], method: 'TIFF rewritten with lossless LZW compression; personal metadata left out', quality: 'Lossless · every pixel identical', checks, notes: [], after: this.afterMeta(it) };
    }
    const op = it.format === 'png' && mode !== 'pure' ? 'optimise' : 'clean';
    const file = this.temp(it, ext);
    this.step(it, it.format === 'png' && op === 'optimise' ? 'Recompressing losslessly' : 'Removing metadata', 0.3);
    const r = await this.work({ op, format: it.format, input: it.path, output: file, opts: { level: mode === 'maximum' ? 'thorough' : 'quick' } });
    if (!r.ok) throw Object.assign(new Error(r.error), { skip: true });
    const { checks } = await this.verifyImage(it, file, { svg: it.format === 'svg' });
    const methods = {
      jpeg: 'Metadata segments removed; the compressed image data copied byte for byte',
      heif: 'EXIF and XMP overwritten in place; the image data copied byte for byte',
      png: op === 'optimise' ? 'Lossless recompression (filters, compression, colour storage) and metadata removal' : 'Metadata chunks removed; the image data copied byte for byte',
      webp: 'EXIF and XMP chunks removed; the image data copied byte for byte',
      gif: 'Comments and metadata blocks removed; the frames copied byte for byte',
      svg: 'Comments, metadata and editor data removed',
    };
    const quality = r.lossless === 'pixel-exact' ? 'Lossless · every pixel identical' : it.format === 'svg' ? 'Lossless · draws identically' : 'Lossless · image data bit-for-bit identical';
    return { file, size: r.size, removed: r.removed, method: methods[it.format], quality, checks, notes: r.notes || [], after: this.afterMeta(it) };
  }

  afterMeta(it) {
    const left = (it.afterInfo?.metadata || []).filter((m) => m !== 'other');
    return left.map((k) => LABELS[k] || k);
  }

  async reencodeImage(it, type, ext, quality) {
    if (it.format === 'heif' && (it.info?.auxiliary || []).some((a) => a === 'depth' || a === 'disparity' || a === 'matte')) {
      throw new Error('this HEIC has portrait depth or matte data that re-encoding would drop');
    }
    this.step(it, `Re-encoding at quality ${Math.round(quality * 100)}`, 0.5);
    const raw = this.temp(it, ext);
    const r = await this.helper(['image-encode', it.path, raw, '--type', type, '--quality', String(quality)]);
    if (!r.ok) throw new Error(r.error);
    const file = this.temp(it, ext);
    const c = await this.work({ op: 'clean', format: it.format, input: raw, output: file, opts: {} });
    if (!c.ok) throw new Error(c.error);
    const { cmp, checks } = await this.verifyImage(it, file, { lossless: false });
    if (cmp.psnr < 38) throw new Error(`the quality loss would be visible (PSNR ${cmp.psnr} dB)`);
    checks.push(`Visual difference measured: PSNR ${cmp.psnr} dB`);
    return {
      file, size: c.size, removed: [...(it.found || []), ...(c.removed || [])], lossy: true, checks, notes: c.notes || [], after: this.afterMeta(it),
      method: `Re-encoded as ${FORMATS[it.format].label} at quality ${Math.round(quality * 100)} (you approved this)`,
      quality: `Lossy · high quality, not identical (PSNR ${cmp.psnr} dB)`,
    };
  }

  // HEIC → JPG: a new JPEG at high quality, without personal metadata. Size,
  // orientation, colour profile and the HDR gain map are kept and checked.
  async heicToJpeg(it, quality) {
    const aux = it.info?.auxiliary || [];
    if ((it.info?.frames || 1) > 1) throw new Error('it holds more than one picture, and a JPG can hold only one');
    this.step(it, `Converting to JPG at quality ${Math.round(quality * 100)}`, 0.4);
    const raw = this.temp(it, '.jpg');
    const r = await this.helper(['image-encode', it.path, raw, '--type', 'public.jpeg', '--quality', String(quality)]);
    if (!r.ok) throw new Error(r.error);
    this.step(it, 'Removing metadata', 0.6);
    const file = this.temp(it, '.jpg');
    const c = await this.work({ op: 'clean', format: 'jpeg', input: raw, output: file, opts: {} });
    if (!c.ok) throw new Error(c.error);
    this.step(it, 'Verifying', 0.8);
    const cmp = await this.helper(['image-compare', it.path, file]);
    if (!cmp.ok) throw new Error(cmp.error);
    if (!cmp.opens) throw new Error(cmp.reason || 'the JPG does not open');
    if (cmp.reason) throw new Error(cmp.reason.replace(/\.$/, ''));
    if (cmp.psnr < 38) throw new Error(`the JPG would look visibly different (PSNR ${cmp.psnr} dB)`);
    const info = await this.helper(['image-info', file]);
    if (!info.ok) throw new Error('the JPG does not open as an image');
    if (info.type && info.type !== 'public.jpeg') throw new Error('the result is not a JPEG');
    const want = it.info || {};
    if (want.orientation && info.orientation !== want.orientation) throw new Error('the orientation would change');
    if ((want.profile || '') !== (info.profile || '')) throw new Error('the colour profile would change');
    it.afterInfo = info;
    const gain = (l) => (l || []).some((a) => a === 'gainmap' || a === 'isogainmap');
    const notes = [];
    if (gain(aux) && !gain(info.auxiliary)) notes.push('The HDR brightness boost (gain map) could not be carried into the JPG, so it shows as a normal photo on HDR screens.');
    const dropped = aux.filter((a) => a === 'depth' || a === 'disparity' || a === 'matte');
    if (dropped.length) notes.push('Portrait depth and matte data cannot go into a JPG, so the portrait effect can no longer be edited.');
    const size = c.size;
    if (size > it.size) notes.push(`JPG is a less efficient format than HEIC, so this file is ${human(size - it.size)} larger. You asked for HEIC photos to be converted; you can turn this off in the widget’s settings.`);
    const checks = ['Opens as a JPEG', `Same size: ${cmp.width} × ${cmp.height}`, 'Orientation and colour profile kept', `Visual difference measured: PSNR ${cmp.psnr} dB`];
    if (gain(info.auxiliary)) checks.push('Kept: HDR gain map');
    return {
      file, size, ext: '.jpg', converted: true, lossy: true, removed: [...(it.found || []), ...(c.removed || [])], checks, notes: [...notes, ...(c.notes || [])], after: this.afterMeta(it),
      method: `Converted from HEIC to JPG at quality ${Math.round(quality * 100)}; personal metadata left out`,
      quality: `Re-encoded · high quality, not identical (PSNR ${cmp.psnr} dB)`,
    };
  }

  async pdfPlan(it, mode) {
    const file = this.temp(it, '.pdf');
    this.step(it, mode === 'pure' ? 'Removing metadata' : 'Rebuilding and recompressing', 0.25);
    const r = await this.work({ op: mode === 'pure' ? 'clean' : 'optimise', format: 'pdf', input: it.path, output: file, opts: {} });
    if (!r.ok) throw Object.assign(new Error(r.error), { skip: true });
    this.step(it, 'Verifying every page', 0.7);
    const cmp = await this.helper(['pdf-compare', it.path, file]);
    if (!cmp.ok) throw new Error(cmp.error);
    if (!cmp.opens) throw new Error(cmp.reason || 'The result does not open.');
    if (cmp.reason) throw new Error(cmp.reason);
    if (!cmp.identical) throw new Error('A page would look different, so the result was thrown away.');
    if (!cmp.textSame) throw new Error('The text would no longer copy or search the same way, so the result was thrown away.');
    const [fa, fb] = await Promise.all([this.work({ op: 'features', input: it.path }), this.work({ op: 'features', input: file })]);
    if (!fa.ok || !fb.ok) throw new Error('The PDF structure could not be checked.');
    for (const [k, label] of [['tagged', 'accessibility tags'], ['forms', 'form fields'], ['outlines', 'bookmarks'], ['names', 'named destinations and attachments']]) {
      if (fa.features[k] && !fb.features[k]) throw new Error(`The ${label} would be lost.`);
    }
    const info = await this.helper(['pdf-info', file]);
    it.afterInfo = info.ok ? info : null;
    const kept = [['tagged', 'accessibility tags'], ['forms', 'forms'], ['outlines', 'bookmarks']].filter(([k]) => fa.features[k]).map(([, l]) => l);
    const checks = [
      `Opens as a PDF with all ${cmp.pages} page${cmp.pages === 1 ? '' : 's'}`,
      `${cmp.pagesChecked === cmp.pages ? 'Every page' : `${cmp.pagesChecked} pages spread through the document`} drawn and compared: identical`,
      'Text copies and searches the same',
      ...(kept.length ? [`Kept: ${kept.join(', ')}`] : []),
    ];
    const notes = [...(r.notes || [])];
    if (info.ok && (info.metadata || []).length) notes.push('macOS reports the producer and dates of the new file as written by this rewrite, not your original details.');
    return {
      file, size: r.size, removed: r.removed, checks, notes,
      method: mode === 'pure' ? 'Rebuilt with only the objects in use; page content, fonts and images copied unchanged; metadata removed' : 'Rebuilt with only the objects in use, streams recompressed losslessly, small objects packed; metadata removed',
      quality: 'Lossless · pages render identically',
    };
  }

  async avChecks(it, file, { exact = true, decode = false } = {}) {
    this.step(it, 'Verifying sound and picture', 0.85);
    const info = await this.helper(['av-info', file]);
    if (!info.ok) throw new Error('The result does not open.');
    const a = it.info || {};
    if (Math.abs((info.duration || 0) - (a.duration || 0)) > 0.1) throw new Error('The duration would change.');
    const kinds = (x) => (x.tracks || []).filter((t) => t.type !== 'meta').map((t) => t.type).join(',');
    if (kinds(info) !== kinds(a)) throw new Error('A picture or sound track would be lost.');
    const va = (a.tracks || []).find((t) => t.type === 'vide'), vb = (info.tracks || []).find((t) => t.type === 'vide');
    if (va && vb && (va.width !== vb.width || va.height !== vb.height)) throw new Error('The picture size would change.');
    if (va && vb && Math.abs(va.fps - vb.fps) > 0.05) throw new Error('The frame rate would change.');
    const sa = (a.tracks || []).find((t) => t.type === 'soun'), sb = (info.tracks || []).find((t) => t.type === 'soun');
    if (sa && sb && (sa.sampleRate !== sb.sampleRate || sa.channels !== sb.channels)) throw new Error('The sample rate or channels would change.');
    const checks = [
      `Opens and plays: ${fmtDuration(info.duration)}`,
      ...(va ? [`Picture: ${va.width} × ${va.height}, ${va.fps} fps, ${codecName(va.codec)}${vb && vb.codec !== va.codec ? ` → ${codecName(vb.codec)}` : ''}`] : []),
      ...(sa ? [`Sound: ${(sa.sampleRate / 1000).toFixed(1)} kHz, ${sa.channels === 1 ? 'mono' : sa.channels === 2 ? 'stereo' : `${sa.channels} channels`}, ${codecName(sa.codec)}${sb && sb.codec !== sa.codec ? ` → ${codecName(sb.codec)}` : ''}`] : []),
    ];
    if (exact) {
      const [ha, hb] = await Promise.all([this.helper(['av-hash', it.path, ...(decode ? ['--decode'] : [])]), this.helper(['av-hash', file, ...(decode ? ['--decode'] : [])])]);
      if (!ha.ok || !hb.ok) throw new Error('The sound and picture could not be compared.');
      const sig = (h) => h.tracks.map((t) => `${t.type}:${t.samples}:${t.sha}`).join('|');
      if (sig(ha) !== sig(hb)) throw new Error(decode ? 'The decoded sound would differ.' : 'The encoded sound or picture would change.');
      checks.push(decode ? 'Decoded sound identical, sample for sample' : `Every ${va ? 'frame and ' : ''}audio sample identical`);
    }
    it.afterInfo = info;
    return { info, checks };
  }

  async remux(it, ext, o) {
    const type = { mp4: 'mp4', mov: 'mov', m4v: 'm4v', m4a: 'm4a' }[it.format];
    const file = this.temp(it, ext);
    this.step(it, 'Copying sound and picture without re-encoding', 0.1);
    const args = ['av-export', it.path, file, '--type', type];
    if (it.kind === 'audio' && o.keepTags !== false) args.push('--keep-tags');
    if (it.kind === 'audio' && o.keepArt !== false) args.push('--keep-art');
    const r = await this.helper(args, { onProgress: (p) => this.step(it, 'Copying sound and picture without re-encoding', 0.1 + p * 0.65) });
    if (!r.ok) throw Object.assign(new Error(r.error), { skip: true });
    const { checks } = await this.avChecks(it, file);
    const size = (await fsp.stat(file)).size;
    const left = (it.afterInfo?.metadata || []).filter((m) => !['other', 'tags', 'artwork'].includes(m));
    return {
      file, size, removed: (it.found || []).filter((m) => !(it.kind === 'audio' && o.keepTags !== false && m === 'tags') && !(it.kind === 'audio' && o.keepArt !== false && m === 'artwork')),
      checks, notes: it.info?.tracks?.some((t) => t.type === 'meta') ? ['Timed metadata tracks (such as location over time and camera motion) were left out.'] : [],
      method: 'Rewrapped without re-encoding: the same encoded picture and sound in a fresh container, without the file’s metadata',
      quality: 'Lossless · picture and sound bit-for-bit identical', remaining: left.map((k) => LABELS[k] || k),
    };
  }

  async audioClean(it, ext, o) {
    const file = this.temp(it, ext);
    this.step(it, 'Removing tags', 0.3);
    const r = await this.work({ op: 'clean', format: it.format, input: it.path, output: file, opts: { keepTags: o.keepTags !== false, keepArt: o.keepArt !== false } });
    if (!r.ok) throw Object.assign(new Error(r.error), { skip: true });
    const { checks } = await this.avChecks(it, file);
    checks.unshift('Audio bytes copied exactly');
    return {
      file, size: r.size, removed: r.removed, checks, notes: r.notes || [],
      method: `Tags removed around the audio; the ${FORMATS[it.format].label} audio copied byte for byte`,
      quality: 'Lossless · audio bit-for-bit identical',
    };
  }

  async reencodeVideo(it, ext) {
    const v = (it.info?.tracks || []).find((t) => t.type === 'vide');
    if (!v) throw new Error('there is no picture to re-encode');
    if (v.codec === 'hvc1' || v.codec === 'hev1') throw new Error('it is already HEVC; encoding it again would only lose quality');
    const type = { mp4: 'mp4', mov: 'mov', m4v: 'm4v' }[it.format];
    const file = this.temp(it, ext);
    const r = await this.helper(['av-export', it.path, file, '--type', type, '--preset', 'AVAssetExportPresetHEVCHighestQuality'], { onProgress: (p) => this.step(it, 'Re-encoding as HEVC', 0.3 + p * 0.5) });
    if (!r.ok) throw new Error(r.error);
    const { checks } = await this.avChecks(it, file, { exact: false });
    const size = (await fsp.stat(file)).size;
    return {
      file, size, removed: it.found || [], checks, notes: [], lossy: true,
      method: 'Re-encoded as HEVC with macOS’s highest quality setting (you approved this); same size, frame rate and duration',
      quality: 'Lossy · high quality, not identical',
    };
  }

  async toFlac(it, o) {
    const raw = this.temp(it, '.flac');
    this.step(it, 'Converting to FLAC (lossless)', 0.5);
    const r = await this.tool('/usr/bin/afconvert', ['-f', 'flac', '-d', 'flac', it.path, raw]);
    if (!r.ok) throw new Error(r.error);
    const file = this.temp(it, '.flac');
    const c = await this.work({ op: 'clean', format: 'flac', input: raw, output: file, opts: { keepTags: false, keepArt: false } });
    if (!c.ok) throw new Error(c.error);
    const { checks } = await this.avChecks(it, file, { decode: true });
    return {
      file, size: c.size, ext: '.flac', converted: true, removed: [...(it.found || [])], checks,
      notes: ['WAV and AIFF markers, loops and broadcast details do not carry over to FLAC.'],
      method: 'Converted to FLAC, a lossless format (you approved the format change)',
      quality: 'Lossless · decoded sound identical, sample for sample',
    };
  }

  async toAac(it) {
    const file = this.temp(it, '.m4a');
    this.step(it, 'Encoding AAC at 256 kbps', 0.5);
    const r = await this.tool('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '256000', '-q', '127', it.path, file]);
    if (!r.ok) throw new Error(r.error);
    const { checks } = await this.avChecks(it, file, { exact: false });
    return {
      file, size: (await fsp.stat(file)).size, ext: '.m4a', converted: true, lossy: true, removed: it.found || [], checks, notes: [],
      method: 'Encoded as AAC at 256 kbps (you approved this lossy step)',
      quality: 'Lossy · high quality, not identical',
    };
  }

  // ---- Previews ----
  async preview(id, which, page = 1) {
    const it = this.items.find((x) => x.id === id);
    if (!it) return { ok: false, error: 'Not found.' };
    const file = which === 'after' ? it.result?.path : it.path;
    if (!file) return { ok: false, error: 'No result yet.' };
    const direct = ['jpeg', 'png', 'gif', 'webp', 'svg'];
    const resultExt = path.extname(file).slice(1).toLowerCase();
    if (it.kind === 'image' && direct.includes(it.format)) return { ok: true, kind: 'image', file };
    if (it.kind === 'video' || it.kind === 'audio') return { ok: true, kind: it.kind, file, ext: resultExt };
    await fsp.mkdir(this.previewDir, { recursive: true });
    const out = path.join(this.previewDir, `${id}-${which}-${page}.png`);
    if (!fs.existsSync(out)) {
      const r = it.kind === 'document'
        ? await this.helper(['pdf-preview', file, out, '--page', String(page), '--max', '1400'], { track: false })
        : await this.helper(['image-preview', file, out, '--max', '1800'], { track: false });
      if (!r.ok) return { ok: false, error: r.error };
      if (it.kind === 'document') it.pages = r.pages;
    }
    return { ok: true, kind: it.kind === 'document' ? 'page' : 'image', file: out, pages: it.pages || it.info?.pages || 1 };
  }

  item(id) { return this.items.find((x) => x.id === id); }

  // Expected changes for Maximum Squeeze, shown before you approve it.
  async estimate() {
    const out = [];
    for (const it of this.items.filter((i) => i.status === 'ready' && i.kind === 'video')) {
      const v = (it.info?.tracks || []).find((t) => t.type === 'vide');
      if (!v || v.codec === 'hvc1' || v.codec === 'hev1') continue;
      const r = await this.helper(['av-estimate', it.path, '--preset', 'AVAssetExportPresetHEVCHighestQuality'], { timeout: 20000, track: false });
      if (r.ok && r.bytes > 0) out.push({ id: it.id, name: it.name, from: it.size, to: r.bytes });
    }
    return out;
  }
}

function codecName(c) {
  return ({ avc1: 'H.264', hvc1: 'HEVC', hev1: 'HEVC', apcn: 'ProRes 422', apch: 'ProRes 422 HQ', ap4h: 'ProRes 4444', 'aac': 'AAC', '.mp3': 'MP3', lpcm: 'PCM', alac: 'Apple Lossless', flac: 'FLAC', apac: 'Spatial Audio', 'ac-3': 'Dolby Digital', 'ec-3': 'Dolby Digital Plus', av01: 'AV1', vp09: 'VP9' })[c] || c;
}
function fmtDuration(s) {
  if (!Number.isFinite(s)) return '';
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m ? `${m} min ${sec} s` : `${(Math.round(s * 10) / 10)} s`;
}
function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

module.exports = { SQUEEZED, commonDir, Engine, sniff, human, FORMATS, LABELS, HELPER };
