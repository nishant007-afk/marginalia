'use strict';

const { app, Menu } = require('electron');
const path = require('path');

const { Store } = require('./store');
const { createWidgetWindow } = require('./widget-window');
const { createLibraryWindow } = require('./library-window');
const { registerShortcuts } = require('./shortcuts');
const { registerIpc } = require('./ipc');

app.setName('Marginalia');

let store = null;
let widget = null;
let libraryWin = null;

function openLibrary() {
  if (libraryWin && !libraryWin.isDestroyed()) {
    if (libraryWin.isMinimized()) libraryWin.restore();
    libraryWin.show();
    libraryWin.focus();
    return;
  }
  libraryWin = createLibraryWindow();
  libraryWin.on('closed', () => {
    libraryWin = null;
  });
}

function widgetActions() {
  return {
    toggleWidget: () => widget && widget.toggle(),
    newNote: (category) => {
      if (!widget) return;
      widget.expand();
      widget.win.webContents.send('widget:quick', { category });
    },
    openLibrary
  };
}

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'data')).load();
  Menu.setApplicationMenu(null);

  widget = createWidgetWindow(store, { onOpenLibrary: openLibrary });

  const actions = widgetActions();
  const applyShortcuts = () => registerShortcuts(store, actions);
  applyShortcuts();

  registerIpc({
    store,
    getWidget: () => widget,
    getLibrary: () => libraryWin,
    openLibrary,
    applyShortcuts
  });

  // First launch: open the library so the introduction can be shown.
  if (!store.getSettings().introShown) {
    openLibrary();
  }

  if (process.env.SMOKE_TEST) {
    setTimeout(() => {
      console.log('SMOKE_OK');
      app.quit();
    }, 5000);
  }
});

// The floating widget *is* the app — closing the library window must not quit.
app.on('window-all-closed', () => {
  /* keep running for the widget */
});

app.on('before-quit', () => {
  if (store) store.flushNow();
});
