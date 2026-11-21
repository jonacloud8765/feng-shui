// The layout bar: a small liquid-glass switcher in the top-right corner. One
// segment per layout (exactly one is on), and a button that saves the layout
// in place and locks it (click again to unlock). Save Layout As New… in the
// menu bar still names a copy here.

const S = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  fengshui: S('<circle cx="8" cy="8" r="6.3"/><path d="M8 1.7a3.15 3.15 0 0 1 0 6.3a3.15 3.15 0 0 0 0 6.3" /><circle cx="8" cy="4.85" r="0.8" fill="currentColor" stroke="none"/><circle cx="8" cy="11.15" r="0.8"/>'),
  personal: S('<circle cx="8" cy="5.3" r="2.6"/><path d="M3 14c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3"/>'),
  cinema: S('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 3v10M11 3v10M2 6.3h3M2 9.7h3M11 6.3h3M11 9.7h3"/>'),
  living: S('<path d="M3 9V6.5A1.5 1.5 0 0 1 4.5 5h7A1.5 1.5 0 0 1 13 6.5V9"/><path d="M1.8 9.2a1.2 1.2 0 0 1 2.4 0V11h7.6V9.2a1.2 1.2 0 0 1 2.4 0V12.5H1.8z"/><path d="M3.5 12.5v1.3M12.5 12.5v1.3"/>'),
  closet: S('<path d="M3 2.5v11M5.5 2.5v11M8 4v9.5M10.2 3.6l2.8 9.6"/><path d="M1.8 13.5h12.4"/>'),
  intel: S('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3.2"/><path d="M8 8l4.2-4.2"/><circle cx="8" cy="8" r="0.7" fill="currentColor"/>'),
  school: S('<path d="M1.5 6L8 3l6.5 3L8 9z"/><path d="M4.2 7.4v3.3c1 1 2.4 1.5 3.8 1.5s2.8-.5 3.8-1.5V7.4"/><path d="M14.5 6v3.5"/>'),
  cabinet: S('<rect x="3" y="1.8" width="10" height="12.4" rx="1"/><path d="M3 6h10M3 10h10M6.8 3.9h2.4M6.8 7.9h2.4M6.8 11.9h2.4"/>'),
  grid: S('<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>'),
  save: S('<path d="M3 2.5h8l2.5 2.5v8.5H3z"/><path d="M5.5 2.5v3.5h5v-3.5M5.5 13.5v-4h5v4"/>'),
  locked: S('<rect x="3.2" y="7" width="9.6" height="6.8" rx="1.4"/><path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7"/><circle cx="8" cy="10.3" r="0.8" fill="currentColor" stroke="none"/>'),
};
function iconFor(name) {
  const n = name.toLowerCase();
  if (/feng|shui/.test(n)) return ICONS.fengshui;
  if (/personal|me\b|home/.test(n)) return ICONS.personal;
  if (/cinema|film|movie/.test(n)) return ICONS.cinema;
  if (/living|room/.test(n)) return ICONS.living;
  if (/criterion|closet|shelf|book/.test(n)) return ICONS.closet;
  if (/intel|osint|radar/.test(n)) return ICONS.intel;
  if (/school|class|study/.test(n)) return ICONS.school;
  if (/file|cabinet|folder/.test(n)) return ICONS.cabinet;
  return ICONS.grid;
}

const bar = document.getElementById('bar');
let state = { layouts: [], active: null };
let naming = false;
let flash = '';

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

function fit() {
  requestAnimationFrame(() => {
    const last = bar.lastElementChild;
    window.fengshui.barSize(Math.ceil((last ? last.getBoundingClientRect().right : 0) + 4));
  });
}

function render() {
  bar.replaceChildren();
  if (naming) {
    const input = el('input', { placeholder: 'Name the new layout', maxLength: 40 });
    const done = (ok) => {
      const name = input.value.trim();
      naming = false;
      if (ok && name) { window.fengshui.saveLayout(name); flash = `Saved “${name}”`; setTimeout(() => { flash = ''; render(); }, 1800); }
      render();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    input.addEventListener('blur', () => naming && done(false));
    bar.append(el('span', { className: 'note', textContent: 'Save as' }), input);
    fit();
    setTimeout(() => { window.fengshui.barFocus(); input.focus(); }, 30);
    return;
  }
  document.body.classList.toggle('fs', state.skin === 'fengshui');
  for (const l of state.layouts) {
    const b = el('button', { className: `seg${l.id === state.active ? ' on' : ''}`, title: l.name });
    b.innerHTML = iconFor(l.name);
    // In the Feng Shui skin its own tab carries the characters.
    if (state.skin === 'fengshui' && /feng|shui/i.test(l.name)) b.prepend(el('span', { className: 'han', textContent: '风水' }));
    b.append(el('span', { textContent: l.name }));
    b.setAttribute('aria-pressed', String(l.id === state.active));
    b.addEventListener('click', () => {
      // A click also hands the bar the keyboard, so ← → can carry on from here.
      if (!keys) window.fengshui.barKeys(true);
      if (l.id !== state.active) { state.active = l.id; render(); window.fengshui.switchLayout(l.id); }
    });
    bar.append(b);
  }
  bar.append(el('div', { className: 'sep' }));
  if (flash) bar.append(el('span', { className: 'note', textContent: flash }));
  const locked = !!state.locked;
  const save = el('button', {
    className: `seg icon${locked ? ' locked' : ''}`,
    title: locked ? 'Locked. Click to unlock this layout' : 'Save this layout as it is and lock it',
    ariaLabel: locked ? 'Unlock layout' : 'Save and lock layout',
  });
  save.innerHTML = locked ? ICONS.locked : ICONS.save;
  save.addEventListener('click', () => {
    window.fengshui.lockLayout(!locked);
    flash = locked ? 'Unlocked' : 'Saved and locked';
    setTimeout(() => { flash = ''; render(); }, 1600);
    state.locked = !locked;
    render();
  });
  bar.append(save);
  fit();
}

window.fengshui.onBar((s) => { state = s; if (!naming) render(); });
// The menu bar's Save Layout As New… asks for a name here.
window.startNaming = () => { naming = true; render(); };

// Layout switching mode (from the menu bar's Layout menu, or a click on the bar).
let keys = false;
function setKeys(on) {
  if (keys === on) return;
  keys = on;
  document.body.classList.toggle('keys', on);
  if (!naming) render();
}
window.fengshui.onBarKeys(() => setKeys(true));
window.addEventListener('focus', () => { if (document.body.classList.contains('keys')) keys = true; });
window.addEventListener('blur', () => { if (keys) { setKeys(false); window.fengshui.barKeys(false); } });
window.addEventListener('keydown', (e) => {
  if (naming) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const i = state.layouts.findIndex((l) => l.id === state.active);
    const next = state.layouts[(i + dir + state.layouts.length) % state.layouts.length];
    if (next) { state.active = next.id; render(); }
    setKeys(true);
    window.fengshui.barStep(dir);
  } else if (e.key === 'Escape' || e.key === 'Enter') {
    setKeys(false);
    window.fengshui.barKeys(false);
  }
});
window.addEventListener('contextmenu', (e) => { e.preventDefault(); window.fengshui.openSettings(); });
render();
