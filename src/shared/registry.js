'use strict';

// The widget catalog. Each type declares its default size, resize limits,
// default configuration and the content fields the settings window shows.
// Adding a widget type means adding an entry here plus a renderer module in
// src/renderer/widgets/<type>.js.

const FONTS = {
  sf: { label: 'SF Pro', stack: 'system-ui, -apple-system, "Helvetica Neue", sans-serif' },
  didot: { label: 'Didot', stack: 'Didot, "Bodoni 72", serif' },
  iowan: { label: 'Iowan Old Style', stack: '"Iowan Old Style", Palatino, Georgia, serif' },
  baskerville: { label: 'Baskerville', stack: 'Baskerville, "Baskerville Old Face", Georgia, serif' },
  hoefler: { label: 'Hoefler Text', stack: '"Hoefler Text", Garamond, Georgia, serif' },
  charter: { label: 'Charter', stack: 'Charter, "Bitstream Charter", Georgia, serif' },
  avenir: { label: 'Avenir Next', stack: '"Avenir Next", Avenir, system-ui, sans-serif' },
  futura: { label: 'Futura', stack: 'Futura, "Century Gothic", system-ui, sans-serif' },
  optima: { label: 'Optima', stack: 'Optima, Candara, system-ui, sans-serif' },
  gill: { label: 'Gill Sans', stack: '"Gill Sans", "Gill Sans MT", system-ui, sans-serif' },
  mono: { label: 'SF Mono', stack: 'ui-monospace, "SF Mono", Menlo, monospace' },
  noteworthy: { label: 'Noteworthy (handwritten)', stack: 'Noteworthy, "Bradley Hand", cursive' },
  bradley: { label: 'Bradley Hand (handwritten)', stack: '"Bradley Hand", Noteworthy, cursive' },
  marker: { label: 'Marker Felt', stack: '"Marker Felt", Noteworthy, cursive' },
  snell: { label: 'Snell Roundhand (script)', stack: '"Snell Roundhand", "Savoye LET", cursive' },
  // Bundled with Morrow (open licenses, see src/renderer/fonts).
  signature: { label: 'Homemade Apple (brush script)', stack: '"Homemade Apple", "Bradley Hand", cursive' },
  scrawl: { label: 'Nothing You Could Do (quick pen)', stack: '"Nothing You Could Do", "Bradley Hand", cursive' },
  brush: { label: 'Caveat Brush (marker)', stack: '"Caveat Brush", "Marker Felt", cursive' },
};

// Native macOS vibrancy materials Electron exposes. "none" turns the native
// blur off and leaves only the tint, which is what the Minimal preset uses.
// The five fonts a Sticky Note offers, in picker order.
const NOTE_FONTS = ['signature', 'scrawl', 'brush', 'marker', 'sf'];

const MATERIALS = {
  hud: 'HUD (deep glass)',
  'under-window': 'Under window (soft)',
  popover: 'Popover (bright)',
  sidebar: 'Sidebar',
  menu: 'Menu',
  'fullscreen-ui': 'Full-screen UI',
  none: 'No blur',
};

const DEFAULT_APPEARANCE = {
  material: 'hud',
  tint: '#0d1322',
  tintOpacity: 0.38,
  text: '#f2ece0',
  accent: '#d8c3a0',
  font: 'didot',
  infoFont: 'sf',
  weight: 300,
  scale: 1,
  align: 'center',
  radius: 22,
  padding: 18,
  highlight: 0.5,
  shadow: true,
  labels: true,
  image: '',
  imageOpacity: 0.5,
};

const PRESETS = [
  { id: 'midnight', name: 'Midnight', appearance: { material: 'hud', tint: '#0d1322', tintOpacity: 0.38, text: '#f2ece0', accent: '#d8c3a0', highlight: 0.5 } },
  { id: 'frosted', name: 'Frosted Glass', appearance: { material: 'under-window', tint: '#c9ccd3', tintOpacity: 0.08, text: '#fbf8f2', accent: '#e9dcc3', highlight: 0.7 } },
  { id: 'graphite', name: 'Graphite', appearance: { material: 'hud', tint: '#1d1e21', tintOpacity: 0.5, text: '#e4e4e6', accent: '#b9bcc2', highlight: 0.35 } },
  { id: 'soft-light', name: 'Soft Light', appearance: { material: 'popover', tint: '#f6f1e8', tintOpacity: 0.45, text: '#2a2620', accent: '#9c7a46', highlight: 0.8 } },
  { id: 'lavender', name: 'Lavender Mist', appearance: { material: 'under-window', tint: '#3b3354', tintOpacity: 0.34, text: '#f1ecfa', accent: '#c7b8ec', highlight: 0.55 } },
  { id: 'smoky-blue', name: 'Smoky Blue', appearance: { material: 'hud', tint: '#24364a', tintOpacity: 0.36, text: '#eaf0f5', accent: '#a9c1d6', highlight: 0.5 } },
  { id: 'sunset', name: 'Sunset', appearance: { material: 'under-window', tint: '#4a2a26', tintOpacity: 0.36, text: '#fbeee2', accent: '#f0a77e', highlight: 0.55 } },
  { id: 'cinema', name: 'Cinema', appearance: { material: 'hud', tint: '#0a0a0c', tintOpacity: 0.72, text: '#f4ede1', accent: '#e6b45e', highlight: 0.4, font: 'didot', infoFont: 'avenir' } },
  { id: 'minimal', name: 'Minimal', appearance: { material: 'none', tint: '#000000', tintOpacity: 0, text: '#f5f1e8', accent: '#d8c3a0', highlight: 0, shadow: false } },
];

// Curated looks for widgets that offer a few beautiful styles instead of
// dozens of knobs. Each style sets the whole appearance (and sometimes a few
// content options); the widget remembers which one is in use as config.style.
const look = (material, tint, tintOpacity, text, accent, more = {}) => ({
  material, tint, tintOpacity, text, accent, font: 'sf', infoFont: 'sf', weight: 300, scale: 1, align: 'center',
  radius: 24, padding: 18, highlight: material === 'none' ? 0 : 0.5, shadow: material !== 'none', labels: true, ...more,
});
const CLEAR = (more) => look('none', '#000000', 0, '#ffffff', '#ffffff', { ...more });

const STYLES = {
  weather: [
    { id: 'daylight', name: 'Daylight', appearance: look('popover', '#e8f1fa', 0.35, '#1c2a3a', '#3b7fc4', { highlight: 0.75, radius: 26 }) },
    { id: 'nightfall', name: 'Nightfall', appearance: look('hud', '#0f1b33', 0.55, '#eef3fb', '#8fb8ff', { weight: 200, radius: 26 }) },
    { id: 'dusk', name: 'Dusk', appearance: look('under-window', '#3a2238', 0.42, '#fbeee8', '#f3a37f', { font: 'didot', infoFont: 'avenir', radius: 26 }) },
    { id: 'clear', name: 'Clear', appearance: CLEAR({ weight: 200 }) },
  ],
  launcher: [
    { id: 'dock', name: 'Dock', appearance: look('under-window', '#d9dde5', 0.1, '#ffffff', '#ffffff', { highlight: 0.75, radius: 26 }), config: { iconSize: 48, spacing: 14, labels: false } },
    { id: 'shelf', name: 'Shelf', appearance: look('popover', '#f4f1ea', 0.5, '#2a2620', '#9c7a46', { radius: 20, highlight: 0.8 }), config: { iconSize: 44, spacing: 18, labels: true } },
    { id: 'floating', name: 'Floating', appearance: CLEAR(), config: { iconSize: 56, spacing: 22, labels: false } },
    { id: 'tiles', name: 'Night Tiles', appearance: look('hud', '#15161a', 0.55, '#eeeeee', '#c9c9cf', { radius: 18 }), config: { iconSize: 40, spacing: 12, labels: true } },
  ],
  worldclock: [
    { id: 'departures', name: 'Departures', appearance: look('hud', '#0b0b0c', 0.72, '#f3f0e6', '#f2c14e', { infoFont: 'mono', radius: 16 }) },
    { id: 'atlas', name: 'Atlas', appearance: look('popover', '#f3ede1', 0.55, '#2b2620', '#9c7a46', { font: 'iowan', infoFont: 'avenir', highlight: 0.8 }) },
    { id: 'midnight', name: 'Midnight', appearance: look('hud', '#0d1322', 0.38, '#f2ece0', '#d8c3a0', { font: 'didot' }) },
    { id: 'clear', name: 'Clear', appearance: CLEAR({ weight: 200 }) },
  ],
  image: [
    { id: 'glass', name: 'Glass', appearance: look('hud', '#0d1322', 0.2, '#fbf7ef', '#d8c3a0', { radius: 18, font: 'didot' }), config: { frame: 'glass' } },
    { id: 'polaroid', name: 'Polaroid', appearance: CLEAR({ radius: 2 }), config: { frame: 'polaroid' } },
    { id: 'gallery', name: 'Gallery Frame', appearance: CLEAR({ radius: 2 }), config: { frame: 'gallery' } },
    { id: 'poster', name: 'Film Poster', appearance: CLEAR({ radius: 3 }), config: { frame: 'poster' } },
    { id: 'bare', name: 'Borderless', appearance: CLEAR({ radius: 14 }), config: { frame: 'bare' } },
  ],
  watched: [
    { id: 'letterboxd', name: 'Letterboxd', appearance: look('hud', '#14181c', 0.82, '#ffffff', '#00e054', { weight: 600, infoFont: 'sf' }) },
    { id: 'marquee', name: 'Marquee', appearance: look('hud', '#0a0a0c', 0.72, '#f4ede1', '#e6b45e', { font: 'didot', infoFont: 'avenir' }) },
    { id: 'ticket', name: 'Ticket Stub', appearance: look('popover', '#f4ead8', 0.78, '#3a2a1a', '#c0392b', { font: 'futura', infoFont: 'futura', weight: 400, radius: 10, highlight: 0.3 }) },
    { id: 'clear', name: 'Clear', appearance: CLEAR({ weight: 200 }) },
  ],
  stopwatch: [
    { id: 'chrono', name: 'Chrono', appearance: look('hud', '#101114', 0.7, '#f2f2f2', '#ff9f0a', { weight: 200 }) },
    { id: 'lab', name: 'Lab', appearance: look('popover', '#f5f5f2', 0.6, '#1c1c1e', '#ff3b30', { highlight: 0.8 }) },
    { id: 'neon', name: 'Neon', appearance: look('hud', '#07120c', 0.75, '#3dff7a', '#3dff7a', { infoFont: 'mono', font: 'mono' }) },
    { id: 'clear', name: 'Clear', appearance: CLEAR({ weight: 200 }) },
  ],
};

const TYPES = {
  clock: {
    name: 'Clock',
    description: 'Large editorial time with an optional date.',
    size: { width: 340, height: 170 },
    min: { width: 140, height: 70 },
    max: { width: 1400, height: 800 },
    config: { hour12: false, seconds: false, showDate: true, showWeekday: true },
    fields: [
      { key: 'hour12', label: '12-hour time', type: 'toggle' },
      { key: 'seconds', label: 'Show seconds', type: 'toggle' },
      { key: 'showDate', label: 'Show date', type: 'toggle' },
      { key: 'showWeekday', label: 'Show weekday', type: 'toggle' },
    ],
  },
  countdown: {
    name: 'Countdown',
    description: 'A beautiful count to the day that matters, in four styles.',
    size: { width: 300, height: 190 },
    min: { width: 130, height: 90 },
    max: { width: 1400, height: 900 },
    config: {
      title: 'Untitled event',
      target: '',
      timeZone: '',
      allDay: false,
      style: 'editorial', // editorial | live | ring | minimal
      days: true,
      hours: true,
      minutes: true,
      seconds: true,
      showDate: true,
      showProgress: true,
      startedAt: null,
      icon: '',
      afterLabel: 'It’s here',
      afterMode: 'label', // label | countup
    },
    // The settings window draws a dedicated editor for countdowns.
    fields: [{ key: 'countdown', label: 'Event', type: 'countdown' }],
    imageSupport: true,
  },
  random: {
    name: 'Random Number',
    description: 'A fair integer between two bounds, in one click.',
    size: { width: 230, height: 240 },
    min: { width: 150, height: 130 },
    max: { width: 700, height: 600 },
    config: { min: 1, max: 100, last: null },
    fields: [
      { key: 'min', label: 'Minimum', type: 'number' },
      { key: 'max', label: 'Maximum', type: 'number' },
    ],
  },
  launcher: {
    name: 'App Launcher',
    description: 'Your chosen apps as real icons. Click to open.',
    size: { width: 300, height: 112 },
    min: { width: 70, height: 70 },
    max: { width: 1600, height: 1000 },
    config: { apps: [], columns: 5, iconSize: 44, spacing: 14, labels: false },
    fields: [
      { key: 'apps', label: 'Apps', type: 'apps' },
    ],
  },
  weather: {
    name: 'Weather',
    description: 'Current conditions, high and low, and the hours ahead.',
    size: { width: 320, height: 230 },
    min: { width: 120, height: 90 },
    max: { width: 1000, height: 700 },
    config: { location: null, useCurrent: false, unit: 'C', hourly: true },
    fields: [
      { key: 'location', label: 'Location', type: 'city' },
      { key: 'unit', label: 'Units', type: 'select', options: { C: 'Celsius', F: 'Fahrenheit' } },
    ],
  },
  worldclock: {
    name: 'World Clock',
    description: 'Time in other cities, with their weather.',
    size: { width: 300, height: 150 },
    min: { width: 130, height: 70 },
    max: { width: 1000, height: 1000 },
    config: { cities: [], hour12: false, showOffset: true, showWeather: true, unit: 'C' },
    fields: [
      { key: 'cities', label: 'Cities', type: 'cities' },
      { key: 'hour12', label: '12-hour time', type: 'toggle' },
    ],
  },
  note: {
    name: 'Sticky Note',
    description: 'A note you type straight onto the desktop.',
    size: { width: 240, height: 220 },
    min: { width: 110, height: 90 },
    max: { width: 1200, height: 1200 },
    config: { text: '', title: '', body: '', showTitle: true, paper: 'butter', font: 'signature', titleFont: 'signature', size: 17, lined: false, tape: true, pin: 'tape', pinColor: 'red' },
    appearance: { align: 'left' },
    fields: [
      { key: 'paper', label: 'Paper', type: 'paper' },
      { key: 'showTitle', label: 'Title', type: 'toggle', hint: 'Select text and press ⌘U to underline it.' },
      { key: 'titleFont', label: 'Title font', type: 'notefont' },
      { key: 'font', label: 'Body font', type: 'notefont' },
      { key: 'size', label: 'Text size', type: 'range', min: 10, max: 44 },
      { key: 'lined', label: 'Ruled lines', type: 'toggle' },
      { key: 'pin', label: 'Pinned with', type: 'choice', options: { tape: 'Washi tape', pushpin: 'Pushpin', none: 'Nothing' } },
      { key: 'pinColor', label: 'Pin color', type: 'pincolor', when: { pin: 'pushpin' } },
    ],
  },
  image: {
    name: 'Photo',
    description: 'A favourite photo, framed in glass.',
    size: { width: 300, height: 220 },
    min: { width: 80, height: 80 },
    max: { width: 1800, height: 1400 },
    config: { file: '', name: '', aspect: null, fit: 'cover', filter: 'none', caption: '', inset: 0, frame: 'glass' },
    appearance: { radius: 18 },
    fields: [
      { key: 'file', label: 'Photo', type: 'image' },
      { key: 'filter', label: 'Tone', type: 'select', options: { none: 'Natural', mono: 'Black and white', warm: 'Warm', cool: 'Cool', fade: 'Faded film' } },
      { key: 'caption', label: 'Caption', type: 'text', placeholder: 'Optional', hint: 'On a Film Poster this is the title.' },
    ],
  },
  films: {
    name: 'Films',
    description: 'Films in your Movies folder, then the rest of your Letterboxd watchlist.',
    size: { width: 420, height: 460 },
    min: { width: 200, height: 160 },
    max: { width: 1800, height: 1400 },
    // An empty folder means the Movies folder in your home folder.
    config: { folder: '', username: '', layout: 'grid', posterSize: 96, showDownloads: true, showWatchlist: true, minSizeMB: 100, wlDecade: '', wlGenre: '', wlSort: 'added', title: '' },
    fields: [
      { key: 'showDownloads', label: 'Show downloads', type: 'toggle', hint: 'Films and shows in your watch folder. Click one to play it in VLC.' },
      { key: 'showWatchlist', label: 'Show watchlist', type: 'toggle', hint: 'The rest of your Letterboxd watchlist, with filters.' },
      { key: 'layout', label: 'Layout', type: 'choice', options: { grid: 'Grid', shelf: 'Shelves', list: 'List' } },
      { key: 'posterSize', label: 'Posters', type: 'choice', options: { 72: 'Small', 96: 'Medium', 132: 'Large' } },
      { key: 'title', label: 'Heading', type: 'text', placeholder: 'None', hint: 'Optional, like “Tonight” or “Ready to watch”.' },
      { key: 'username', label: 'Letterboxd username', type: 'text', placeholder: 'Your public username' },
      { key: 'folder', label: 'Watch folder', type: 'folder' },
      { key: 'minSizeMB', label: 'Hide short clips', type: 'flag', on: 100, off: 0, hint: 'Skips videos under 100 MB, like phone recordings.' },
    ],
  },
  watched: {
    name: 'Films Watched',
    description: 'How many films you’ve watched, from your Letterboxd profile.',
    size: { width: 220, height: 170 },
    min: { width: 120, height: 90 },
    max: { width: 900, height: 700 },
    config: { username: '', label: 'films watched', showUser: true, goal: 0 },
    fields: [
      { key: 'username', label: 'Letterboxd username', type: 'text', placeholder: 'Your public username' },
      { key: 'goal', label: 'Goal', type: 'number', placeholder: 'None', hint: 'A target count shows a progress bar. Leave at 0 for none.' },
    ],
  },
  cork: {
    name: 'Corkboard',
    description: 'A framed cork board for notes, photos and red string.',
    size: { width: 560, height: 440 },
    min: { width: 260, height: 200 },
    max: { width: 1800, height: 1400 },
    config: { items: [], strings: [], font: 'scrawl', size: 16, boardW: 0, boardH: 0 },
    appearance: { tintOpacity: 0, highlight: 0, shadow: false, radius: 8, padding: 0 },
    fields: [
      { key: 'font', label: 'Note font', type: 'notefont' },
      { key: 'size', label: 'Text size', type: 'range', min: 10, max: 32 },
    ],
  },
  board: {
    name: 'Whiteboard',
    description: 'Draw with markers on a whiteboard, or with chalk on a green or black chalkboard.',
    size: { width: 520, height: 380 },
    min: { width: 240, height: 180 },
    max: { width: 1800, height: 1400 },
    config: { surface: 'white', marker: 'black', chalk: 'classic', strokes: [], texts: [] },
    appearance: { tintOpacity: 0, highlight: 0, shadow: false, radius: 6, padding: 0 },
    fields: [
      { key: 'surface', label: 'Surface', type: 'select', options: { white: 'Whiteboard', green: 'Green chalkboard', black: 'Black chalkboard' } },
    ],
  },
  page: {
    name: 'Custom Widget',
    description: 'Your own widget from a single HTML file.',
    size: { width: 360, height: 360 },
    min: { width: 120, height: 80 },
    max: { width: 1800, height: 1400 },
    config: { file: '', name: '' },
    // The page draws its own card; Morrow adds only the native blur behind it.
    appearance: { tintOpacity: 0, highlight: 0, shadow: false, radius: 30, padding: 0 },
    fields: [{ key: 'file', label: 'HTML file', type: 'page' }],
  },
  stopwatch: {
    name: 'Stopwatch',
    description: 'Start, pause, laps. Expands to show lap times.',
    size: { width: 260, height: 170 },
    min: { width: 180, height: 110 },
    max: { width: 900, height: 900 },
    config: {},
    fields: [],
  },
};

for (const [type, list] of Object.entries(STYLES)) TYPES[type].styles = list;

module.exports = { TYPES, STYLES, FONTS, NOTE_FONTS, MATERIALS, PRESETS, DEFAULT_APPEARANCE };
