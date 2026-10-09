import { h, setText, aligned } from '../dom.js';

const css = `
.clock { display: flex; flex-direction: column; gap: 0.5em; align-items: inherit; width: 100%; }
.clock .time { font-size: calc(min(100cqw / var(--chars) * 1.72, var(--time-h)) * var(--scale)); }
.clock .time .sep { opacity: 0.55; margin: 0 0.02em; }
.clock .time .sec { opacity: 0.5; font-size: 0.5em; margin-left: 0.12em; }
.clock .time .ampm { font-family: var(--info); font-size: 0.2em; font-weight: 500; letter-spacing: 0.08em; margin-left: 0.35em; opacity: 0.6; vertical-align: 0.35em; }
.clock .date { font-family: var(--info); font-size: calc(clamp(10px, 9cqh, 22px) * var(--scale)); letter-spacing: 0.14em; text-transform: uppercase; font-weight: 500; opacity: 0.66; }
.clock .date .day { color: var(--accent); opacity: 1; }
@container (max-height: 105px) { .clock .date { display: none; } .clock { --time-h: 70cqh !important; } }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const hh = h('span');
  const mm = h('span');
  const ss = h('span.sec');
  const ampm = h('span.ampm');
  const time = h('div.display.time', {}, hh, h('span.sep', {}, ':'), mm, ss, ampm);
  const day = h('span.day');
  const date = h('span');
  const dateLine = h('div.date', {}, day, date);
  const wrap = h('div.clock', {}, time, dateLine);
  root.append(wrap);

  let stop;

  function render() {
    const c = ctx.config;
    const now = new Date();
    let hours = now.getHours();
    if (c.hour12) {
      setText(ampm, hours < 12 ? 'AM' : 'PM');
      hours = hours % 12 || 12;
    } else setText(ampm, '');
    setText(hh, c.hour12 ? String(hours) : String(hours).padStart(2, '0'));
    setText(mm, String(now.getMinutes()).padStart(2, '0'));
    setText(ss, c.seconds ? String(now.getSeconds()).padStart(2, '0') : '');
    if (c.showDate || c.showWeekday) {
      setText(day, c.showWeekday ? now.toLocaleDateString(undefined, { weekday: 'long' }) + (c.showDate ? '  ·  ' : '') : '');
      setText(date, c.showDate ? now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '');
    }
  }

  function configure() {
    const c = ctx.config;
    const chars = 5 + (c.seconds ? 1.6 : 0) + (c.hour12 ? 1.2 : 0);
    wrap.style.setProperty('--chars', chars);
    wrap.style.setProperty('--time-h', c.showDate || c.showWeekday ? '50cqh' : '72cqh');
    dateLine.style.display = c.showDate || c.showWeekday ? '' : 'none';
    stop?.();
    // Only wake once a second when seconds are visible, otherwise once a minute.
    stop = aligned(c.seconds ? 1000 : 60000, render);
  }

  configure();
  return {
    update: configure,
    resume: configure,
  };
}
