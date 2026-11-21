import { h } from '../dom.js';
import { liveReading, css as pzCss, INFO_SVG } from './pizzint-ui.js';

// DOUGHCON: PizzINT Watch's Pentagon pizza readiness level, shown with the
// DEFCON level it maps to (one to one). The accent follows the level.

const ACCENT = { 1: '#ff3b30', 2: '#ff7a1a', 3: '#ffb000', 4: '#ffe45c', 5: '#39ff6a' };

const css = `
${pzCss}
.dc { position: absolute; inset: 3px; border-radius: 14px; overflow: hidden; container-type: size; --pz-accent: var(--lvl);
  font-family: "DIN Alternate", "DIN Condensed", "Avenir Next Condensed", sans-serif; color: #e9f5ec;
  background:
    linear-gradient(rgba(120,255,160,0.045) 1px, transparent 1px) 0 0 / 11px 11px,
    linear-gradient(90deg, rgba(120,255,160,0.045) 1px, transparent 1px) 0 0 / 11px 11px,
    radial-gradient(120% 140% at 12% 50%, color-mix(in srgb, var(--lvl) 13%, transparent), transparent 60%),
    linear-gradient(160deg, #07120c, #030805 70%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lvl) 70%, transparent), 0 0 12px -2px color-mix(in srgb, var(--lvl) 45%, transparent), 0 8px 20px -8px rgba(0,0,0,0.7); }
.dc::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: repeating-linear-gradient(180deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 3px); }
.dc .row { position: absolute; inset: 0; display: flex; align-items: center; gap: 5cqw; padding: 0 6cqw 0 5.5cqw; }
.dc .shield { height: 62cqh; flex: none; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--lvl) 55%, transparent)); }
.dc .shield svg { height: 100%; display: block; }
.dc .text { min-width: 0; display: flex; flex-direction: column; gap: 1.5cqh; }
.dc .kicker { font-size: max(8px, 8.5cqh); letter-spacing: 0.32em; color: color-mix(in srgb, var(--lvl) 75%, #dfe); text-transform: uppercase; }
.dc .big { display: flex; align-items: center; gap: 4cqw; min-width: 0; }
.dc .side { display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 2.5cqh; min-width: 0; }
.dc .desc { white-space: normal !important; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dc .num { font-family: "DIN Condensed", "Avenir Next Condensed", "Impact", sans-serif; font-weight: 700; font-size: 52cqh; line-height: 0.82;
  color: var(--lvl); text-shadow: 0 0 14px color-mix(in srgb, var(--lvl) 55%, transparent); letter-spacing: 0.02em; }
.dc .defcon { font-size: max(8px, 9cqh); letter-spacing: 0.22em; padding: 0.35em 0.6em 0.25em; border: 1px solid color-mix(in srgb, var(--lvl) 60%, transparent);
  border-radius: 3px; color: #e9f5ec; white-space: nowrap; background: color-mix(in srgb, var(--lvl) 10%, transparent); }
.dc .desc { font-size: max(8px, 8.6cqh); letter-spacing: 0.16em; text-transform: uppercase; color: rgba(233,245,236,0.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dc .tools { position: absolute; top: 6cqh; right: 3cqw; display: flex; gap: 2px; font-size: max(11px, 11cqh); z-index: 2; }
.dc .pz-status { position: absolute; right: 5cqw; bottom: 7cqh; font-size: max(7px, 6.4cqh); color: rgba(233,245,236,0.42); }
.dc .pz-status.stale { color: #ffb020; } .dc .pz-status.fail { color: #ff5a4a; }
@container (max-height: 112px) { .dc .pz-status:not(.stale):not(.fail) { display: none; } .dc .pz-status { bottom: auto; top: 8cqh; right: 22cqw; } }
.dc .empty { font-size: max(9px, 9cqh); letter-spacing: 0.18em; text-transform: uppercase; color: rgba(233,245,236,0.6); }
`;

function shield(level) {
  return `<svg viewBox="0 0 40 46">
    <path d="M20 2 L36 8 V22 C36 33 29 40 20 44 C11 40 4 33 4 22 V8 Z" style="fill: color-mix(in srgb, var(--lvl) 14%, transparent); stroke: var(--lvl)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M20 7 L31.5 11.4 V22 C31.5 30 26.6 35.4 20 38.6 C13.4 35.4 8.5 30 8.5 22 V11.4 Z" fill="none" style="stroke: var(--lvl)" stroke-width="0.8" opacity="0.55"/>
    <path d="M20 13.5 L22.6 19.8 L29.3 20.3 L24.2 24.6 L25.8 31.2 L20 27.6 L14.2 31.2 L15.8 24.6 L10.7 20.3 L17.4 19.8 Z" style="fill: var(--lvl); opacity: ${level ? 0.95 : 0.35}"/>
  </svg>`;
}

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  document.documentElement.classList.add('paper-note');
  const card = h('div.dc');
  const row = h('div.row');
  const info = h('button.pz-btn', { title: 'About DEFCON (opens PizzINT Watch)', 'aria-label': 'About DEFCON', html: INFO_SVG, onmousedown: (e) => e.stopPropagation(), onclick: () => ctx.api.openPizzint('doughcon') });
  card.style.setProperty('--lvl', '#39ff6a');

  function render(r, _state, error) {
    if (!r) {
      card.style.setProperty('--lvl', '#6f8f7a');
      row.replaceChildren(h('div.shield', { html: shield(null) }), h('div.text', {}, h('div.kicker', {}, 'DEFCON'), h('div.empty', {}, error ? 'No reading yet · PizzINT unreachable' : 'Reading PizzINT…')));
      return;
    }
    card.style.setProperty('--lvl', ACCENT[r.level]);
    row.replaceChildren(
      h('div.shield', { html: shield(r.level) }),
      h('div.text', {},
        h('div.big', {}, h('div.num', {}, String(r.defcon)),
          h('div.side', {}, h('div.kicker', {}, 'DEFCON'), h('div.desc', { title: r.description }, r.description)))));
  }

  render(null);
  const live = liveReading(ctx, 'doughcon', render);
  card.append(row, h('div.tools', {}, live.button, info), live.status);
  root.append(card);
  return { resume: live.resume, noDoubleClickSettings: false };
}
