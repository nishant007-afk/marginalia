'use strict';

const { ipcMain, Menu, app, BrowserWindow, shell } = require('electron');
const { exportNotes, exportNotesPdf, createBackup, restoreBackup } = require('./export');
const { validate } = require('./shortcuts');

const CATEGORIES = require('../shared/categories.json');

function collectNotes(store, payload) {
  if (!payload) return store.listNotes();
  if (Array.isArray(payload.ids)) {
    const set = new Set(payload.ids);
    return store.listNotes().filter((n) => set.has(n.id));
  }
  if (payload.category) return store.listNotes({ category: payload.category });
  if (payload.book) return store.listNotes({ book: payload.book });
  if (payload.sessionId) return store.listNotes({ sessionId: payload.sessionId });
  return store.listNotes();
}

function suggestedName(payload) {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (payload && payload.category) {
    const label = CATEGORIES[payload.category] ? CATEGORIES[payload.category].label : payload.category;
    return `marginalia-${label.toLowerCase()}-${date}`;
  }
  if (payload && payload.book) return `marginalia-${payload.book.replace(/[\\/:*?"<>|]+/g, '-')}-${date}`;
  if (payload && payload.sessionId) return `marginalia-session-${date}`;
  return `marginalia-notes-${date}`;
}

function registerIpc(ctx) {
  const { store } = ctx;

  // ------------------------------------------------------------ widget

  ipcMain.handle('widget:state:get', () => ctx.getWidget().getState());
  ipcMain.handle('widget:set-y', (_e, y) => {
    ctx.getWidget().setPenY(y);
    return true;
  });
  ipcMain.handle('widget:toggle', () => {
    ctx.getWidget().toggle();
    return true;
  });
  ipcMain.handle('widget:expand', () => {
    ctx.getWidget().expand();
    return true;
  });
  ipcMain.handle('widget:collapse', () => {
    ctx.getWidget().collapse();
    return true;
  });
  ipcMain.handle('widget:set-pin', (_e, v) => {
    store.updateSettings({ pinExpanded: !!v });
    ctx.getWidget().sendState();
    return true;
  });
  ipcMain.handle('widget:open-library', () => {
    ctx.getWidget().collapse();
    ctx.openLibrary();
    return true;
  });
  ipcMain.handle('widget:save-note', (_e, input) => store.createNote(input || {}));
  ipcMain.handle('widget:get-quick-context', () => ({ activeSession: store.getActiveSession() }));
  ipcMain.handle('widget:context-menu', (e) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open library', click: () => ctx.openLibrary() },
      { type: 'separator' },
      {
        label: 'Always on top',
        type: 'checkbox',
        checked: store.getSettings().alwaysOnTop,
        click: (item) => {
          store.updateSettings({ alwaysOnTop: item.checked });
          ctx.getWidget().win.setAlwaysOnTop(item.checked, 'floating');
          ctx.getWidget().sendState();
        }
      },
      {
        label: 'Pin expanded',
        type: 'checkbox',
        checked: store.getSettings().pinExpanded,
        click: (item) => {
          store.updateSettings({ pinExpanded: item.checked });
          ctx.getWidget().sendState();
        }
      },
      { type: 'separator' },
      { label: 'Quit Marginalia', click: () => app.quit() }
    ]);
    const win = BrowserWindow.fromWebContents(e.sender);
    menu.popup({ window: win });
    return true;
  });

  // ------------------------------------------------------------- notes

  ipcMain.handle('notes:list', (_e, filters) => store.listNotes(filters || {}));
  ipcMain.handle('notes:get', (_e, id) => store.getNote(id));
  ipcMain.handle('notes:create', (_e, input) => store.createNote(input || {}));
  ipcMain.handle('notes:update', (_e, id, patch) => store.updateNote(id, patch || {}));
  ipcMain.handle('notes:delete', (_e, id) => store.deleteNote(id));
  ipcMain.handle('notes:link', (_e, a, b) => store.linkNotes(a, b));
  ipcMain.handle('notes:unlink', (_e, a, b) => store.unlinkNotes(a, b));
  ipcMain.handle('notes:random-revisit', () => store.randomRevisit());
  ipcMain.handle('notes:tags', () => store.getTags());
  ipcMain.handle('notes:books', () => store.getBooks());
  ipcMain.handle('notes:stats', () => store.getStats());

  // ---------------------------------------------------------- sessions

  ipcMain.handle('sessions:list', () => store.listSessions());
  ipcMain.handle('sessions:get', (_e, id) => store.getSession(id));
  ipcMain.handle('sessions:create', (_e, data) => store.createSession(data || {}));
  ipcMain.handle('sessions:end', (_e, id) => store.endSession(id));
  ipcMain.handle('sessions:resume', (_e, id) => store.resumeSession(id));
  ipcMain.handle('sessions:delete', (_e, id) => store.deleteSession(id));
  ipcMain.handle('sessions:active', () => store.getActiveSession());

  // ---------------------------------------------------------- settings

  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:update', (_e, patch) => {
    const before = store.getSettings();
    const updated = store.updateSettings(patch || {});
    if (patch && typeof patch.alwaysOnTop === 'boolean' && patch.alwaysOnTop !== before.alwaysOnTop) {
      ctx.getWidget().win.setAlwaysOnTop(patch.alwaysOnTop, 'floating');
      ctx.getWidget().sendState();
    }
    if (patch && patch.shortcuts) ctx.applyShortcuts();
    return updated;
  });
  ipcMain.handle('settings:data-path', () => store.dataDir);
  ipcMain.handle('settings:open-data-folder', async () => {
    const err = await shell.openPath(store.dataDir);
    return err ? { error: err } : {};
  });
  ipcMain.handle('settings:validate-shortcut', (_e, accel) => validate(accel));

  // ------------------------------------------------- export / backup

  ipcMain.handle('export:notes', (_e, payload) => {
    const notes = collectNotes(store, payload);
    const format = payload && payload.format ? payload.format : 'md';
    return exportNotes(ctx.getLibrary(), notes, format, suggestedName(payload));
  });
  ipcMain.handle('export:pdf', (_e, payload) => {
    const notes = collectNotes(store, payload);
    return exportNotesPdf(ctx.getLibrary(), notes, suggestedName(payload));
  });
  ipcMain.handle('backup:create', () => createBackup(ctx.getLibrary(), store));
  ipcMain.handle('backup:restore', () => restoreBackup(ctx.getLibrary(), store));

  // -------------------------------------------------------------- app

  ipcMain.handle('app:open-widget', () => {
    const w = ctx.getWidget();
    w.win.show();
    w.win.focus();
    return true;
  });
  ipcMain.handle('app:quit', () => {
    app.quit();
    return true;
  });
}

module.exports = { registerIpc };
