'use strict';

/* Browser bridge for the phone/PWA build.
 *
 * Implements the same `window.bridge` API the library UI expects, backed by
 * the shared Store logic persisted in IndexedDB, with export/backup handled
 * through browser downloads and file pickers. */

(function () {
  const { Store } = window.MarginaliaStore;
  const CATEGORIES = window.MARGINALIA_CATEGORIES || {};
  const ExportFormats = window.ExportFormats;

  /* ------------------------------------------------- IndexedDB helpers */

  const DB_NAME = 'marginalia';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';

  let dbPromise = null;
  function getDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE_NAME)) {
            req.result.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  function idbGet(key) {
    return getDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(key);
          req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
          req.onerror = () => reject(req.error);
        })
    );
  }

  function idbSet(key, value) {
    return getDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        })
    );
  }

  /* ------------------------------------------- store IO over IndexedDB */

  const webIo = {
    async: true,
    ensureDir: async () => {},
    read: async (file) => {
      const key = file.endsWith('.bak') ? 'library.bak' : 'library';
      const value = await idbGet(key);
      if (value == null) throw new Error('not found');
      return value;
    },
    writeAtomic: async (file, json) => {
      const key = file.endsWith('.bak') ? 'library.bak' : 'library';
      await idbSet(key, json);
    }
  };

  let store = null;
  const ready = new Store('idb', webIo)
    .loadAsync()
    .then((s) => {
      store = s;
    })
    .catch((err) => {
      console.error('Marginalia store failed to load', err);
    });

  const whenReady = (fn) => (...args) => ready.then(() => fn(...args));

  /* ------------------------------------------------------- export helpers */

  function stamp() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function collectNotes(payload) {
    if (Array.isArray(payload.ids)) {
      const set = new Set(payload.ids);
      return store.listNotes().filter((n) => set.has(n.id));
    }
    if (payload.category) return store.listNotes({ category: payload.category });
    if (payload.book) return store.listNotes({ book: payload.book });
    if (payload.sessionId) return store.listNotes({ sessionId: payload.sessionId });
    return store.listNotes();
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportNotes(payload) {
    const notes = collectNotes(payload);
    if (!notes.length) return { canceled: false, error: 'Nothing to export.' };
    const format = payload.format || 'md';
    let text;
    let mime;
    let ext;
    if (format === 'txt') {
      text = ExportFormats.buildText(notes);
      mime = 'text/plain';
      ext = 'txt';
    } else if (format === 'json') {
      text = JSON.stringify(
        { app: 'marginalia', type: 'notes-export', exportedAt: new Date().toISOString(), notes },
        null,
        2
      );
      mime = 'application/json';
      ext = 'json';
    } else {
      text = ExportFormats.buildMarkdown(notes);
      mime = 'text/markdown';
      ext = 'md';
    }
    download(`marginalia-notes-${stamp()}.${ext}`, text, mime);
    return { canceled: false };
  }

  function exportPdf(payload) {
    const notes = collectNotes(payload);
    if (!notes.length) return { canceled: false, error: 'Nothing to export.' };
    // The shared PDF template carries a strict CSP for the Electron printer;
    // a print window needs its inline print trigger, so strip the CSP here.
    const html =
      ExportFormats.buildPdfHtml(notes)
        .replace('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'>', '') +
      '\n<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });</' +
      'script>';
    const w = window.open('', '_blank');
    if (!w) return { canceled: false, error: 'The browser blocked the print window.' };
    w.document.open();
    w.document.write(html);
    w.document.close();
    return { canceled: false };
  }

  function exportBackup() {
    download(
      `marginalia-backup-${stamp()}.json`,
      JSON.stringify(store.exportAll(), null, 2),
      'application/json'
    );
    return { canceled: false };
  }

  function restoreBackup() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) {
          resolve({ canceled: true });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const payload = JSON.parse(String(reader.result));
            const res = store.importAll(payload);
            resolve({ canceled: false, ...res });
          } catch (err) {
            resolve({ canceled: false, error: `Could not restore: ${err.message}` });
          }
        };
        reader.onerror = () => resolve({ canceled: false, error: 'Could not read that file.' });
        reader.readAsText(file);
      });
      input.click();
    });
  }

  /* ------------------------------------------------------------- bridge */

  window.bridge = {
    categories: CATEGORIES,
    notes: {
      list: whenReady((f) => store.listNotes(f || {})),
      get: whenReady((id) => store.getNote(id)),
      create: whenReady((input) => store.createNote(input || {})),
      update: whenReady((id, patch) => store.updateNote(id, patch || {})),
      remove: whenReady((id) => store.deleteNote(id)),
      link: whenReady((a, b) => store.linkNotes(a, b)),
      unlink: whenReady((a, b) => store.unlinkNotes(a, b)),
      randomRevisit: whenReady(() => store.randomRevisit()),
      tags: whenReady(() => store.getTags()),
      books: whenReady(() => store.getBooks()),
      stats: whenReady(() => store.getStats())
    },
    sessions: {
      list: whenReady(() => store.listSessions()),
      get: whenReady((id) => store.getSession(id)),
      create: whenReady((d) => store.createSession(d || {})),
      end: whenReady((id) => store.endSession(id)),
      resume: whenReady((id) => store.resumeSession(id)),
      remove: whenReady((id) => store.deleteSession(id)),
      active: whenReady(() => store.getActiveSession())
    },
    settings: {
      get: whenReady(() => store.getSettings()),
      update: whenReady((p) => store.updateSettings(p || {})),
      dataPath: () =>
        Promise.resolve('Stored in this browser, on this device. Nothing is sent anywhere.'),
      openDataFolder: () =>
        Promise.resolve({ error: 'This device keeps your writing in the browser, not a folder.' }),
      validateShortcut: () => Promise.resolve(true)
    },
    export: {
      notes: whenReady((payload) => exportNotes(payload || {})),
      pdf: whenReady((payload) => exportPdf(payload || {})),
      backup: whenReady(() => exportBackup()),
      restore: () => restoreBackup()
    },
    openWidget: () => Promise.resolve(true),
    quit: () => Promise.resolve(true)
  };

  // Nothing is lost when the tab or browser closes.
  window.addEventListener('pagehide', () => {
    if (store) store.flushAsync();
  });
})();
