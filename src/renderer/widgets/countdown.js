import { h, setText, aligned } from '../dom.js';
import { zonedToEpoch } from '../time.js';

const css = `
.cd { width: 100%; display: flex; flex-direction: column; gap: 0.7em; align-items: inherit; }
.cd .head { display: flex; gap: 0.45em; align-items: center; justify-content: inherit; max-width: 100%; }
.cd .icon { font-size: calc(clamp(12px, 10cqmin, 20px) * var(--scale)); }
.cd .units { display: flex; gap: calc(6px + 4cqw); justify-content: inherit; align-items: flex-end; }
.cd .unit { display: flex; flex-direction: column; align-items: center; gap: 0.35em; }
.cd .unit .n { font-size: calc(min(100cqw / var(--cols) * 0.62, 46cqh) * var(--scale)); transition: opacity 0.3s; }
.cd .unit .u { font-family: var(--info); font-size: calc(clamp(9px, 6cqmin, 13px) * var(--scale)); letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.55; font-weight: 500; }
.cd .big { font-size: calc(min(60cqw, 52cqh) * var(--scale)); }
.cd .days-row { display: flex; align-items: baseline; gap: 0.35em; justify-content: inherit; }
.cd .days-row .u { font-family: var(--info); font-size: calc(clamp(10px, 8cqmin, 16px) * var(--scale)); letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.6; }
.cd .done { font-size: calc(min(16cqw, 30cqh) * var(--scale)); }
.cd .sub { font-family: var(--info); font-size: calc(clamp(10px, 7cqmin, 14px) * var(--scale)); opacity: 0.6; }
.cd .tick { animation: tick 0.4s var(--ease); }
@keyframes tick { from { opacity: 0.35; transform: translateY(-2px); } }
@container (max-height: 120px) { .cd .unit .u { display: none; } .cd { gap: 0.4em; } }
`;

const UNITS = [
  ['days', 'Days', 86400000],
  ['hours', 'Hours', 3600000],
  ['minutes', 'Min', 60000],
  ['seconds', 'Sec', 1000],
];

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const icon = h('span.icon');
  const title = h('span.label');
  const body = h('div.cd-body');
  const wrap = h('div.cd', {}, h('div.head', {}, icon, title), body);
  root.append(wrap);

  let stop;
  let cells = {};
  let built = '';

  function build(kind, keys) {
    const sig = kind + keys.join();
    if (sig === built) return;
    built = sig;
    body.replaceChildren();
    cells = {};
    if (kind === 'live') {
      const row = h('div.units');
      row.style.setProperty('--cols', String(keys.length * 1.25 + 0.5));
      for (const [key, label] of UNITS.filter(([k]) => keys.includes(k))) {
        cells[key] = h('span.display.n');
        row.append(h('div.unit', {}, cells[key], h('span.u', {}, label)));
      }
      body.append(row);
    } else if (kind === 'days') {
      cells.days = h('span.display.big');
      cells.unit = h('span.u');
      body.append(h('div.days-row', {}, cells.days, cells.unit));
    } else if (kind === 'done') {
      cells.done = h('div.display.done.accent');
      cells.sub = h('div.sub');
      body.append(cells.done, cells.sub);
    } else if (kind === 'empty') {
      body.append(h('button.pill', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Set a date'));
    }
  }

  function set(el, text) {
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
  }

  function render() {
    const c = ctx.config;
    setText(icon, c.icon || '');
    icon.style.display = c.icon ? '' : 'none';
    setText(title, c.title || '');
    const target = zonedToEpoch(c.target, c.timeZone);
    if (!Number.isFinite(target)) return build('empty', []);
    let left = target - Date.now();
    if (left <= 0) {
      build('done', []);
      setText(cells.done, c.afterLabel || 'Arrived');
      const ago = Math.floor(-left / 86400000);
      setText(cells.sub, ago >= 1 ? `${ago} day${ago === 1 ? '' : 's'} ago` : 'Today');
      return;
    }
    if (c.layout === 'days') {
      build('days', []);
      const d = Math.ceil(left / 86400000);
      setText(cells.days, String(d));
      setText(cells.unit, d === 1 ? 'day' : 'days');
      return;
    }
    const keys = UNITS.map(([k]) => k).filter((k) => c[k]);
    if (!keys.length) keys.push('days');
    build('live', keys);
    UNITS.forEach(([key, , ms], i) => {
      if (!keys.includes(key)) return;
      // The largest shown unit absorbs everything above it.
      const isFirst = keys[0] === key;
      const v = isFirst ? Math.floor(left / ms) : Math.floor((left % UNITS[i - 1][2]) / ms);
      set(cells[key], key === 'days' && isFirst ? String(v) : String(v).padStart(2, '0'));
    });
  }

  function configure() {
    const c = ctx.config;
    stop?.();
    const fine = c.layout === 'live' && c.seconds;
    stop = aligned(fine ? 1000 : 60000, render);
  }

  configure();
  return { update: () => { built = ''; configure(); }, resume: configure };
}
