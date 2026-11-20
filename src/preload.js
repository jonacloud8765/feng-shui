'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('morrow', {
  init: (id) => ipcRenderer.invoke('morrow:init', id),
  onWidget: on('morrow:widget'),
  onSettings: on('morrow:settings'),
  onDoc: on('morrow:doc'),
  onResume: on('morrow:resume'),
  onMenuAction: on('morrow:menu-action'),
  onFocusWidget: on('morrow:focus-widget'),

  updateWidget: (id, patch) => ipcRenderer.send('morrow:update-widget', id, patch),
  gestureStart: (kind, edge) => ipcRenderer.send('morrow:gesture-start', kind, edge),
  gestureEnd: () => ipcRenderer.send('morrow:gesture-end'),
  contextMenu: (extra) => ipcRenderer.send('morrow:context-menu', extra),
  openSettings: (id) => ipcRenderer.send('morrow:open-settings', id),
  copy: (text) => ipcRenderer.send('morrow:copy', text),
  stopwatch: (action) => ipcRenderer.invoke('morrow:stopwatch', action),

  addWidget: (type) => ipcRenderer.invoke('morrow:add-widget', type),
  duplicateWidget: (id) => ipcRenderer.send('morrow:duplicate-widget', id),
  removeWidget: (id) => ipcRenderer.send('morrow:remove-widget', id),
  updateSettings: (patch) => ipcRenderer.send('morrow:update-settings', patch),
  createLayout: (name, fromId) => ipcRenderer.invoke('morrow:create-layout', name, fromId),
  renameLayout: (id, name) => ipcRenderer.send('morrow:rename-layout', id, name),
  deleteLayout: (id) => ipcRenderer.send('morrow:delete-layout', id),
  switchLayout: (id) => ipcRenderer.send('morrow:switch-layout', id),
  savePreset: (name, appearance) => ipcRenderer.invoke('morrow:save-preset', name, appearance),
  deletePreset: (id) => ipcRenderer.send('morrow:delete-preset', id),
  pickImage: () => ipcRenderer.invoke('morrow:pick-image'),
  listApps: (refresh) => ipcRenderer.invoke('morrow:apps-list', refresh),
  appIcon: (p, size) => ipcRenderer.invoke('morrow:app-icon', p, size),
  bundleId: (p) => ipcRenderer.invoke('morrow:bundle-id', p),
  resolveApps: (entries, size) => ipcRenderer.invoke('morrow:apps-resolve', entries, size),
  launch: (p) => ipcRenderer.invoke('morrow:launch', p),
  weather: (loc, force) => ipcRenderer.invoke('morrow:weather', loc, force),
  searchCities: (q) => ipcRenderer.invoke('morrow:city-search', q),
  importImage: (p) => ipcRenderer.invoke('morrow:import-image', p),
  pickPhoto: () => ipcRenderer.invoke('morrow:pick-photo'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  timeZones: () => ipcRenderer.invoke('morrow:time-zones'),
  films: (opts) => ipcRenderer.invoke('morrow:films', opts),
  filmPoster: (url) => ipcRenderer.invoke('morrow:film-poster', url),
  playFilm: (files) => ipcRenderer.invoke('morrow:film-play', files),
  openFilmPage: (link) => ipcRenderer.send('morrow:film-page', link),
  pickFolder: (current) => ipcRenderer.invoke('morrow:pick-folder', current),
});
