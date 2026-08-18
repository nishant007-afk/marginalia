'use strict';

/* UMD wrapper: the same store logic runs in Electron (CommonJS) and in the
   browser (global MarginaliaStore) where persistence is injected via IO. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarginaliaStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Marginalia local store.
   *
   * A single versioned JSON document (`library.json`) holds everything: notes,
   * reading sessions, and settings. On disk, writes are atomic (temp file +
   * rename) and a rolling `.bak` copy is kept so a corrupt write can never
   * destroy writing. The document carries a schema version so future updates
   * can migrate safely.
   *
   * The module has no Electron dependency, which keeps it unit-testable in
   * plain Node, and persistence is injectable so the browser build can store
   * the same document in IndexedDB.
   */

  let fs = null;
  let path = null;
  try {
    fs = require('fs');
    path = require('path');
  } catch (_) {
    /* browser: no fs */
  }
  const webcrypto = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;

const SCHEMA_VERSION = 1;
const REVISIT_CATEGORIES = ['observe', 'image', 'connection', 'line'];

const DEFAULT_SETTINGS = {
  widget: { x: 0, y: null }, // y: null means "vertical middle of screen"
  alwaysOnTop: true,
  pinExpanded: false,
  autoCollapse: true,
  introShown: false,
  activeSessionId: null,
  shortcuts: {
    toggle: 'CommandOrControl+Shift+P',
    newObservation: 'CommandOrControl+Shift+O',
    newLine: 'CommandOrControl+Shift+L'
  }
};

function uid() {
  if (webcrypto && typeof webcrypto.randomUUID === 'function') return webcrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function nowISO() {
  return new Date().toISOString();
}

function cleanString(value, max = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const t of tags) {
    const s = String(t).trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function normalizeNote(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    category: typeof r.category === 'string' && r.category ? r.category : 'observe',
    title: cleanString(r.title, 500),
    content: typeof r.content === 'string' ? r.content : '',
    book: cleanString(r.book, 500),
    author: cleanString(r.author, 500),
    page: cleanString(r.page, 200),
    date: cleanString(r.date, 200),
    tags: cleanTags(r.tags),
    sessionId: typeof r.sessionId === 'string' && r.sessionId ? r.sessionId : null,
    links: Array.isArray(r.links) ? [...new Set(r.links.filter((l) => typeof l === 'string' && l))] : [],
    createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : nowISO(),
    updatedAt: typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : nowISO()
  };
}

function normalizeSession(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    book: cleanString(r.book, 500),
    author: cleanString(r.author, 500),
    chapter: cleanString(r.chapter, 500),
    pageRange: cleanString(r.pageRange, 200),
    startedAt: typeof r.startedAt === 'string' && r.startedAt ? r.startedAt : nowISO(),
    endedAt: typeof r.endedAt === 'string' && r.endedAt ? r.endedAt : null,
    createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : nowISO(),
    updatedAt: typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : nowISO()
  };
}

function mergeSettings(existing) {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!existing || typeof existing !== 'object') return base;
  const out = { ...base, ...existing };
  out.widget = { ...base.widget, ...(existing.widget || {}) };
  out.shortcuts = { ...base.shortcuts, ...(existing.shortcuts || {}) };
  return out;
}

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    notes: [],
    sessions: [],
    settings: mergeSettings(null)
  };
}

/**
 * Migration entry point. `raw` is whatever was on disk. Future versions add
 * a step here that transforms the document and bumps SCHEMA_VERSION.
 */
function migrate(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};
  let version = typeof state.version === 'number' ? state.version : 0;

  // (No migrations yet beyond v1; add `while (version < SCHEMA_VERSION)` steps here.)

  state.version = SCHEMA_VERSION;
  state.notes = Array.isArray(state.notes) ? state.notes.map(normalizeNote) : [];
  state.sessions = Array.isArray(state.sessions) ? state.sessions.map(normalizeSession) : [];
  state.settings = mergeSettings(state.settings);
  return state;
}

/**
 * Default filesystem IO. Storage lives in a JSON document written atomically
 * (temp file + rename) with a rolling `.bak` copy.
 */
const defaultFsIo = fs
  ? {
  async: false,
  ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
  },
  read(file) {
    return fs.readFileSync(file, 'utf8');
  },
  writeAtomic(file, json) {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
    try {
      fs.copyFileSync(file, `${file}.bak`);
    } catch (_) {
      /* backup is best-effort */
    }
  }
  }
  : null;

class Store {
  /**
   * @param {string} dataDir directory for the library file (filesystem IO)
   * @param {object} [io] injectable IO (used by the browser build).
   *   Must provide ensureDir(dir), read(file), writeAtomic(file, json);
   *   set io.async = true when methods return promises.
   */
  constructor(dataDir, io) {
    this.dataDir = dataDir;
    this.file = path ? path.join(dataDir, 'library.json') : `${dataDir}/library.json`;
    this.io = io || defaultFsIo;
    this.state = emptyState();
    this._timer = null;
  }

  load() {
    if (!this.io) throw new Error('No IO provided to Store.');
    if (this.io.async) throw new Error('Use loadAsync() with async IO.');
    this.io.ensureDir(this.dataDir);
    this.state = this._readState();
    return this;
  }

  async loadAsync() {
    await this.io.ensureDir(this.dataDir);
    let raw = null;
    try {
      raw = JSON.parse(await this.io.read(this.file));
    } catch (_) {
      raw = null;
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.notes)) {
      // Main file missing or corrupt: try the rolling backup.
      try {
        raw = JSON.parse(await this.io.read(`${this.file}.bak`));
      } catch (_) {
        raw = null;
      }
    }
    this.state = raw ? migrate(raw) : emptyState();
    return this;
  }

  _readState() {
    let raw = null;
    try {
      raw = JSON.parse(this.io.read(this.file));
    } catch (_) {
      raw = null;
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.notes)) {
      // Main file missing or corrupt: try the rolling backup.
      try {
        raw = JSON.parse(this.io.read(`${this.file}.bak`));
      } catch (_) {
        raw = null;
      }
    }
    return raw ? migrate(raw) : emptyState();
  }

  /** Debounced persist. */
  persist() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if (this.io.async) this.flushAsync();
      else this.flushNow();
    }, 250);
  }

  /** Immediate, synchronous, atomic write + rolling backup. */
  flushNow() {
    clearTimeout(this._timer);
    this.io.writeAtomic(this.file, JSON.stringify(this.state, null, 2));
  }

  /** Immediate async write (used by browser/IndexedDB storage). */
  async flushAsync() {
    clearTimeout(this._timer);
    await this.io.writeAtomic(this.file, JSON.stringify(this.state, null, 2));
  }

  // ---------------------------------------------------------------- notes

  listNotes(filters = {}) {
    let notes = this.state.notes.slice();
    if (filters.category) {
      notes = notes.filter((n) => n.category === filters.category);
    }
    if (filters.book) {
      notes = notes.filter((n) => n.book === filters.book);
    }
    if (filters.tag) {
      notes = notes.filter((n) => n.tags.includes(filters.tag));
    }
    if (filters.sessionId) {
      notes = notes.filter((n) => n.sessionId === filters.sessionId);
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      notes = notes.filter((n) =>
        n.content.toLowerCase().includes(q) ||
        n.title.toLowerCase().includes(q) ||
        n.book.toLowerCase().includes(q) ||
        n.author.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    const dir = filters.sort === 'oldest' ? 1 : -1;
    const field = filters.sort === 'created' ? 'createdAt' : 'updatedAt';
    notes.sort((a, b) => (a[field] < b[field] ? -dir : a[field] > b[field] ? dir : 0));
    if (filters.limit && filters.limit > 0) {
      notes = notes.slice(0, filters.limit);
    }
    return notes;
  }

  getNote(id) {
    return this.state.notes.find((n) => n.id === id) || null;
  }

  createNote(input = {}) {
    const note = normalizeNote(input);
    // Auto-associate with the active reading session.
    const active = this.state.settings.activeSessionId;
    if (active && !note.sessionId) {
      const session = this.state.sessions.find((s) => s.id === active);
      if (session) note.sessionId = session.id;
    }
    this.state.notes.push(note);
    this.persist();
    return note;
  }

  updateNote(id, patch = {}) {
    const note = this.state.notes.find((n) => n.id === id);
    if (!note) return null;
    const merged = normalizeNote({ ...note, ...patch, id: note.id });
    merged.updatedAt = nowISO();
    const idx = this.state.notes.indexOf(note);
    this.state.notes[idx] = merged;
    this.persist();
    return merged;
  }

  deleteNote(id) {
    this.state.notes = this.state.notes.filter((n) => n.id !== id);
    // Remove dangling references from other notes' link lists.
    for (const n of this.state.notes) {
      if (n.links.includes(id)) {
        n.links = n.links.filter((l) => l !== id);
        n.updatedAt = nowISO();
      }
    }
    this.persist();
    return true;
  }

  linkNotes(aId, bId) {
    if (aId === bId) return false;
    const a = this.getNote(aId);
    const b = this.getNote(bId);
    if (!a || !b) return false;
    if (!a.links.includes(bId)) a.links.push(bId);
    if (!b.links.includes(aId)) b.links.push(aId);
    a.updatedAt = nowISO();
    b.updatedAt = nowISO();
    this.persist();
    return true;
  }

  unlinkNotes(aId, bId) {
    const a = this.getNote(aId);
    const b = this.getNote(bId);
    if (!a || !b) return false;
    a.links = a.links.filter((l) => l !== bId);
    b.links = b.links.filter((l) => l !== aId);
    a.updatedAt = nowISO();
    b.updatedAt = nowISO();
    this.persist();
    return true;
  }

  /** "Give me something to revisit": a random old observation/image/connection/line. */
  randomRevisit() {
    const pool = this.state.notes.filter((n) => REVISIT_CATEGORIES.includes(n.category) && n.content.trim());
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getTags() {
    const counts = new Map();
    for (const n of this.state.notes) {
      for (const t of n.tags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  getBooks() {
    const map = new Map();
    for (const n of this.state.notes) {
      if (!n.book) continue;
      const key = n.book;
      if (!map.has(key)) {
        map.set(key, { book: n.book, author: n.author, count: 0, lastUpdated: n.updatedAt });
      }
      const entry = map.get(key);
      entry.count += 1;
      if (n.updatedAt > entry.lastUpdated) entry.lastUpdated = n.updatedAt;
    }
    return [...map.values()].sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
  }

  getStats() {
    const counts = {};
    for (const n of this.state.notes) counts[n.category] = (counts[n.category] || 0) + 1;
    return { total: this.state.notes.length, byCategory: counts };
  }

  // ------------------------------------------------------------- sessions

  listSessions() {
    return this.state.sessions.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  getSession(id) {
    const session = this.state.sessions.find((s) => s.id === id) || null;
    if (!session) return null;
    const notes = this.state.notes
      .filter((n) => n.sessionId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { session, notes };
  }

  createSession(data = {}) {
    const session = normalizeSession(data);
    this.state.sessions.push(session);
    this.state.settings.activeSessionId = session.id;
    this.persist();
    return session;
  }

  updateSession(id, patch = {}) {
    const session = this.state.sessions.find((s) => s.id === id);
    if (!session) return null;
    const merged = normalizeSession({ ...session, ...patch, id: session.id });
    merged.updatedAt = nowISO();
    const idx = this.state.sessions.indexOf(session);
    this.state.sessions[idx] = merged;
    this.persist();
    return merged;
  }

  endSession(id) {
    const session = this.state.sessions.find((s) => s.id === id);
    if (!session) return null;
    session.endedAt = nowISO();
    session.updatedAt = nowISO();
    if (this.state.settings.activeSessionId === id) {
      this.state.settings.activeSessionId = null;
    }
    this.persist();
    return session;
  }

  resumeSession(id) {
    if (!this.state.sessions.find((s) => s.id === id)) return false;
    this.state.settings.activeSessionId = id;
    this.persist();
    return true;
  }

  deleteSession(id) {
    this.state.sessions = this.state.sessions.filter((s) => s.id !== id);
    if (this.state.settings.activeSessionId === id) {
      this.state.settings.activeSessionId = null;
    }
    // Detach its notes but keep them. The writing is the user's.
    for (const n of this.state.notes) {
      if (n.sessionId === id) n.sessionId = null;
    }
    this.persist();
    return true;
  }

  getActiveSession() {
    const id = this.state.settings.activeSessionId;
    if (!id) return null;
    return this.state.sessions.find((s) => s.id === id) || null;
  }

  // ------------------------------------------------------------- settings

  getSettings() {
    return this.state.settings;
  }

  updateSettings(patch = {}) {
    this.state.settings = mergeSettings({ ...this.state.settings, ...patch });
    this.persist();
    return this.state.settings;
  }

  // ---------------------------------------------------- export / backup

  /** Deep snapshot of everything, ready to serialize. */
  exportAll() {
    return {
      app: 'marginalia',
      type: 'library',
      version: SCHEMA_VERSION,
      exportedAt: nowISO(),
      data: {
        notes: this.state.notes.map((n) => ({ ...n })),
        sessions: this.state.sessions.map((s) => ({ ...s })),
        settings: this.state.settings
      }
    };
  }

  /**
   * Replace the entire library from a backup payload.
   * Returns { ok, notes, sessions } or throws on invalid input.
   */
  importAll(payload) {
    if (!payload || payload.app !== 'marginalia' || payload.type !== 'library') {
      throw new Error('Not a Marginalia backup file.');
    }
    const data = payload.data || {};
    const notes = Array.isArray(data.notes) ? data.notes : [];
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    if (!notes.length && !sessions.length) {
      throw new Error('Backup contains no notes.');
    }
    this.state = migrate({
      version: SCHEMA_VERSION,
      notes,
      sessions,
      settings: data.settings || {}
    });
    this.persist();
    return { ok: true, notes: this.state.notes.length, sessions: this.state.sessions.length };
  }
}

  return { Store, migrate, normalizeNote, SCHEMA_VERSION, DEFAULT_SETTINGS, defaultFsIo };
});
