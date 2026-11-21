import { h } from '../dom.js';

// Films Watched: the count from the member's Letterboxd profile, printed on a
// cinema ticket stub. Click the ticket to change its look (three of them).

export const LOOKS = { admit: 'Admit One', deco: 'Picture House', foil: 'Midnight Premiere' };
const ORDER = Object.keys(LOOKS);

const css = `
:root.paper-note .glass { overflow: visible; border-radius: 0; }
:root.paper-note .glass > .layer { display: none; }
.tk-stage { position: absolute; inset: 0; display: grid; place-items: center; perspective: 700px; container-type: size; cursor: pointer; }
.tk { position: relative; width: 88cqw; height: min(74cqh, 50cqw); transform-style: preserve-3d;
  transform: rotateX(var(--rx, 10deg)) rotateY(var(--ry, -16deg)) rotateZ(-3deg); transition: transform .5s cubic-bezier(.3,1.3,.5,1); }
.tk-stage:hover .tk { --rx: 4deg; --ry: -7deg; }
.tk.flip { animation: tk-flip .6s cubic-bezier(.4,0,.2,1); }
@keyframes tk-flip { 0% { transform: rotateX(10deg) rotateY(-16deg) rotateZ(-3deg); } 50% { transform: rotateX(80deg) rotateY(-10deg) rotateZ(-3deg) translateZ(20px); } 100% { transform: rotateX(10deg) rotateY(-16deg) rotateZ(-3deg); } }
/* Paper: the face, the board it is cut from (its thickness), and a second ticket under it. */
.tk .face, .tk .edge, .tk .under { position: absolute; inset: 0; border-radius: 5px;
  -webkit-mask: radial-gradient(circle at var(--cut) 0, #0000 6.5cqh, #000 6.6cqh) top / 100% 51% no-repeat,
                radial-gradient(circle at var(--cut) 100%, #0000 6.5cqh, #000 6.6cqh) bottom / 100% 51% no-repeat; }
.tk { --cut: 72%; }
.tk .edge { transform: translateZ(-3px); background: var(--edge); }
.tk .under { transform: translateZ(-14px) translate(5%, 7%) rotateZ(5deg); background: var(--edge); filter: brightness(0.75); box-shadow: 0 14px 22px -8px rgba(0,0,0,0.6); }
.tk .face { background: var(--paper); color: var(--ink); overflow: hidden; display: flex;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
.tk .face::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, rgba(255,255,255,0.22), transparent 38%, transparent 62%, rgba(0,0,0,0.16)); }
.tk .shadow { position: absolute; left: 6%; right: 2%; bottom: -12%; height: 18%; transform: translateZ(-30px); background: rgba(0,0,0,0.55); filter: blur(10px); border-radius: 50%; }
.tk .body { position: relative; width: var(--cut); padding: 5cqh 4cqw; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 1.2cqh; text-align: center; }
.tk .stub { position: relative; flex: 1; border-left: 2px dashed var(--perf); display: flex; align-items: center; justify-content: center; }
.tk .kick { font-size: max(7px, 6cqh); letter-spacing: 0.32em; text-transform: uppercase; opacity: 0.85; white-space: nowrap; }
.tk .count { font-size: min(32cqh, calc(56cqw / var(--digits) * 1.45)); line-height: 0.92; font-variant-numeric: lining-nums tabular-nums; transition: opacity .3s ease; }
.tk .count.loading { opacity: 0.35; }
.tk .lab { font-size: max(7px, 5.6cqh); letter-spacing: 0.24em; text-transform: uppercase; white-space: nowrap; }
.tk .meta { font-size: max(6px, 4.4cqh); letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.7; white-space: nowrap; }
.tk .goal { width: 78%; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 20%, transparent); overflow: hidden; }
.tk .goal i { display: block; height: 100%; width: 0; background: var(--ink); transition: width .8s ease; }
.tk .vert { writing-mode: vertical-rl; transform: rotate(180deg); font-size: max(7px, 6.4cqh); letter-spacing: 0.3em; text-transform: uppercase; white-space: nowrap; }
.tk .err { position: absolute; left: 0; right: 0; bottom: -2px; font-size: 9px; color: #ffc4ba; text-align: center; transform: translateY(110%); }
.tk .add { font: inherit; font-size: max(8px, 5cqh); letter-spacing: 0.14em; text-transform: uppercase; border: 1px solid currentColor; background: none; color: inherit; border-radius: 3px; padding: 0.3em 0.7em; cursor: pointer; }
@container (max-height: 120px) { .tk .meta, .tk .kick { display: none; } }

/* Admit One: the red roll ticket. */
.tk.admit { --paper: linear-gradient(180deg, #c8262f, #a81d26); --edge: #6e1016; --ink: #fbe9cf; --perf: rgba(251,233,207,0.6); }
.tk.admit .face { font-family: "DIN Condensed", "Avenir Next Condensed", "Impact", sans-serif; }
.tk.admit .body { outline: 1px solid rgba(251,233,207,0.45); outline-offset: -2.6cqh; }
.tk.admit .count { font-weight: 700; text-shadow: 0 1px 0 rgba(0,0,0,0.25); }
.tk.admit .stub .vert { font-weight: 700; font-size: max(8px, 8cqh); letter-spacing: 0.22em; }

/* Picture House: cream card stock, black and gold, art deco. */
.tk.deco { --paper: radial-gradient(120% 90% at 30% 20%, #f7efd9, #e6d6b0); --edge: #b9a26f; --ink: #1d1a14; --perf: rgba(120,95,40,0.55); }
.tk.deco .face { font-family: "Didot", "Bodoni 72", Georgia, serif; }
.tk.deco .body::before { content: ''; position: absolute; inset: 2.6cqh 2.4cqw; border: 1.5px solid #a88a3e; box-shadow: inset 0 0 0 3px #f2e7cb, inset 0 0 0 4px #a88a3e; pointer-events: none; }
.tk.deco .kick { color: #8a6d24; font-family: "Futura", "Avenir Next", sans-serif; font-weight: 500; }
.tk.deco .count { font-style: italic; }
.tk.deco .lab { font-family: "Futura", "Avenir Next", sans-serif; }
.tk.deco .stub { background: repeating-linear-gradient(45deg, rgba(168,138,62,0.13) 0 4px, transparent 4px 9px); }
.tk.deco .stub .vert { font-family: "Futura", "Avenir Next", sans-serif; color: #8a6d24; }

/* Midnight Premiere: dark card with a foil stripe and a barcode. */
.tk.foil { --paper: linear-gradient(160deg, #1b2240, #0b0f1f); --edge: #05070f; --ink: #e9ecff; --perf: rgba(170,180,255,0.35); }
.tk.foil .face { font-family: "Menlo", "SF Mono", monospace; }
.tk.foil .count { font-family: "Avenir Next Condensed", "DIN Condensed", sans-serif; font-weight: 700;
  background: linear-gradient(100deg, #ffd6f5, #b4f1ff 35%, #fff1b3 65%, #d7c4ff); -webkit-background-clip: text; color: transparent; }
.tk.foil .stub { background: linear-gradient(180deg, rgba(255,120,220,0.5), rgba(120,220,255,0.5) 33%, rgba(255,240,140,0.5) 66%, rgba(170,140,255,0.5)); flex-direction: column; gap: 3cqh; }
.tk.foil .bars { width: 62%; height: 34cqh; background: repeating-linear-gradient(90deg, #0b0f1f 0 2px, transparent 2px 3px, #0b0f1f 3px 4px, transparent 4px 7px, #0b0f1f 7px 10px, transparent 10px 11px); opacity: 0.85; }
.tk.foil .stub .vert { writing-mode: horizontal-tb; transform: none; font-size: max(6px, 4.4cqh); color: #0b0f1f; font-weight: 700; letter-spacing: 0.16em; }
`;

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  document.documentElement.classList.add('paper-note');
  const stage = h('div.tk-stage', { title: 'Click to change the ticket' });
  const ticket = h('div.tk');
  stage.append(ticket);
  root.append(stage);
  let data = null;
  let token = 0;

  stage.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const next = ORDER[(ORDER.indexOf(look()) + 1) % ORDER.length];
    ticket.classList.remove('flip');
    void ticket.offsetWidth;
    ticket.classList.add('flip');
    setTimeout(() => ctx.setConfig({ look: next }), 300);
  });
  ticket.addEventListener('animationend', () => ticket.classList.remove('flip'));

  const look = () => (LOOKS[ctx.config.look] ? ctx.config.look : 'admit');
  const serial = (n) => String(n ?? 0).padStart(6, '0');

  function paint() {
    const c = ctx.config;
    const k = look();
    ticket.className = `tk ${k}${ticket.classList.contains('flip') ? ' flip' : ''}`;
    const have = data?.count;
    const text = have != null ? have.toLocaleString() : '—';
    const count = h(`div.count${data || !c.username ? '' : '.loading'}`, {}, text);
    ticket.style.setProperty('--digits', String(Math.max(2, text.length)));
    const target = Number(c.goal) || 0;
    const goal = target > 0 && have != null ? h('div.goal', { title: have >= target ? `Goal of ${target.toLocaleString()} reached` : `${(target - have).toLocaleString()} to go to ${target.toLocaleString()}` }, h('i', { style: { width: `${Math.min(100, (have / target) * 100)}%` } })) : null;
    const label = c.label || 'films watched';
    const who = c.showUser && c.username ? `@${c.username}` : '';
    const body = h('div.body');
    if (!c.username) body.append(h('div.kick', {}, LOOKS[k]), h('button.add', { onclick: () => ctx.api.openSettings(ctx.widget.id) }, 'Add username'));
    else if (k === 'admit') body.append(h('div.kick', {}, '★ Cinema ★'), count, h('div.lab', {}, label), goal || '', h('div.meta', {}, who ? `${who} · Nº ${serial(have)}` : `Nº ${serial(have)}`));
    else if (k === 'deco') body.append(h('div.kick', {}, 'The Picture House'), count, h('div.lab', {}, label), goal || '', h('div.meta', {}, who || 'Admit the bearer'));
    else body.append(h('div.kick', {}, 'Premiere · Row Z'), count, h('div.lab', {}, label), goal || '', h('div.meta', {}, who || `Seat ${serial(have).slice(-3)}`));
    const stub = h('div.stub');
    if (k === 'admit') stub.append(h('div.vert', {}, 'Admit One'));
    else if (k === 'deco') stub.append(h('div.vert', {}, `Nº ${serial(have)}`));
    else stub.append(h('div.bars'), h('div.vert', {}, serial(have)));
    const face = h('div.face', {}, body, stub);
    const err = data?.error ? h('div.err', { title: data.error }, data.count != null ? 'Couldn’t update. Showing the last count.' : data.error) : '';
    ticket.replaceChildren(h('div.shadow'), h('div.under'), h('div.edge'), face, err);
  }

  async function load(force = false) {
    const mine = ++token;
    if (!ctx.config.username) { data = null; return paint(); }
    paint();
    const r = await ctx.api.watched(ctx.config.username, force);
    if (mine !== token) return;
    data = r;
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
        data = null;
        clearTimeout(debounce);
        debounce = setTimeout(() => load(false), 800);
      } else paint();
    },
    resume: () => load(false),
    menu: () => [{ label: 'Refresh Count', action: 'refresh' }, { type: 'separator' }, ...ORDER.map((k) => ({ label: LOOKS[k], type: 'radio', checked: look() === k, action: `look:${k}` }))],
    menuAction: (a) => { if (a === 'refresh') load(true); else if (a.startsWith('look:')) ctx.setConfig({ look: a.slice(5) }); },
  };
}
