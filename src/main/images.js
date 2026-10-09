'use strict';

// Photos for the Photo widget are copied into Morrow's own data folder, so a
// widget keeps working if the original is moved, renamed or deleted.
// Formats Chromium can't display (HEIC, TIFF) are converted to JPEG with
// macOS's built-in `sips`.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const MAX = 2400; // longest side kept; larger photos are scaled down to save memory

function sips(args) {
  return new Promise((resolve, reject) =>
    execFile('/usr/bin/sips', args, { timeout: 30000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))));
}

async function shrink(file) {
  try {
    const out = await sips(['-g', 'pixelWidth', '-g', 'pixelHeight', file]);
    const [w, h] = [/pixelWidth: (\d+)/, /pixelHeight: (\d+)/].map((r) => Number((r.exec(out) || [])[1] || 0));
    if (Math.max(w, h) > MAX) await sips(['-Z', String(MAX), file]);
  } catch {
    // Keep the full-size copy if sips can't read it; Chromium may still display it.
  }
}

const DIRECT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);
const CONVERT = new Set(['.heic', '.heif', '.tif', '.tiff']);

function createImages(dataDir) {
  const dir = path.join(dataDir, 'images');

  async function importImage(src) {
    if (!src || !fs.existsSync(src)) throw new Error('That file can’t be found.');
    const ext = path.extname(src).toLowerCase();
    if (!DIRECT.has(ext) && !CONVERT.has(ext)) throw new Error('Choose a photo: JPEG, PNG, HEIC, GIF, WebP or TIFF.');
    fs.mkdirSync(dir, { recursive: true });
    const id = crypto.randomUUID();
    let dest;
    if (DIRECT.has(ext)) {
      dest = path.join(dir, id + (ext === '.jpeg' ? '.jpg' : ext));
      await fs.promises.copyFile(src, dest);
      if (ext !== '.gif') await shrink(dest); // keep animated GIFs as they are
    } else {
      dest = path.join(dir, id + '.jpg');
      try {
        await sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', src, '--out', dest]);
      } catch {
        throw new Error('macOS couldn’t convert that photo.');
      }
      await shrink(dest);
    }
    return { file: dest, name: path.basename(src) };
  }

  // Delete copies no widget in any layout uses any more.
  function cleanup(doc) {
    let files;
    try { files = fs.readdirSync(dir); } catch { return; }
    const used = new Set();
    for (const l of doc.layouts) for (const w of l.widgets) {
      if (w.config && w.config.file) used.add(path.basename(w.config.file));
      if (w.appearance && w.appearance.image && w.appearance.image.startsWith(dir)) used.add(path.basename(w.appearance.image));
    }
    for (const f of files) if (!used.has(f)) fs.rm(path.join(dir, f), { force: true }, () => {});
  }

  return { dir, importImage, cleanup };
}

module.exports = { createImages };
