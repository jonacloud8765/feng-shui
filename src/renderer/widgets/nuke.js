import { h } from '../dom.js';

// NF Widget ("Nuke France", a joke): a green hard-shell briefcase with the trefoil on its lid.
// Click it and the case pops open on launch.exe, a tongue-in-cheek
// 90s-Windows launch sequence. Nothing ever leaves the computer.

const CASE = `<svg viewBox="0 0 220 180" aria-hidden="true">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7fae4e"/><stop offset="0.48" stop-color="#55843a"/><stop offset="0.5" stop-color="#3f6a2c"/><stop offset="1" stop-color="#2c4d20"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eef2"/><stop offset="0.5" stop-color="#8e979f"/><stop offset="1" stop-color="#4b5258"/></linearGradient>
    <linearGradient id="handle" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a3a"/><stop offset="1" stop-color="#0d0d0d"/></linearGradient>
    <radialGradient id="badge" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#ffe45a"/><stop offset="0.7" stop-color="#f2b705"/><stop offset="1" stop-color="#b37d00"/></radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <ellipse cx="110" cy="166" rx="92" ry="9" fill="rgba(0,0,0,0.45)" filter="url(#soft)"/>
  <g class="handle">
    <path d="M78 46 V30 a10 10 0 0 1 10 -10 h44 a10 10 0 0 1 10 10 V46" fill="none" stroke="url(#handle)" stroke-width="11" stroke-linejoin="round"/>
    <path d="M84 30 a5 5 0 0 1 5 -5 h42 a5 5 0 0 1 5 5" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
    <rect x="68" y="40" width="20" height="12" rx="3" fill="url(#rim)"/><rect x="132" y="40" width="20" height="12" rx="3" fill="url(#rim)"/>
  </g>
  <rect x="14" y="48" width="192" height="114" rx="16" fill="url(#body)" stroke="#1d3315" stroke-width="2.5"/>
  <rect x="14" y="99" width="192" height="6" fill="url(#rim)"/>
  <rect x="22" y="56" width="176" height="98" rx="10" fill="none" stroke="rgba(10,25,5,0.55)" stroke-width="2"/>
  <rect x="17" y="51" width="186" height="40" rx="13" fill="url(#gloss)"/>
  <g fill="url(#rim)" stroke="#2b3036" stroke-width="1">
    <rect x="40" y="93" width="22" height="18" rx="3"/><rect x="158" y="93" width="22" height="18" rx="3"/>
  </g>
  <circle cx="51" cy="102" r="2.2" fill="#2b3036"/><circle cx="169" cy="102" r="2.2" fill="#2b3036"/>
  <g fill="#c9d0d6" stroke="#3b4248" stroke-width="0.8">
    <circle cx="28" cy="62" r="3.5"/><circle cx="192" cy="62" r="3.5"/><circle cx="28" cy="148" r="3.5"/><circle cx="192" cy="148" r="3.5"/>
  </g>
  <g transform="translate(110 104)">
    <circle r="27" fill="url(#badge)" stroke="#2a2100" stroke-width="2.4"/>
    <g fill="#141414">
      <circle r="4.6"/>
      <path d="M0 -7 L-12.1 -21 A24 24 0 0 1 12.1 -21 Z" transform="rotate(0)"/>
      <path d="M0 -7 L-12.1 -21 A24 24 0 0 1 12.1 -21 Z" transform="rotate(120)"/>
      <path d="M0 -7 L-12.1 -21 A24 24 0 0 1 12.1 -21 Z" transform="rotate(240)"/>
    </g>
    <ellipse cx="-7" cy="-13" rx="10" ry="5" fill="rgba(255,255,255,0.35)"/>
  </g>
  <text x="110" y="152" text-anchor="middle" font-family="Menlo, monospace" font-size="8" letter-spacing="2.5" fill="rgba(230,255,200,0.55)">TOP SECRET</text>
</svg>`;

const css = `
:root.paper-note .glass { overflow: visible; border-radius: 0; }
:root.paper-note .glass > .layer { display: none; }
.nuke { position: absolute; inset: 0; display: grid; place-items: center; cursor: pointer; }
.nuke svg { width: 100%; height: 100%; overflow: visible; transition: transform .25s cubic-bezier(.3,1.4,.5,1); filter: drop-shadow(0 2px 2px rgba(0,0,0,0.25)); }
.nuke:hover svg { transform: translateY(-2px) rotate(-1.5deg); }
.nuke:active svg { transform: scale(0.96); }
.nuke .handle { transition: transform .25s ease; transform-origin: 110px 46px; }
.nuke:hover .handle { transform: translateY(-2px); }
.nuke.armed svg { animation: nk-shake .45s steps(6); }
@keyframes nk-shake { 25% { transform: translateX(-3px) rotate(-2deg); } 50% { transform: translateX(3px) rotate(2deg); } 75% { transform: translateX(-2px); } }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  document.documentElement.classList.add('paper-note');
  const box = h('div.nuke', { title: 'launch.exe', html: CASE });
  box.addEventListener('click', () => {
    box.classList.remove('armed');
    void box.offsetWidth;
    box.classList.add('armed');
    ctx.api.openNuke();
  });
  root.append(box);
  return { noDoubleClickSettings: true };
}
