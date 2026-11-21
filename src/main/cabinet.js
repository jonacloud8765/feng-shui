'use strict';

// File Cabinet: the file system side of the File Cabinet widget.
//
// Everything works inside one chosen folder (the "root", the Downloads folder
// unless you pick another). Paths from the widget are checked to be inside it
// before anything is read or moved. Deleting never erases a file: items go to
// the Trash, so they can be put back.

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { shell } = require('electron');

const DAY = 24 * 3600 * 1000;
const HASH_CAP = 80 * 1024 * 1024;
const LARGE = 100 * 1024 * 1024;

function defaultRoot() {
  return path.join(os.homedir(), 'Downloads');
}

function rootOf(root) {
  return path.resolve(root || defaultRoot());
}

function inside(root, p) {
  const r = rootOf(root);
  const q = path.resolve(p);
  return q === r || q.startsWith(r + path.sep);
}

function check(root, p) {
  if (!p || !inside(root, p)) throw new Error('That is outside the folder File Cabinet is looking at.');
  return path.resolve(p);
}

async function entry(dir, name) {
  const p = path.join(dir, name);
  try {
    const st = await fsp.lstat(p);
    if (st.isSymbolicLink()) return null;
    return { name, path: p, dir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, hidden: name.startsWith('.') };
  } catch {
    return null;
  }
}

// The contents of one folder.
async function list(root, dir) {
  const d = check(root, dir || rootOf(root));
  const names = await fsp.readdir(d);
  const items = (await Promise.all(names.map((n) => entry(d, n)))).filter(Boolean);
  return { ok: true, dir: d, root: rootOf(root), items };
}

// The subfolders of one folder, for the tree, with whether each has any of its own.
async function folders(root, dir) {
  const d = check(root, dir || rootOf(root));
  const ents = await fsp.readdir(d, { withFileTypes: true });
  const out = [];
  for (const e of ents) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    let kids = false;
    try {
      const sub = await fsp.readdir(p, { withFileTypes: true });
      kids = sub.some((s) => s.isDirectory() && !s.name.startsWith('.'));
    } catch { /* unreadable */ }
    out.push({ name: e.name, path: p, kids });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return { ok: true, dir: d, folders: out };
}

// The first few kilobytes of a text file.
async function peek(root, p) {
  const f = check(root, p);
  const fh = await fsp.open(f, 'r');
  try {
    const buf = Buffer.alloc(6000);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const text = buf.subarray(0, bytesRead).toString('utf8');
    // Mostly control characters means it isn't really text.
    const odd = (text.match(/[\u0000-\u0008\u000e-\u001f�]/g) || []).length;
    return { ok: true, text: odd > text.length * 0.05 ? null : text };
  } finally {
    await fh.close();
  }
}

// Move items to the Trash. Every path must be inside the root, and the root
// itself can never go.
async function trash(root, paths) {
  const r = rootOf(root);
  const done = [];
  const failed = [];
  for (const p of paths || []) {
    try {
      const f = check(root, p);
      if (f === r) throw new Error('The folder itself can’t be deleted.');
      await shell.trashItem(f);
      done.push(f);
    } catch (err) {
      failed.push({ path: p, error: String(err.message || err) });
    }
  }
  return { ok: !failed.length, done, failed };
}

function open(root, p) {
  return shell.openPath(check(root, p));
}

function reveal(root, p) {
  shell.showItemInFolder(check(root, p));
}

// ---- Disk Cleanup ----

const TEMP = new Set(['.tmp', '.temp', '.bak', '.old']);
const PARTIAL = new Set(['.crdownload', '.part', '.partial', '.download']);
const META = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', 'ehthumbs.db']);
const INSTALLER = new Set(['.exe', '.msi', '.dmg', '.pkg', '.iso', '.appx', '.msix']);

// What kind of junk a file looks like, and whether it is ticked to begin with.
function classify(name, st, now) {
  const lower = name.toLowerCase();
  const ext = path.extname(lower);
  if (META.has(lower)) return { kind: 'Metadata', checked: true };
  if (lower.startsWith('~$')) return { kind: 'Lock file', checked: true };
  if (PARTIAL.has(ext)) return { kind: 'Incomplete', checked: true };
  if (TEMP.has(ext) || lower.endsWith('~')) return { kind: 'Temp', checked: true };
  // Installers count as old only with a known date over 30 days back.
  if (INSTALLER.has(ext) && st.mtimeMs && now - st.mtimeMs > 30 * DAY) return { kind: 'Old installer', checked: false };
  if (st.size >= LARGE) return { kind: 'Large file', checked: false };
  return null;
}

function hashFile(p, size, cancelled) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(p, { highWaterMark: 1 << 20 });
    s.on('data', (d) => { if (cancelled()) s.destroy(new Error('cancelled')); else h.update(d); });
    s.on('error', reject);
    s.on('end', () => resolve(h.digest('hex')));
  });
}

const running = new Map(); // scan id -> { cancelled }

function cancelScan(id) {
  const job = running.get(id);
  if (job) job.cancelled = true;
}

// Walk the root and sort out what looks like junk. progress({ frac, name }) is
// called along the way. Nothing is deleted here.
async function scan(root, id, progress) {
  const r = rootOf(root);
  const job = { cancelled: false };
  running.set(id, job);
  const cancelled = () => job.cancelled;
  const found = [];
  const files = [];
  const emptyDirs = [];
  const now = Date.now();
  let last = 0;
  const tick = (frac, name) => {
    const t = Date.now();
    if (t - last > 60) { last = t; progress({ frac, name }); }
  };
  try {
    const top = await fsp.readdir(r);
    let i = 0;
    function addFile(p, name, st) {
      const f = { path: p, name, size: st.size, mtime: st.mtimeMs };
      files.push(f);
      const kind = classify(name, st, now);
      if (kind) found.push({ ...f, ...kind });
    }
    // Returns true when the folder holds nothing (or only empty folders).
    async function walk(dir) {
      if (cancelled()) return false;
      let ents;
      try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return false; }
      let empty = true;
      for (const e of ents) {
        if (cancelled()) return false;
        const p = path.join(dir, e.name);
        if (e.isSymbolicLink()) { empty = false; continue; }
        if (e.isDirectory()) {
          if (e.name === '__MACOSX') {
            found.push({ path: p, name: e.name, dir: true, size: await dirSize(p), kind: 'Metadata', checked: true });
            empty = false;
            continue;
          }
          if (/\.(app|photoslibrary|bundle|framework)$/i.test(e.name)) { empty = false; continue; }
          const sub = await walk(p);
          if (sub) emptyDirs.push(p); else empty = false;
          continue;
        }
        empty = false;
        let st;
        try { st = await fsp.stat(p); } catch { continue; }
        addFile(p, e.name, st);
        tick((i / Math.max(1, top.length)) * 0.6, e.name);
      }
      return empty;
    }
    for (const name of top) {
      if (cancelled()) break;
      i++;
      progress({ frac: (i / Math.max(1, top.length)) * 0.6, name });
      const p = path.join(r, name);
      let st;
      try { st = await fsp.lstat(p); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (name === '__MACOSX') { found.push({ path: p, name, dir: true, size: await dirSize(p), kind: 'Metadata', checked: true }); continue; }
        if (/\.(app|photoslibrary|bundle|framework)$/i.test(name)) continue;
        if (await walk(p)) emptyDirs.push(p);
      } else {
        addFile(p, name, st);
      }
    }
    if (cancelled()) return { ok: false, cancelled: true };

    // Duplicates: same size first, then the same contents.
    const flagged = new Set(found.map((x) => x.path));
    const bySize = new Map();
    for (const f of files) {
      if (f.size < 1024 || flagged.has(f.path)) continue;
      if (!bySize.has(f.size)) bySize.set(f.size, []);
      bySize.get(f.size).push(f);
    }
    const groups = [...bySize.values()].filter((g) => g.length > 1);
    const total = groups.reduce((t, g) => t + g.reduce((s, f) => s + Math.min(f.size, HASH_CAP), 0), 0) || 1;
    let doneBytes = 0;
    for (const g of groups) {
      if (cancelled()) return { ok: false, cancelled: true };
      const byHash = new Map();
      for (const f of g) {
        if (cancelled()) return { ok: false, cancelled: true };
        progress({ frac: 0.6 + 0.4 * (doneBytes / total), name: f.name });
        let key;
        if (f.size > HASH_CAP) key = `size:${f.size}`;
        else {
          try { key = await hashFile(f.path, f.size, cancelled); } catch { continue; }
        }
        doneBytes += Math.min(f.size, HASH_CAP);
        if (!byHash.has(key)) byHash.set(key, []);
        byHash.get(key).push(f);
      }
      for (const [key, same] of byHash) {
        if (same.length < 2) continue;
        // Keep the oldest as the original.
        same.sort((a, b) => a.mtime - b.mtime);
        const original = same[0];
        for (const f of same.slice(1)) {
          found.push({ ...f, kind: 'Duplicate', checked: false, note: `${key.startsWith('size:') ? 'Same size as' : 'Duplicate of'} ${path.relative(r, original.path)}` });
        }
      }
    }
    for (const p of emptyDirs) {
      // Only report the outermost empty folder of a nest.
      if (emptyDirs.some((q) => q !== p && p.startsWith(q + path.sep))) continue;
      found.push({ path: p, name: path.basename(p), dir: true, size: 0, kind: 'Empty folder', checked: false });
    }
    progress({ frac: 1, name: '' });
    found.forEach((x) => { x.rel = path.relative(r, x.path); });
    return { ok: true, items: found, scanned: files.length };
  } finally {
    running.delete(id);
  }
}

async function dirSize(dir) {
  let total = 0;
  try {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += await dirSize(p);
      else if (e.isFile()) { try { total += (await fsp.stat(p)).size; } catch { /* gone */ } }
    }
  } catch { /* unreadable */ }
  return total;
}

module.exports = { defaultRoot, list, folders, peek, trash, open, reveal, scan, cancelScan, inside };
