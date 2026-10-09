'use strict';
// End-to-end check inside Electron. Run with: npm run selftest
// Adds one of every widget, clicks their real buttons in the renderer,
// captures each window to test/out/, and exits non-zero on renderer errors.
const fs = require('fs');
const path = require('path');

module.exports = function selftest({ app, BrowserWindow, store, windows }) {
  const out = path.join(__dirname, 'out');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  app.on('web-contents-created', (_e, wc) => {
    wc.on('console-message', (ev) => {
      console.log(`[renderer ${ev.level}] ${ev.message} (${ev.sourceId}:${ev.lineNumber})`);
      if (ev.level === 'error') errors.push(ev.message);
    });
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const types = Object.keys(require('../src/shared/registry').TYPES);
  const winFor = (id) => windows.windows.get(id);
  const run = (id, js) => winFor(id).webContents.executeJavaScript(js);

  (async () => {
    await wait(1500);
    const ids = {};
    let x = 40;
    for (const t of types) {
      const w = store.addWidget(t, { x, y: 400, width: undefined, height: undefined });
      ids[t] = w.id;
      x += 40;
    }
    store.updateWidget(ids.countdown, { config: { title: 'Lisbon', target: '2027-06-01T09:30', timeZone: 'Europe/Lisbon', layout: 'live' } });
    store.updateWidget(ids.launcher, { config: { labels: true, apps: [
      { path: '/System/Applications/Calendar.app', name: 'Calendar', bundleId: 'com.apple.iCal' },
      { path: '/System/Applications/Notes.app', name: 'Notes', bundleId: 'com.apple.Notes' },
      { path: '/Applications/Gone Forever.app', name: 'Gone Forever', bundleId: 'com.example.gone' },
    ] } });
    store.updateWidget(ids.weather, { config: { location: { name: 'Lisbon', lat: 38.72, lon: -9.15, timezone: 'Europe/Lisbon' } } });
    store.updateWidget(ids.worldclock, { config: { cities: [
      { name: 'Tokyo', lat: 35.69, lon: 139.69, timezone: 'Asia/Tokyo' },
      { name: 'New York', lat: 40.71, lon: -74.01, timezone: 'America/New_York' },
      { name: 'Kathmandu', lat: null, lon: null, timezone: 'Asia/Kathmandu' },
    ] } });
    await wait(4000);
    const results = {};
    results.clock = await run(ids.clock, `document.querySelector('.time').textContent`);
    results.countdown = await run(ids.countdown, `[...document.querySelectorAll('.unit .n')].map(e=>e.textContent).join(' ')`);
    await run(ids.random, `document.querySelectorAll('input.field')[0].value='-5'; document.querySelectorAll('input.field')[0].dispatchEvent(new Event('change')); document.querySelector('.pill.primary').click()`);
    await run(ids.coin, `document.querySelector('.pill').click()`);
    await run(ids.stopwatch, `document.querySelectorAll('.controls .icon-btn')[1].click()`);
    await wait(1200);
    await run(ids.stopwatch, `document.querySelectorAll('.controls .icon-btn')[2].click()`);
    await wait(400);
    results.launcher = await run(ids.launcher, `[...document.querySelectorAll('.app')].map(b => b.getAttribute('aria-label') + (b.querySelector('img') ? ' [icon ' + b.querySelector('img').naturalWidth + 'px]' : ' [no icon]')).join(' | ')`);
    results.weather = await run(ids.weather, `document.querySelector('.wx').innerText.replace(/\\n+/g, ' | ')`);
    results.worldclock = await run(ids.worldclock, `document.querySelector('.wc').innerText.replace(/\\n+/g, ' | ')`);
    results.random = await run(ids.random, `document.querySelector('.value').textContent`);
    results.coin = await run(ids.coin, `document.querySelector('.result').textContent`);
    results.stopwatch = await run(ids.stopwatch, `document.querySelector('.time').textContent + ' laps=' + document.querySelectorAll('.lap').length`);
    results.saved = {
      random: store.widget(ids.random).config,
      coin: store.widget(ids.coin).config.last,
    };
    // Resize through the store, as the settings sliders do, then check the window followed.
    store.updateWidget(ids.clock, { bounds: { width: 520, height: 240 } });
    await wait(600);
    results.clockBounds = winFor(ids.clock).getBounds();
    for (const [t, id] of Object.entries(ids)) {
      const img = await winFor(id).webContents.capturePage();
      fs.writeFileSync(path.join(out, `${t}.png`), img.toPNG());
    }
    console.log('[selftest] ' + JSON.stringify(results, null, 2));
    console.log(`[selftest] renderer errors: ${errors.length}`);
    store.flush();
    app.exit(errors.length ? 1 : 0);
  })().catch((e) => { console.error('[selftest] failed', e); app.exit(2); });
};
