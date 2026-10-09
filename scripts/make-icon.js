'use strict';
// Renders the app icon with Electron and converts it to build/icon.icns.
// Run with: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="position:absolute;left:100px;top:100px;width:824px;height:824px;border-radius:185px;overflow:hidden;
  background:radial-gradient(120% 90% at 25% 0%, #2a3557 0%, #121a30 55%, #0a0f1d 100%);
  box-shadow: inset 0 3px 0 rgba(255,255,255,0.28), inset 0 0 0 2px rgba(255,255,255,0.12)">
  <div style="position:absolute;left:212px;top:250px;width:400px;height:400px;border-radius:50%;
    background:radial-gradient(circle at 38% 32%, #fff7e6 0%, #ead7b2 35%, #b8955d 100%);
    box-shadow:0 0 120px rgba(234,215,178,0.45)"></div>
  <div style="position:absolute;left:0;right:0;top:520px;bottom:0;
    background:linear-gradient(180deg, rgba(20,28,50,0.55), rgba(10,15,29,0.92));
    backdrop-filter: blur(30px); box-shadow: inset 0 2px 0 rgba(255,255,255,0.35)"></div>
  <div style="position:absolute;left:0;right:0;top:0;height:420px;background:linear-gradient(180deg, rgba(255,255,255,0.12), transparent)"></div>
</div></body></html>`;

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
