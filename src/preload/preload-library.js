'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const categories = require('../shared/categories.json');

contextBridge.exposeInMainWorld('api', {
  categories,
  notes: {
    list: (filters) => ipcRenderer.invoke('notes:list', filters || {}),
    get: (id) => ipcRenderer.invoke('notes:get', id),
    create: (input) => ipcRenderer.invoke('notes:create', input || {}),
    update: (id, patch) => ipcRenderer.invoke('notes:update', id, patch || {}),
    remove: (id) => ipcRenderer.invoke('notes:delete', id),
    link: (a, b) => ipcRenderer.invoke('notes:link', a, b),
    unlink: (a, b) => ipcRenderer.invoke('notes:unlink', a, b),
    randomRevisit: () => ipcRenderer.invoke('notes:random-revisit'),
    tags: () => ipcRenderer.invoke('notes:tags'),
    books: () => ipcRenderer.invoke('notes:books'),
    stats: () => ipcRenderer.invoke('notes:stats')
  },
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    create: (data) => ipcRenderer.invoke('sessions:create', data || {}),
    end: (id) => ipcRenderer.invoke('sessions:end', id),
    resume: (id) => ipcRenderer.invoke('sessions:resume', id),
    remove: (id) => ipcRenderer.invoke('sessions:delete', id),
    active: () => ipcRenderer.invoke('sessions:active')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch || {}),
    dataPath: () => ipcRenderer.invoke('settings:data-path'),
    openDataFolder: () => ipcRenderer.invoke('settings:open-data-folder'),
    validateShortcut: (accel) => ipcRenderer.invoke('settings:validate-shortcut', accel)
  },
  export: {
    notes: (payload) => ipcRenderer.invoke('export:notes', payload || {}),
    pdf: (payload) => ipcRenderer.invoke('export:pdf', payload || {}),
    backup: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore')
  },
  openWidget: () => ipcRenderer.invoke('app:open-widget'),
  quit: () => ipcRenderer.invoke('app:quit')
});
