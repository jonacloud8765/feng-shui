import { h } from '../dom.js';

// Shared by the DOUGHCON and Nothing Ever Happens widgets: keeps one PizzINT
// reading fresh, and drives the refresh button and the status line.
// Each widget calls this for its own reading, so they refresh independently.

export const REFRESH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.75" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12.3 1.6v3.2H9.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const INFO_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="4.8" r="0.95" fill="currentColor"/></svg>';

export const css = `
.pz-btn { width: 1.55em; height: 1.55em; padding: 0.22em; border: 0; border-radius: 50%; background: transparent; color: var(--pz-accent); opacity: 0.7; cursor: pointer; display: grid; place-items: center; transition: opacity .2s ease, background .2s ease; }
.pz-btn:hover { opacity: 1; background: color-mix(in srgb, var(--pz-accent) 14%, transparent); }
.pz-btn svg { width: 100%; height: 100%; display: block; }
.pz-btn.busy svg { animation: pz-spin 0.9s linear infinite; }
.pz-btn:disabled { cursor: default; }
@keyframes pz-spin { to { transform: rotate(360deg); } }
.pz-status { font-size: 0.62em; letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap; transition: opacity .4s ease; }
.pz-status.stale { color: #ffb020; }
.pz-status.fail { color: #ff5a4a; }
`;

const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function liveReading(ctx, kind, render) {
  const button = h('button.pz-btn', { title: 'Refresh now', 'aria-label': 'Refresh now', html: REFRESH_SVG });
  const status = h('div.pz-status');
  let state = null; // last result from the main process
  let error = null; // error with no reading at all
  let flash = '';
  let flashTimer;
  let busy = false;

  function showStatus() {
    status.className = 'pz-status';
    if (flash) {
      status.textContent = flash;
      if (/fail/i.test(flash)) status.classList.add('fail');
      return;
    }
    if (!state) { status.textContent = error ? 'No reading' : ''; return; }
    if (state.stale) { status.classList.add('stale'); status.textContent = `Stale · ${ago(state.updatedAt)}`; status.title = state.error || ''; return; }
    status.textContent = `Live · ${ago(state.updatedAt)}`;
    status.title = '';
  }

  function say(text) {
    flash = text;
    clearTimeout(flashTimer);
    showStatus();
    flashTimer = setTimeout(() => { flash = ''; showStatus(); }, 2600);
  }

  async function load(force) {
    if (busy) return;
    busy = true;
    button.classList.add('busy');
    button.disabled = true;
    const r = await ctx.api.pizzint(kind, force);
    busy = false;
    button.classList.remove('busy');
    button.disabled = false;
    if (r.ok) {
      state = r.data;
      error = null;
      render(state.reading, state);
      if (force) say(state.stale ? 'Refresh failed' : state.changed ? 'Updated' : 'Up to date');
    } else {
      error = r.error;
      if (!state) render(null, null, error);
      if (force) say('Refresh failed');
    }
    showStatus();
  }

  button.addEventListener('click', (e) => { e.stopPropagation(); load(true); });
  button.addEventListener('mousedown', (e) => e.stopPropagation());
  const timer = setInterval(() => load(false), 5 * 60 * 1000);
  const tick = setInterval(showStatus, 30 * 1000);
  load(false);
  return { button, status, resume: () => load(false), stop: () => { clearInterval(timer); clearInterval(tick); } };
}
