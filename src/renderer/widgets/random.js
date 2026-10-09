import { h, setText, randomInt, reduceMotion, icons } from '../dom.js';

const css = `
.rng { width: 100%; height: 100%; display: flex; flex-direction: column; gap: 0.6em; align-items: center; justify-content: space-between; }
.rng .result { flex: 1; display: grid; place-items: center; min-height: 0; width: 100%; }
.rng .value { font-size: calc(min(100cqw / var(--digits) * 1.45, 40cqh) * var(--scale)); transition: transform 0.35s var(--ease), opacity 0.35s var(--ease), filter 0.35s; }
.rng .value.rolling { opacity: 0.45; filter: blur(1.5px); transform: translateY(3px) scale(0.98); }
.rng .value.empty { opacity: 0.25; }
.rng .range { display: flex; align-items: center; gap: 0.4em; font-size: calc(clamp(11px, 7cqmin, 14px) * var(--scale)); }
.rng .range input { width: 5.2em; }
.rng .range .dash { opacity: 0.45; }
.rng .row { display: flex; gap: 0.5em; align-items: center; }
.rng .error { font-size: calc(clamp(10px, 6cqmin, 12px) * var(--scale)); color: #ffb3a8; min-height: 1.2em; }
@container (max-height: 150px) { .rng .range { display: none; } .rng .error { display: none; } }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const value = h('div.display.value');
  const minInput = h('input.field', { type: 'text', inputmode: 'numeric', 'aria-label': 'Minimum' });
  const maxInput = h('input.field', { type: 'text', inputmode: 'numeric', 'aria-label': 'Maximum' });
  const error = h('div.error');
  const go = h('button.pill.primary', { 'aria-label': 'Generate a random number' }, 'Generate');
  const copy = h('button.icon-btn', { title: 'Copy result', 'aria-label': 'Copy result', html: icons.copy });
  root.append(
    h('div.rng', {},
      h('div.result', {}, value),
      h('div.range', {}, minInput, h('span.dash', {}, '–'), maxInput),
      error,
      h('div.row', {}, go, copy)),
  );

  const parse = (s) => (/^\s*-?\d+\s*$/.test(s) ? Number(s) : NaN);

  function validate() {
    const lo = parse(minInput.value);
    const hi = parse(maxInput.value);
    minInput.classList.toggle('invalid', !Number.isSafeInteger(lo));
    maxInput.classList.toggle('invalid', !Number.isSafeInteger(hi));
    let msg = '';
    if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi)) msg = 'Enter whole numbers';
    else if (lo > hi) msg = 'Minimum is above maximum';
    setText(error, msg);
    go.disabled = !!msg;
    return msg ? null : [lo, hi];
  }

  function commit() {
    const r = validate();
    if (r && (r[0] !== ctx.config.min || r[1] !== ctx.config.max)) ctx.setConfig({ min: r[0], max: r[1] });
  }

  function show(n) {
    const text = n === null || n === undefined ? '–' : n.toLocaleString();
    value.classList.toggle('empty', n === null || n === undefined);
    value.style.setProperty('--digits', String(Math.max(2, text.length)));
    setText(value, text);
  }

  let busy = false;
  function generate() {
    const r = validate();
    if (!r || busy) return;
    commit();
    const n = randomInt(r[0], r[1]);
    if (reduceMotion()) {
      show(n);
      ctx.setConfig({ last: n });
      return;
    }
    // A brief settle animation; the number shown at the end is the one drawn above.
    busy = true;
    value.classList.add('rolling');
    setTimeout(() => {
      show(n);
      value.classList.remove('rolling');
      busy = false;
      ctx.setConfig({ last: n });
    }, 180);
  }

  minInput.addEventListener('input', validate);
  maxInput.addEventListener('input', validate);
  minInput.addEventListener('change', commit);
  maxInput.addEventListener('change', commit);
  for (const el of [minInput, maxInput]) el.addEventListener('keydown', (e) => e.key === 'Enter' && generate());
  go.addEventListener('click', generate);
  copy.addEventListener('click', () => {
    const v = ctx.config.last;
    if (v === null || v === undefined) return;
    ctx.api.copy(String(v));
    copy.innerHTML = icons.check;
    setTimeout(() => (copy.innerHTML = icons.copy), 1200);
  });

  function load() {
    if (document.activeElement !== minInput) minInput.value = String(ctx.config.min);
    if (document.activeElement !== maxInput) maxInput.value = String(ctx.config.max);
    validate();
    show(ctx.config.last);
  }
  load();

  return {
    update: load,
    menu: () => [{ label: 'Generate', action: 'generate' }],
    menuAction: (a) => a === 'generate' && generate(),
  };
}
