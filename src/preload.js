'use strict';

const { contextBridge, ipcRenderer } = require('electron');

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
  timeZones: () => ipcRenderer.invoke('morrow:time-zones'),
});
