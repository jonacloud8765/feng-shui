'use strict';
// Renders the app icon with Electron and converts it to build/icon.icns.
// Run with: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// The mark (a yin-yang on rice paper, ringed in brass) lives in
// src/renderer/brand/mark.svg and is drawn on the macOS icon grid.
const svg = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'brand', 'mark.svg'), 'utf8');
const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024, quality: 'best' });
  const out = path.join(__dirname, '..', 'build');
  const set = path.join(out, 'icon.iconset');
  fs.rmSync(set, { recursive: true, force: true });
  fs.mkdirSync(set, { recursive: true });
  const master = path.join(out, 'icon-1024.png');
  fs.writeFileSync(master, img.toPNG());
  for (const s of [16, 32, 128, 256, 512]) {
    for (const [scale, suffix] of [[1, ''], [2, '@2x']]) {
      execFileSync('/usr/bin/sips', ['-z', String(s * scale), String(s * scale), master, '--out', path.join(set, `icon_${s}x${s}${suffix}.png`)], { stdio: 'ignore' });
    }
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', set, '-o', path.join(out, 'icon.icns')]);
  fs.rmSync(set, { recursive: true, force: true });
  console.log('wrote build/icon.icns');
  app.quit();
});
