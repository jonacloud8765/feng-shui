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
};

// Native macOS vibrancy materials Electron exposes. "none" turns the native
// blur off and leaves only the tint, which is what the Minimal preset uses.
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
  { id: 'minimal', name: 'Minimal', appearance: { material: 'none', tint: '#000000', tintOpacity: 0, text: '#f5f1e8', accent: '#d8c3a0', highlight: 0, shadow: false } },
];

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
    description: 'Days or a live countdown to a date that matters.',
    size: { width: 260, height: 160 },
    min: { width: 140, height: 90 },
    max: { width: 1000, height: 700 },
    config: {
      title: 'Untitled event',
      target: '',
      timeZone: '',
      layout: 'live',
      days: true,
      hours: true,
      minutes: true,
      seconds: true,
      icon: '',
      afterLabel: 'Arrived',
    },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'target', label: 'Date and time', type: 'datetime' },
      { key: 'timeZone', label: 'Time zone', type: 'timezone' },
      { key: 'layout', label: 'Layout', type: 'select', options: { live: 'Live countdown', days: 'Days remaining' } },
      { key: 'days', label: 'Days', type: 'toggle', when: { layout: 'live' } },
      { key: 'hours', label: 'Hours', type: 'toggle', when: { layout: 'live' } },
      { key: 'minutes', label: 'Minutes', type: 'toggle', when: { layout: 'live' } },
      { key: 'seconds', label: 'Seconds', type: 'toggle', when: { layout: 'live' } },
      { key: 'icon', label: 'Icon (emoji)', type: 'text', placeholder: 'e.g. ✈︎' },
      { key: 'afterLabel', label: 'Text when reached', type: 'text' },
    ],
    imageSupport: true,
  },
  random: {
    name: 'Random Number',
    description: 'A fair integer between two bounds, in one click.',
    size: { width: 220, height: 200 },
    min: { width: 160, height: 150 },
    max: { width: 700, height: 600 },
    config: { min: 1, max: 100, last: null },
    fields: [
      { key: 'min', label: 'Minimum', type: 'number' },
      { key: 'max', label: 'Maximum', type: 'number' },
    ],
  },
  coin: {
    name: 'Coin Flip',
    description: 'Heads or tails, with a short honest flip.',
    size: { width: 180, height: 200 },
    min: { width: 110, height: 120 },
    max: { width: 600, height: 600 },
    config: { heads: 'Heads', tails: 'Tails', last: null },
    fields: [
      { key: 'heads', label: 'Heads label', type: 'text' },
      { key: 'tails', label: 'Tails label', type: 'text' },
    ],
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

module.exports = { TYPES, FONTS, MATERIALS, PRESETS, DEFAULT_APPEARANCE };
