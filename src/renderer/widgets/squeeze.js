import { h } from '../dom.js';
import { fileUrl } from '../appearance.js';

// SQUEEZE: the clean file studio. A workspace for making files lighter and
// removing personal metadata. All the work happens in the main process
// (src/main/squeeze); this side shows the queue, the before-and-after
// comparison and the results, and sends what you choose.

const css = `
.sq { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; display: grid; grid-template-rows: auto 1fr auto;
  --bg0: #17181b; --bg1: #1d1f23; --panel: rgba(255,255,255,0.035); --panel2: rgba(255,255,255,0.055); --line: rgba(255,255,255,0.075); --line2: rgba(255,255,255,0.13);
  --fg: #e9eaed; --fg2: #b6b9c0; --mute: #80848c; --silver: linear-gradient(180deg, #fbfbfc 0%, #c9ccd2 55%, #9ea2aa 100%);
  --ok: #94b8a8; --warn: #cfb27a; --bad: #d08b80; --accent: #a9b8c9;
  background: radial-gradient(1200px 600px at 20% -10%, #24262b 0%, transparent 60%), linear-gradient(180deg, var(--bg1), var(--bg0));
  color: var(--fg); font: 13px/1.45 -apple-system, "SF Pro Text", system-ui, sans-serif; font-feature-settings: "tnum"; letter-spacing: 0.005em; -webkit-font-smoothing: antialiased; user-select: none; cursor: default; text-align: left;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
.sq * { box-sizing: border-box; }
.sq button { font: inherit; color: inherit; cursor: default; }
.sq .grip { position: absolute; top: 5px; left: 50%; width: 54px; height: 14px; margin-left: -27px; z-index: 30; display: grid; place-items: center; border-radius: 7px; opacity: 0; transition: opacity .2s; }
.sq .grip::before { content: ''; width: 30px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.35); }
.sq:hover .grip { opacity: 1; }
.sq .grip:hover { background: rgba(255,255,255,0.08); }

/* Header */
.sq-top { display: flex; align-items: flex-end; gap: 28px; padding: 26px 30px 18px; border-bottom: 1px solid var(--line); }
.sq-brand { flex: 0 0 auto; }
.sq-word { font: 200 30px/1 -apple-system, "SF Pro Display", system-ui, sans-serif; letter-spacing: 0.42em; margin-right: -0.42em; background: var(--silver); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sq-sub { margin-top: 9px; color: var(--mute); font-size: 12px; letter-spacing: 0.04em; }
.sq-modes { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 0; }
.sq-seg { display: inline-flex; padding: 3px; border-radius: 10px; background: rgba(0,0,0,0.28); box-shadow: inset 0 0 0 1px var(--line); }
.sq-seg button { border: 0; background: transparent; padding: 6px 14px; border-radius: 7px; font-size: 11.5px; font-weight: 500; letter-spacing: 0.09em; color: var(--fg2); transition: background-color .25s, color .25s, box-shadow .25s; white-space: nowrap; }
.sq-seg button:hover { color: var(--fg); }
.sq-seg button.on { background: linear-gradient(180deg, #3a3d43, #2d3035); color: #fff; box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset, 0 1px 3px rgba(0,0,0,0.4); }
.sq-seg button:disabled { opacity: .45; }
.sq-modedesc { font-size: 11.5px; color: var(--mute); max-width: 470px; text-align: right; min-height: 17px; }
.sq-modedesc b { color: var(--fg2); font-weight: 500; }

/* Body */
.sq-body { display: grid; grid-template-columns: minmax(330px, 0.9fr) minmax(380px, 1.25fr); min-height: 0; }
.sq-left { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); }
.sq-right { position: relative; min-height: 0; overflow: auto; }
.sq-bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px 10px 22px; }
.sq-bar .count { color: var(--mute); font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; margin-right: auto; }
.sq-btn { border: 0; border-radius: 8px; padding: 6px 12px; font-size: 12px; background: var(--panel2); box-shadow: inset 0 0 0 1px var(--line); color: var(--fg); transition: background-color .2s, box-shadow .2s, opacity .2s; white-space: nowrap; }
.sq-btn:hover { background: rgba(255,255,255,0.085); }
.sq-btn:active { background: rgba(255,255,255,0.05); }
.sq-btn:disabled { opacity: .4; }
.sq-btn.primary { background: linear-gradient(180deg, #eef0f3, #c3c7ce); color: #17181b; font-weight: 600; letter-spacing: 0.08em; box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 8px rgba(0,0,0,0.35); padding: 8px 20px; }
.sq-btn.primary:hover { background: linear-gradient(180deg, #fff, #d1d5db); }
.sq-btn.primary:disabled { opacity: .35; }
.sq-btn.ghost { background: transparent; box-shadow: none; color: var(--fg2); }
.sq-btn.ghost:hover { color: var(--fg); background: var(--panel); }
.sq-btn.danger { color: var(--bad); }

.sq-list { flex: 1; overflow: auto; padding: 0 10px 12px 12px; min-height: 0; }
.sq-row { display: grid; grid-template-columns: 30px 1fr auto; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; margin: 1px 0; transition: background-color .18s; animation: sq-in .35s cubic-bezier(.2,.8,.2,1) both; }
.sq-row:hover { background: var(--panel); }
.sq-row.sel { background: var(--panel2); box-shadow: inset 0 0 0 1px var(--line); }
@keyframes sq-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
.sq-ico { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: rgba(255,255,255,0.045); box-shadow: inset 0 0 0 1px var(--line); color: var(--fg2); }
.sq-ico svg { width: 16px; height: 16px; }
.sq-name { min-width: 0; }
.sq-name .n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--fg); }
.sq-name .m { font-size: 11.5px; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.sq-name .m .bad { color: var(--bad); } .sq-name .m .warn { color: var(--warn); } .sq-name .m .ok { color: var(--ok); }
.sq-side { text-align: right; font-size: 12px; white-space: nowrap; }
.sq-side .pct { color: var(--ok); font-weight: 500; }
.sq-side .sub { font-size: 11px; color: var(--mute); }
.sq-prog { height: 3px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; margin-top: 6px; }
.sq-prog > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #8f97a3, #e8eaee); border-radius: inherit; transition: width .35s ease; }
.sq-x { border: 0; background: transparent; color: var(--mute); width: 22px; height: 22px; border-radius: 6px; opacity: 0; transition: opacity .2s; font-size: 14px; line-height: 1; }
.sq-row:hover .sq-x { opacity: 1; }
.sq-x:hover { background: var(--panel2); color: var(--fg); }

/* Drop zone */
.sq-drop { margin: 6px 18px 18px 22px; flex: 1; border-radius: 16px; border: 1px dashed rgba(255,255,255,0.16); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; padding: 30px; transition: border-color .25s, background-color .25s; }
.sq-drop .glyph { width: 54px; height: 54px; color: #c9ccd2; opacity: .9; }
.sq-drop .t { font-size: 15px; color: var(--fg); font-weight: 400; letter-spacing: 0.01em; }
.sq-drop .s { color: var(--mute); font-size: 12px; max-width: 360px; }
.sq-drop .fmts { color: var(--mute); font-size: 11px; letter-spacing: 0.05em; max-width: 380px; line-height: 1.7; margin-top: 6px; }
.sq-drop .btns { display: flex; gap: 8px; margin-top: 4px; }
.sq.dragging .sq-drop, .sq.dragging .sq-left { border-color: rgba(220,225,232,0.5); background: rgba(255,255,255,0.03); }
.sq .sq-dropveil { position: absolute; inset: 0; z-index: 20; display: none; place-items: center; background: rgba(16,17,19,0.55); backdrop-filter: blur(6px); }
.sq.dragging .sq-dropveil { display: grid; }
.sq-dropveil div { padding: 22px 34px; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.35); color: var(--fg); font-size: 15px; letter-spacing: 0.04em; }

/* Detail */
.sq-detail { padding: 22px 26px 28px; display: flex; flex-direction: column; gap: 18px; animation: sq-fade .3s ease both; }
@keyframes sq-fade { from { opacity: 0; } to { opacity: 1; } }
.sq-dh { display: flex; align-items: flex-start; gap: 12px; }
.sq-dh .n { font-size: 16px; font-weight: 500; color: var(--fg); word-break: break-word; }
.sq-dh .m { color: var(--mute); font-size: 12px; margin-top: 3px; }
.sq-dh .acts { margin-left: auto; display: flex; gap: 6px; flex: 0 0 auto; }
.sq-cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sq-pane { border-radius: 12px; background: rgba(0,0,0,0.25); box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.sq-pane .cap { display: flex; justify-content: space-between; padding: 8px 11px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mute); border-bottom: 1px solid var(--line); }
.sq-pane .cap b { font-weight: 500; color: var(--fg2); letter-spacing: 0.02em; text-transform: none; font-size: 11.5px; }
.sq-pane .view { position: relative; height: 260px; display: grid; place-items: center; background: repeating-conic-gradient(#202226 0 25%, #1a1b1e 0 50%) 0 0 / 16px 16px; }
.sq-pane .view img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.sq-pane .view video { max-width: 100%; max-height: 100%; display: block; background: #000; }
.sq-pane .view audio { width: 92%; }
.sq-pane .view .empty { color: var(--mute); font-size: 12px; padding: 20px; text-align: center; }
.sq-pager { display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--fg2); font-size: 12px; }
.sq-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.sq-stat { padding: 12px 14px; border-radius: 12px; background: var(--panel); box-shadow: inset 0 0 0 1px var(--line); }
.sq-stat .k { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mute); }
.sq-stat .v { font-size: 17px; font-weight: 300; margin-top: 4px; color: var(--fg); }
.sq-stat .v.ok { color: var(--ok); }
.sq-sec { border-radius: 12px; background: var(--panel); box-shadow: inset 0 0 0 1px var(--line); padding: 4px 14px; }
.sq-kv { display: grid; grid-template-columns: 150px 1fr; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 12.5px; }
.sq-kv:last-child { border-bottom: 0; }
.sq-kv .k { color: var(--mute); }
.sq-kv .v { color: var(--fg); min-width: 0; }
.sq-kv .v.ok { color: var(--ok); } .sq-kv .v.warn { color: var(--warn); } .sq-kv .v.bad { color: var(--bad); }
.sq-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.sq-chip { font-size: 11px; padding: 2px 8px; border-radius: 20px; background: rgba(255,255,255,0.06); box-shadow: inset 0 0 0 1px var(--line); color: var(--fg2); }
.sq-chip.cut { text-decoration: line-through; text-decoration-color: rgba(255,255,255,0.35); }
.sq-checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.sq-checks li { position: relative; padding-left: 18px; }
.sq-checks li::before { content: ''; position: absolute; left: 2px; top: 6px; width: 8px; height: 4px; border-left: 1.5px solid var(--ok); border-bottom: 1.5px solid var(--ok); transform: rotate(-45deg); }
.sq-notes { color: var(--fg2); font-size: 12px; display: grid; gap: 3px; }
.sq-welcome { padding: 40px 34px; color: var(--fg2); display: grid; gap: 18px; max-width: 620px; }
.sq-welcome h3 { margin: 0; font-weight: 300; font-size: 18px; color: var(--fg); letter-spacing: 0.02em; }
.sq-welcome .p { display: grid; grid-template-columns: 22px 1fr; gap: 10px; font-size: 12.5px; }
.sq-welcome .p i { font-style: normal; color: var(--mute); font-size: 11px; padding-top: 2px; }

/* Footer */
.sq-foot { display: flex; align-items: center; gap: 22px; padding: 14px 22px 16px 26px; border-top: 1px solid var(--line); background: rgba(0,0,0,0.18); }
.sq-tot { display: flex; gap: 22px; flex-wrap: wrap; font-size: 12px; color: var(--mute); }
.sq-tot b { color: var(--fg); font-weight: 400; margin-left: 5px; }
.sq-tot b.ok { color: var(--ok); }
.sq-overall { flex: 1; min-width: 80px; }
.sq-overall .sq-prog { margin: 0; height: 4px; }
.sq-overall .lbl { font-size: 11px; color: var(--mute); margin-bottom: 5px; display: flex; justify-content: space-between; }
.sq .sq-out { font-size: 11.5px; color: var(--mute); border: 0; background: transparent; padding: 4px 6px; border-radius: 6px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sq-foot .acts { display: flex; gap: 8px; margin-left: auto; }

/* Sheets */
.sq-veil { position: absolute; inset: 0; z-index: 25; background: rgba(12,13,15,0.62); backdrop-filter: blur(10px); display: grid; place-items: center; animation: sq-fade .25s ease both; }
.sq-sheet { width: min(620px, calc(100% - 60px)); max-height: calc(100% - 60px); overflow: auto; border-radius: 18px; background: linear-gradient(180deg, #25272c, #1d1f23); box-shadow: 0 30px 80px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.09); padding: 28px 30px 24px; animation: sq-pop .35s cubic-bezier(.2,.8,.2,1) both; }
@keyframes sq-pop { from { opacity: 0; transform: scale(.975) translateY(6px); } to { opacity: 1; transform: none; } }
.sq-sheet h2 { margin: 0 0 6px; font: 200 22px/1.2 -apple-system, "SF Pro Display", system-ui; letter-spacing: 0.3em; background: var(--silver); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sq-sheet .lead { color: var(--fg2); font-size: 12.5px; margin: 0 0 18px; }
.sq-opt { display: grid; grid-template-columns: 22px 1fr; gap: 10px; padding: 12px 0; border-top: 1px solid var(--line); }
.sq-opt input[type=checkbox] { margin: 2px 0 0; accent-color: #c9ccd2; width: 15px; height: 15px; }
.sq-opt .t { color: var(--fg); font-size: 13px; }
.sq-opt .d { color: var(--mute); font-size: 12px; margin-top: 3px; }
.sq-opt .tag { display: inline-block; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; margin-left: 6px; vertical-align: 1px; }
.sq-opt .tag.lossy { color: var(--warn); box-shadow: inset 0 0 0 1px rgba(207,178,122,0.4); }
.sq-opt .tag.lossless { color: var(--ok); box-shadow: inset 0 0 0 1px rgba(148,184,168,0.4); }
.sq-opt input[type=range] { width: 200px; accent-color: #c9ccd2; vertical-align: middle; margin-right: 8px; }
.sq-sheet .foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }
.sq-sheet .always { color: var(--mute); font-size: 12px; border-top: 1px solid var(--line); padding-top: 12px; }
.sq-done { text-align: left; }
.sq-done .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; margin: 18px 0 6px; }
.sq-done .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.sq-done .row span:first-child { color: var(--mute); }
.sq-done .row span:last-child { color: var(--fg); }
.sq-done .row .ok { color: var(--ok) !important; } .sq-done .row .warn { color: var(--warn) !important; } .sq-done .row .bad { color: var(--bad) !important; }
.sq-done .big { font: 200 44px/1 -apple-system, "SF Pro Display", system-ui; color: var(--fg); margin-top: 16px; letter-spacing: 0.02em; }
.sq-done .big small { font-size: 14px; color: var(--mute); letter-spacing: 0.08em; margin-left: 10px; }
.sq-done .foot { flex-wrap: wrap; justify-content: flex-start; }
.sq-done .foot .sq-btn.primary { margin-left: auto; }
.sq-banner { margin: 0 18px 10px 22px; padding: 9px 12px; border-radius: 10px; font-size: 12px; color: var(--bad); background: rgba(208,139,128,0.08); box-shadow: inset 0 0 0 1px rgba(208,139,128,0.25); }
`;

const S = (d, vb = 16) => `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  image: S('<rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="6" cy="6.6" r="1.2"/><path d="M2.5 11.5l3.4-3.2 2.6 2.4 1.8-1.6 3.2 2.9"/>'),
  document: S('<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5h3.5M6 8h4.5M6 10.5h4.5"/>'),
  video: S('<rect x="1.8" y="3.5" width="9.4" height="9" rx="1.8"/><path d="M11.2 7l3-1.8v5.6l-3-1.8"/>'),
  audio: S('<path d="M6 12V3.5l7-1.5v8.5"/><circle cx="4.3" cy="12" r="1.8"/><circle cx="11.3" cy="10.5" r="1.8"/>'),
  other: S('<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5h3.5"/>'),
};
const GLYPH = `<svg viewBox="0 0 54 54" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="36" height="36" rx="9" opacity=".45"/><path d="M27 4v14M21.5 12.5L27 18l5.5-5.5M27 50V36M21.5 41.5L27 36l5.5 5.5"/><path d="M15 27h24" opacity=".7"/></svg>`;

const MODES = {
  quick: { label: 'QUICK SQUEEZE', desc: '<b>Default.</b> Safe, lossless optimisation and metadata removal. Nothing you can see or hear changes, except that HEIC photos become JPGs when that makes them smaller.' },
  pure: { label: 'PURE CLEAN', desc: '<b>Metadata only.</b> Personal data is removed; the encoded picture and sound are kept exactly as they are.' },
  maximum: { label: 'MAXIMUM SQUEEZE', desc: '<b>Stronger.</b> May trade a little quality for size, using settings you approve. You see exactly what first.' },
};

const human = (n) => {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1000 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0)} ${u[i]}`;
};
const pct = (a, b) => (a ? `${((1 - b / a) * 100).toFixed(1)}%` : '0%');
const dur = (s) => { if (!Number.isFinite(s)) return ''; const m = Math.floor(s / 60), x = Math.round(s % 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m ? `${m} min ${x} s` : `${Math.round(s * 10) / 10} s`; };
const CODEC = { avc1: 'H.264', hvc1: 'HEVC', hev1: 'HEVC', aac: 'AAC', '.mp3': 'MP3', lpcm: 'PCM', alac: 'Apple Lossless', flac: 'FLAC', apac: 'Spatial Audio', apcn: 'ProRes 422', ap4h: 'ProRes 4444', apch: 'ProRes 422 HQ' };
const tildify = (p, home) => (home && p.startsWith(home) ? '~' + p.slice(home.length) : p);

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  const el = h('div.sq', { 'data-interactive': '' });
  root.append(el);

  let state = { items: [], totals: {}, running: false, paused: false, overall: 0, batch: null, helper: true };
  let mode = ['quick', 'pure', 'maximum'].includes(ctx.config.mode) ? ctx.config.mode : 'quick';
  let selected = null;
  let sheet = null; // 'max' | 'done' | null
  let doneSeen = null;
  let page = 1;
  let error = '';
  let estimates = null;

  const api = (op, ...args) => ctx.api.squeeze(op, ...args);

  // ---- Structure (built once; parts re-rendered) ----
  const grip = h('div.grip', { title: 'Drag to move · Right-click for options' });
  grip.addEventListener('mousedown', (e) => { if (e.button === 0) { e.stopPropagation(); ctx.api.gestureStart('move'); } });
  const seg = h('div.sq-seg');
  const modeDesc = h('div.sq-modedesc');
  const top = h('div.sq-top', {},
    h('div.sq-brand', {}, h('div.sq-word', {}, 'SQUEEZE'), h('div.sq-sub', {}, 'Less weight. Same substance.')),
    h('div.sq-modes', {}, seg, modeDesc));
  const count = h('span.count');
  const addBtn = h('button.sq-btn', { onclick: () => pick('files') }, 'Add Files…');
  const addFolderBtn = h('button.sq-btn', { onclick: () => pick('folder') }, 'Add Folder…');
  const clearBtn = h('button.sq-btn.ghost', { onclick: () => api('clear').then(refresh) }, 'Clear');
  const bar = h('div.sq-bar', {}, count, addBtn, addFolderBtn, clearBtn);
  const banner = h('div.sq-banner', { style: { display: 'none' } });
  const list = h('div.sq-list');
  const left = h('div.sq-left', {}, bar, banner, list);
  const right = h('div.sq-right');
  const body = h('div.sq-body', {}, left, right);
  const totals = h('div.sq-tot');
  const overallLbl = h('div.lbl');
  const overallBar = h('i');
  const overall = h('div.sq-overall', {}, overallLbl, h('div.sq-prog', {}, overallBar));
  const outBtn = h('span.sq-out');
  const acts = h('div.acts');
  const foot = h('div.sq-foot', {}, totals, overall, outBtn, acts);
  const veil = h('div.sq-dropveil', {}, h('div', {}, 'Drop to add to SQUEEZE'));
  el.append(grip, top, body, foot, veil);

  function setMode(m) {
    if (state.running) return;
    mode = m;
    ctx.setConfig({ mode: m });
    render();
  }

  async function pick(kind) {
    const r = await api('pick', kind);
    if (!r.ok && !r.canceled) showError(r.error);
  }

  function showError(msg) {
    error = msg || '';
    render();
    if (msg) setTimeout(() => { if (error === msg) { error = ''; render(); } }, 6000);
  }

  async function start() {
    const ready = state.items.filter((i) => i.status === 'ready');
    if (!ready.length) return;
    if (mode === 'maximum') { sheet = 'max'; estimates = null; render(); api('estimate').then((r) => { estimates = r.ok ? r.estimates : []; if (sheet === 'max') render(); }); return; }
    const r = await api('start', mode, {});
    if (!r.ok) showError(r.error);
  }

  async function approveMax(opts) {
    ctx.setConfig({ lossyImages: opts.lossyImages, video: opts.video, flac: opts.flac, aac: opts.aac, imageQuality: Math.round(opts.imageQuality * 100) });
    sheet = null;
    render();
    const r = await api('start', 'maximum', { ...opts, approved: true });
    if (!r.ok) showError(r.error);
  }

  // ---- Rendering ----
  function render() {
    seg.replaceChildren(...Object.entries(MODES).map(([k, m]) => h(`button${k === mode ? '.on' : ''}`, { disabled: state.running, onclick: () => setMode(k), title: m.label }, m.label)));
    modeDesc.innerHTML = MODES[mode].desc;
    const n = state.items.length;
    count.textContent = n ? `${n} file${n === 1 ? '' : 's'}` : 'Workspace';
    addBtn.disabled = addFolderBtn.disabled = false;
    clearBtn.disabled = state.running || !n;
    clearBtn.style.display = n ? '' : 'none';
    banner.style.display = error || !state.helper ? '' : 'none';
    banner.textContent = !state.helper ? 'The SQUEEZE helper is missing from this build, so files cannot be analysed or verified.' : error;
    renderList();
    renderRight();
    renderFoot();
    renderSheet();
  }

  function rowMeta(it) {
    const label = [it.formatLabel, human(it.size)].filter(Boolean).join(' · ');
    if (it.status === 'analysing') return h('span', {}, `${label} · looking inside…`);
    if (it.status === 'unsupported' || it.status === 'skipped') return h('span', {}, label ? `${label} · ` : '', h('span.warn', {}, 'Skipped'));
    if (it.status === 'failed') return h('span', {}, `${label} · `, h('span.bad', {}, 'Not processed, original kept'));
    if (it.status === 'canceled') return h('span', {}, `${label} · canceled`);
    if (it.status === 'working') return h('span', {}, it.phase || 'Working');
    if (it.status === 'queued') return h('span', {}, `${label} · waiting`);
    if (it.status === 'done') return h('span', {}, `${human(it.size)} → ${human(it.result.size)}`, it.result.removed.length ? h('span.ok', {}, ' · cleaned') : '', it.result.lossy ? h('span.warn', {}, ' · lossy') : '');
    return h('span', {}, label, it.found?.length ? ` · ${it.found.length} kind${it.found.length === 1 ? '' : 's'} of metadata` : '');
  }

  function renderList() {
    if (!state.items.length) {
      list.replaceChildren(h('div.sq-drop', {},
        h('div.glyph', { html: GLYPH }),
        h('div.t', {}, 'Drop files or folders here'),
        h('div.s', {}, 'Originals are never changed. Results go to a new folder, and every one is checked before it is kept.'),
        h('div.btns', {}, h('button.sq-btn', { onclick: () => pick('files') }, 'Choose Files…'), h('button.sq-btn', { onclick: () => pick('folder') }, 'Choose Folder…')),
        h('div.fmts', {}, 'JPEG · PNG · HEIC · WebP · TIFF · GIF · SVG · PDF · MP4 · MOV · M4A · MP3 · WAV · AIFF · FLAC · AAC')));
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      return;
    }
    list.style.display = '';
    const keep = new Map([...list.querySelectorAll('.sq-row')].map((r) => [r.dataset.id, r]));
    const rows = state.items.map((it) => {
      let row = keep.get(it.id);
      if (!row) {
        row = h('div.sq-row', { 'data-id': it.id, onclick: () => { selected = it.id; page = 1; render(); } });
        row._ico = h('div.sq-ico');
        row._n = h('div.n');
        row._m = h('div.m');
        row._prog = h('div.sq-prog', {}, h('i'));
        row._side = h('div.sq-side');
        row._x = h('button.sq-x', { title: 'Remove from the list', onclick: (e) => { e.stopPropagation(); api('remove', it.id); if (selected === it.id) selected = null; } }, '×');
        row.append(row._ico, h('div.sq-name', {}, row._n, row._m, row._prog), h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, row._side, row._x));
      }
      row.classList.toggle('sel', selected === it.id);
      const ico = ICON[it.kind] || ICON.other;
      if (row._ico.dataset.k !== (it.kind || 'other')) { row._ico.innerHTML = ico; row._ico.dataset.k = it.kind || 'other'; }
      row._n.textContent = it.rel && it.rel !== it.name ? it.rel : it.name;
      row._n.title = it.rel || it.name;
      row._m.replaceChildren(rowMeta(it));
      row._prog.style.display = it.status === 'working' ? '' : 'none';
      row._prog.firstChild.style.width = `${Math.round((it.progress || 0) * 100)}%`;
      row._x.style.display = it.status === 'working' || state.running ? 'none' : '';
      row._side.replaceChildren(...(it.status === 'done'
        ? [h('div.pct', {}, it.result.saved > 0 ? `−${it.result.percent.toFixed(1)}%` : it.result.saved < 0 ? `+${(-it.result.percent).toFixed(1)}%` : '0%'), h('div.sub', {}, it.result.saved > 0 ? `${human(it.result.saved)} saved` : it.result.saved < 0 ? `${human(-it.result.saved)} larger` : 'unchanged')]
        : it.status === 'working' ? [h('div.sub', {}, `${Math.round(it.progress * 100)}%`)] : []));
      return row;
    });
    list.replaceChildren(...rows);
  }

  function techProps(info, kind) {
    if (!info) return [];
    if (kind === 'image') return [info.width ? `${info.width} × ${info.height}` : '', info.frames > 1 ? `${info.frames} frames` : '', info.depth ? `${info.depth}-bit` : '', info.profile || '', info.orientation && info.orientation !== 1 ? 'rotated by orientation' : ''].filter(Boolean);
    if (kind === 'document') return [`${info.pages} page${info.pages === 1 ? '' : 's'}`, `PDF ${info.version}`, info.sizes?.[0] ? `${Math.round(info.sizes[0][0] / 72 * 25.4)} × ${Math.round(info.sizes[0][1] / 72 * 25.4)} mm` : ''].filter(Boolean);
    const v = (info.tracks || []).find((t) => t.type === 'vide'), a = (info.tracks || []).find((t) => t.type === 'soun');
    return [dur(info.duration), v ? `${v.width} × ${v.height}` : '', v ? `${v.fps} fps` : '', v ? CODEC[v.codec] || v.codec : '', a ? `${CODEC[a.codec] || a.codec} ${(a.sampleRate / 1000).toFixed(1)} kHz` : '', a ? (a.channels === 1 ? 'mono' : a.channels === 2 ? 'stereo' : `${a.channels} ch`) : ''].filter(Boolean);
  }

  const kv = (k, v, cls = '') => h('div.sq-kv', {}, h('div.k', {}, k), h(`div.v${cls ? '.' + cls : ''}`, {}, v));
  const chips = (arr, cut) => (arr.length ? h('div.sq-chips', {}, ...arr.map((x) => h(`span.sq-chip${cut ? '.cut' : ''}`, {}, x))) : h('span', { style: { color: 'var(--mute)' } }, 'None found'));

  let previewToken = 0;
  function pane(it, which, title, sub) {
    const view = h('div.view', {}, h('div.empty', {}, which === 'after' && it.status !== 'done' ? (it.status === 'working' ? 'Squeezing…' : 'Appears here after squeezing') : 'Loading preview…'));
    const box = h('div.sq-pane', {}, h('div.cap', {}, h('span', {}, title), h('b', {}, sub)), view);
    if (which === 'after' && it.status !== 'done') return box;
    if (!['image', 'document', 'video', 'audio'].includes(it.kind)) { view.firstChild.textContent = 'No preview for this file.'; return box; }
    const token = previewToken;
    api('preview', it.id, which, page).then((r) => {
      if (token !== previewToken) return;
      if (!r.ok) { view.firstChild.textContent = 'No preview available.'; return; }
      let media;
      if (r.kind === 'image' || r.kind === 'page') media = h('img', { src: fileUrl(r.file) + (r.kind === 'page' ? `?p=${page}` : ''), draggable: false, onerror: () => view.replaceChildren(h('div.empty', {}, 'No preview available.')) });
      else if (r.kind === 'video') media = h('video', { src: fileUrl(r.file), controls: true, preload: 'metadata', playsInline: true });
      else media = h('audio', { src: fileUrl(r.file), controls: true, preload: 'metadata' });
      view.replaceChildren(media);
      if (r.kind === 'page' && r.pages > 1) {
        it._pages = r.pages;
        const pager = right.querySelector('.sq-pager');
        if (pager) pager.style.display = 'flex';
        const lbl = right.querySelector('.sq-pager span');
        if (lbl) lbl.textContent = `Page ${page} of ${r.pages}`;
      }
    });
    return box;
  }

  let rightKey = '';
  function renderRight() {
    const it = state.items.find((x) => x.id === selected);
    if (!it) {
      if (rightKey === 'welcome') return;
      rightKey = 'welcome';
      right.replaceChildren(h('div.sq-welcome', {},
        h('h3', {}, 'How SQUEEZE keeps your files safe'),
        ...[
          ['01', 'Originals are only read, never changed, moved or deleted.'],
          ['02', 'Each file is handled by a method made for its format. Removing metadata and compressing are separate steps; colour profiles, orientation, HDR, fonts, codecs and audio streams are kept.'],
          ['03', 'Work happens in temporary files. Every result is opened again and compared with the original: pixels, pages, text, frames and samples. Anything that fails is discarded.'],
          ['04', 'Results are saved to a new folder for each batch, without replacing anything.'],
          ['05', 'Everything runs on this Mac. Nothing is uploaded.'],
        ].map(([n, t]) => h('div.p', {}, h('i', {}, n), h('span', {}, t)))));
      return;
    }
    const key = `${it.id}|${it.status}|${page}|${it.result ? it.result.path : ''}|${(it.found || []).length}|${it.status === 'working' ? '' : it.phase}`;
    if (key === rightKey) return;
    rightKey = key;
    previewToken++;
    const r = it.result;
    const parts = [];
    parts.push(h('div.sq-dh', {},
      h('div', {}, h('div.n', {}, it.name), h('div.m', {}, [it.formatLabel, human(it.size), ...techProps(it.info, it.kind)].filter(Boolean).join(' · '))),
      h('div.acts', {},
        h('button.sq-btn', { onclick: () => api('reveal', it.id, 'before'), title: it.trashed ? 'Show the original in the Trash' : 'Show the original in Finder' }, it.trashed ? 'Original in Trash' : 'Original in Finder'),
        r && !r.noCopy ? h('button.sq-btn', { onclick: () => api('reveal', it.id, 'after'), title: 'Show the squeezed file in Finder' }, 'Reveal in Finder') : null,
        r && !r.noCopy ? h('button.sq-btn', { onclick: () => api('open', it.id, 'after') }, 'Open') : null)));
    if (it.status === 'unsupported' || it.status === 'skipped' || it.status === 'failed') {
      parts.push(h('div.sq-sec', {}, kv('Status', it.status === 'failed' ? 'Not processed. The original is untouched and nothing was saved.' : 'Skipped. The original is untouched.', it.status === 'failed' ? 'bad' : 'warn'), kv('Why', it.reason || '')));
    }
    if (['image', 'document', 'video', 'audio'].includes(it.kind) && it.status !== 'unsupported') {
      parts.push(h('div.sq-cmp', {}, pane(it, 'before', 'Original', human(it.size)), pane(it, 'after', 'Squeezed', r ? human(r.size) : '—')));
      if (it.kind === 'document') {
        const pager = h('div.sq-pager', { style: { display: (it._pages || it.info?.pages || 1) > 1 ? 'flex' : 'none' } },
          h('button.sq-btn', { onclick: () => { if (page > 1) { page--; render(); } } }, '‹'),
          h('span', {}, `Page ${page} of ${it._pages || it.info?.pages || 1}`),
          h('button.sq-btn', { onclick: () => { if (page < (it._pages || it.info?.pages || 1)) { page++; render(); } } }, '›'));
        parts.push(pager);
      }
    }
    if (r) {
      parts.push(h('div.sq-stats', {},
        h('div.sq-stat', {}, h('div.k', {}, 'Original'), h('div.v', {}, human(it.size))),
        h('div.sq-stat', {}, h('div.k', {}, 'Optimised'), h('div.v', {}, human(r.size))),
        r.saved < 0
          ? h('div.sq-stat', {}, h('div.k', {}, 'Larger by'), h('div.v', {}, human(-r.saved)))
          : h('div.sq-stat', {}, h('div.k', {}, 'Saved'), h('div.v.ok', {}, r.saved > 0 ? human(r.saved) : '0 B')),
        r.saved < 0
          ? h('div.sq-stat', {}, h('div.k', {}, 'Change'), h('div.v', {}, `+${(-r.percent).toFixed(1)}%`))
          : h('div.sq-stat', {}, h('div.k', {}, 'Reduction'), h('div.v.ok', {}, r.saved > 0 ? `${r.percent.toFixed(1)}%` : '0%'))));
      parts.push(h('div.sq-sec', {},
        kv('Saved as', r.noCopy ? 'No copy made; the original is already as small and clean as it gets' : r.name),
        kv('Metadata removed', chips(r.removed, true)),
        ...(r.remaining?.length || r.after?.length ? [kv('Still present', chips([...(r.remaining || []), ...(r.after || [])]), 'warn')] : []),
        kv('Method', r.method),
        kv('Quality', r.quality, r.lossy ? 'warn' : 'ok'),
        kv('Integrity', h('ul.sq-checks', {}, ...r.checks.map((c) => h('li', {}, c)))),
        ...(r.notes.length ? [kv('Notes', h('div.sq-notes', {}, ...r.notes.map((x) => h('div', {}, x))))] : [])));
    } else if (it.status === 'ready' || it.status === 'queued' || it.status === 'working') {
      parts.push(h('div.sq-sec', {},
        kv('Metadata found', chips(it.found || [])),
        kv('Plan', planText(it)),
        ...(it.status === 'working' ? [kv('Now', it.phase || 'Working')] : [])));
    }
    right.replaceChildren(h('div.sq-detail', {}, ...parts));
  }

  function planText(it) {
    const m = mode;
    const f = it.format;
    if (it.kind === 'image') {
      if (f === 'png') return m === 'pure' ? 'Remove metadata chunks; the image data stays byte for byte.' : `Remove metadata and recompress losslessly${m === 'maximum' ? ' (thorough)' : ''}. Every pixel is checked.`;
      if (f === 'tiff') return 'Rewrite with lossless LZW compression, without personal metadata. Every pixel is checked.';
      if (f === 'svg') return 'Remove comments, metadata and editor data. Both versions are drawn and compared.';
      if (f === 'heif' && ctx.config.convertHeic !== false) return `Convert to JPG at quality ${m === 'maximum' ? 'you approve' : '92'}, without personal metadata. Size, orientation and colour profile are checked; JPG is re-encoded and usually larger than HEIC.`;
      if ((f === 'jpeg' || f === 'heif') && m === 'maximum') return 'Remove metadata losslessly; then, if you approve, try re-encoding at high quality and keep it only if clearly smaller.';
      return 'Remove metadata without decoding the picture. Orientation, colour profile and HDR data are kept; every pixel is checked.';
    }
    if (it.kind === 'document') return m === 'pure' ? 'Rebuild without metadata; page content, fonts and images are copied unchanged. Every page is compared.' : 'Rebuild with only what is used, recompress losslessly and remove metadata. Every page and its text are compared.';
    if (it.kind === 'video') return m === 'maximum' ? 'Rewrap without re-encoding; then, if you approve, try HEVC and keep it only if clearly smaller.' : 'Rewrap the same picture and sound without the file’s metadata. Nothing is re-encoded; every frame is checked.';
    if (f === 'm4a') return 'Rewrap the same sound without personal metadata. Nothing is re-encoded.';
    if ((f === 'wav' || f === 'aiff') && m === 'maximum') return 'Remove tags; then, if you approve, convert to FLAC (lossless) or AAC.';
    return 'Remove tags around the audio; the audio itself is copied byte for byte and checked.';
  }

  function renderFoot() {
    const t = state.totals || {};
    const inBatch = state.items.filter((i) => ['done', 'failed', 'skipped', 'canceled', 'working', 'queued'].includes(i.status));
    const ready = state.items.filter((i) => i.status === 'ready');
    totals.replaceChildren(
      h('span', {}, 'Done', h('b', {}, `${t.done || 0}`)),
      h('span', {}, 'Failed', h('b', {}, `${t.failed || 0}`)),
      h('span', {}, 'Original', h('b', {}, human(t.original || 0))),
      h('span', {}, 'Result', h('b', {}, human(t.result || 0))),
      (t.result || 0) > (t.original || 0)
        ? h('span', {}, 'Grew', h('b', {}, `${human(t.result - t.original)} · +${((t.result / t.original - 1) * 100).toFixed(1)}%`))
        : h('span', {}, 'Saved', h('b.ok', {}, `${human(Math.max(0, (t.original || 0) - (t.result || 0)))}${t.original ? ` · ${pct(t.original, t.result)}` : ''}`)));
    overall.style.visibility = state.running || (state.batch && inBatch.length) ? 'visible' : 'hidden';
    overallLbl.replaceChildren(h('span', {}, state.running ? (state.paused ? 'Paused, safe to leave as it is' : 'Squeezing') : state.batch?.finished ? 'Complete' : ''), h('span', {}, `${Math.round((state.overall || 0) * 100)}%`));
    overallBar.style.width = `${Math.round((state.overall || 0) * 100)}%`;
    const replace = ctx.config.replaceOriginal !== false;
    outBtn.textContent = replace ? 'Originals go to the Trash' : 'Saved next to the originals';
    outBtn.title = replace ? 'Each original is moved to the Trash (you can put it back from there) and the squeezed file takes its name and place. Change this in the widget’s settings.' : 'Each result is saved in the same folder as its original, with “(squeezed)” added to the name. Originals are never changed.';
    const btns = [];
    if (state.running) {
      btns.push(h('button.sq-btn', { onclick: () => api(state.paused ? 'resume' : 'pause') }, state.paused ? 'Resume' : 'Pause'));
      btns.push(h('button.sq-btn.danger', { onclick: () => api('cancel') }, 'Cancel'));
    } else {
      if (state.batch?.finished) btns.push(h('button.sq-btn', { onclick: () => { sheet = 'done'; render(); } }, 'Summary'));
      btns.push(h('button.sq-btn.primary', { disabled: !ready.length || !state.helper, onclick: start }, ready.length ? `SQUEEZE ${ready.length}` : 'SQUEEZE'));
    }
    acts.replaceChildren(...btns);
  }

  let sheetKey = '';
  function renderSheet() {
    const key = `${sheet}|${sheet === 'max' ? JSON.stringify(estimates) : state.batch?.finished}`;
    if (key === sheetKey) return;
    sheetKey = key;
    el.querySelector('.sq-veil')?.remove();
    if (!sheet) return;
    if (sheet === 'max') el.append(maxSheet());
    if (sheet === 'done') el.append(doneSheet());
  }

  function maxSheet() {
    const ready = state.items.filter((i) => i.status === 'ready');
    const has = (fn) => ready.filter(fn).length;
    const photos = has((i) => i.format === 'jpeg' || i.format === 'heif');
    const videos = has((i) => i.kind === 'video');
    const pcm = has((i) => i.format === 'wav' || i.format === 'aiff');
    const lossless = has((i) => i.format === 'wav' || i.format === 'aiff' || i.format === 'flac');
    const c = ctx.config;
    const o = { lossyImages: c.lossyImages !== false, video: c.video !== false, flac: c.flac !== false, aac: !!c.aac, imageQuality: (Number(c.imageQuality) || 85) / 100 };
    const box = (key, title, tag, desc, extra) => {
      const input = h('input', { type: 'checkbox', checked: o[key], onchange: (e) => { o[key] = e.target.checked; } });
      return h('label.sq-opt', {}, input, h('div', {}, h('div.t', {}, title, h(`span.tag.${tag}`, {}, tag)), h('div.d', {}, desc), extra || null));
    };
    const ql = h('span', {}, `${Math.round(o.imageQuality * 100)}`);
    const quality = h('div.d', { style: { marginTop: '8px' } }, h('input', { type: 'range', min: 70, max: 95, step: 1, value: Math.round(o.imageQuality * 100), oninput: (e) => { o.imageQuality = Number(e.target.value) / 100; ql.textContent = e.target.value; } }), 'Quality ', ql);
    const est = videos ? (estimates === null ? 'Estimating…' : estimates.length ? estimates.map((e) => `${e.name}: about ${human(e.from)} → ${human(e.to)}`).join(' · ') : 'Already HEVC or not worth it; these will stay lossless.') : '';
    const opts = [];
    if (photos) opts.push(box('lossyImages', `Re-encode ${photos} photo${photos === 1 ? '' : 's'} (JPEG, HEIC)`, 'lossy', 'Kept only if at least 5% smaller and the measured difference stays small (PSNR 38 dB or better). HDR and portrait photos stay lossless. Size and orientation never change.', quality));
    if (videos) opts.push(box('video', `Re-encode ${videos} video${videos === 1 ? '' : 's'} as HEVC`, 'lossy', `macOS’s highest quality HEVC setting. Same resolution, frame rate and duration. Skipped for videos that are already HEVC. ${est}`));
    if (pcm) opts.push(box('flac', `Convert ${pcm} WAV/AIFF file${pcm === 1 ? '' : 's'} to FLAC`, 'lossless', 'Identical sound, usually 40–60% smaller. The file type changes to .flac; markers, loops and broadcast details do not carry over.'));
    if (lossless) opts.push(box('aac', 'Encode lossless audio as AAC 256 kbps instead', 'lossy', 'Much smaller, but no longer lossless. Off unless you choose it. Used only when FLAC is not chosen or not smaller.'));
    const sheetEl = h('div.sq-sheet', {},
      h('h2', {}, 'MAXIMUM'),
      h('p.lead', {}, opts.length ? 'These steps can make files smaller than lossless methods can. Choose what you are comfortable with. Anything you leave unticked stays lossless, and the originals are never changed.' : 'Nothing in this batch has a stronger option, so Maximum Squeeze will use the most thorough lossless settings.'),
      ...opts,
      h('div.always', {}, 'Always lossless, whatever you choose: PNG, GIF, WebP, SVG, TIFF, PDF, MP3, AAC and M4A. Lossy files are never encoded again, which would only lose more quality.'),
      h('div.foot', {}, h('button.sq-btn', { onclick: () => { sheet = null; render(); } }, 'Cancel'), h('button.sq-btn.primary', { onclick: () => approveMax(o) }, 'APPROVE AND SQUEEZE')));
    return h('div.sq-veil', { onclick: (e) => { if (e.target === e.currentTarget) { sheet = null; render(); } } }, sheetEl);
  }

  function doneSheet() {
    const t = state.totals;
    const failed = t.failed || 0, skipped = t.skipped || 0, canceled = t.canceled || 0;
    const row = (k, v, cls = '') => h('div.row', {}, h('span', {}, k), h(`span${cls ? '.' + cls : ''}`, {}, v));
    const sheetEl = h('div.sq-sheet.sq-done', {},
      h('h2', {}, 'SQUEEZE COMPLETE'),
      h('div.big', {}, t.original ? pct(t.original, t.result) : '0%', h('small', {}, 'LIGHTER')),
      h('div.grid', {},
        row('Original size', human(t.original)),
        row('Optimised size', human(t.result)),
        ...(t.result > t.original
          ? [row('Grew by', `${human(t.result - t.original)} (+${((t.result / t.original - 1) * 100).toFixed(1)}%)`)]
          : [row('Space saved', human(Math.max(0, t.original - t.result)), 'ok'), row('Reduction', t.original ? pct(t.original, t.result) : '0%', 'ok')]),
        row('Metadata', t.cleaned ? `Cleaned (${t.cleaned} file${t.cleaned === 1 ? '' : 's'})` : 'None found', t.cleaned ? 'ok' : ''),
        row('Integrity', t.done ? 'Verified' : '—', t.done ? 'ok' : ''),
        row('Succeeded', `${t.done}`),
        row('Failed', `${failed}`, failed ? 'bad' : ''),
        ...(skipped ? [row('Skipped', `${skipped}`, 'warn')] : []),
        ...(canceled ? [row('Canceled', `${canceled}`)] : []),
        ...(t.lossy ? [row('Lossy, as approved', `${t.lossy}`, 'warn')] : [])),
      h('div.foot', {},
        h('button.sq-btn', { onclick: () => api('open-output'), title: state.batch?.dir ? tildify(state.batch.dir, homeDir) : '' }, 'Open Output Folder'),
        h('button.sq-btn', { onclick: () => api('reveal', 'batch') }, 'Reveal in Finder'),
        h('button.sq-btn', { onclick: () => { sheet = null; const first = state.items.find((i) => i.status === 'done'); if (first) { selected = first.id; page = 1; } render(); } }, 'Preview Files'),
        h('button.sq-btn.primary', { onclick: () => { sheet = null; selected = null; api('clear'); } }, 'PROCESS ANOTHER BATCH')));
    return h('div.sq-veil', { onclick: (e) => { if (e.target === e.currentTarget) { sheet = null; render(); } } }, sheetEl);
  }

  // ---- Data ----
  let homeDir = '';
  function apply(s) {
    const wasRunning = state.running;
    state = s;
    if (selected && !state.items.some((i) => i.id === selected)) selected = null;
    if (wasRunning && !state.running && state.batch?.finished && doneSeen !== state.batch.finished) { doneSeen = state.batch.finished; sheet = 'done'; }
    render();
  }
  async function refresh() {
    const r = await api('state');
    if (r.ok) { homeDir = ((r.state.items[0]?.path || '').match(/^\/Users\/[^/]+/) || [''])[0]; apply(r.state); }
  }
  const off = ctx.api.onSqueeze((s) => apply(s));

  // ---- Drag and drop ----
  let depth = 0;
  el.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); depth++; el.classList.add('dragging'); } });
  el.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  el.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove('dragging'); });
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0;
    el.classList.remove('dragging');
    const paths = [...(e.dataTransfer?.files || [])].map((f) => ctx.api.pathForFile(f)).filter(Boolean);
    if (paths.length) { const r = await api('add', paths); if (!r.ok) showError(r.error); }
  });

  // Keyboard: arrows move through the list, Delete removes a waiting file.
  el.tabIndex = -1;
  el.addEventListener('keydown', (e) => {
    if (sheet && e.key === 'Escape') { sheet = null; render(); return; }
    const ids = state.items.map((i) => i.id);
    const i = ids.indexOf(selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      selected = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] || null;
      page = 1;
      render();
      list.querySelector('.sq-row.sel')?.scrollIntoView({ block: 'nearest' });
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && selected && !state.running) {
      api('remove', selected);
      selected = ids[i + 1] || ids[i - 1] || null;
    }
  });

  render();
  refresh();

  const menu = () => [
    { label: 'Add Files…', action: 'add' },
    { label: 'Add Folder…', action: 'add-folder' },
    ...(state.batch?.dir ? [{ label: 'Open Output Folder', action: 'output' }] : []),
    { type: 'separator' },
    { label: 'Clear the List', action: 'clear' },
  ];

  return {
    menu,
    async menuAction(a) {
      if (a === 'add') pick('files');
      if (a === 'add-folder') pick('folder');
      if (a === 'output') api('open-output');
      if (a === 'clear') api('clear');
    },
    update() { render(); },
    noDoubleClickSettings: true,
    destroy() { off?.(); },
  };
}
