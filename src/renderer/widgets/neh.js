import { h } from '../dom.js';
import { liveReading, css as pzCss } from './pizzint-ui.js';

// Nothing Ever Happens Index: PizzINT Watch's doomsday gauge. The score is the
// highest escalation probability among the markets the site watches; the
// needle and bands use the site's own classifications.

const BANDS = [
  { max: 29, lines: ['NOTHING', 'EVER HAPPENS'], color: '#22c55e' },
  { max: 64, lines: ['SOMETHING', 'MIGHT HAPPEN'], color: '#eab308' },
  { max: 98, lines: ['SOMETHING', 'IS HAPPENING'], color: '#f97316' },
  { max: 100, lines: ['IT', 'HAPPENED'], color: '#ef4444' },
];
const LABELS = ['Nothing Ever Happens', 'Something Might Happen', 'Something Is Happening', 'It Happened'];
const bandOf = (v) => (v <= 29 ? 0 : v <= 64 ? 1 : v <= 98 ? 2 : 3);
// Each band gets a quarter of the dial, as on the site.
const dialPct = (v) => { const t = Math.max(0, Math.min(100, v)); return t <= 29 ? (t / 29) * 25 : t <= 64 ? 25 + ((t - 30) / 34) * 25 : t <= 98 ? 50 + ((t - 65) / 33) * 25 : 75 + (t - 99) * 25; };

const CX = 150, CY = 152, R1 = 132, R0 = 90;
const pt = (deg, r) => [CX + r * Math.cos((deg * Math.PI) / 180), CY - r * Math.sin((deg * Math.PI) / 180)];
const f = (n) => n.toFixed(2);
function sector(a0, a1, r0, r1) {
  const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1), [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0);
  return `M${f(x0)} ${f(y0)} A${r1} ${r1} 0 0 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${r0} ${r0} 0 0 0 ${f(x3)} ${f(y3)} Z`;
}
function arc(a0, a1, r) {
  const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
  return `M${f(x0)} ${f(y0)} A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}`;
}

function dial() {
  const gap = 1.2;
  let s = '<defs><filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    + '<radialGradient id="hub" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e9edf2"/><stop offset="0.5" stop-color="#8a929c"/><stop offset="1" stop-color="#2b3038"/></radialGradient></defs>';
  // Faint instrumentation behind the dial.
  s += '<g fill="none" stroke="rgba(150,180,230,0.08)" stroke-width="0.7">';
  for (const r of [60, 74, 146, 158]) s += `<path d="${arc(180, 0, r)}"/>`;
  for (let a = 0; a <= 180; a += 15) { const [x0, y0] = pt(a, 40), [x1, y1] = pt(a, 166); s += `<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}"/>`; }
  s += '</g>';
  // Ticks round the outside.
  s += '<g stroke="rgba(200,215,240,0.35)" stroke-width="0.8">';
  for (let i = 0; i <= 40; i++) { const a = 180 - i * 4.5; const [x0, y0] = pt(a, R1 + 3), [x1, y1] = pt(a, R1 + (i % 10 === 0 ? 10 : 6)); s += `<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}"/>`; }
  s += '</g>';
  // Bands, each a quarter of the dial with a lit border and its label on the arc.
  BANDS.forEach((b, i) => {
    const a0 = 180 - i * 45 - gap, a1 = 180 - (i + 1) * 45 + gap;
    s += `<path class="band b${i}" d="${sector(a0, a1, R0, R1)}" style="fill:${b.color}" />`;
    s += `<path d="${sector(a0, a1, R0, R1)}" fill="none" stroke="${b.color}" stroke-width="1.1" filter="url(#glow)" opacity="0.95"/>`;
    b.lines.forEach((line, j) => {
      const r = j === 0 ? 117 : 102;
      s += `<path id="lp${i}${j}" d="${arc(a0 - 1, a1 + 1, r)}" fill="none"/>`;
      s += `<text class="lab" font-size="9.6"><textPath href="#lp${i}${j}" startOffset="50%" text-anchor="middle">${line}</textPath></text>`;
    });
  });
  // Boundary figures.
  for (const [v, a] of [[0, 180], [30, 135], [65, 90], [99, 45], [100, 0]]) {
    const [x, y] = pt(a, R1 + 18);
    s += `<text class="fig" x="${f(x)}" y="${f(y + 3)}" text-anchor="middle">${v}</text>`;
  }
  s += '<g class="needle"><path d="M-3.4 -66 L-0.9 -124 L0.9 -124 L3.4 -66 Z" fill="#f1f3f5"/><path d="M0 -66 L0 -124" stroke="rgba(0,0,0,0.25)" stroke-width="0.6"/></g>';
  // The score sits in a half disc under the needle's pivot.
  const HR = 64;
  s += `<path class="hub" d="M${CX - HR} ${CY} A${HR} ${HR} 0 0 1 ${CX + HR} ${CY} Z"/>`;
  s += `<path d="M${CX - HR + 6} ${CY} A${HR - 6} ${HR - 6} 0 0 1 ${CX + HR - 6} ${CY}" class="hubring"/>`;
  s += `<text class="hubnum" x="${CX}" y="${CY - 13}" text-anchor="middle">––</text>`;
  s += `<text class="hubcap" x="${CX}" y="${CY - 3}" text-anchor="middle">OUT OF 100</text>`;
  return s;
}

const css = `
${pzCss}
.neh { position: absolute; inset: 3px; border-radius: 16px; overflow: hidden; container-type: size; --pz-accent: #9fb4d8;
  font-family: "DIN Condensed", "Avenir Next Condensed", sans-serif; color: #e8eef8;
  background:
    linear-gradient(rgba(140,170,230,0.05) 1px, transparent 1px) 0 0 / 12px 12px,
    linear-gradient(90deg, rgba(140,170,230,0.05) 1px, transparent 1px) 0 0 / 12px 12px,
    radial-gradient(90% 70% at 50% 75%, rgba(40,70,130,0.35), transparent 70%),
    linear-gradient(180deg, #0a1020, #050810);
  box-shadow: inset 0 0 0 1px rgba(150,180,240,0.16), 0 8px 20px -8px rgba(0,0,0,0.7); }
.neh svg.g { position: absolute; left: 50%; top: 15cqh; height: 54cqh; transform: translateX(-50%); overflow: visible; }
.neh .band { opacity: 0.16; transition: opacity .4s ease; }
.neh .band.on { opacity: 0.42; }
.neh .lab { fill: rgba(240,244,250,0.88); font-weight: 700; letter-spacing: 0.06em; }
.neh .fig { fill: rgba(200,215,240,0.55); font-size: 9px; font-family: "DIN Alternate", sans-serif; }
.neh .needle { transition: transform 1.1s cubic-bezier(.3,1.5,.5,1); filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.6)); }
.neh .hub { fill: #060a14; stroke: var(--neh); stroke-width: 1.3; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--neh) 45%, transparent)); }
.neh .hubring { fill: none; stroke: color-mix(in srgb, var(--neh) 30%, transparent); stroke-width: 0.7; stroke-dasharray: 1.5 2.5; }
.neh .hubnum { fill: var(--neh); font-family: "DIN Condensed", "Impact", sans-serif; font-weight: 700; font-size: 46px; letter-spacing: 0.02em;
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--neh) 55%, transparent)); }
.neh .hubcap { fill: rgba(200,215,240,0.45); font-size: 6.5px; letter-spacing: 0.22em; font-family: "DIN Alternate", sans-serif; }
.neh .threat { position: absolute; left: 6cqw; right: 6cqw; bottom: 4.5cqh; text-align: center; display: flex; flex-direction: column; gap: 1.2cqh; }
.neh .cls { font-size: max(8px, 6.6cqh); letter-spacing: 0.2em; color: var(--neh); white-space: nowrap; font-weight: 700; }
.neh .cur { font-family: "Avenir Next Condensed", "Avenir Next", sans-serif; font-size: max(8px, 5.4cqh); line-height: 1.25; color: rgba(232,238,248,0.82);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.neh .cur b { font-family: "DIN Alternate", sans-serif; font-weight: 400; font-size: 0.86em; letter-spacing: 0.18em; color: rgba(200,215,240,0.5); margin-right: 0.4em; }
.neh .title { position: absolute; left: 5cqw; top: 5cqh; font-size: max(7px, 5.6cqh); letter-spacing: 0.22em; color: rgba(200,215,240,0.5); }
.neh .tools { position: absolute; right: 3cqw; top: 3.5cqh; display: flex; align-items: center; gap: 1.5cqw; font-size: max(11px, 8cqh); }
.neh .pz-status { position: absolute; left: 5cqw; top: 11.5cqh; font-size: max(7px, 4.4cqh); color: rgba(200,215,240,0.42); }
.neh .pz-status.stale { color: #ffb020; } .neh .pz-status.fail { color: #ff5a4a; }
@container (max-height: 190px) { .neh .cur { -webkit-line-clamp: 1; } }
@container (max-height: 150px) { .neh .title, .neh .pz-status, .neh .cur { display: none; } }
`;
export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  document.documentElement.classList.add('paper-note');
  const card = h('div.neh');
  card.style.setProperty('--neh', '#9fb4d8');
  card.insertAdjacentHTML('beforeend', `<svg class="g" viewBox="0 -24 300 178" aria-hidden="true">${dial()}</svg>`);
  const svg = card.querySelector('svg');
  const needle = svg.querySelector('.needle');
  const num = svg.querySelector('.hubnum');
  const cls = h('div.cls', {}, 'Reading PizzINT…');
  const cur = h('div.cur');
  card.append(h('div.title', {}, 'NOTHING EVER HAPPENS INDEX'), h('div.threat', {}, cls, cur));

  function point(v) {
    const deg = 180 - dialPct(v) * 1.8; // 180 = far left
    needle.setAttribute('transform', `translate(${CX} ${CY}) rotate(${90 - deg})`);
  }
  point(0);
  needle.style.opacity = '0.35';

  function render(r, _state, error) {
    if (!r) {
      num.textContent = '––';
      cls.textContent = error ? 'No reading · PizzINT unreachable' : 'Reading PizzINT…';
      return;
    }
    const b = bandOf(r.value);
    card.style.setProperty('--neh', BANDS[b].color);
    svg.querySelectorAll('.band').forEach((el, i) => el.classList.toggle('on', i === b));
    num.textContent = String(r.value);
    cls.textContent = (r.label || LABELS[b]).toUpperCase();
    // The market setting the score is the threat the index is reading now.
    cur.replaceChildren(h('b', {}, 'CURRENT THREAT'), r.driver || 'No single market leads');
    cur.title = r.driver ? `${r.driver} · ${r.value}% on the markets PizzINT watches` : '';
    needle.style.opacity = '1';
    point(r.value);
  }

  const live = liveReading(ctx, 'neh', render);
  card.append(h('div.tools', {}, live.button), live.status);
  root.append(card);
  return { resume: live.resume };
}
