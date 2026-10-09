// Tiny DOM helpers shared by widgets and the settings window.

export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Set text only when it changed, so unchanged nodes aren't touched every tick.
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// Runs fn now and then at each boundary of `ms` (aligned to the wall clock),
// rather than drifting with setInterval. Returns a stop function.
export function aligned(ms, fn) {
  let t;
  const tick = () => {
    fn();
    t = setTimeout(tick, ms - (Date.now() % ms) + 5);
  };
  tick();
  return () => clearTimeout(t);
}

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Uniform integer in [min, max] using rejection sampling over crypto randomness.
export function randomInt(min, max) {
  const range = max - min + 1;
  if (range <= 1) return min;
  if (range > 2 ** 32) {
    // Combine two draws for very wide ranges.
    const hi = randomInt(0, Math.floor((range - 1) / 2 ** 32));
    const lo = randomInt(0, 2 ** 32 - 1);
    const v = hi * 2 ** 32 + lo;
    return v < range ? min + v : randomInt(min, max);
  }
  const limit = Math.floor(2 ** 32 / range) * range;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return min + (buf[0] % range);
}

export const icons = {
  play: '<svg viewBox="0 0 16 16"><path d="M4.5 2.8v10.4c0 .5.6.8 1 .5l8-5.2c.4-.2.4-.8 0-1l-8-5.2c-.4-.3-1 0-1 .5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/></svg>',
  reset: '<svg viewBox="0 0 16 16"><path d="M3 8a5 5 0 1 0 1.6-3.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2.6 2.2v3.2h3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flag: '<svg viewBox="0 0 16 16"><path d="M4 14V2.5M4 3h7.5l-1.8 2.8L11.5 8.6H4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 16 16"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.2A1.8 1.8 0 0 0 8.8 2H4a2 2 0 0 0-2 2v4.8c0 .8.5 1.4 1.2 1.7" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  check: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
