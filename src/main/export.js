'use strict';

const fs = require('fs');
const { BrowserWindow, dialog } = require('electron');

const { buildText, buildMarkdown, buildPdfHtml } = require('../shared/export-formats.js');

async function pickSavePath(parent, defaultName, filters) {
  const opts = { defaultPath: defaultName, filters };
  const res =
    parent && !parent.isDestroyed()
      ? await dialog.showSaveDialog(parent, opts)
      : await dialog.showSaveDialog(opts);
  return res.canceled || !res.filePath ? null : res.filePath;
}

function serialize(notes, format) {
  if (format === 'txt') return buildText(notes);
  if (format === 'json') {
    return JSON.stringify(
      { app: 'marginalia', type: 'notes-export', exportedAt: new Date().toISOString(), notes },
      null,
      2
    );
  }
  return buildMarkdown(notes);
}

/**
 * Export notes to a file the user picks. format: 'txt' | 'md' | 'json'.
 * Returns { canceled } or { canceled: false, filePath }.
 */
async function exportNotes(parent, notes, format, suggestedName) {
  if (!notes.length) return { canceled: false, error: 'Nothing to export.' };
  const ext = format === 'md' ? 'md' : format === 'json' ? 'json' : 'txt';
  const filePath = await pickSavePath(parent, suggestedName, [
    { name: format.toUpperCase(), extensions: [ext] }
  ]);
  if (!filePath) return { canceled: true };
  fs.writeFileSync(filePath, serialize(notes, format), 'utf8');
  return { canceled: false, filePath };
}

/** Export notes as a PDF (rendered via Chromium's printToPDF, fully offline). */
async function exportNotesPdf(parent, notes, suggestedName) {
  if (!notes.length) return { canceled: false, error: 'Nothing to export.' };
  const filePath = await pickSavePath(parent, `${suggestedName}.pdf`, [
    { name: 'PDF', extensions: ['pdf'] }
  ]);
  if (!filePath) return { canceled: true };
  const html = buildPdfHtml(notes);
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const data = await pdfWin.webContents.printToPDF({ printBackground: true });
    fs.writeFileSync(filePath, data);
  } finally {
    pdfWin.destroy();
  }
  return { canceled: false, filePath };
}

function stamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Full library backup to a user-chosen JSON file. */
async function createBackup(parent, store) {
  const filePath = await pickSavePath(parent, `marginalia-backup-${stamp()}.json`, [
    { name: 'Marginalia backup', extensions: ['json'] }
  ]);
  if (!filePath) return { canceled: true };
  fs.writeFileSync(filePath, JSON.stringify(store.exportAll(), null, 2), 'utf8');
  return { canceled: false, filePath };
}

/** Restore a library from a backup JSON file the user picks. */
async function restoreBackup(parent, store) {
  const res = await dialog.showOpenDialog(parent, {
    title: 'Restore Marginalia backup',
    filters: [{ name: 'Marginalia backup', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const raw = fs.readFileSync(res.filePaths[0], 'utf8');
  const payload = JSON.parse(raw);
  const result = store.importAll(payload);
  return { canceled: false, filePath: res.filePaths[0], ...result };
}

module.exports = { exportNotes, exportNotesPdf, createBackup, restoreBackup };
