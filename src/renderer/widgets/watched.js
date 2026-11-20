import { h } from '../dom.js';

// Films Watched: one big number from the member's Letterboxd profile.
// Click it to open their films on Letterboxd.

const css = `
.watched { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25em; text-align: var(--align); }
.watched .count { background: none; padding: 0; font-family: var(--display); font-weight: var(--weight); line-height: 1; font-variant-numeric: lining-nums tabular-nums;
  font-size: calc(min(100cqw / var(--digits) * 1.5, 48cqh) * var(--scale)); transition: opacity 0.3s var(--ease); }
.watched .count.loading { opacity: 0.35; }
.watched .label { font-family: var(--info); font-size: calc(clamp(10px, 8cqmin, 15px) * var(--scale)); letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.7; }
.watched .user { font-family: var(--info); font-size: calc(clamp(9px, 6cqmin, 12px) * var(--scale)); opacity: 0.45; }
.watched .goal { width: min(78%, 260px); margin-top: 0.5em; display: flex; flex-direction: column; gap: 5px; align-items: stretch; }
.watched .bar { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.12); overflow: hidden; }
.watched .bar i { display: block; height: 100%; width: 0; border-radius: inherit; background: var(--accent); transition: width 0.8s var(--ease); }
.watched .goal small { font-family: var(--info); font-size: calc(clamp(9px, 5.5cqmin, 11px) * var(--scale)); opacity: 0.55; text-align: center; }
@container (max-height: 140px) { .watched .goal small { display: none; } }
.watched .err { font-family: var(--info); font-size: calc(clamp(9px, 6cqmin, 12px) * var(--scale)); color: #ffc4ba; max-width: 92%; }
@container (max-height: 120px) { .watched .user { display: none; } }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  const count = h('button.count.loading', { title: 'Open your films on Letterboxd' }, '—');
  const label = h('div.label');
  const user = h('div.user');
  const err = h('div.err');
  const fill = h('i');
  const goalText = h('small');
  const goal = h('div.goal', {}, h('div.bar', {}, fill), goalText);
  const wrap = h('div.watched', {}, count, label, goal, user, err);
  root.append(wrap);
  let data = null;
  let token = 0;

  count.addEventListener('click', () => { if (ctx.config.username) ctx.api.openProfile(ctx.config.username); });

  function paint() {
    const c = ctx.config;
    label.textContent = c.label || 'films watched';
    user.textContent = c.showUser && c.username ? `@${c.username}` : '';
    if (!c.username) {
      goal.style.display = 'none';
      count.textContent = '—';
      wrap.style.setProperty('--digits', '2');
      err.replaceChildren(h('button.pill', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Add username'));
      return;
    }
    const target = Number(c.goal) || 0;
    const have = data?.count;
    goal.style.display = target > 0 && have != null ? '' : 'none';
    if (target > 0 && have != null) {
      fill.style.width = `${Math.min(100, (have / target) * 100)}%`;
      goalText.textContent = have >= target ? `Goal of ${target.toLocaleString()} reached` : `${(target - have).toLocaleString()} to go to ${target.toLocaleString()}`;
    }
    const text = data && data.count != null ? data.count.toLocaleString() : '—';
    count.textContent = text;
    wrap.style.setProperty('--digits', String(Math.max(2, text.length)));
    err.textContent = data?.error ? (data.count != null ? 'Couldn’t update. Showing the last count.' : data.error) : '';
    err.title = data?.error || '';
  }

  async function load(force = false) {
    const mine = ++token;
    if (!ctx.config.username) { data = null; count.classList.remove('loading'); return paint(); }
    count.classList.add('loading');
    const r = await ctx.api.watched(ctx.config.username, force);
    if (mine !== token) return;
    data = r;
    count.classList.remove('loading');
    paint();
  }

  // Checked hourly; Letterboxd's count changes only as you log films.
  setInterval(() => load(false), 60 * 60 * 1000);
  let prevUser = ctx.config.username;
  let debounce;
  load();
  return {
    update: (w) => {
      if (w.config.username !== prevUser) {
        prevUser = w.config.username;
        clearTimeout(debounce);
        debounce = setTimeout(() => load(false), 800);
      } else paint();
    },
    resume: () => load(false),
    menu: () => [{ label: 'Refresh Count', action: 'refresh' }],
    menuAction: (a) => a === 'refresh' && load(true),
  };
}
