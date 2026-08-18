'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Store } = require('../src/main/store.js');

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marginalia-test-'));
  return new Store(dir).load();
}

test('createNote adds automatic timestamps and defaults', () => {
  const store = tmpStore();
  const note = store.createNote({ content: 'A man keeps checking the clock.' });
  assert.ok(note.id);
  assert.equal(note.category, 'observe');
  assert.ok(note.createdAt);
  assert.ok(note.updatedAt);
  assert.ok(note.updatedAt >= note.createdAt);
  assert.equal(store.getStats().total, 1);
});

test('updateNote changes content and bumps updatedAt', async () => {
  const store = tmpStore();
  const note = store.createNote({ content: 'first' });
  await new Promise((r) => setTimeout(r, 20));
  const updated = store.updateNote(note.id, { content: 'second', title: 'T' });
  assert.equal(updated.content, 'second');
  assert.equal(updated.title, 'T');
  assert.ok(updated.updatedAt > note.updatedAt);
});

test('search matches content, title, book, author, and tags', () => {
  const store = tmpStore();
  store.createNote({ content: 'A dog sleeping under a motorcycle.', tags: ['rain'] });
  store.createNote({ content: 'evening walk', title: 'The Shop', book: 'Devotions', author: 'Mary Oliver' });
  store.createNote({ content: 'other', tags: ['loneliness'] });

  assert.equal(store.listNotes({ query: 'dog' }).length, 1);
  assert.equal(store.listNotes({ query: 'shop' }).length, 1);
  assert.equal(store.listNotes({ query: 'devotions' }).length, 1);
  assert.equal(store.listNotes({ query: 'mary' }).length, 1);
  assert.equal(store.listNotes({ query: 'rain' }).length, 1);
  assert.equal(store.listNotes({ query: 'LONE' }).length, 1); // case-insensitive
  assert.equal(store.listNotes({ query: 'zzz' }).length, 0);
});

test('linking is bidirectional and survives deletion cleanup', () => {
  const store = tmpStore();
  const a = store.createNote({ content: 'A dog sleeping under a motorcycle.' });
  const b = store.createNote({ content: 'Everyone searches for somewhere safe.' });
  const c = store.createNote({ content: 'Even the stray knows where to hide from the rain.' });

  assert.equal(store.linkNotes(a.id, b.id), true);
  assert.equal(store.linkNotes(a.id, a.id), false);
  assert.ok(store.getNote(a.id).links.includes(b.id));
  assert.ok(store.getNote(b.id).links.includes(a.id));

  store.deleteNote(b.id);
  assert.ok(!store.getNote(a.id).links.includes(b.id));
  assert.ok(store.getNote(c.id).links.length === 0);

  assert.equal(store.linkNotes(a.id, c.id), true);
  store.unlinkNotes(a.id, c.id);
  assert.ok(!store.getNote(a.id).links.includes(c.id));
});

test('sessions: active session auto-associates notes, end clears it', () => {
  const store = tmpStore();
  const session = store.createSession({ book: 'Devotions', author: 'Mary Oliver' });
  assert.equal(store.getActiveSession().id, session.id);

  const n1 = store.createNote({ content: 'observation during session' });
  const n2 = store.createNote({ content: 'another' });
  assert.equal(n1.sessionId, session.id);
  assert.equal(n2.sessionId, session.id);

  store.endSession(session.id);
  assert.equal(store.getActiveSession(), null);
  assert.ok(store.getSession(session.id).session.endedAt);

  const n3 = store.createNote({ content: 'after session' });
  assert.equal(n3.sessionId, null);

  // resume puts new notes back into the session
  store.resumeSession(session.id);
  const n4 = store.createNote({ content: 'resumed' });
  assert.equal(n4.sessionId, session.id);
});

test('session notes are counted per category', () => {
  const store = tmpStore();
  const session = store.createSession({ book: 'B' });
  store.createNote({ content: '1', category: 'observe' });
  store.createNote({ content: '2', category: 'observe' });
  store.createNote({ content: '3', category: 'image' });
  const { session: s, notes } = store.getSession(session.id);
  assert.equal(notes.length, 3);
  assert.ok(s.startedAt);
});

test('tags are collected with counts and deduplicated', () => {
  const store = tmpStore();
  store.createNote({ content: 'a', tags: ['rain', 'rain', ' time '] });
  store.createNote({ content: 'b', tags: ['rain', 'memory'] });
  const tags = store.getTags();
  const byTag = Object.fromEntries(tags.map((t) => [t.tag, t.count]));
  assert.equal(byTag.rain, 2);
  assert.equal(byTag.time, 1);
  assert.equal(byTag.memory, 1);
  assert.equal(tags.length, 3);
});

test('books are grouped with counts', () => {
  const store = tmpStore();
  store.createNote({ content: 'a', book: 'Devotions', author: 'Mary Oliver' });
  store.createNote({ content: 'b', book: 'Devotions', author: 'Mary Oliver' });
  store.createNote({ content: 'c', book: 'Other', author: 'X' });
  const books = store.getBooks();
  assert.equal(books.length, 2);
  assert.equal(books.find((b) => b.book === 'Devotions').count, 2);
});

test('randomRevisit only returns revisit categories', () => {
  const store = tmpStore();
  store.createNote({ content: 'poem', category: 'poem' });
  store.createNote({ content: 'draft', category: 'draft' });
  assert.equal(store.randomRevisit(), null);
  store.createNote({ content: 'observe me', category: 'observe' });
  store.createNote({ content: 'line me', category: 'line' });
  for (let i = 0; i < 20; i++) {
    const n = store.randomRevisit();
    assert.ok(['observe', 'image', 'connection', 'feeling', 'idea', 'line'].includes(n.category));
  }
});

test('exportAll / importAll round-trips the library', () => {
  const store = tmpStore();
  const s = store.createSession({ book: 'Devotions' });
  const a = store.createNote({ content: 'first note', tags: ['rain'] });
  const b = store.createNote({ content: 'second note' });
  store.linkNotes(a.id, b.id);
  assert.equal(a.sessionId, s.id);

  const payload = store.exportAll();
  const store2 = tmpStore();
  const res = store2.importAll(payload);
  assert.equal(res.notes, 2);
  assert.equal(res.sessions, 1);
  assert.equal(store2.getNote(a.id).content, 'first note');
  assert.equal(store2.getNote(a.id).sessionId, s.id);
  assert.ok(store2.getNote(a.id).links.includes(b.id));
  assert.equal(store2.getTags()[0].tag, 'rain');
});

test('importAll rejects non-backup payloads', () => {
  const store = tmpStore();
  assert.throws(() => store.importAll({ foo: 1 }), /Not a Marginalia backup/);
  assert.throws(() => store.importAll({ app: 'marginalia', type: 'library', data: { notes: [] } }), /no notes/);
});

test('persistence across instances and atomic file + backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marginalia-test-'));
  const store = new Store(dir).load();
  store.createNote({ content: 'survives restart' });
  store.flushNow();

  const again = new Store(dir).load();
  assert.equal(again.getStats().total, 1);
  assert.equal(again.listNotes()[0].content, 'survives restart');
  assert.ok(fs.existsSync(path.join(dir, 'library.json')));
  assert.ok(fs.existsSync(path.join(dir, 'library.json.bak')));
});

test('corrupt main file falls back to backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marginalia-test-'));
  const store = new Store(dir).load();
  store.createNote({ content: 'precious writing' });
  store.flushNow();

  fs.writeFileSync(path.join(dir, 'library.json'), '{not json!!!', 'utf8');

  const recovered = new Store(dir).load();
  assert.equal(recovered.listNotes()[0].content, 'precious writing');
});

test('settings merge and update', () => {
  const store = tmpStore();
  const s1 = store.updateSettings({ pinExpanded: true, widget: { y: 240 } });
  assert.equal(s1.pinExpanded, true);
  assert.equal(s1.widget.y, 240);
  assert.equal(s1.alwaysOnTop, true); // untouched default preserved
  const s2 = store.updateSettings({ shortcuts: { newLine: 'Ctrl+Alt+L' } });
  assert.equal(s2.shortcuts.newLine, 'Ctrl+Alt+L');
  assert.equal(s2.shortcuts.toggle, 'CommandOrControl+Shift+P');
});

test('multi-language unicode content is preserved exactly', () => {
  const store = tmpStore();
  const content = 'The rain feels different today.\nआज किन हो किन मन अलि भारी छ।\nशायद इसलिए कि मैंने इसे पहले भी महसूस किया है。雨の音';
  const note = store.createNote({ content, category: 'feeling' });
  store.flushNow();
  const again = new Store(path.dirname(store.file)).load();
  assert.equal(again.getNote(note.id).content, content);
});
