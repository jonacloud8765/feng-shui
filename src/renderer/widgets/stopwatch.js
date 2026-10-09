import { h, setText, icons } from '../dom.js';

const css = `
.sw { width: 100%; height: 100%; display: flex; flex-direction: column; gap: 0.7em; align-items: center; justify-content: center; }
.sw .time { font-size: calc(min(100cqw / 7.2 * 1.6, 36cqh) * var(--scale)); }
.sw .time .cs { opacity: 0.5; font-size: 0.62em; }
.sw .controls { display: flex; gap: 0.55em; }
.sw .laps { width: 100%; flex: 1; min-height: 0; overflow-y: auto; display: none; font-family: var(--info); font-size: calc(clamp(11px, 4.4cqmin, 14px) * var(--scale)); font-variant-numeric: tabular-nums; }
.sw .laps::-webkit-scrollbar { width: 0; }
.sw .lap { display: flex; justify-content: space-between; padding: 0.42em 0.2em; border-top: 0.5px solid rgba(255,255,255,0.1); }
.sw .lap .n { opacity: 0.5; }
.sw .lap .t { opacity: 0.85; }
.sw .lap.best .t { color: var(--accent); }
@container (min-height: 260px) { .sw { justify-content: flex-start; padding-top: 4cqh; } .sw .laps { display: block; } .sw .time { font-size: calc(min(100cqw / 7.2 * 1.6, 70px + 6cqh) * var(--scale)); } }
@container (max-height: 125px) { .sw .controls .icon-btn.lap-btn { display: none; } }
`;

export function format(ms, withCs = true) {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000) % 60;
  const hr = Math.floor(total / 360000);
  const main = (hr ? `${hr}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
  return withCs ? [main, '.' + String(cs).padStart(2, '0')] : [main, ''];
}

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const main = h('span');
  const cs = h('span.cs');
  const time = h('div.display.time', { role: 'timer', 'aria-live': 'off' }, main, cs);
  const play = h('button.icon-btn', { 'aria-label': 'Start' });
  const lap = h('button.icon-btn.lap-btn', { 'aria-label': 'Lap', html: icons.flag });
  const reset = h('button.icon-btn', { 'aria-label': 'Reset', html: icons.reset });
  const laps = h('div.laps');
  root.append(h('div.sw', {}, time, h('div.controls', {}, reset, play, lap), laps));

  // State comes from the main process (monotonic clock). Between snapshots the
  // display is extrapolated from performance.now(), which is also monotonic.
  let state = { running: false, elapsed: 0, laps: [] };
  let base = performance.now();
  let raf = 0;

  const elapsed = () => state.elapsed + (state.running ? performance.now() - base : 0);

  function paint() {
    const [a, b] = format(elapsed());
    setText(main, a);
    setText(cs, b);
  }

  function loop() {
    paint();
    raf = state.running ? requestAnimationFrame(loop) : 0;
  }

  function apply(s) {
    state = s;
    base = performance.now();
    play.innerHTML = s.running ? icons.pause : icons.play;
    play.setAttribute('aria-label', s.running ? 'Pause' : s.elapsed > 0 ? 'Resume' : 'Start');
    play.classList.toggle('primary', !s.running);
    lap.disabled = !s.running;
    reset.disabled = s.running || s.elapsed === 0;
    renderLaps();
    cancelAnimationFrame(raf);
    loop();
  }

  function renderLaps() {
    // Laps are stored as cumulative times, newest first.
    const splits = state.laps.map((t, i) => t - (state.laps[i + 1] || 0));
    const best = splits.length > 1 ? Math.min(...splits) : null;
    laps.replaceChildren(
      ...splits.map((d, i) =>
        h(`div.lap${d === best ? '.best' : ''}`, {}, h('span.n', {}, `Lap ${splits.length - i}`), h('span.t', {}, format(d).join(''))),
      ),
    );
  }

  const act = async (a) => apply(await ctx.api.stopwatch(a));
  play.addEventListener('click', () => act(state.running ? 'pause' : 'start'));
  lap.addEventListener('click', () => act('lap'));
  reset.addEventListener('click', () => act('reset'));
  act('get');

  // requestAnimationFrame pauses while the window is hidden; resync when shown.
  document.addEventListener('visibilitychange', () => !document.hidden && act('get'));

  return {
    resume: () => act('get'),
    menu: () => [
      { label: state.running ? 'Pause' : 'Start', action: state.running ? 'pause' : 'start' },
      { label: 'Lap', action: 'lap' },
      { label: 'Reset', action: 'reset' },
    ],
    menuAction: (a) => act(a),
  };
}
