import { h } from '../dom.js';
import { fileUrl } from '../appearance.js';

// File Cabinet: a 90s file explorer for one folder (Downloads unless you pick
// another). A Platinum-style window frame around a classic gray interior:
// folder tree, Large Icons or Details, preview pane, search, Properties, and a
// Disk Cleanup that finds temporary files, leftovers, old installers,
// duplicates, large files and empty folders.
//
// Nothing is ever erased: Delete asks first (No is the default) and then moves
// the items to the Trash. The file system work happens in the main process,
// which refuses any path outside the chosen folder.

const A = 'cabinet/';
const cur = (n, x, y, fb) => `-webkit-image-set(url(${A}cur-${n}.png) 1x, url(${A}cur-${n}@2x.png) 2x) ${x} ${y}, ${fb}`;
const CUR = { arrow: cur('arrow', 1, 0, 'default'), hand: cur('hand', 9, 0, 'pointer'), wait: cur('wait', 10, 16, 'wait'), busy: cur('busy', 14, 16, 'wait'), ibeam: cur('ibeam', 10, 16, 'text') };

const SVG = {
  back: '<svg viewBox="0 0 16 16"><path d="M1 8l6-6v4h8v4H7v4z" fill="#1d4fa8" stroke="#000" stroke-width="1" shape-rendering="crispEdges"/></svg>',
  forward: '<svg viewBox="0 0 16 16"><path d="M15 8L9 2v4H1v4h8v4z" fill="#1d4fa8" stroke="#000" stroke-width="1" shape-rendering="crispEdges"/></svg>',
  up: '<svg viewBox="0 0 16 16"><path d="M8 1l6 6h-4v8H6V7H2z" fill="#1d4fa8" stroke="#000" stroke-width="1" shape-rendering="crispEdges"/></svg>',
  del: '<svg viewBox="0 0 16 16"><path d="M2 4l2-2 4 4 4-4 2 2-4 4 4 4-2 2-4-4-4 4-2-2 4-4z" fill="#d01010" stroke="#600" stroke-width="0.8" shape-rendering="crispEdges"/></svg>',
  props: '<svg viewBox="0 0 16 16"><path d="M3 1h7l3 3v11H3z" fill="#fff" stroke="#000" shape-rendering="crispEdges"/><path d="M10 1v3h3" fill="none" stroke="#000"/><rect x="7" y="5" width="2" height="2" fill="#1d4fa8"/><rect x="7" y="8" width="2" height="5" fill="#1d4fa8"/></svg>',
  warn: '<svg viewBox="0 0 32 32"><path d="M16 2L30 29H2z" fill="#ffd800" stroke="#000" stroke-width="2" stroke-linejoin="miter"/><rect x="14.5" y="10" width="3" height="11" fill="#000"/><rect x="14.5" y="23" width="3" height="3" fill="#000"/></svg>',
  speaker: '<svg viewBox="0 0 16 16"><path d="M2 6h3l4-3v10l-4-3H2z" fill="#000"/><path d="M11 5.5q2 2.5 0 5M12.5 4q3.5 4 0 8" fill="none" stroke="#000"/></svg>',
  mute: '<svg viewBox="0 0 16 16"><path d="M2 6h3l4-3v10l-4-3H2z" fill="#000"/><path d="M11 6l4 4M15 6l-4 4" stroke="#a00" stroke-width="1.4"/></svg>',
};

const EXT = {
  text: 'txt md markdown json log csv tsv xml yml yaml ini cfg conf js mjs cjs ts tsx jsx css html htm py rb sh zsh swift c h cpp java go rs sql srt vtt rtf',
  image: 'png jpg jpeg gif webp bmp tif tiff heic svg ico avif',
  audio: 'mp3 wav aiff aif m4a aac flac ogg opus',
  video: 'mp4 mov m4v mkv avi webm wmv',
  zip: 'zip rar 7z tar gz tgz bz2 xz',
  program: 'app exe msi dmg pkg iso appx msix command',
};
const KIND = {};
for (const [k, list] of Object.entries(EXT)) for (const e of list.split(' ')) KIND[e] = k;
const NAMES = { text: 'Text Document', image: 'Image', audio: 'Sound', video: 'Movie', zip: 'Archive', program: 'Application', file: 'File' };

const extOf = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');
const kindOf = (it) => (it.dir ? 'folder' : KIND[extOf(it.name)] || 'file');
const typeName = (it) => (it.dir ? 'File Folder' : (extOf(it.name) ? `${extOf(it.name).toUpperCase()} ${NAMES[kindOf(it)] === 'File' ? 'File' : NAMES[kindOf(it)]}` : 'File'));
const icon = (k) => `${A}${k === 'folder-open' ? 'folder-open' : k}.png`;

function bytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} bytes`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
const date = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

const css = `
@font-face { font-family: FCTahoma; src: url(fonts/Tahoma.ttf); }
@font-face { font-family: FCTahoma; src: url("fonts/Tahoma Bold.ttf"); font-weight: bold; }
:root.paper-note .glass { overflow: visible; border-radius: 0; }
:root.paper-note .glass > .layer { display: none; }
.fc { --face: #c0c0c0; --hi: #fff; --lt: #dfdfdf; --sh: #808080; --dk: #000; --navy: #000080; --s: 1;
  position: absolute; inset: 4px 6px 8px 4px; display: flex; flex-direction: column; color: #000;
  font: calc(11px * var(--s)) / 1.25 FCTahoma, Tahoma, Geneva, sans-serif; cursor: ${CUR.arrow};
  text-align: left; background: #dcdcdc; border: 1px solid #000; box-shadow: 2px 3px 0 rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.3); user-select: none; -webkit-font-smoothing: none; }
.fc.busy, .fc.busy * { cursor: ${CUR.wait} !important; }
.fc.busy.alt, .fc.busy.alt * { cursor: ${CUR.busy} !important; }
.fc button, .fc .hand, .fc input[type=checkbox], .fc .menubar > span, .fc .mi, .fc .tw { cursor: ${CUR.hand}; }
.fc input[type=text], .fc input[type=search], .fc .ptext { cursor: ${CUR.ibeam}; }

/* Platinum title bar */
.fc .title { flex: none; height: calc(19px * var(--s)); position: relative; display: flex; align-items: center; padding: 0 5px; gap: 5px;
  background: linear-gradient(#ececec, #d6d6d6); border-bottom: 1px solid #000; }
.fc .title .stripes { flex: 1; height: calc(11px * var(--s)); background: repeating-linear-gradient(#fff 0 1px, #9a9a9a 1px 2px); border-top: 1px solid #fff; }
.fc .title .name { flex: none; padding: 0 8px; font: bold calc(12px * var(--s)) Geneva, FCTahoma, sans-serif; letter-spacing: 0.2px; white-space: nowrap; }
.fc .tbox { flex: none; width: calc(11px * var(--s)); height: calc(11px * var(--s)); box-sizing: border-box; border: 1px solid #000; background: linear-gradient(135deg, #fff, #bbb);
  box-shadow: inset 1px 1px #fff, inset -1px -1px #888; position: relative; padding: 0; }
.fc .tbox:active { background: #777; box-shadow: inset 1px 1px #444; }
.fc .tbox.collapse::after { content: ''; position: absolute; left: 1px; right: 1px; top: 50%; height: 1px; margin-top: -1px; background: #000; }
.fc .tbox.zoom::after { content: ''; position: absolute; left: 1px; top: 1px; width: 50%; height: 50%; border: 1px solid #000; border-width: 0 1px 1px 0; }

.fc .win { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--face); }
.fc.shaded .win { display: none; }
.fc.shaded { bottom: auto; }
.raised { box-shadow: inset -1px -1px var(--dk), inset 1px 1px var(--hi), inset -2px -2px var(--sh), inset 2px 2px var(--lt); background: var(--face); }
.sunken { box-shadow: inset 1px 1px var(--sh), inset -1px -1px var(--hi), inset 2px 2px var(--dk), inset -2px -2px var(--lt); background: #fff; }
.etched { box-shadow: inset 1px 1px var(--sh), inset -1px -1px var(--hi); }

/* Menu bar and menus */
.fc .menubar { flex: none; display: flex; padding: 2px 3px; gap: 0; border-bottom: 1px solid var(--sh); box-shadow: 0 1px var(--hi); }
.fc .menubar > span { padding: 2px 7px; }
.fc .menubar > span.open { background: var(--navy); color: #fff; }
.fc .menu { position: absolute; z-index: 30; min-width: calc(170px * var(--s)); padding: 3px; }
.fc .mi { display: flex; justify-content: space-between; gap: 22px; padding: 3px 18px 3px 20px; white-space: nowrap; position: relative; }
.fc .mi:hover:not(.off) { background: var(--navy); color: #fff; }
.fc .mi.off { color: var(--sh); text-shadow: 1px 1px var(--hi); }
.fc .mi.on::before { content: '✓'; position: absolute; left: 6px; }
.fc .mi.dot::before { content: '•'; position: absolute; left: 8px; font-weight: bold; }
.fc .mi kbd { font: inherit; opacity: 0.85; }
.fc .msep { height: 0; margin: 3px 1px; border-top: 1px solid var(--sh); border-bottom: 1px solid var(--hi); }
.u { text-decoration: underline; }

/* Toolbar */
.fc .toolbar { flex: none; display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 5px; border-bottom: 1px solid var(--sh); box-shadow: 0 1px var(--hi); }
.fc .tb { display: inline-flex; align-items: center; gap: 5px; height: calc(26px * var(--s)); padding: 0 10px 0 7px; border: 0; font: inherit; color: #000; }
.fc .tb img, .fc .tb svg { width: calc(16px * var(--s)); height: calc(16px * var(--s)); image-rendering: auto; flex: none; }
.fc .tb:active:not(:disabled), .fc .tb.down { box-shadow: inset 1px 1px var(--dk), inset -1px -1px var(--hi), inset 2px 2px var(--sh), inset -2px -2px var(--lt); background: #b4b4b4; }
.fc .tb:active:not(:disabled) > *, .fc .tb.down > * { transform: translate(1px, 1px); }
.fc .tb:disabled { color: var(--sh); text-shadow: 1px 1px var(--hi); }
.fc .tb:disabled img, .fc .tb:disabled svg { filter: grayscale(1) opacity(0.45); }
.fc .tb.small span { display: none; }

.fc .searchbar, .fc .address { flex: none; display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-bottom: 1px solid var(--sh); box-shadow: 0 1px var(--hi); }
.fc .field { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; height: calc(20px * var(--s)); padding: 0 5px; box-sizing: border-box; overflow: hidden; white-space: nowrap; }
.fc .field img { width: calc(14px * var(--s)); height: calc(14px * var(--s)); flex: none; }
.fc .field .seg { padding: 0 1px; }
.fc .field .seg:hover { text-decoration: underline; }
.fc input[type=text] { border: 0; outline: 0; font: inherit; background: transparent; flex: 1; min-width: 0; height: 100%; padding: 0; }
.fc .x { border: 0; background: none; font: inherit; padding: 0 3px; }
.fc .drop { width: calc(18px * var(--s)); height: calc(20px * var(--s)); border: 0; padding: 0; display: grid; place-items: center; }
.fc .drop::after { content: ''; border: 4px solid transparent; border-top: 5px solid #000; margin-top: 4px; }

/* Body */
.fc .body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(150px, 27%) 1fr; grid-template-rows: 1fr auto; gap: 4px; padding: 4px; }
.fc .body.nopreview { grid-template-rows: 1fr 0; }
.fc .pane { position: relative; min-height: 0; min-width: 0; display: flex; flex-direction: column; padding: 2px; }
.fc .pane > .hd { flex: none; padding: 2px 5px; background: var(--face); margin: 0 0 2px; box-shadow: inset -1px -1px var(--sh), inset 1px 1px var(--hi); }
.fc .tree { grid-row: 1; grid-column: 1; }
.fc .view { grid-row: 1 / span 2; grid-column: 2; }
.fc .pv { grid-row: 2; grid-column: 1; height: calc(170px * var(--s)); }
.fc .body.nopreview .pv { display: none; }
.fc .scroll { flex: 1; min-height: 0; overflow: auto; position: relative; }

/* Classic Mac scroll bars */
.fc ::-webkit-scrollbar { width: 16px; height: 16px; }
.fc ::-webkit-scrollbar-track { background: #dadada repeating-linear-gradient(45deg, transparent 0 1px, rgba(0,0,0,0.06) 1px 2px); border-left: 1px solid #000; }
.fc ::-webkit-scrollbar-track:horizontal { border-left: 0; border-top: 1px solid #000; }
.fc ::-webkit-scrollbar-thumb { background: #ccccff linear-gradient(135deg, #e8e8ff, #a8a8d8); border: 1px solid #000; box-shadow: inset 1px 1px #fff, inset -1px -1px #6b6b9c; min-height: 20px; }
.fc ::-webkit-scrollbar-corner { background: #dadada; }
.fc ::-webkit-scrollbar-button:single-button { display: block; width: 16px; height: 16px; background: #e4e4e4 no-repeat center / 9px 9px; border: 1px solid #000; box-sizing: border-box; box-shadow: inset 1px 1px #fff, inset -1px -1px #999; }
.fc ::-webkit-scrollbar-button:single-button:vertical:decrement { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 9'%3E%3Cpath d='M4.5 1L8 6H1z'/%3E%3C/svg%3E"); }
.fc ::-webkit-scrollbar-button:single-button:vertical:increment { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 9'%3E%3Cpath d='M4.5 8L8 3H1z'/%3E%3C/svg%3E"); }
.fc ::-webkit-scrollbar-button:single-button:horizontal:decrement { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 9'%3E%3Cpath d='M1 4.5L6 1v7z'/%3E%3C/svg%3E"); }
.fc ::-webkit-scrollbar-button:single-button:horizontal:increment { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 9'%3E%3Cpath d='M8 4.5L3 1v7z'/%3E%3C/svg%3E"); }
.fc ::-webkit-scrollbar-button:single-button:active { background-color: #888; }

/* Tree */
.fc .node { display: flex; align-items: center; gap: 3px; white-space: nowrap; padding: 1px 0; }
.fc .tw { width: 9px; height: 9px; flex: none; border: 1px solid var(--sh); background: #fff; position: relative; box-sizing: border-box; }
.fc .tw::before { content: ''; position: absolute; left: 1px; right: 1px; top: 3px; height: 1px; background: #000; }
.fc .tw.closed::after { content: ''; position: absolute; top: 1px; bottom: 1px; left: 3px; width: 1px; background: #000; }
.fc .tw.none { visibility: hidden; }
.fc .node img { width: calc(16px * var(--s)); height: calc(16px * var(--s)); flex: none; }
.fc .node .lab { padding: 0 3px; }
.fc .node.sel .lab { background: var(--navy); color: #fff; outline: 1px dotted #ff0; outline-offset: -1px; }

/* Icons view */
.fc .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(88px * var(--s)), 1fr)); align-content: start; gap: 6px 2px; padding: 8px 6px; min-height: calc(100% - 16px); }
.fc .ic { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 3px 2px; text-align: center; }
.fc .ic img { width: calc(40px * var(--s)); height: calc(40px * var(--s)); object-fit: contain; }
.fc .ic .lab { padding: 0 2px; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
.fc .ic.sel img { filter: brightness(0.55) sepia(1) hue-rotate(190deg) saturate(4); }
.fc .ic.sel .lab { background: var(--navy); color: #fff; outline: 1px dotted #fff; outline-offset: -1px; }
.fc .ic.cut, .fc .row.cut { opacity: 0.5; }

/* Details view */
.fc table { border-collapse: collapse; width: 100%; table-layout: fixed; }
.fc th { position: sticky; top: 0; z-index: 2; text-align: left; font-weight: normal; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc th.num, .fc td.num { text-align: right; }
.fc th:active { box-shadow: inset 1px 1px var(--sh); }
.fc th .ar { font-size: 0.8em; margin-left: 4px; }
.fc td { padding: 1px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc td .nm { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; }
.fc td img { width: calc(16px * var(--s)); height: calc(16px * var(--s)); flex: none; }
.fc tr.sel td { background: var(--navy); color: #fff; }
.fc tr.sel td:first-child { outline: 1px dotted #fff; outline-offset: -1px; }

.fc .band { position: absolute; border: 1px dotted #000; background: rgba(0,0,128,0.08); pointer-events: none; z-index: 3; }
.fc .welcome { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; }
.fc .welcome > div { padding: 16px 20px; max-width: 320px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; background: var(--face); }

/* Preview */
.fc .pvbox { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 4px; background: #fff; }
.fc .pvbox img.thumb, .fc .pvbox video { max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: auto; box-shadow: 0 0 0 1px #000, 2px 2px 0 var(--sh); }
.fc .pvbox img.big { width: calc(48px * var(--s)); height: calc(48px * var(--s)); }
.fc .ptext { align-self: stretch; flex: 1; margin: 0; overflow: auto; font: calc(10px * var(--s)) / 1.3 Monaco, Menlo, monospace; white-space: pre-wrap; word-break: break-word; user-select: text; }
.fc .pmeta { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; word-break: break-word; }
.fc .player { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.fc .player .row2 { display: flex; gap: 4px; }

/* Status bar */
.fc .status { flex: none; display: flex; gap: 3px; padding: 2px 3px 3px; align-items: stretch; }
.fc .status > div { padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc .status .s1 { flex: 1; }
.fc .status .s2 { flex: none; width: 34%; }
.fc .status .snd { flex: none; border: 0; padding: 0 4px; display: grid; place-items: center; background: none; }
.fc .status .snd svg { width: 14px; height: 14px; }
.fc .grow { flex: none; width: 16px; align-self: flex-end; height: 16px; cursor: nwse-resize !important;
  background: linear-gradient(135deg, transparent 0 45%, #fff 45% 52%, #808080 52% 59%, transparent 59% 66%, #fff 66% 73%, #808080 73% 80%, transparent 80%); }

/* Buttons and dialogs */
.fc .btn { min-width: calc(76px * var(--s)); height: calc(23px * var(--s)); padding: 0 12px; border: 0; font: inherit; color: #000; display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
.fc .btn img, .fc .btn svg { width: calc(16px * var(--s)); height: calc(16px * var(--s)); }
.fc .btn:active:not(:disabled) { box-shadow: inset 1px 1px var(--dk), inset -1px -1px var(--hi), inset 2px 2px var(--sh); }
.fc .btn:active:not(:disabled) > * { transform: translate(1px, 1px); }
.fc .btn.def { box-shadow: 0 0 0 1px #000, inset -1px -1px var(--dk), inset 1px 1px var(--hi), inset -2px -2px var(--sh), inset 2px 2px var(--lt); }
.fc .btn:focus-visible, .fc .btn.def:focus { outline: 1px dotted #000; outline-offset: -5px; }
.fc .btn:disabled { color: var(--sh); text-shadow: 1px 1px var(--hi); }
.fc .modal { position: absolute; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(0,0,0,0.06); }
.fc .dlg { min-width: calc(300px * var(--s)); max-width: 92%; max-height: 92%; display: flex; flex-direction: column; border: 1px solid #000; background: #dcdcdc; box-shadow: 2px 2px 0 rgba(0,0,0,0.45); }
.fc .dlg .title { cursor: inherit; }
.fc .dlg .in { flex: 1; min-height: 0; padding: 12px 14px; background: var(--face); display: flex; flex-direction: column; gap: 10px; box-shadow: inset 1px 1px var(--hi), inset -1px -1px var(--sh); }
.fc .dlg .btns { display: flex; gap: 10px; justify-content: flex-end; }
.fc .dlg .msg { display: flex; gap: 14px; align-items: flex-start; }
.fc .dlg .msg svg, .fc .dlg .msg img { width: calc(34px * var(--s)); height: calc(34px * var(--s)); flex: none; }
.fc .dlg .msg p { margin: 0 0 6px; }
.fc .bar { height: calc(20px * var(--s)); padding: 3px; box-sizing: border-box; display: flex; gap: 2px; overflow: hidden; }
.fc .bar i { flex: none; width: calc(9px * var(--s)); background: var(--navy); }
.fc .scanicons { display: flex; gap: 10px; align-items: center; }
.fc .scanicons img { width: calc(32px * var(--s)); height: calc(32px * var(--s)); }
.fc .scanicons img.sweep { animation: fc-sweep 0.6s steps(2) infinite; transform-origin: 70% 90%; }
@keyframes fc-sweep { 50% { transform: rotate(-14deg); } }
.fc input[type=checkbox] { appearance: none; -webkit-appearance: none; width: 13px; height: 13px; margin: 0; flex: none; background: #fff; position: relative;
  box-shadow: inset 1px 1px var(--sh), inset -1px -1px var(--hi), inset 2px 2px var(--dk), inset -2px -2px var(--lt); }
.fc input[type=checkbox]:active { background: var(--face); }
.fc input[type=checkbox]:checked::after { content: ''; position: absolute; left: 3px; top: 3px; width: 7px; height: 7px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 7' shape-rendering='crispEdges'%3E%3Cpath d='M0 2h1v1h1v1h1V3h1V2h1V1h1V0h1v3H6v1H5v1H4v1H3v1H2V6H1V5H0z'/%3E%3C/svg%3E") no-repeat; }
.fc .results { flex: 1; min-height: calc(120px * var(--s)); max-height: calc(300px * var(--s)); overflow: auto; }
.fc .results td { padding: 1px 5px; }
.fc .results input { margin: 0; }
.fc .results .note { color: var(--sh); }
.fc .results tr.sel td { background: none; color: inherit; }
.fc .kv { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; }
.fc .kv span:nth-child(odd) { color: #222; }
.fc .kv span:nth-child(even) { word-break: break-all; user-select: text; }
.fc hr { border: 0; border-top: 1px solid var(--sh); border-bottom: 1px solid var(--hi); margin: 0; width: 100%; }
`;

// ---- Sounds, synthesised ----
let audio;
function tone(kind, on) {
  if (!on) return;
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.connect(g).connect(audio.destination);
    const P = {
      click: ['square', 1400, 0.035, 0.05],
      tick: ['square', 2400, 0.025, 0.04],
      honk: ['sawtooth', 160, 0.22, 0.08],
      ding: ['sine', 880, 0.45, 0.12],
      done: ['triangle', 660, 0.3, 0.1],
    }[kind] || ['square', 1000, 0.03, 0.04];
    o.type = P[0];
    o.frequency.setValueAtTime(P[1], t);
    if (kind === 'ding') o.frequency.setValueAtTime(1320, t + 0.12);
    if (kind === 'honk') o.frequency.linearRampToValueAtTime(120, t + P[2]);
    g.gain.setValueAtTime(P[3], t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + P[2]);
    o.start(t);
    o.stop(t + P[2] + 0.02);
  } catch { /* no audio */ }
}

export function mount(root, ctx) {
  root.append(h('style', {}, css));
  root.style.padding = '0';
  document.documentElement.classList.add('paper-note');
  const api = ctx.api;
  const cab = (op, ...a) => api.cabinet(op, ...a);
  const snd = (k) => tone(k, ctx.config.sound !== false);

  const st = {
    root: null, dir: null, items: [], sel: new Set(), anchor: null, focus: null,
    back: [], fwd: [], expanded: new Set(), treeKids: new Map(), sort: { key: 'name', dir: 1 },
    search: '', searchOpen: false, deep: false, deepItems: null, busy: false, error: '',
  };

  // ---------- Build the window ----------
  const fc = h('div.fc');
  const titleName = h('span.name', {}, 'File Cabinet');
  const closeBox = h('button.tbox.close', { title: 'Close Folder', 'data-interactive': '' });
  const collapseBox = h('button.tbox.collapse', { title: 'Collapse', 'data-interactive': '' });
  const zoomBox = h('button.tbox.zoom', { title: 'Zoom', 'data-interactive': '' });
  const title = h('div.title', {}, closeBox, h('span.stripes'), titleName, h('span.stripes'), collapseBox, zoomBox);

  const win = h('div.win', { 'data-interactive': '' });
  const menubar = h('div.menubar');
  const toolbar = h('div.toolbar');
  const searchInput = h('input', { type: 'text', placeholder: 'Name contains…', spellcheck: false });
  const deepBox = h('input', { type: 'checkbox' });
  const searchbar = h('div.searchbar', { style: { display: 'none' } },
    h('span', {}, 'Search:'), h('div.field.sunken', {}, h('img', { src: icon('search') }), searchInput, h('button.x', { title: 'Clear', onclick: () => closeSearch() }, '×')),
    h('label.hand', { style: { display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' } }, deepBox, 'Search subfolders'));
  const addrField = h('div.field.sunken');
  const address = h('div.address', {}, h('span', {}, 'Address:'), addrField, h('button.drop.raised', { title: 'Recent folders', onclick: (e) => historyMenu(e.currentTarget) }));
  const treeScroll = h('div.scroll.sunken');
  const tree = h('div.pane.tree.etched', {}, h('div.hd', {}, 'Folder'), treeScroll);
  const viewScroll = h('div.scroll.sunken', { tabIndex: 0 });
  const view = h('div.pane.view.etched', {}, viewScroll);
  const pvBox = h('div.pvbox.sunken');
  const pv = h('div.pane.pv.etched', {}, h('div.hd', {}, 'Preview:'), pvBox);
  const body = h('div.body', {}, tree, view, pv);
  const s1 = h('div.s1.etched');
  const s2 = h('div.s2.etched');
  const sndBtn = h('button.snd', { title: 'Sound on or off' });
  const grow = h('div.grow', { title: 'Resize' });
  const status = h('div.status', {}, s1, s2, sndBtn, grow);
  win.append(menubar, toolbar, searchbar, address, body, status);
  fc.append(title, win);
  root.append(fc);

  // Size everything with the widget, like a window that reflows.
  const ro = new ResizeObserver(() => {
    const w = fc.clientWidth;
    const s = Math.max(0.9, Math.min(1.45, w / 820));
    fc.style.setProperty('--s', s.toFixed(3));
    for (const b of toolbar.querySelectorAll('.tb')) b.classList.toggle('small', w < 640 * s);
    body.classList.toggle('nopreview', ctx.config.preview === false || fc.clientHeight < 420 * s);
  });
  ro.observe(fc);

  // ---------- Toolbar ----------
  const tbButton = (id, label, ic, fn, tip) => {
    const b = h('button.tb.raised', { title: tip || label, onclick: () => { snd('click'); fn(); } });
    b.innerHTML = ic.startsWith('<') ? ic : `<img src="${icon(ic)}" alt="">`;
    b.append(h('span', {}, label));
    b.dataset.id = id;
    return b;
  };
  const T = {
    back: tbButton('back', 'Back', SVG.back, () => goBack()),
    forward: tbButton('forward', 'Forward', SVG.forward, () => goForward()),
    up: tbButton('up', 'Up', SVG.up, () => goUp(), 'Up One Level'),
    search: tbButton('search', 'Search', 'search', () => openSearch()),
    scan: tbButton('scan', 'Scan', 'cleanup', () => diskCleanup(), 'Disk Cleanup'),
    del: tbButton('del', 'Delete', SVG.del, () => askDelete(selected())),
    props: tbButton('props', 'Properties', SVG.props, () => properties(selected())),
  };
  toolbar.append(...Object.values(T));

  // ---------- Menus ----------
  let openMenu = null;
  function closeMenus() {
    if (!openMenu) return;
    openMenu.el.remove();
    openMenu.anchor.classList.remove('open');
    openMenu = null;
  }
  function showMenu(anchor, items, at) {
    closeMenus();
    const m = h('div.menu.raised', { role: 'menu' });
    for (const it of items) {
      if (it === '-') { m.append(h('div.msep')); continue; }
      const off = it.enabled === false;
      const el = h(`div.mi${off ? '.off' : ''}${it.checked ? '.on' : ''}${it.radio ? '.dot' : ''}`, { role: 'menuitem' }, h('span', {}, it.label), it.key ? h('kbd', {}, it.key) : '');
      el.addEventListener('mouseup', (e) => {
        if (off) return;
        e.stopPropagation();
        closeMenus();
        snd('click');
        it.run();
      });
      m.append(el);
    }
    const r = fc.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const x = at ? at.x - r.left : a.left - r.left;
    const y = at ? at.y - r.top : a.bottom - r.top;
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    fc.append(m);
    const mr = m.getBoundingClientRect();
    if (mr.right > r.right - 2) m.style.left = `${Math.max(2, x - (mr.right - r.right) - 4)}px`;
    if (mr.bottom > r.bottom - 2) m.style.top = `${Math.max(2, y - mr.height)}px`;
    anchor.classList.add('open');
    openMenu = { el: m, anchor };
  }
  document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.el.contains(e.target) && !e.target.closest('.menubar > span')) closeMenus(); }, true);

  const has = () => !!st.dir;
  const MENUS = {
    File: () => [
      { label: 'Open Folder…', key: '⌘O', run: pickRoot },
      { label: 'Close Folder', enabled: has(), run: closeFolder },
      '-',
      { label: 'Open', enabled: selected().length === 1, run: () => openItem(selected()[0]) },
      { label: 'Show in Finder', enabled: has(), run: () => cab('reveal', (selected()[0] || { path: st.dir }).path) },
      { label: 'Properties', key: '⌥↵', enabled: has(), run: () => properties(selected()) },
      '-',
      { label: 'Exit', run: closeFolder },
    ],
    Edit: () => [
      { label: 'Select All', key: '⌘A', enabled: has(), run: selectAll },
      { label: 'Invert Selection', enabled: has(), run: invertSel },
      '-',
      { label: 'Delete', key: '⌫', enabled: selected().length > 0, run: () => askDelete(selected()) },
    ],
    View: () => [
      { label: 'Large Icons', radio: ctx.config.view !== 'details', run: () => setCfg({ view: 'icons' }) },
      { label: 'Details', radio: ctx.config.view === 'details', run: () => setCfg({ view: 'details' }) },
      '-',
      { label: 'Show Preview Pane', checked: ctx.config.preview !== false, run: () => setCfg({ preview: ctx.config.preview === false }) },
      { label: 'Refresh', key: 'F5', enabled: has(), run: refresh },
    ],
    Go: () => [
      { label: 'Back', enabled: st.back.length > 0, run: goBack },
      { label: 'Forward', enabled: st.fwd.length > 0, run: goForward },
      { label: 'Up One Level', enabled: has() && st.dir !== st.root, run: goUp },
      '-',
      { label: 'Home Folder', enabled: has(), run: () => navigate(st.root) },
    ],
    Tools: () => [
      { label: 'Disk Cleanup…', enabled: has(), run: diskCleanup },
      { label: 'Search', key: '⌘F', enabled: has(), run: openSearch },
      '-',
      { label: 'Sounds', checked: ctx.config.sound !== false, run: () => setCfg({ sound: ctx.config.sound === false }) },
    ],
    Help: () => [{ label: 'About File Cabinet', run: about }],
  };
  for (const name of Object.keys(MENUS)) {
    const m = h('span', {}, h('span.u', {}, name[0]), name.slice(1));
    m.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (openMenu && openMenu.anchor === m) { closeMenus(); return; }
      showMenu(m, MENUS[name]());
    });
    m.addEventListener('mouseenter', () => { if (openMenu && openMenu.anchor !== m && openMenu.anchor.parentNode === menubar) showMenu(m, MENUS[name]()); });
    menubar.append(m);
  }

  function setCfg(patch) {
    ctx.setConfig(patch);
    applyCfg();
  }
  function applyCfg() {
    body.classList.toggle('nopreview', ctx.config.preview === false || fc.clientHeight < 420 * (parseFloat(fc.style.getPropertyValue('--s')) || 1));
    sndBtn.innerHTML = ctx.config.sound === false ? SVG.mute : SVG.speaker;
    renderView();
  }
  sndBtn.addEventListener('click', () => { setCfg({ sound: ctx.config.sound === false }); snd('tick'); });

  // ---------- Window boxes ----------
  closeBox.addEventListener('click', () => { snd('click'); closeFolder(); });
  collapseBox.addEventListener('click', () => { snd('click'); fc.classList.toggle('shaded'); });
  let unzoomed = null;
  function zoom() {
    const b = ctx.widget.bounds;
    if (unzoomed) { api.updateWidget(ctx.widget.id, { bounds: unzoomed }); unzoomed = null; return; }
    unzoomed = { ...b };
    const W = Math.min(1900, screen.availWidth - 80);
    const H = Math.min(1400, screen.availHeight - 120);
    api.updateWidget(ctx.widget.id, { bounds: { x: Math.round(screen.availLeft + (screen.availWidth - W) / 2), y: Math.round(screen.availTop + 60), width: W, height: H } });
  }
  zoomBox.addEventListener('click', () => { snd('click'); zoom(); });
  title.addEventListener('dblclick', (e) => { if (!e.target.closest('.tbox')) zoom(); });
  grow.addEventListener('mousedown', (e) => { if (e.button === 0) { e.preventDefault(); e.stopPropagation(); api.gestureStart('resize', 'se'); } });

  // ---------- Busy cursor ----------
  let busyTimer = null;
  function busy(on) {
    st.busy = on;
    fc.classList.toggle('busy', on);
    clearInterval(busyTimer);
    if (on) busyTimer = setInterval(() => fc.classList.toggle('alt'), 220);
    else fc.classList.remove('alt');
  }

  // ---------- Folders and navigation ----------
  const rel = (p) => {
    if (!st.root) return '';
    const base = st.root.split('/').pop();
    return p === st.root ? base : `${base}/${p.slice(st.root.length + 1)}`;
  };

  async function start() {
    st.rootCfg = ctx.config.root || '';
    const r = await cab('list');
    if (!r.ok) { st.error = r.error; st.dir = null; render(); return; }
    st.error = '';
    st.root = r.root;
    st.expanded = new Set([r.root]);
    st.treeKids.clear();
    st.back = [];
    st.fwd = [];
    await load(r.root, r);
  }

  async function load(dir, pre) {
    busy(true);
    const r = pre || await cab('list', dir);
    busy(false);
    if (!r.ok) { snd('honk'); message('File Cabinet', r.error || 'That folder can’t be opened.'); return false; }
    st.dir = r.dir;
    st.items = r.items.filter((x) => !x.hidden);
    st.sel.clear();
    st.anchor = null;
    st.focus = null;
    st.deepItems = null;
    // Open the tree down to this folder.
    let p = r.dir;
    while (p && p.length >= st.root.length) { st.expanded.add(p); if (p === st.root) break; p = p.slice(0, p.lastIndexOf('/')); }
    if (st.searchOpen && st.deep && st.search) runDeepSearch();
    render();
    return true;
  }

  async function navigate(dir) {
    if (!dir || dir === st.dir) return;
    const prev = st.dir;
    if (await load(dir)) {
      if (prev) st.back.push(prev);
      st.fwd = [];
      renderNav();
    }
  }
  async function goBack() { if (!st.back.length) return; const d = st.back.pop(); const cur = st.dir; if (await load(d)) st.fwd.push(cur); else st.back.push(d); renderNav(); }
  async function goForward() { if (!st.fwd.length) return; const d = st.fwd.pop(); const cur = st.dir; if (await load(d)) st.back.push(cur); else st.fwd.push(d); renderNav(); }
  function goUp() { if (st.dir && st.dir !== st.root) navigate(st.dir.slice(0, st.dir.lastIndexOf('/'))); }
  async function refresh() { if (!st.dir) return; st.treeKids.clear(); const keep = new Set(st.sel); await load(st.dir); for (const p of keep) if (st.items.some((x) => x.path === p)) st.sel.add(p); renderView(); }

  async function pickRoot() {
    const r = await cab('pick');
    if (r.ok) { ctx.widget.config.root = r.root; await start(); }
  }
  function closeFolder() {
    st.dir = null; st.items = []; st.sel.clear(); st.back = []; st.fwd = [];
    closeSearch(true);
    render();
  }

  function historyMenu(anchor) {
    const seen = new Set();
    const list = [...st.back].reverse().filter((d) => d !== st.dir && !seen.has(d) && seen.add(d)).slice(0, 8);
    const items = list.map((d) => ({ label: rel(d), run: () => navigate(d) }));
    if (st.root && st.dir !== st.root) items.push('-', { label: rel(st.root), run: () => navigate(st.root) });
    showMenu(anchor, items.length ? items : [{ label: 'No other folders yet', enabled: false, run() {} }]);
  }

  // ---------- Selection ----------
  const shown = () => {
    let list = st.deepItems || st.items;
    if (st.search) {
      const q = st.search.toLowerCase();
      list = list.filter((x) => x.name.toLowerCase().includes(q));
    }
    const { key, dir } = st.sort;
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      size: (a, b) => (a.size || 0) - (b.size || 0),
      type: (a, b) => typeName(a).localeCompare(typeName(b)),
      date: (a, b) => (a.mtime || 0) - (b.mtime || 0),
    }[key];
    return [...list].sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : cmp(a, b) * dir || a.name.localeCompare(b.name)));
  };
  const selected = () => shown().filter((x) => st.sel.has(x.path));
  function selectAll() { for (const x of shown()) st.sel.add(x.path); renderView(); }
  function invertSel() { for (const x of shown()) if (st.sel.has(x.path)) st.sel.delete(x.path); else st.sel.add(x.path); renderView(); }

  function clickItem(e, it) {
    const list = shown();
    if (e.shiftKey && st.anchor) {
      const a = list.findIndex((x) => x.path === st.anchor);
      const b = list.findIndex((x) => x.path === it.path);
      if (!(e.metaKey || e.ctrlKey)) st.sel.clear();
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) st.sel.add(list[i].path);
    } else if (e.metaKey || e.ctrlKey) {
      if (st.sel.has(it.path)) st.sel.delete(it.path); else st.sel.add(it.path);
      st.anchor = it.path;
    } else {
      if (!(st.sel.has(it.path) && e.button === 2)) { st.sel.clear(); st.sel.add(it.path); }
      st.anchor = it.path;
    }
    st.focus = it.path;
    renderView();
  }

  function openItem(it) {
    if (!it) return;
    if (it.dir) { navigate(it.path); return; }
    if (ctx.config.preview === false) setCfg({ preview: true });
    st.sel.clear(); st.sel.add(it.path); st.focus = it.path;
    renderView();
    preview(it, true);
  }

  // ---------- Rendering ----------
  function render() {
    renderTitle();
    renderNav();
    renderTree();
    renderView();
  }
  function renderTitle() {
    titleName.textContent = st.dir ? `File Cabinet — ${st.dir.split('/').pop()}` : 'File Cabinet';
  }
  function renderNav() {
    T.back.disabled = !st.back.length;
    T.forward.disabled = !st.fwd.length;
    T.up.disabled = !st.dir || st.dir === st.root;
    T.search.disabled = !st.dir;
    T.scan.disabled = !st.dir;
    addrField.replaceChildren(h('img', { src: icon('folder-open') }));
    if (!st.dir) { addrField.append(h('span', { style: { color: '#808080' } }, '(no folder open)')); return; }
    const parts = rel(st.dir).split('/');
    let p = st.root;
    parts.forEach((part, i) => {
      if (i > 0) { p += `/${part}`; addrField.append(h('span', {}, '/')); }
      const target = p;
      addrField.append(h('span.seg.hand', { onclick: () => navigate(target) }, part));
    });
  }

  async function kidsOf(dir) {
    if (st.treeKids.has(dir)) return st.treeKids.get(dir);
    const r = await cab('folders', dir);
    const kids = r.ok ? r.folders : [];
    st.treeKids.set(dir, kids);
    return kids;
  }
  let treeGen = 0;
  async function renderTree() {
    const gen = ++treeGen;
    if (!st.root || !st.dir) { treeScroll.replaceChildren(); return; }
    const frag = document.createDocumentFragment();
    async function add(dir, name, depth, hasKids) {
      const open = st.expanded.has(dir);
      const tw = h(`span.tw${hasKids ? (open ? '' : '.closed') : '.none'}`);
      const node = h(`div.node${dir === st.dir ? '.sel' : ''}`, { style: { paddingLeft: `${4 + depth * 16}px` } },
        tw, h('img', { src: icon(open && hasKids ? 'folder-open' : dir === st.root ? 'drive' : 'folder') }), h('span.lab.hand', {}, name));
      tw.addEventListener('click', (e) => { e.stopPropagation(); snd('tick'); if (open) st.expanded.delete(dir); else st.expanded.add(dir); renderTree(); });
      node.addEventListener('click', () => { snd('click'); navigate(dir); });
      node.addEventListener('dblclick', () => { if (open) st.expanded.delete(dir); else st.expanded.add(dir); renderTree(); });
      frag.append(node);
      if (open) for (const k of await kidsOf(dir)) await add(k.path, k.name, depth + 1, k.kids);
    }
    await add(st.root, st.root.split('/').pop(), 0, true);
    if (gen !== treeGen) return;
    treeScroll.replaceChildren(frag);
    treeScroll.querySelector('.node.sel')?.scrollIntoView({ block: 'nearest' });
  }

  function renderView() {
    applyStatus();
    T.del.disabled = !st.sel.size;
    T.props.disabled = !st.dir;
    if (!st.dir) {
      viewScroll.replaceChildren(h('div.welcome', {}, h('div.raised', {},
        h('img', { src: icon('drive'), style: { width: '48px', height: '48px' } }),
        h('div', {}, st.error || 'Choose a folder to browse. File → Open Folder… or click Open Folder.'),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('button.btn.raised.def', { onclick: () => { snd('click'); start(); } }, 'Open Downloads'),
          h('button.btn.raised', { onclick: () => { snd('click'); pickRoot(); } }, 'Open Folder…')))));
      preview(null);
      return;
    }
    const list = shown();
    const details = ctx.config.view === 'details';
    let el;
    if (!details) {
      el = h('div.items');
      for (const it of list) {
        const k = kindOf(it);
        const img = h('img', { src: icon(k), draggable: false, alt: '' });
        const c = h(`div.ic${st.sel.has(it.path) ? '.sel' : ''}`, { title: st.deepItems ? rel(it.path) : it.name }, img, h('span.lab', {}, it.name));
        c.dataset.path = it.path;
        el.append(c);
      }
    } else {
      const col = (key, label, cls = '') => {
        const th = h(`th.raised${cls}`, {}, label, st.sort.key === key ? h('span.ar', {}, st.sort.dir > 0 ? '▲' : '▼') : '');
        th.classList.add('hand');
        th.addEventListener('click', () => { snd('click'); st.sort = { key, dir: st.sort.key === key ? -st.sort.dir : key === 'size' || key === 'date' ? -1 : 1 }; renderView(); });
        return th;
      };
      el = h('table', {}, h('colgroup', {}, h('col', { style: { width: '46%' } }), h('col', { style: { width: '14%' } }), h('col', { style: { width: '18%' } }), h('col', { style: { width: '22%' } })),
        h('thead', {}, h('tr', {}, col('name', 'Name'), col('size', 'Size', '.num'), col('type', 'Type'), col('date', 'Modified'))));
      const tb = h('tbody');
      for (const it of list) {
        const tr = h(`tr${st.sel.has(it.path) ? '.sel' : ''}`, {},
          h('td', { title: st.deepItems ? rel(it.path) : it.name }, h('span.nm', {}, h('img', { src: icon(kindOf(it)), alt: '' }), h('span', {}, it.name))),
          h('td.num', {}, it.dir ? '' : bytes(it.size)), h('td', {}, typeName(it)), h('td', {}, date(it.mtime)));
        tr.dataset.path = it.path;
        tb.append(tr);
      }
      el.append(tb);
    }
    if (!list.length) el.append(h('div', { style: { padding: '14px', color: '#808080', gridColumn: '1 / -1' } }, st.search ? 'No items match your search.' : 'This folder is empty.'));
    const top = viewScroll.scrollTop;
    viewScroll.replaceChildren(el);
    viewScroll.scrollTop = top;
    const one = selected();
    preview(one.length === 1 ? one[0] : null);
  }

  function applyStatus() {
    if (!st.dir) { s1.textContent = '0 object(s)'; s2.textContent = ''; return; }
    const list = shown();
    s1.textContent = st.search ? `${list.length} match${list.length === 1 ? '' : 'es'} for “${st.search}”${st.deepItems ? ' in subfolders' : ''}` : `${list.length} object(s)`;
    const sel = selected();
    const size = sel.reduce((t, x) => t + (x.size || 0), 0);
    s2.textContent = sel.length ? `${sel.length} selected · ${bytes(size)}` : bytes(list.reduce((t, x) => t + (x.size || 0), 0));
  }

  // ---------- Preview pane ----------
  let pvFor = null;
  let pvAudio = null;
  async function preview(it, play) {
    const key = it ? it.path : null;
    if (key === pvFor && !play) return;
    pvFor = key;
    if (pvAudio) { pvAudio.pause(); pvAudio = null; }
    pvBox.replaceChildren();
    if (!it) { pvBox.append(h('div.pmeta', { style: { color: '#808080' } }, st.dir ? 'Select a file to preview it.' : '')); return; }
    const k = kindOf(it);
    const meta = h('div.pmeta', {}, h('img.big', { src: icon(k === 'folder' ? 'folder' : k) }), h('b', {}, it.name), h('span', {}, it.dir ? 'File Folder' : `${typeName(it)} · ${bytes(it.size)}`));
    if (k === 'image') {
      pvBox.append(h('img.thumb', { src: fileUrl(it.path), alt: it.name, onerror: (e) => e.currentTarget.replaceWith(meta) }));
    } else if (k === 'audio') {
      const a = new Audio(fileUrl(it.path));
      pvAudio = a;
      const playB = h('button.btn.raised', {}, '▶ Play');
      const stopB = h('button.btn.raised', {}, '■ Stop');
      playB.addEventListener('click', () => { snd('click'); a.play().catch(() => {}); });
      stopB.addEventListener('click', () => { snd('click'); a.pause(); a.currentTime = 0; });
      pvBox.append(h('div.player', {}, h('img.big', { src: icon('audio') }), h('span', {}, it.name), h('div.row2', {}, playB, stopB)));
      if (play) a.play().catch(() => {});
    } else if (k === 'video') {
      const v = h('video', { src: fileUrl(it.path), preload: 'metadata', controls: true, muted: !play });
      v.addEventListener('error', () => v.replaceWith(meta));
      pvBox.append(v);
      if (play) v.play().catch(() => {});
    } else if (k === 'text' || (!it.dir && it.size < 2_000_000 && !KIND[extOf(it.name)])) {
      const r = await cab('peek', it.path);
      if (pvFor !== key) return;
      if (r.ok && r.text != null) pvBox.append(h('pre.ptext', {}, r.text));
      else pvBox.append(meta);
    } else {
      pvBox.append(meta);
    }
  }

  // ---------- Mouse in the view ----------
  let band = null;
  viewScroll.addEventListener('mousedown', (e) => {
    closeMenus();
    viewScroll.focus({ preventScroll: true });
    const itemEl = e.target.closest('[data-path]');
    if (itemEl) {
      const it = shown().find((x) => x.path === itemEl.dataset.path);
      if (it) clickItem(e, it);
      return;
    }
    if (e.button !== 0 || e.offsetX > viewScroll.clientWidth) return;
    // Rubber band in empty space.
    if (!(e.metaKey || e.ctrlKey || e.shiftKey)) st.sel.clear();
    const base = new Set(st.sel);
    const r0 = viewScroll.getBoundingClientRect();
    const x0 = e.clientX - r0.left + viewScroll.scrollLeft;
    const y0 = e.clientY - r0.top + viewScroll.scrollTop;
    band = h('div.band');
    viewScroll.append(band);
    const move = (ev) => {
      const x1 = ev.clientX - r0.left + viewScroll.scrollLeft;
      const y1 = ev.clientY - r0.top + viewScroll.scrollTop;
      const L = Math.min(x0, x1), T2 = Math.min(y0, y1), W = Math.abs(x1 - x0), H = Math.abs(y1 - y0);
      Object.assign(band.style, { left: `${L}px`, top: `${T2}px`, width: `${W}px`, height: `${H}px` });
      st.sel = new Set(base);
      for (const el of viewScroll.querySelectorAll('[data-path]')) {
        const b = el.getBoundingClientRect();
        const bx = b.left - r0.left + viewScroll.scrollLeft, by = b.top - r0.top + viewScroll.scrollTop;
        const hit = bx < L + W && bx + b.width > L && by < T2 + H && by + b.height > T2;
        if (hit) st.sel.add(el.dataset.path);
        el.classList.toggle('sel', st.sel.has(el.dataset.path));
      }
      applyStatus();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      band?.remove();
      band = null;
      renderView();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    renderView();
  });
  viewScroll.addEventListener('dblclick', (e) => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    const it = shown().find((x) => x.path === el.dataset.path);
    snd('click');
    openItem(it);
  });
  viewScroll.addEventListener('contextmenu', (e) => {
    if (!st.dir) return;
    e.preventDefault();
    e.stopPropagation();
    const sel = selected();
    const one = sel.length === 1 ? sel[0] : null;
    const items = sel.length ? [
      { label: one && one.dir ? 'Open' : 'Preview', enabled: !!one, run: () => openItem(one) },
      { label: 'Open with Default App', enabled: !!one && !one.dir, run: () => cab('open', one.path) },
      { label: 'Show in Finder', enabled: !!one, run: () => cab('reveal', one.path) },
      '-',
      { label: 'Delete', run: () => askDelete(sel) },
      '-',
      { label: 'Properties', run: () => properties(sel) },
    ] : [
      { label: 'Large Icons', radio: ctx.config.view !== 'details', run: () => setCfg({ view: 'icons' }) },
      { label: 'Details', radio: ctx.config.view === 'details', run: () => setCfg({ view: 'details' }) },
      '-',
      { label: 'Refresh', run: refresh },
      { label: 'Select All', run: selectAll },
      '-',
      { label: 'Properties', run: () => properties([]) },
    ];
    showMenu(viewScroll, items, { x: e.clientX, y: e.clientY });
  });

  // ---------- Keyboard ----------
  fc.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input[type=text]');
    const dlg = fc.querySelector('.modal:last-of-type');
    if (e.key === 'Escape') {
      if (openMenu) { closeMenus(); return; }
      if (dlg) { dlg._cancel?.(); return; }
      if (st.searchOpen) { closeSearch(); return; }
    }
    if (dlg) {
      if (e.key === 'Enter' && !e.target.matches('button')) { e.preventDefault(); dlg._enter?.(); }
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = [...dlg.querySelectorAll('button, input')].filter((x) => !x.disabled);
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
      }
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if ((mod && e.key.toLowerCase() === 'f') || e.key === 'F3') { e.preventDefault(); openSearch(); return; }
    if (e.key === 'F5' || (mod && e.key.toLowerCase() === 'r')) { e.preventDefault(); refresh(); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); pickRoot(); return; }
    if (typing) return;
    if (!st.dir) return;
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
    if (e.altKey && e.key === 'Enter') { e.preventDefault(); properties(selected()); return; }
    if (e.key === 'Enter') { const s = selected(); if (s.length === 1) openItem(s[0]); return; }
    if ((e.altKey && e.key === 'ArrowUp') || (mod && e.key === 'ArrowUp')) { e.preventDefault(); goUp(); return; }
    if (e.key === 'Delete' || (mod && e.key === 'Backspace')) { e.preventDefault(); if (st.sel.size) askDelete(selected()); return; }
    if (e.key === 'Backspace') { e.preventDefault(); if (st.sel.size) askDelete(selected()); else goUp(); return; }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const list = shown();
      if (!list.length) return;
      let i = list.findIndex((x) => x.path === st.focus);
      let cols = 1;
      if (ctx.config.view !== 'details') {
        const els = viewScroll.querySelectorAll('.ic');
        const y = els[0]?.offsetTop;
        cols = Math.max(1, [...els].filter((x) => x.offsetTop === y).length);
      }
      const step = { ArrowRight: ctx.config.view === 'details' ? 1 : 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      i = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + step));
      const it = list[i];
      if (e.shiftKey && st.anchor) clickItem({ shiftKey: true }, it);
      else { st.sel = new Set([it.path]); st.anchor = it.path; st.focus = it.path; renderView(); }
      viewScroll.querySelector(`[data-path="${CSS.escape(it.path)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  });

  // ---------- Search ----------
  function openSearch() {
    if (!st.dir) return;
    st.searchOpen = true;
    searchbar.style.display = '';
    searchInput.focus();
    searchInput.select();
  }
  function closeSearch(silent) {
    st.searchOpen = false;
    st.search = '';
    st.deepItems = null;
    searchInput.value = '';
    searchbar.style.display = 'none';
    if (!silent) renderView();
  }
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { st.search = searchInput.value.trim(); if (st.deep) runDeepSearch(); else renderView(); }, 120);
  });
  deepBox.addEventListener('change', () => { snd('tick'); st.deep = deepBox.checked; if (st.deep) runDeepSearch(); else { st.deepItems = null; renderView(); } });
  let deepGen = 0;
  async function runDeepSearch() {
    if (!st.search) { st.deepItems = null; renderView(); return; }
    const gen = ++deepGen;
    busy(true);
    const out = [];
    const queue = [st.dir];
    let n = 0;
    while (queue.length && n < 400) {
      const d = queue.shift();
      n++;
      const r = await cab('list', d);
      if (gen !== deepGen) { busy(false); return; }
      if (!r.ok) continue;
      for (const x of r.items) {
        if (x.hidden) continue;
        out.push(x);
        if (x.dir) queue.push(x.path);
      }
    }
    busy(false);
    st.deepItems = out;
    renderView();
  }

  // ---------- Dialogs ----------
  function dialog(name, content, buttons, { onCancel, width } = {}) {
    const close = () => { modal.remove(); viewScroll.focus({ preventScroll: true }); };
    const cancel = () => { close(); onCancel?.(); };
    const cb = h('button.tbox.close', { title: 'Close', 'data-interactive': '' });
    cb.addEventListener('click', () => { snd('click'); cancel(); });
    const btnRow = h('div.btns');
    let def = null;
    for (const b of buttons) {
      const el = h(`button.btn.raised${b.default ? '.def' : ''}`, { onclick: () => { snd('click'); if (b.keepOpen) b.run?.(el); else { close(); b.run?.(); } } });
      if (b.icon) el.innerHTML = b.icon.startsWith('<') ? b.icon : `<img src="${icon(b.icon)}" alt="">`;
      el.append(h('span', {}, b.label));
      if (b.disabled) el.disabled = true;
      btnRow.append(el);
      if (b.default) def = el;
      b.el = el;
    }
    const d = h('div.dlg', { role: 'dialog', 'aria-label': name, style: width ? { width } : {} },
      h('div.title', {}, cb, h('span.stripes'), h('span.name', {}, name), h('span.stripes')),
      h('div.in', {}, content, btnRow));
    const modal = h('div.modal', { 'data-interactive': '' }, d);
    modal._cancel = cancel;
    modal._enter = () => def?.click();
    modal.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    fc.append(modal);
    setTimeout(() => (def || btnRow.lastChild)?.focus(), 0);
    return { close, modal, buttons };
  }
  function message(name, text) {
    dialog(name, h('div.msg', {}, h('img', { src: icon('drive') }), h('div', {}, h('p', {}, text))), [{ label: 'OK', default: true }]);
  }

  function about() {
    dialog('About File Cabinet', h('div.msg', {}, h('img', { src: icon('drive') }), h('div', {},
      h('p', {}, h('b', {}, 'File Cabinet')),
      h('p', {}, 'Browse a folder the old-fashioned way, and sweep it clean with Disk Cleanup.'),
      h('p', { style: { color: '#404040' } }, 'Deleted items go to the Trash, so you can always put them back.'))),
    [{ label: 'OK', default: true }]);
  }

  async function properties(items) {
    let content;
    if (!items.length) {
      const all = st.items;
      content = h('div.msg', {}, h('img', { src: icon(st.dir === st.root ? 'drive' : 'folder') }), h('div.kv', {},
        h('span', {}, 'Name:'), h('span', {}, st.dir.split('/').pop()),
        h('span', {}, 'Location:'), h('span', {}, rel(st.dir)),
        h('span', {}, 'Contains:'), h('span', {}, `${all.filter((x) => !x.dir).length} files, ${all.filter((x) => x.dir).length} folders`),
        h('span', {}, 'Size:'), h('span', {}, `${bytes(all.reduce((t, x) => t + (x.size || 0), 0))} (not counting subfolders)`)));
    } else if (items.length === 1) {
      const it = items[0];
      content = h('div.msg', {}, h('img', { src: icon(kindOf(it)) }), h('div.kv', {},
        h('span', {}, 'Name:'), h('span', {}, it.name),
        h('span', {}, 'Type:'), h('span', {}, typeName(it)),
        h('span', {}, 'Location:'), h('span', {}, rel(it.path.slice(0, it.path.lastIndexOf('/')))),
        h('span', {}, 'Size:'), h('span', {}, it.dir ? '—' : `${bytes(it.size)} (${it.size.toLocaleString()} bytes)`),
        h('span', {}, 'Modified:'), h('span', {}, date(it.mtime) || 'Unknown')));
    } else {
      const size = items.reduce((t, x) => t + (x.size || 0), 0);
      content = h('div.msg', {}, h('img', { src: icon('file') }), h('div.kv', {},
        h('span', {}, 'Selected:'), h('span', {}, `${items.filter((x) => !x.dir).length} files, ${items.filter((x) => x.dir).length} folders`),
        h('span', {}, 'Size:'), h('span', {}, `${bytes(size)} (${size.toLocaleString()} bytes)`),
        h('span', {}, 'Location:'), h('span', {}, rel(st.dir))));
    }
    dialog('Properties', content, [{ label: 'OK', default: true }]);
  }

  // Delete always asks; No is the default answer.
  function askDelete(items, after) {
    if (!items.length) return;
    const size = items.reduce((t, x) => t + (x.size || 0), 0);
    const files = items.filter((x) => !x.dir).length;
    const folders = items.length - files;
    const what = items.length === 1 ? `“${items[0].name}”` : 'the selected items';
    const count = [files ? `${files} file(s)` : '', folders ? `${folders} folder(s)` : ''].filter(Boolean).join(', ');
    snd('ding');
    dialog('Confirm File Delete', h('div.msg', { html: SVG.warn },
      h('div', {}, h('p', {}, `Are you sure you want to delete ${what}?`), h('p', {}, 'They will be moved to the Trash.'), h('p', {}, `${count}${size ? `, ${bytes(size)}` : ''}`))),
    [
      { label: 'Yes', run: () => doDelete(items, after) },
      { label: 'No', default: true, run: () => snd('honk') },
    ], { onCancel: () => snd('honk') });
  }
  async function doDelete(items, after) {
    busy(true);
    const r = await cab('trash', items.map((x) => x.path));
    busy(false);
    if (r.failed && r.failed.length) {
      snd('honk');
      message('File Cabinet', `${r.done.length} item(s) moved to the Trash. ${r.failed.length} could not be moved: ${r.failed[0].error}`);
    } else {
      snd('done');
    }
    s2.textContent = `${r.done ? r.done.length : 0} item(s) removed`;
    st.treeKids.clear();
    await load(st.dir);
    s2.textContent = `${r.done ? r.done.length : 0} item(s) moved to the Trash`;
    after?.(r);
  }

  // ---------- Disk Cleanup ----------
  async function diskCleanup() {
    if (!st.dir || st.busy) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const blocks = h('div.bar.sunken');
    const current = h('div.field.sunken', {}, h('span', {}, '…'));
    let cancelled = false;
    const d = dialog('Disk Cleanup', h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '320px' } },
      h('div', {}, 'Scanning…'),
      h('div.scanicons', {}, h('img', { src: icon('drive') }), h('img.sweep', { src: icon('cleanup') })),
      h('div', {}, `Looking for temporary and junk files in ${rel(st.root)}…`),
      blocks, current),
    [{ label: 'Cancel', default: true, run: () => { cancelled = true; cab('cancel', id); } }],
    { onCancel: () => { cancelled = true; cab('cancel', id); } });
    let shownBlocks = 0;
    const off = api.onCabinetProgress((p) => {
      if (p.id !== id) return;
      if (p.name) current.firstChild.textContent = p.name;
      if (typeof p.frac === 'number') {
        const total = Math.max(1, Math.floor((blocks.clientWidth - 6) / ((parseFloat(getComputedStyle(fc).getPropertyValue('--s')) || 1) * 9 + 2)));
        const want = Math.round(p.frac * total);
        while (shownBlocks < want) { blocks.append(h('i')); shownBlocks++; }
      }
    });
    busy(true);
    const r = await cab('scan', id);
    busy(false);
    off();
    if (cancelled || r.cancelled) { d.close(); return; }
    d.close();
    if (!r.ok) { snd('honk'); message('Disk Cleanup', r.error || 'The scan stopped.'); return; }
    snd('ding');
    results(r.items, r.scanned);
  }

  function results(items, scanned) {
    const sel = new Set(items.filter((x) => x.checked).map((x) => x.path));
    let sort = { key: 'size', dir: -1 };
    const tbody = h('tbody');
    const totalEl = h('b');
    const head = h('thead');
    let delBtn;
    const update = () => {
      const chosen = items.filter((x) => sel.has(x.path));
      totalEl.textContent = `Total: ${bytes(chosen.reduce((t, x) => t + x.size, 0))} selected of ${bytes(items.reduce((t, x) => t + x.size, 0))} found`;
      if (delBtn) delBtn.disabled = !chosen.length;
    };
    const draw = () => {
      const cmp = { name: (a, b) => a.name.localeCompare(b.name), size: (a, b) => a.size - b.size, kind: (a, b) => a.kind.localeCompare(b.kind) }[sort.key];
      const list = [...items].sort((a, b) => cmp(a, b) * sort.dir);
      const th = (key, label, cls = '') => {
        const el = h(`th.raised.hand${cls}`, {}, label, sort.key === key ? h('span.ar', {}, sort.dir > 0 ? '▲' : '▼') : '');
        el.addEventListener('click', () => { snd('click'); sort = { key, dir: sort.key === key ? -sort.dir : key === 'size' ? -1 : 1 }; draw(); });
        return el;
      };
      head.replaceChildren(h('tr', {}, h('th.raised', {}, ''), th('name', 'Name'), th('size', 'Size', '.num'), th('kind', 'Type')));
      tbody.replaceChildren(...list.map((x) => {
        const cb = h('input', { type: 'checkbox', checked: sel.has(x.path) });
        cb.addEventListener('change', () => { snd('tick'); if (cb.checked) sel.add(x.path); else sel.delete(x.path); update(); });
        return h('tr', { title: x.rel }, h('td', {}, cb),
          h('td', {}, h('span.nm', {}, h('img', { src: icon(kindOf(x)), alt: '' }), h('span', {}, x.name), x.note ? h('span.note', {}, ` — ${x.note}`) : '')),
          h('td.num', {}, x.dir && !x.size ? '' : bytes(x.size)), h('td', {}, x.kind));
      }));
      update();
    };
    const table = h('table', {}, h('colgroup', {}, h('col', { style: { width: '28px' } }), h('col', { style: { width: '52%' } }), h('col', { style: { width: '17%' } }), h('col', { style: { width: '23%' } })), head, tbody);
    const all = h('button.btn.raised', { onclick: () => { snd('click'); items.forEach((x) => sel.add(x.path)); draw(); } }, 'Select All');
    const none = h('button.btn.raised', { onclick: () => { snd('click'); sel.clear(); draw(); } }, 'Select None');
    const content = items.length
      ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 } },
        h('div', {}, `The following junk files were found (${scanned.toLocaleString()} files checked):`),
        h('div.results.sunken', {}, table),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } }, totalEl, h('div', { style: { display: 'flex', gap: '6px' } }, all, none)),
        h('div', { style: { color: '#404040' } }, 'Old installers, duplicates, large files and empty folders are listed but not ticked.'))
      : h('div.msg', {}, h('img', { src: icon('bin') }), h('div', {}, h('p', {}, `Nothing to clean up. ${scanned.toLocaleString()} files checked.`)));
    const btns = items.length ? [
      { label: 'Delete selected', icon: 'bin-full', keepOpen: true, run: () => {
        const chosen = items.filter((x) => sel.has(x.path));
        askDelete(chosen.map((x) => ({ ...x })), (r) => {
          const gone = new Set(r.done || []);
          for (let i = items.length - 1; i >= 0; i--) if (gone.has(items[i].path)) { sel.delete(items[i].path); items.splice(i, 1); }
          if (!items.length) { dlg.close(); message('Disk Cleanup', `${gone.size} item(s) moved to the Trash. All clean!`); } else draw();
        });
      } },
      { label: 'Cancel', default: true },
    ] : [{ label: 'OK', default: true }];
    const dlg = dialog('Cleanup Results', content, btns, { width: 'min(640px, 92%)' });
    delBtn = btns[0].el;
    if (items.length) draw();
  }

  // ---------- Start ----------
  applyCfg();
  start();

  return {
    noDoubleClickSettings: true,
    update() { applyCfg(); if ((ctx.config.root || '') !== st.rootCfg) start(); },
    resume() { if (st.dir) refresh(); },
    menu: () => [
      { label: 'Disk Cleanup…', action: 'scan' },
      { label: 'Open Folder…', action: 'pick' },
      { type: 'separator' },
      { label: 'Large Icons', type: 'radio', checked: ctx.config.view !== 'details', action: 'icons' },
      { label: 'Details', type: 'radio', checked: ctx.config.view === 'details', action: 'details' },
      { label: 'Show Preview Pane', type: 'checkbox', checked: ctx.config.preview !== false, action: 'preview' },
      { type: 'separator' },
    ],
    menuAction(a) {
      if (a === 'scan') diskCleanup();
      if (a === 'pick') pickRoot();
      if (a === 'icons') setCfg({ view: 'icons' });
      if (a === 'details') setCfg({ view: 'details' });
      if (a === 'preview') setCfg({ preview: ctx.config.preview === false });
    },
  };
}
