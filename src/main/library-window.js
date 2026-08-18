'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');

function createLibraryWindow() {
  const win = new BrowserWindow({
    width: 1140,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#17150f',
    title: 'Marginalia',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload-library.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/library/index.html'));
  win.once('ready-to-show', () => win.show());
  return win;
}

module.exports = { createLibraryWindow };
