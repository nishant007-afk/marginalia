'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const categories = require('../shared/categories.json');

contextBridge.exposeInMainWorld('api', {
  categories,
  getState: () => ipcRenderer.invoke('widget:state:get'),
  setY: (y) => ipcRenderer.invoke('widget:set-y', y),
  toggle: () => ipcRenderer.invoke('widget:toggle'),
  expand: () => ipcRenderer.invoke('widget:expand'),
  collapse: () => ipcRenderer.invoke('widget:collapse'),
  setPin: (v) => ipcRenderer.invoke('widget:set-pin', v),
  contextMenu: () => ipcRenderer.invoke('widget:context-menu'),
  openLibrary: () => ipcRenderer.invoke('widget:open-library'),
  saveNote: (input) => ipcRenderer.invoke('widget:save-note', input),
  getQuickContext: () => ipcRenderer.invoke('widget:get-quick-context'),
  onState: (cb) => ipcRenderer.on('widget:state', (_e, s) => cb(s)),
  onQuick: (cb) => ipcRenderer.on('widget:quick', (_e, q) => cb(q))
});
