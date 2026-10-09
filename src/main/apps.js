'use strict';

// Discovers installed applications and serves their real icons. Only reads
// the standard application folders the user can already browse in Finder;
// nothing here needs extra permissions.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { app, shell } = require('electron');
const native = require('./native');

const ROOTS = [
  '/Applications',
  '/Applications/Utilities',
  '/System/Applications',
  '/System/Applications/Utilities',
  path.join(os.homedir(), 'Applications'),
];
const EXTRA = ['/System/Library/CoreServices/Finder.app'];

let catalog = null;
const iconCache = new Map(); // `${path}@${size}` -> data URL

function scanDir(dir, depth, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.name.endsWith('.app')) out.set(full, { path: full, name: e.name.replace(/\.app$/, '') });
    // Vendors often group apps in a folder, e.g. /Applications/Adobe Photoshop 2026/.
    else if (depth > 0 && (e.isDirectory() || e.isSymbolicLink()) && !ROOTS.includes(full)) scanDir(full, depth - 1, out);
  }
}

function listApps(refresh = false) {
  if (catalog && !refresh) return catalog;
  const found = new Map();
  for (const root of ROOTS) scanDir(root, 1, found);
  for (const p of EXTRA) if (fs.existsSync(p)) found.set(p, { path: p, name: path.basename(p, '.app') });
  catalog = [...found.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return catalog;
}

function run(cmd, args) {
  return new Promise((resolve) => execFile(cmd, args, { timeout: 4000 }, (err, stdout) => resolve(err ? '' : stdout.trim())));
}

async function bundleId(appPath) {
  return run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')]);
}

// If an app moved, find it again by its bundle identifier via Spotlight.
async function relocate(entry) {
  if (!entry.bundleId || !/^[\w.-]+$/.test(entry.bundleId)) return null;
  const out = await run('/usr/bin/mdfind', [`kMDItemCFBundleIdentifier == '${entry.bundleId}'`]);
  return out.split('\n').find((p) => p.endsWith('.app') && fs.existsSync(p)) || null;
}

async function icon(appPath, size) {
  const key = `${appPath}@${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  if (!fs.existsSync(appPath)) return null;
  let url = null;
  const png = native.available ? native.appIcon(appPath, size) : null;
  if (png) url = 'data:image/png;base64,' + png.toString('base64');
  else {
    // Fallback without the native helper: Electron's icon, which tops out at 32px.
    const img = await app.getFileIcon(appPath, { size: 'normal' });
    url = img.isEmpty() ? null : img.toDataURL();
  }
  iconCache.set(key, url);
  return url;
}

// Resolve the launcher's saved entries: icon, and whether the app still exists.
async function resolve(entries, size) {
  const out = [];
  for (const e of entries) {
    let p = e.path;
    let moved = null;
    if (!fs.existsSync(p)) {
      moved = await relocate(e);
      if (moved) p = moved;
    }
    out.push({ ...e, path: p, moved: moved ? p : null, missing: !fs.existsSync(p), icon: await icon(p, size) });
  }
  return out;
}

async function launch(appPath) {
  if (!fs.existsSync(appPath)) return `${path.basename(appPath, '.app')} is no longer installed at ${appPath}.`;
  const err = await shell.openPath(appPath);
  return err || null;
}

module.exports = { listApps, bundleId, icon, resolve, launch };
