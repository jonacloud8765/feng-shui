import { h, setText, aligned, reduceMotion } from '../dom.js';
import { zonedToEpoch } from '../time.js';

// Four styles share one renderer:
//   editorial - a large serif numeral with an italic unit, the title and date
//   live      - days, hours, minutes and seconds on quiet glass tiles
//   ring      - a progress ring with the days in the middle
//   minimal   - one line, for small or understated placements

const css = `
.cd { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: var(--justify); text-align: var(--align); gap: calc(4px + 2.5cqh); position: relative; }
.cd .head { display: flex; gap: 0.5em; align-items: center; justify-content: var(--justify); max-width: 100%; min-width: 0; }
.cd .icon { font-size: calc(clamp(13px, 10cqmin, 26px) * var(--scale)); line-height: 1; filter: saturate(0.9); }
.cd .title { font-family: var(--info); font-size: calc(clamp(10px, 6.6cqmin, 17px) * var(--scale)); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.78; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cd .when { font-family: var(--info); font-size: calc(clamp(10px, 5.6cqmin, 15px) * var(--scale)); opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; letter-spacing: 0.01em; }
.cd .bar { width: min(100%, 78cqw); height: 3px; border-radius: 3px; background: rgba(255,255,255,0.13); overflow: hidden; box-shadow: inset 0 0 0 0.5px rgba(255,255,255,0.06); }
.cd .bar i { display: block; height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 55%, transparent), var(--accent)); box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 60%, transparent); transition: width 0.8s var(--ease); }

/* Editorial */
.cd .hero { display: flex; align-items: baseline; gap: 0.28em; justify-content: var(--justify); line-height: 0.9; }
.cd .hero .n { font-family: var(--display); font-weight: var(--weight); font-size: calc(min(100cqw / var(--digits) * 1.35, 50cqh) * var(--scale)); letter-spacing: -0.02em; font-variant-numeric: lining-nums tabular-nums; }
.cd .hero .u { font-family: var(--display); font-style: italic; font-size: calc(min(9cqw, 15cqh) * var(--scale)); color: var(--accent); opacity: 0.95; white-space: nowrap; }
.cd .hero .u small { display: block; font-family: var(--info); font-style: normal; font-size: 0.55em; letter-spacing: 0.02em; opacity: 0.6; color: var(--text); margin-top: 0.3em; }

/* Live */
.cd .tiles { display: flex; gap: calc(4px + 2cqw); justify-content: var(--justify); }
.cd .tile { min-width: calc(100cqw / var(--cols) - 3cqw); padding: calc(6px + 2cqh) calc(4px + 1.5cqw) calc(5px + 1.6cqh); border-radius: calc(var(--radius) * 0.55); background: rgba(255,255,255,0.06); box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.18), inset 0 0 0 0.5px rgba(255,255,255,0.07); display: flex; flex-direction: column; align-items: center; gap: 0.35em; }
.cd .tile .n { font-family: var(--display); font-weight: var(--weight); font-size: calc(min(100cqw / var(--cols) * 0.5, 30cqh) * var(--scale)); line-height: 1; font-variant-numeric: lining-nums tabular-nums; display: inline-block; }
.cd .tile .u { font-family: var(--info); font-size: calc(clamp(8px, 4.6cqmin, 12px) * var(--scale)); letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.55; font-weight: 600; }
.cd .tile .n.tick { animation: tick 0.45s var(--ease); }
@keyframes tick { from { opacity: 0.25; transform: translateY(-0.12em); filter: blur(1px); } }

/* Ring */
.cd .ringwrap { position: relative; width: calc(min(70cqh, 62cqw)); aspect-ratio: 1; align-self: center; }
.cd .ringwrap svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); overflow: visible; }
.cd .ringwrap .track { stroke: rgba(255,255,255,0.12); }
.cd .ringwrap .fill { stroke: var(--accent); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--accent) 70%, transparent)); transition: stroke-dashoffset 0.9s var(--ease); }
.cd .ringwrap .mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.cd .ringwrap .n { font-family: var(--display); font-weight: var(--weight); font-size: calc(min(100cqw / var(--digits) * 0.8, 26cqh) * var(--scale)); line-height: 1; font-variant-numeric: lining-nums tabular-nums; }
.cd .ringwrap .u { font-family: var(--display); font-style: italic; color: var(--accent); font-size: calc(min(6cqw, 8cqh) * var(--scale)); }
.cd.ring { flex-direction: row; gap: calc(8px + 4cqw); }
.cd.ring .side { display: flex; flex-direction: column; gap: 0.6em; min-width: 0; flex: 1; align-items: flex-start; text-align: left; }
@container (max-width: 260px) { .cd.ring { flex-direction: column; } .cd.ring .side { align-items: center; text-align: center; flex: none; } .cd.ring .side .when { display: none; } }

/* Minimal */
.cd .line { display: flex; align-items: baseline; gap: 0.3em; justify-content: var(--justify); }
.cd .line .n { font-family: var(--display); font-weight: var(--weight); font-size: calc(min(100cqw / (var(--digits) + 3.2) * 1.5, 44cqh) * var(--scale)); line-height: 1; font-variant-numeric: lining-nums tabular-nums; }
.cd .line .u { font-family: var(--display); font-style: italic; color: var(--accent); font-size: calc(min(100cqw / (var(--digits) + 3.2) * 0.75, 22cqh) * var(--scale)); }

/* Arrived */
.cd .arrived { font-family: var(--display); font-weight: var(--weight); font-size: calc(min(100cqw / var(--chars) * 1.7, 34cqh) * var(--scale)); color: var(--accent); line-height: 1.05; }
.cd .arrived.glow { animation: glow 3.5s ease-in-out infinite; }
@keyframes glow { 50% { text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 70%, transparent); } }

.cd .setup { display: flex; flex-direction: column; align-items: center; gap: 0.7em; font-family: var(--info); }
.cd .setup .hint { font-size: calc(clamp(11px, 6.5cqmin, 14px) * var(--scale)); opacity: 0.6; }

@container (max-height: 150px) { .cd .when { display: none; } }
@container (max-height: 120px) { .cd .bar, .cd .tile .u, .cd .hero .u small { display: none; } .cd { gap: 4px; } }
@container (max-height: 62px) { .cd .head { display: none; } }
`;

const UNITS = [
  ['days', 'Days', 86400000],
  ['hours', 'Hours', 3600000],
  ['minutes', 'Minutes', 60000],
  ['seconds', 'Seconds', 1000],
];
const SHORT = { days: 'Days', hours: 'Hrs', minutes: 'Min', seconds: 'Sec' };

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const wrap = h('div.cd');
  root.append(wrap);

  let stop;
  let sig = '';
  let el = {};

  const target = () => {
    const c = ctx.config;
    const t = c.allDay && c.target ? c.target.slice(0, 10) + 'T00:00' : c.target;
    return zonedToEpoch(t, c.timeZone);
  };

  function whenText(t) {
    const c = ctx.config;
    // The ring style sits beside the text, so it gets the shorter date.
    const short = c.style === 'ring';
    const opts = { weekday: short ? 'short' : 'long', day: 'numeric', month: short ? 'short' : 'long', year: 'numeric', timeZone: c.timeZone || undefined };
    let s = new Date(t).toLocaleDateString(undefined, opts);
    if (!c.allDay) s += ' · ' + new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: c.timeZone || undefined });
    if (c.timeZone) s += ` · ${c.timeZone.split('/').pop().replace(/_/g, ' ')}`;
    return s;
  }

  function progress(t) {
    const start = ctx.config.startedAt;
    if (!start || start >= t) return null;
    return Math.max(0, Math.min(1, (Date.now() - start) / (t - start)));
  }

  // Builds the DOM for a style once; ticks only update text and widths.
  function build(kind, extra = '') {
    const key = kind + '|' + extra;
    if (key === sig) return false;
    sig = key;
    const c = ctx.config;
    el = {};
    wrap.className = `cd ${kind}`;
    const head = () => {
      el.title = h('span.title');
      el.icon = h('span.icon', { 'aria-hidden': 'true' });
      return h('div.head', {}, el.icon, el.title);
    };
    const when = () => (el.when = h('div.when'));
    const bar = () => { el.fill = h('i'); return h('div.bar', { role: 'progressbar', 'aria-label': 'Time elapsed' }, el.fill); };
    const parts = [];
    if (kind === 'setup') {
      parts.push(head(), h('div.setup', {}, h('span.hint', {}, 'What are you counting down to?'), h('button.pill.primary', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Set the date')));
    } else if (kind === 'arrived') {
      el.big = h('div.arrived');
      parts.push(head(), el.big, when());
    } else if (kind === 'editorial') {
      el.n = h('span.n');
      el.unit = h('span');
      el.detail = h('small');
      parts.push(head(), h('div.hero', {}, el.n, h('span.u', {}, el.unit, el.detail)));
      if (c.showProgress) parts.push(bar());
      if (c.showDate) parts.push(when());
    } else if (kind === 'live') {
      const keys = extra.split(',');
      el.cells = {};
      const tiles = h('div.tiles');
      tiles.style.setProperty('--cols', String(keys.length));
      for (const k of keys) {
        el.cells[k] = h('span.n');
        tiles.append(h('div.tile', {}, el.cells[k], h('span.u', {}, SHORT[k])));
      }
      parts.push(head(), tiles);
      if (c.showProgress) parts.push(bar());
      if (c.showDate) parts.push(when());
    } else if (kind === 'ring') {
      const R = 46;
      el.circ = 2 * Math.PI * R;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.innerHTML = `<circle class="track" cx="50" cy="50" r="${R}" fill="none" stroke-width="3"/><circle class="fill" cx="50" cy="50" r="${R}" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="${el.circ}" stroke-dashoffset="${el.circ}"/>`;
      el.ring = svg.querySelector('.fill');
      el.n = h('span.n');
      el.unit = h('span.u');
      const ring = h('div.ringwrap', {}, svg, h('div.mid', {}, el.n, el.unit));
      parts.push(ring, h('div.side', {}, head(), c.showDate ? when() : null));
    } else if (kind === 'minimal') {
      el.n = h('span.n');
      el.unit = h('span.u');
      parts.push(h('div.line', {}, el.n, el.unit), head());
    }
    wrap.replaceChildren(...parts);
    return true;
  }

  function tickText(node, text, animate) {
    if (node.textContent === text) return;
    node.textContent = text;
    if (!animate || reduceMotion()) return;
    node.classList.remove('tick');
    void node.offsetWidth;
    node.classList.add('tick');
  }

  function render() {
    const c = ctx.config;
    const t = target();
    if (!Number.isFinite(t)) {
      build('setup');
    } else {
      const left = t - Date.now();
      if (left <= 0) renderArrived(t, -left);
      else renderStyle(t, left);
    }
    if (el.title) setText(el.title, c.title || 'Countdown');
    if (el.icon) { setText(el.icon, c.icon || ''); el.icon.style.display = c.icon ? '' : 'none'; }
  }

  function renderArrived(t, since) {
    const c = ctx.config;
    build('arrived');
    let text = c.afterLabel || 'It’s here';
    const days = Math.floor(since / 86400000);
    if (c.afterMode === 'countup' && days >= 1) text = `${days} day${days === 1 ? '' : 's'} ago`;
    el.big.style.setProperty('--chars', String(Math.max(6, text.length)));
    setText(el.big, text);
    el.big.classList.toggle('glow', days < 1 && !reduceMotion());
    if (el.when) setText(el.when, whenText(t));
  }

  function renderStyle(t, left) {
    const c = ctx.config;
    const style = ['editorial', 'live', 'ring', 'minimal'].includes(c.style) ? c.style : 'editorial';
    const days = Math.floor(left / 86400000);
    const hours = Math.floor((left % 86400000) / 3600000);
    const p = progress(t);

    if (style === 'live') {
      let keys = UNITS.map(([k]) => k).filter((k) => c[k]);
      if (!keys.length) keys = ['days'];
      build('live', keys.join(','));
      keys.forEach((k, i) => {
        const ms = UNITS.find(([u]) => u === k)[2];
        // The largest unit shown absorbs everything above it.
        const prev = i === 0 ? Infinity : UNITS.find(([u]) => u === keys[i - 1])[2];
        const v = i === 0 ? Math.floor(left / ms) : Math.floor((left % prev) / ms);
        tickText(el.cells[k], i === 0 ? String(v) : String(v).padStart(2, '0'), true);
      });
    } else {
      // Under a day, the hero shows hours and minutes instead of "0 days".
      const underDay = days < 1;
      const n = underDay ? `${hours}:${String(Math.floor((left % 3600000) / 60000)).padStart(2, '0')}` : String(days);
      const unit = underDay ? (c.allDay ? 'until the day' : 'hrs to go') : days === 1 ? 'day' : 'days';
      build(style);
      wrap.style.setProperty('--digits', String(Math.max(2, n.length)));
      setText(el.n, n);
      setText(el.unit, unit);
      if (el.detail) setText(el.detail, !underDay && hours > 0 && c.hours ? `and ${hours} hr${hours === 1 ? '' : 's'}` : '');
      if (el.ring) {
        const frac = p === null ? 0 : p;
        el.ring.setAttribute('stroke-dashoffset', String(el.circ * (1 - frac)));
      }
    }
    if (el.fill) el.fill.style.width = p === null ? '0%' : `${(p * 100).toFixed(2)}%`;
    if (el.when) setText(el.when, whenText(t));
  }

  function configure() {
    const c = ctx.config;
    sig = '';
    // Remember when counting began, so progress has a starting point.
    if (c.target && !c.startedAt) ctx.setConfig({ startedAt: Date.now() });
    stop?.();
    const t = target();
    const fine = (c.style === 'live' && c.seconds) || (Number.isFinite(t) && t - Date.now() < 86400000);
    stop = aligned(fine ? 1000 : 60000, render);
  }

  configure();
  return {
    update: configure,
    resume: configure,
    menu: () => [{ label: 'Edit Event…', action: 'edit' }],
    menuAction: (a) => a === 'edit' && ctx.api.openSettings(ctx.widget.id),
  };
}
