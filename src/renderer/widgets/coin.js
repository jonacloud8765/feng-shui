import { h, setText, randomInt, reduceMotion } from '../dom.js';

const css = `
.coin-w { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8em; }
.coin-stage { perspective: 600px; display: grid; place-items: center; }
.coin {
  --d: calc(min(62cqw, 52cqh));
  width: var(--d); height: var(--d);
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.9s cubic-bezier(0.2, 0.75, 0.25, 1);
  cursor: default;
}
.coin.instant { transition: none; }
.coin .face {
  position: absolute; inset: 0; border-radius: 50%;
  display: grid; place-items: center;
  backface-visibility: hidden;
  background:
    radial-gradient(circle at 32% 28%, rgba(255,255,255,0.35), transparent 55%),
    radial-gradient(circle at 70% 80%, rgba(0,0,0,0.25), transparent 60%),
    color-mix(in srgb, var(--accent) 55%, rgba(40,36,30,0.6));
  box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.35), inset 0 0 0 calc(var(--d) * 0.06) rgba(0,0,0,0.08), 0 6px 18px rgba(0,0,0,0.25);
  color: rgba(25, 20, 12, 0.78);
  font-family: var(--display);
  font-size: calc(var(--d) * 0.42);
  font-weight: 400;
}
.coin .face.tails { transform: rotateY(180deg); }
.coin-w .result { font-size: calc(clamp(12px, 9cqmin, 22px) * var(--scale)); letter-spacing: 0.06em; min-height: 1.2em; transition: opacity 0.3s; }
.coin-w .result.hidden { opacity: 0; }
.coin-w .fade { transition: opacity 0.25s; }
@container (max-height: 150px) { .coin-w .pill { display: none; } }
@container (max-height: 120px) { .coin-w .result { display: none; } }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const headsFace = h('div.face.heads');
  const tailsFace = h('div.face.tails');
  const coin = h('div.coin', { role: 'button', 'aria-label': 'Flip coin', 'data-interactive': '' }, headsFace, tailsFace);
  const result = h('div.display.result');
  const btn = h('button.pill', {}, 'Flip');
  root.append(h('div.coin-w', {}, h('div.coin-stage', {}, coin), result, btn));

  let rotation = 0; // degrees; even multiples of 180 show heads
  let flipping = false;

  const faceOf = (deg) => (Math.round(deg / 180) % 2 === 0 ? 'heads' : 'tails');

  function labels() {
    const c = ctx.config;
    setText(headsFace, (c.heads || 'H').trim().charAt(0).toUpperCase());
    setText(tailsFace, (c.tails || 'T').trim().charAt(0).toUpperCase());
  }

  function showResult(side) {
    const c = ctx.config;
    setText(result, side ? (side === 'heads' ? c.heads : c.tails) : '');
    result.classList.toggle('hidden', !side);
  }

  function flip() {
    if (flipping) return;
    // Decide first, then animate to exactly that face.
    const side = randomInt(0, 1) === 0 ? 'heads' : 'tails';
    const current = faceOf(rotation);
    const turns = 4 * 180 + (side === current ? 0 : 180);
    rotation += turns;
    result.classList.add('hidden');
    if (reduceMotion()) {
      coin.classList.add('instant');
      coin.style.transform = `rotateY(${rotation}deg)`;
      showResult(side);
      ctx.setConfig({ last: side });
      return;
    }
    flipping = true;
    coin.classList.remove('instant');
    coin.style.transform = `rotateY(${rotation}deg)`;
    setTimeout(() => {
      flipping = false;
      showResult(side);
      ctx.setConfig({ last: side });
    }, 900);
  }

  coin.addEventListener('click', flip);
  btn.addEventListener('click', flip);

  function load() {
    labels();
    const last = ctx.config.last;
    if (!flipping) {
      if (last && faceOf(rotation) !== last) {
        rotation += 180;
        coin.classList.add('instant');
        coin.style.transform = `rotateY(${rotation}deg)`;
      }
      showResult(last);
    }
  }
  load();

  return { update: load, menu: () => [{ label: 'Flip', action: 'flip' }], menuAction: (a) => a === 'flip' && flip() };
}
