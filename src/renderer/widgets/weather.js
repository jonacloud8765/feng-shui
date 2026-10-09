import { h, setText, aligned } from '../dom.js';
import { describe, temp, ago } from '../weather-ui.js';

const css = `
.wx { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 0.6em; align-items: inherit; }
.wx .top { display: flex; align-items: center; gap: 0.6em; justify-content: inherit; width: 100%; }
.wx .icon { width: calc(min(22cqw, 34cqh) * var(--scale)); color: var(--accent); flex: none; }
.wx .icon svg { width: 100%; height: auto; display: block; }
.wx .now { font-size: calc(min(30cqw, 46cqh) * var(--scale)); }
.wx .side { display: flex; flex-direction: column; gap: 0.25em; min-width: 0; }
.wx .cond { font-family: var(--info); font-size: calc(clamp(11px, 8cqmin, 17px) * var(--scale)); opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wx .hl { font-family: var(--info); font-size: calc(clamp(10px, 6.5cqmin, 14px) * var(--scale)); opacity: 0.6; font-variant-numeric: tabular-nums; }
.wx .hours { display: flex; gap: 0; justify-content: space-between; width: 100%; font-family: var(--info); font-variant-numeric: tabular-nums; }
.wx .hour { display: flex; flex-direction: column; align-items: center; gap: 0.3em; font-size: calc(clamp(9px, 5.5cqmin, 13px) * var(--scale)); }
.wx .hour .t { opacity: 0.55; }
.wx .hour .i { width: 1.5em; opacity: 0.85; }
.wx .hour .i svg { width: 100%; height: auto; display: block; }
.wx .foot { font-family: var(--info); font-size: calc(clamp(9px, 5cqmin, 11px) * var(--scale)); opacity: 0.42; white-space: nowrap; }
.wx .state { font-family: var(--info); font-size: calc(clamp(11px, 7cqmin, 14px) * var(--scale)); opacity: 0.75; text-align: center; max-width: 100%; }
.wx .state b { display: block; font-weight: 500; opacity: 1; margin-bottom: 0.3em; }
.wx .loading { opacity: 0.5; animation: breathe 1.6s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: 0.25; } }
@container (max-height: 175px) { .wx .hours { display: none; } }
@container (max-height: 120px) { .wx .foot, .wx .label { display: none; } }
@container (max-width: 190px) { .wx .side .hl { display: none; } }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const wrap = h('div.wx');
  root.append(wrap);
  let data = null;
  let error = null;
  let loading = false;
  let stop;
  let footEl;

  async function refresh(force = false) {
    const loc = ctx.config.location;
    if (!loc) { data = null; error = null; return paint(); }
    loading = true;
    if (!data) paint();
    const r = await ctx.api.weather(loc, force);
    loading = false;
    if (r.ok) { data = r.data; error = null; } else { error = r.error; }
    paint();
  }

  function paint() {
    const c = ctx.config;
    const loc = c.location;
    if (!loc) {
      wrap.replaceChildren(h('div.state', {}, h('b', {}, 'Weather'), 'Choose a city to see its weather.'), h('button.pill', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Choose city'));
      return;
    }
    if (!data) {
      wrap.replaceChildren(
        h('div.label', {}, loc.name),
        error
          ? h('div.state', {}, h('b', {}, 'Weather unavailable'), error, h('div', { style: { marginTop: '0.6em' } }, h('button.pill', { onclick: () => refresh(true) }, 'Try again')))
          : h('div.state.loading', {}, 'Loading weather…'),
      );
      return;
    }
    const d = describe(data.code, data.isDay);
    footEl = h('div.foot', {}, error ? `Couldn’t refresh · ${ago(data.updatedAt)}` : `${ago(data.updatedAt)} · ${data.source}`);
    wrap.replaceChildren(
      h('div.label.optional', {}, loc.name),
      h('div.top', {},
        h('div.icon', { html: d.icon, 'aria-hidden': 'true' }),
        h('div.display.now', { 'aria-label': `${temp(data.tempC, c.unit)} ${d.text}` }, temp(data.tempC, c.unit)),
        h('div.side', {}, h('div.cond', {}, d.text), h('div.hl', {}, `H ${temp(data.highC, c.unit)}  L ${temp(data.lowC, c.unit)}`))),
      c.hourly && data.hourly.length
        ? h('div.hours', {}, ...data.hourly.filter((_, i) => i % 2 === 0).slice(0, 6).map((x) =>
            h('div.hour', {}, h('span.t', {}, hourLabel(x.time)), h('span.i', { html: describe(x.code, x.isDay).icon }), h('span', {}, temp(x.tempC, c.unit)))))
        : null,
      footEl,
    );
  }

  // Hourly times are local to the forecast location.
  const hourLabel = (t) => {
    const hr = Number(t.slice(11, 13));
    return navigatorUses12h() ? `${hr % 12 || 12}${hr < 12 ? 'a' : 'p'}` : `${String(hr).padStart(2, '0')}`;
  };

  function start() {
    stop?.();
    // Refresh every 15 minutes; between refreshes only the "updated" line changes.
    let n = 0;
    stop = aligned(60000, () => {
      if (n++ % 15 === 0) refresh();
      else if (footEl && data) setText(footEl, `${ago(data.updatedAt)} · ${data.source}`);
    });
  }

  start();
  return {
    update: () => { data = null; start(); },
    resume: () => refresh(true),
    menu: () => [{ label: 'Refresh Weather', action: 'refresh' }],
    menuAction: (a) => a === 'refresh' && refresh(true),
  };
}

function navigatorUses12h() {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === true;
}
