import { h, setText, aligned } from '../dom.js';
import { describe, temp } from '../weather-ui.js';
import { offsetLabel, dayDifference } from '../time.js';

const css = `
.wc { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 0; }
.wc .city { display: flex; align-items: center; gap: 0.8em; min-height: 0; flex: 1; }
.wc .city + .city { border-top: 0.5px solid rgba(255,255,255,0.1); }
.wc .names { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2em; text-align: left; }
.wc .name { font-family: var(--info); font-weight: 500; font-size: calc(clamp(11px, var(--row) * 0.2, 18px) * var(--scale)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wc .meta { font-family: var(--info); font-size: calc(clamp(9px, var(--row) * 0.14, 13px) * var(--scale)); opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wc .wx { display: flex; align-items: center; gap: 0.3em; font-family: var(--info); font-size: calc(clamp(10px, var(--row) * 0.17, 16px) * var(--scale)); opacity: 0.85; font-variant-numeric: tabular-nums; }
.wc .wx .i { width: 1.3em; color: var(--accent); }
.wc .wx .i svg { width: 100%; height: auto; display: block; }
.wc .time { font-size: calc(min(var(--row) * 0.52, 18cqw) * var(--scale)); text-align: right; }
.wc .time .ap { font-family: var(--info); font-size: 0.32em; margin-left: 0.2em; opacity: 0.6; }

/* A single city gets the large, centered treatment. */
.wc.single .city { flex-direction: column; justify-content: center; gap: 0.35em; text-align: center; align-items: var(--justify); }
.wc.single .names { align-items: inherit; text-align: inherit; flex: none; }
.wc.single .time { font-size: calc(min(26cqw, 44cqh) * var(--scale)); text-align: inherit; order: 2; }
.wc.single .names { order: 1; }
.wc.single .wx { order: 3; }
.wc.single .name { font-size: calc(clamp(10px, 8cqmin, 15px) * var(--scale)); letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.7; }
@container (max-height: 110px) { .wc.single .names .meta, .wc.single .wx { display: none; } .wc.single .time { font-size: calc(min(26cqw, 58cqh) * var(--scale)); } }
@container (max-width: 210px) { .wc:not(.single) .wx { display: none; } }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const wrap = h('div.wc');
  root.append(wrap);
  let rows = [];
  let stopClock;
  let stopWx;
  const weather = new Map(); // city index -> forecast

  function build() {
    const c = ctx.config;
    wrap.classList.toggle('single', c.cities.length === 1);
    wrap.style.setProperty('--row', `calc(100cqh / ${Math.max(1, c.cities.length)})`);
    if (!c.cities.length) {
      wrap.replaceChildren(h('div.state', { style: { textAlign: 'center', fontSize: '13px', opacity: 0.75 } }, 'Add cities to compare times.', h('div', { style: { marginTop: '0.6em' } }, h('button.pill', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Add cities'))));
      rows = [];
      return;
    }
    rows = c.cities.map((city) => {
      const r = { city, name: h('div.name', {}, city.name), meta: h('div.meta'), hm: h('span'), ap: h('span.ap'), wx: h('div.wx') };
      r.el = h('div.city', {}, h('div.names', {}, r.name, r.meta), r.wx, h('div.display.time', {}, r.hm, r.ap));
      return r;
    });
    wrap.replaceChildren(...rows.map((r) => r.el));
  }

  function tick() {
    const c = ctx.config;
    const now = Date.now();
    for (const r of rows) {
      const tz = r.city.timezone;
      let parts;
      try {
        parts = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: !!c.hour12 }).formatToParts(new Date(now));
      } catch {
        setText(r.hm, '--:--');
        setText(r.meta, `Unknown time zone ${tz}`);
        continue;
      }
      const get = (t) => parts.find((p) => p.type === t)?.value || '';
      setText(r.hm, `${c.hour12 ? get('hour') : get('hour').padStart(2, '0')}:${get('minute')}`);
      setText(r.ap, c.hour12 ? get('dayPeriod') : '');
      const diff = dayDifference(now, tz);
      const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : `${diff > 0 ? '+' : ''}${diff} days`;
      const bits = [day];
      if (c.showOffset) bits.push(offsetLabel(now, tz));
      setText(r.meta, bits.join(' · '));
    }
  }

  function paintWeather() {
    const c = ctx.config;
    rows.forEach((r, i) => {
      const w = weather.get(i);
      if (!c.showWeather || !Number.isFinite(r.city.lat)) { r.wx.replaceChildren(); r.wx.style.display = 'none'; return; }
      r.wx.style.display = '';
      if (!w) return r.wx.replaceChildren(h('span', { style: { opacity: 0.4 } }, '…'));
      if (!w.ok) return r.wx.replaceChildren(h('span', { title: w.error, style: { opacity: 0.45 } }, 'n/a'));
      const d = describe(w.data.code, w.data.isDay);
      r.wx.replaceChildren(h('span.i', { html: d.icon, title: d.text }), h('span', {}, temp(w.data.tempC, c.unit)));
      r.wx.setAttribute('aria-label', `${d.text}, ${temp(w.data.tempC, c.unit)}`);
    });
  }

  async function loadWeather(force = false) {
    const c = ctx.config;
    if (!c.showWeather) return paintWeather();
    await Promise.all(c.cities.map(async (city, i) => {
      if (!Number.isFinite(city.lat)) return;
      weather.set(i, await ctx.api.weather({ lat: city.lat, lon: city.lon }, force));
    }));
    paintWeather();
  }

  function start() {
    weather.clear();
    build();
    stopClock?.();
    stopWx?.();
    stopClock = aligned(60000, tick);
    let n = 0;
    stopWx = aligned(60000, () => { if (n++ % 15 === 0) loadWeather(); });
    paintWeather();
  }

  start();
  return {
    update: start,
    resume: () => { tick(); loadWeather(true); },
    menu: () => [{ label: 'Refresh Weather', action: 'refresh' }],
    menuAction: (a) => a === 'refresh' && loadWeather(true),
  };
}
