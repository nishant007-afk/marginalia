'use strict';

const { BrowserWindow, screen } = require('electron');
const path = require('path');

const PEN_SIZE = 64;
const PANEL = { width: 400, height: 620 };

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function defaultPenY() {
  const wa = workArea();
  return Math.round(wa.y + (wa.height - PEN_SIZE) / 2);
}

function clampY(y, height) {
  const wa = workArea();
  const maxY = wa.y + wa.height - height;
  return Math.max(wa.y, Math.min(Math.round(y), maxY));
}

/**
 * The floating widget window.
 *
 * Collapsed: a small pen-sized transparent window pinned to the left edge.
 * Expanded:  a wider quick-capture panel sliding out from the left edge.
 * The window is always-on-top and stays out of the taskbar. Position is
 * remembered in the store.
 */
function createWidgetWindow(store, { onOpenLibrary }) {
  const settings = store.getSettings();
  let penY = settings.widget.y == null ? defaultPenY() : settings.widget.y;
  let expanded = false;

  const win = new BrowserWindow({
    width: PEN_SIZE,
    height: PEN_SIZE,
    x: 0,
    y: clampY(penY, PEN_SIZE),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload-widget.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, '../renderer/widget/index.html'));

  function sendState() {
    if (win.isDestroyed()) return;
    win.webContents.send('widget:state', {
      expanded,
      alwaysOnTop: store.getSettings().alwaysOnTop,
      pinExpanded: store.getSettings().pinExpanded,
      autoCollapse: store.getSettings().autoCollapse,
      penSize: PEN_SIZE,
      panelWidth: PANEL.width,
      panelHeight: PANEL.height,
      penY: clampY(penY, PEN_SIZE)
    });
  }

  function expand() {
    if (expanded) return;
    expanded = true;
    const y = clampY(penY, PANEL.height);
    win.setBounds({ x: 0, y, width: PANEL.width, height: PANEL.height });
    win.show();
    win.focus();
    sendState();
  }

  function collapse() {
    if (!expanded) return;
    expanded = false;
    win.setBounds({ x: 0, y: clampY(penY, PEN_SIZE), width: PEN_SIZE, height: PEN_SIZE });
    sendState();
  }

  function toggle() {
    if (expanded) collapse();
    else expand();
  }

  function setPenY(y) {
    penY = clampY(y, PEN_SIZE);
    store.updateSettings({ widget: { ...store.getSettings().widget, y: penY } });
    if (expanded) {
      win.setBounds({ x: 0, y: clampY(penY, PANEL.height), width: PANEL.width, height: PANEL.height });
    } else {
      win.setBounds({ x: 0, y: clampY(penY, PEN_SIZE), width: PEN_SIZE, height: PEN_SIZE });
    }
  }

  // Clicking anywhere outside the widget collapses it (unless pinned).
  win.on('blur', () => {
    const s = store.getSettings();
    if (s.autoCollapse && !s.pinExpanded) collapse();
  });

  win.once('ready-to-show', () => {
    win.showInactive();
  });

  return {
    win,
    expand,
    collapse,
    toggle,
    setPenY,
    sendState,
    getState: () => ({ expanded, penY: clampY(penY, PEN_SIZE) }),
    showPen: () => {
      if (win.isDestroyed()) return;
      if (!win.isVisible()) win.showInactive();
    }
  };
}

module.exports = { createWidgetWindow, PEN_SIZE, PANEL };
