'use strict';

/* ================================================================ helpers */

const bridge = window.api;
const cats = bridge.categories;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function noteTitle(n) {
  if (n.title) return n.title;
  const first = (n.content || '').split('\n').map((l) => l.trim()).find(Boolean);
  if (first) return first.length > 60 ? first.slice(0, 60) + '…' : first;
  return 'Untitled';
}

function notePreview(n) {
  const withoutFirst = (n.content || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(1);
  const rest = withoutFirst.join(' ');
  if (rest) return rest.length > 160 ? rest.slice(0, 160) + '…' : rest;
  return '';
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ================================================================== state */

const state = {
  view: 'all',
  filters: { category: 'all', query: '', sort: 'recent' },
  listScroll: 0,
  editingId: null,
  dirty: false,
  settings: null,
  activeSession: null,
  booksSub: null, // {book} when browsing a book's notes
  tagSub: null    // {tag} when browsing a tag's notes
};

/* ============================================================ view switch */

function switchView(name) {
  state.view = name;
  state.booksSub = null;
  state.tagSub = null;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  closeEditor();
  if (name === 'all') renderAll();
  else if (name === 'review') renderReview();
  else if (name === 'sessions') renderSessions();
  else if (name === 'books') renderBooks();
  else if (name === 'tags') renderTags();
  else if (name === 'settings') renderSettings();
}

$$('.nav-item').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

/* ============================================================ all / list */

function renderFilterChips() {
  const chips = $('#filter-chips');
  chips.innerHTML = '';
  const add = (key, label) => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.filters.category === key ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      state.filters.category = key;
      renderFilterChips();
      loadNotes();
    });
    chips.appendChild(b);
  };
  add('all', 'All');
  for (const [key, c] of Object.entries(cats)) add(key, c.label);
}

function makeNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card' + (state.editingId === note.id ? ' active' : '');
  card.dataset.id = note.id;

  const title = esc(noteTitle(note));
  const preview = esc(notePreview(note));
  const catLabel = (cats[note.category] && cats[note.category].label) || note.category;
  const metaParts = [];
  if (note.book) metaParts.push(esc(note.book));
  if (note.author) metaParts.push(esc(note.author));
  const tags = note.tags.map((t) => `<span class="tag-mini">${esc(t)}</span>`).join('');

  card.innerHTML = `
    <div class="note-card-top">
      <span class="cat-chip">${esc(catLabel)}</span>
      <span class="note-card-title">${title}</span>
    </div>
    ${preview ? `<div class="note-card-preview">${preview}</div>` : ''}
    <div class="note-card-meta">
      ${metaParts.length ? `<span>${metaParts.join(' · ')}</span>` : ''}
      <span>${fmtDate(note.updatedAt)}</span>
      ${tags ? `<span class="note-card-tags">${tags}</span>` : ''}
    </div>`;
  card.addEventListener('click', () => {
    if (state.view !== 'all') switchView('all');
    openEditor(note.id);
  });
  return card;
}

async function loadNotes() {
  const list = $('#note-list');
  const savedScroll = list.scrollTop;
  const notes = await bridge.notes.list({
    category: state.filters.category === 'all' ? undefined : state.filters.category,
    query: state.filters.query || undefined,
    sort: state.filters.sort
  });
  list.innerHTML = '';
  if (!notes.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = state.filters.query
      ? 'Nothing matches your search.'
      : 'Nothing here yet. Click the pen, or press Ctrl+Shift+P.';
    list.appendChild(empty);
  } else {
    for (const n of notes) list.appendChild(makeNoteCard(n));
  }
  list.scrollTop = savedScroll;
  state.listScroll = savedScroll;
}

async function renderAll() {
  renderFilterChips();
  await loadNotes();
}

$('#search').addEventListener('input', (e) => {
  state.filters.query = e.target.value.trim();
  loadNotes();
});
$('#sort').addEventListener('change', (e) => {
  state.filters.sort = e.target.value;
  loadNotes();
});

/* ================================================================= editor */

const editorEl = () => $('#editor');
const saveStatus = $('#save-status');
let saveTimer = null;

function setSaveStatus(text, cls) {
  saveStatus.textContent = text;
  saveStatus.className = 'save-status' + (cls ? ` ${cls}` : '');
}

function editorPatch() {
  const tags = $('#editor-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
  return {
    category: $('#editor-category').value,
    title: $('#editor-title').value.trim(),
    content: $('#editor-content').value,
    book: $('#editor-book').value.trim(),
    author: $('#editor-author').value.trim(),
    page: $('#editor-page').value.trim(),
    date: $('#editor-date').value.trim(),
    tags
  };
}

async function saveEditor(showStatus = true) {
  if (!state.editingId) return;
  if (showStatus) setSaveStatus('Saving…', 'saving');
  const patch = editorPatch();
  await bridge.notes.update(state.editingId, patch);
  state.dirty = false;
  if (showStatus) {
    setSaveStatus('Saved', 'saved');
    setTimeout(() => setSaveStatus('', ''), 1600);
  }
  refreshSidebar();
  loadNotes();
  renderLinked();
}

function scheduleSave() {
  state.dirty = true;
  setSaveStatus('Editing…', 'saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveEditor(), 700);
}

['editor-title', 'editor-content', 'editor-book', 'editor-author', 'editor-page', 'editor-date', 'editor-tags']
  .forEach((id) => $(`#${id}`).addEventListener('input', scheduleSave));

$('#editor-category').addEventListener('change', scheduleSave);

async function openEditor(id) {
  const note = await bridge.notes.get(id);
  if (!note) return;
  state.editingId = id;

  // category select options
  const sel = $('#editor-category');
  sel.innerHTML = '';
  for (const [key, c] of Object.entries(cats)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = c.label;
    sel.appendChild(opt);
  }
  sel.value = note.category;

  $('#editor-title').value = note.title || '';
  $('#editor-content').value = note.content;
  $('#editor-book').value = note.book || '';
  $('#editor-author').value = note.author || '';
  $('#editor-page').value = note.page || '';
  $('#editor-date').value = note.date || '';
  $('#editor-tags').value = note.tags.join(', ');
  $('#editor-timestamps').textContent = `Created ${fmtDateTime(note.createdAt)} · Modified ${fmtDateTime(note.updatedAt)}`;

  editorEl().hidden = false;
  // keep list visible on wide screens; it sits beside the editor
  setSaveStatus('', '');
  state.dirty = false;
  await renderLinked();
  updateActiveCards();
}

function closeEditor() {
  if (state.editingId && state.dirty) {
    saveEditor(false); // fire and forget before switching away
  }
  state.editingId = null;
  editorEl().hidden = true;
  $('#export-menu').hidden = true;
}

function updateActiveCards() {
  $$('.note-card').forEach((c) => c.classList.toggle('active', c.dataset.id === state.editingId));
}

$('#btn-back').addEventListener('click', closeEditor);

$('#btn-new-note').addEventListener('click', async () => {
  const note = await bridge.notes.create({ category: 'observe', content: '' });
  switchView('all');
  openEditor(note.id);
  $('#editor-title').focus();
});

/* ------------------------------------------------------------ editor: delete */

let deleteArmed = false;
$('#btn-delete').addEventListener('click', async () => {
  if (!state.editingId) return;
  if (!deleteArmed) {
    deleteArmed = true;
    const btn = $('#btn-delete');
    btn.textContent = 'Confirm?';
    setTimeout(() => {
      btn.textContent = 'Delete';
      deleteArmed = false;
    }, 3000);
    return;
  }
  const id = state.editingId;
  await bridge.notes.remove(id);
  closeEditor();
  toast('Note deleted');
  refreshSidebar();
  loadNotes();
});

/* -------------------------------------------------------------- export menu */

$('#btn-export-note').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#export-menu').hidden = !$('#export-menu').hidden;
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#export-wrap')) $('#export-menu').hidden = true;
});

$('#export-menu').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || !state.editingId) return;
  $('#export-menu').hidden = true;
  const format = btn.dataset.format;
  const res =
    format === 'pdf'
      ? await bridge.export.pdf({ ids: [state.editingId] })
      : await bridge.export.notes({ ids: [state.editingId], format });
  if (!res.canceled) toast(res.error || 'Exported');
});

/* ------------------------------------------------------------------ links */

async function renderLinked() {
  const box = $('#linked-list');
  box.innerHTML = '';
  if (!state.editingId) return;
  const note = await bridge.notes.get(state.editingId);
  if (!note) return;
  for (const linkedId of note.links) {
    const other = await bridge.notes.get(linkedId);
    if (!other) continue;
    const chip = document.createElement('span');
    chip.className = 'link-chip';
    chip.innerHTML = `${esc(noteTitle(other))} <span class="x" title="Unlink">×</span>`;
    chip.addEventListener('click', () => openEditor(other.id));
    chip.querySelector('.x').addEventListener('click', async (e) => {
      e.stopPropagation();
      await bridge.notes.unlink(state.editingId, other.id);
      renderLinked();
      loadNotes();
    });
    box.appendChild(chip);
  }
}

let linkSearchTimer = null;
$('#link-search').addEventListener('input', (e) => {
  clearTimeout(linkSearchTimer);
  const q = e.target.value.trim();
  const results = $('#link-results');
  if (!q) { results.hidden = true; return; }
  linkSearchTimer = setTimeout(async () => {
    const note = state.editingId ? await bridge.notes.get(state.editingId) : null;
    const found = await bridge.notes.list({ query: q });
    const candidates = found.filter((n) => n.id !== state.editingId && !(note && note.links.includes(n.id)));
    results.innerHTML = '';
    if (!candidates.length) {
      const d = document.createElement('div');
      d.className = 'empty-state';
      d.textContent = 'No notes match.';
      results.appendChild(d);
    } else {
      for (const c of candidates.slice(0, 12)) {
        const b = document.createElement('button');
        b.textContent = `${noteTitle(c)} · ${(cats[c.category] && cats[c.category].label) || c.category}`;
        b.addEventListener('click', async () => {
          await bridge.notes.link(state.editingId, c.id);
          $('#link-search').value = '';
          results.hidden = true;
          renderLinked();
          loadNotes();
          toast('Notes linked');
        });
        results.appendChild(b);
      }
    }
    results.hidden = false;
  }, 250);
});

/* ================================================================= review */

function rangeStart(range) {
  const now = new Date();
  if (range === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === 'week') return new Date(now.getTime() - 7 * 86400000);
  if (range === 'month') return new Date(now.getTime() - 30 * 86400000);
  return null; // older
}

async function renderReview() {
  const chips = $$('#review-filters .chip');
  if (!chips.some((c) => c.classList.contains('active'))) chips[0].classList.add('active');
  const activeRange = $('#review-filters .chip.active');
  const range = activeRange ? activeRange.dataset.range : 'today';
  const all = await bridge.notes.list({});
  const start = rangeStart(range);
  const filtered = range === 'older'
    ? all.filter((n) => new Date(n.createdAt) < rangeStart('month'))
    : all.filter((n) => new Date(n.createdAt) >= start);
  const list = $('#review-list');
  list.innerHTML = '';
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = range === 'older' ? 'Nothing older than a month yet.' : `Nothing from ${range === 'today' ? 'today' : 'this ' + range} yet.`;
    list.appendChild(empty);
    return;
  }
  for (const n of filtered) list.appendChild(makeNoteCard(n));
}

$('#review-filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $$('#review-filters .chip').forEach((c) => c.classList.toggle('active', c === chip));
  renderReview();
});

let revisitNote = null;
$('#btn-revisit').addEventListener('click', async () => {
  revisitNote = await bridge.notes.randomRevisit();
  const body = $('#revisit-body');
  const meta = $('.revisit-meta');
  if (!revisitNote) {
    body.textContent = 'No observations, images, connections, or lines yet. Capture a few first, and they will come back to you.';
    $('#btn-revisit-open').hidden = true;
    meta && meta.remove();
    return;
  }
  body.textContent = revisitNote.content;
  const cat = (cats[revisitNote.category] && cats[revisitNote.category].label) || revisitNote.category;
  const m = document.createElement('div');
  m.className = 'revisit-meta';
  m.textContent = `${cat} · ${fmtDateTime(revisitNote.createdAt)}${revisitNote.book ? ` · ${revisitNote.book}` : ''}`;
  const old = $('.revisit-meta');
  if (old) old.remove();
  body.after(m);
  $('#btn-revisit-open').hidden = false;
});

$('#btn-revisit-open').addEventListener('click', () => {
  if (!revisitNote) return;
  switchView('all');
  openEditor(revisitNote.id);
});

/* =============================================================== sessions */

function countsHtml(notes) {
  const counts = {};
  for (const n of notes) counts[n.category] = (counts[n.category] || 0) + 1;
  return Object.entries(counts)
    .map(([k, v]) => `<span class="count-chip">${(cats[k] && cats[k].label) || k}: ${v}</span>`)
    .join('');
}

async function renderSessions() {
  const sessions = await bridge.sessions.list();
  const list = $('#session-list');
  list.innerHTML = '';
  if (!sessions.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No reading sessions yet. Start one while you read.';
    list.appendChild(empty);
    return;
  }
  for (const s of sessions) {
    const { notes } = await bridge.sessions.get(s.id);
    const item = document.createElement('div');
    item.className = 'session-item';
    const chapter = s.chapter ? ` · ${esc(s.chapter)}` : '';
    const pages = s.pageRange ? ` · pp. ${esc(s.pageRange)}` : '';
    item.innerHTML = `
      <div class="session-item-head">
        <span class="session-book">${esc(s.book || 'Untitled session')}</span>
        ${s.author ? `<span class="session-author">${esc(s.author)}</span>` : ''}
        <span class="session-date">${fmtDate(s.startedAt)}${s.endedAt ? ' · ended' : ' · ongoing'}</span>
      </div>
      <div class="session-sub">${esc(chapter + pages || '')}${s.endedAt ? ` Ended ${fmtDateTime(s.endedAt)}` : ''}</div>
      <div class="session-counts">${countsHtml(notes)}<span class="count-chip">total: ${notes.length}</span></div>
      <div class="session-actions">
        ${state.activeSession && state.activeSession.id === s.id
          ? `<button class="ghost small" data-act="end">End session</button>`
          : `<button class="ghost small" data-act="resume">Resume</button>`}
        <button class="ghost small" data-act="export">Export…</button>
        ${s.endedAt ? `<button class="danger small" data-act="delete">Delete</button>` : ''}
      </div>
      <div class="session-notes"></div>`;

    const notesBox = item.querySelector('.session-notes');
    if (notes.length) {
      const toggle = document.createElement('button');
      toggle.className = 'ghost small';
      toggle.textContent = 'Show notes';
      item.querySelector('.session-actions').appendChild(toggle);
      toggle.addEventListener('click', () => {
        if (notesBox.children.length) {
          notesBox.innerHTML = '';
          toggle.textContent = 'Show notes';
          return;
        }
        notesBox.innerHTML = '';
        for (const n of notes) notesBox.appendChild(makeNoteCard(n));
        toggle.textContent = 'Hide notes';
      });
    }

    item.querySelector('.session-actions').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'resume') {
        await bridge.sessions.resume(s.id);
        toast('Session resumed. New captures will attach to it.');
      } else if (act === 'end') {
        await bridge.sessions.end(s.id);
        toast('Session ended');
      } else if (act === 'delete') {
        await bridge.sessions.remove(s.id);
        toast('Session deleted (its notes were kept)');
      } else if (act === 'export') {
        await exportSession(s.id);
        return;
      }
      refreshSidebar();
      renderSessions();
    });

    list.appendChild(item);
  }
}

async function exportSession(id) {
  // small inline menu reusing the export formats
  const formats = [
    ['txt', 'Plain text (.txt)'],
    ['md', 'Markdown (.md)'],
    ['json', 'JSON (.json)'],
    ['pdf', 'PDF (.pdf)']
  ];
  const chosen = await pickFormat(formats);
  if (!chosen) return;
  const res = chosen === 'pdf'
    ? await bridge.export.pdf({ sessionId: id })
    : await bridge.export.notes({ sessionId: id, format: chosen });
  if (!res.canceled) toast(res.error || 'Exported');
}

/* ------------------------------------------------------------ session modal */

function openSessionModal() {
  $('#modal-session').hidden = false;
  $('#sess-book').focus();
}
function closeSessionModal() {
  $('#modal-session').hidden = true;
  ['sess-book', 'sess-author', 'sess-chapter', 'sess-pages'].forEach((id) => { $(`#${id}`).value = ''; });
}

$('#btn-start-session').addEventListener('click', openSessionModal);
$('#btn-start-session-2').addEventListener('click', openSessionModal);
$('#btn-session-cancel').addEventListener('click', closeSessionModal);

$('#btn-session-start').addEventListener('click', async () => {
  const data = {
    book: $('#sess-book').value.trim(),
    author: $('#sess-author').value.trim(),
    chapter: $('#sess-chapter').value.trim(),
    pageRange: $('#sess-pages').value.trim()
  };
  if (!data.book && !data.author) {
    toast('Give the session at least a book name');
    return;
  }
  await bridge.sessions.create(data);
  closeSessionModal();
  toast('Reading session started');
  refreshSidebar();
});

/* ================================================================== books */

async function renderBooks() {
  const box = $('#book-list');
  if (state.booksSub) {
    // showing notes of one book
    const back = document.createElement('button');
    back.className = 'ghost small';
    back.textContent = '← All books';
    back.addEventListener('click', () => { state.booksSub = null; renderBooks(); });
    box.innerHTML = '';
    box.appendChild(back);
    const notes = await bridge.notes.list({ book: state.booksSub.book });
    const sub = document.createElement('div');
    sub.className = 'note-list';
    sub.style.maxHeight = 'calc(100vh - 220px)';
    if (!notes.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No notes for this book.';
      sub.appendChild(empty);
    } else {
      for (const n of notes) sub.appendChild(makeNoteCard(n));
    }
    box.appendChild(sub);
    return;
  }
  const books = await bridge.notes.books();
  box.innerHTML = '';
  if (!books.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No notes with a book source yet.';
    box.appendChild(empty);
    return;
  }
  for (const b of books) {
    const item = document.createElement('div');
    item.className = 'book-item';
    item.innerHTML = `
      <div>
        <div class="book-name">${esc(b.book)}</div>
        ${b.author ? `<div class="book-author">${esc(b.author)}</div>` : ''}
      </div>
      <span class="book-count">${b.count} note${b.count === 1 ? '' : 's'}</span>`;
    item.addEventListener('click', () => { state.booksSub = { book: b.book }; renderBooks(); });
    box.appendChild(item);
  }
}

/* =================================================================== tags */

async function renderTags() {
  const box = $('#tag-list');
  if (state.tagSub) {
    const back = document.createElement('button');
    back.className = 'ghost small';
    back.textContent = '← All tags';
    back.addEventListener('click', () => { state.tagSub = null; renderTags(); });
    box.innerHTML = '';
    box.appendChild(back);
    const notes = await bridge.notes.list({ tag: state.tagSub.tag });
    const sub = document.createElement('div');
    sub.className = 'note-list';
    sub.style.maxHeight = 'calc(100vh - 220px)';
    if (!notes.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No notes with this tag.';
      sub.appendChild(empty);
    } else {
      for (const n of notes) sub.appendChild(makeNoteCard(n));
    }
    box.appendChild(sub);
    return;
  }
  const tags = await bridge.notes.tags();
  box.innerHTML = '';
  if (!tags.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No tags yet. Add tags to a note to organize by them.';
    box.appendChild(empty);
    return;
  }
  for (const { tag, count } of tags) {
    const item = document.createElement('button');
    item.className = 'tag-item';
    item.innerHTML = `${esc(tag)}<span class="count">${count}</span>`;
    item.addEventListener('click', () => { state.tagSub = { tag }; renderTags(); });
    box.appendChild(item);
  }
}

/* ================================================================ settings */

async function renderSettings() {
  const s = await bridge.settings.get();
  state.settings = s;
  $('#set-always-on-top').checked = !!s.alwaysOnTop;
  $('#set-pin').checked = !!s.pinExpanded;
  $('#set-auto-collapse').checked = !!s.autoCollapse;
  renderShortcutRows(s.shortcuts || {});
  $('#data-path').textContent = await bridge.settings.dataPath();
}

$('#set-always-on-top').addEventListener('change', (e) => bridge.settings.update({ alwaysOnTop: e.target.checked }));
$('#set-pin').addEventListener('change', (e) => bridge.settings.update({ pinExpanded: e.target.checked }));
$('#set-auto-collapse').addEventListener('change', (e) => bridge.settings.update({ autoCollapse: e.target.checked }));

/* shortcuts editor */
const SHORTCUT_KEYS = [
  ['toggle', 'Open / collapse widget'],
  ['newObservation', 'New observation'],
  ['newLine', 'New line']
];
let capturing = null;

function renderShortcutRows(shortcuts) {
  const box = $('#shortcut-rows');
  box.innerHTML = '';
  for (const [key, label] of SHORTCUT_KEYS) {
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    const accel = document.createElement('span');
    accel.className = 'accel';
    accel.textContent = shortcuts[key] || '· · ·';
    accel.title = 'Click to change';
    accel.addEventListener('click', () => startCapture(key, accel));
    row.innerHTML = `<span class="label">${label}</span>`;
    row.appendChild(accel);
    box.appendChild(row);
  }
}

function acceleratorFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  if (e.key && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  }
  return parts.join('+');
}

function startCapture(key, el) {
  if (capturing) endCapture();
  capturing = { key, el };
  el.classList.add('capturing');
  el.textContent = 'Press keys…';
  el.focus();
}

function endCapture() {
  if (!capturing) return;
  capturing.el.classList.remove('capturing');
  capturing = null;
}

document.addEventListener('keydown', async (e) => {
  if (!capturing) return;
  e.preventDefault();
  const accel = acceleratorFromEvent(e);
  if (!accel) return;
  const valid = await bridge.settings.validateShortcut(accel);
  const { key, el } = capturing;
  endCapture();
  if (!valid) {
    el.classList.add('bad');
    el.textContent = 'Unavailable';
    setTimeout(() => {
      el.classList.remove('bad');
      el.textContent = (state.settings.shortcuts && state.settings.shortcuts[key]) || '· · ·';
    }, 1800);
    return;
  }
  const shortcuts = { ...(state.settings.shortcuts || {}), [key]: accel };
  await bridge.settings.update({ shortcuts });
  state.settings = await bridge.settings.get();
  renderShortcutRows(state.settings.shortcuts || {});
  toast(`Shortcut updated: ${accel}`);
});

/* export / backup */
$('#btn-export-all-json').addEventListener('click', async () => {
  const res = await bridge.export.notes({ all: true, format: 'json' });
  if (!res.canceled) toast(res.error || 'Exported');
});
$('#btn-export-all-md').addEventListener('click', async () => {
  const res = await bridge.export.notes({ all: true, format: 'md' });
  if (!res.canceled) toast(res.error || 'Exported');
});
$('#btn-export-all-pdf').addEventListener('click', async () => {
  const res = await bridge.export.pdf({ all: true });
  if (!res.canceled) toast(res.error || 'Exported');
});
$('#btn-backup').addEventListener('click', async () => {
  const res = await bridge.export.backup();
  if (!res.canceled) toast('Backup created');
});
$('#btn-restore').addEventListener('click', async () => {
  const res = await bridge.export.restore();
  if (!res.canceled) {
    if (res.error) {
      toast(res.error);
      return;
    }
    toast(`Library restored (${res.notes} notes, ${res.sessions} sessions)`);
    state.activeSession = await bridge.sessions.active();
    refreshSidebar();
    switchView('all');
    renderSettings();
  }
});

$('#btn-open-data').addEventListener('click', async () => {
  const res = await bridge.settings.openDataFolder();
  if (res && res.error) toast(res.error);
});

$('#btn-replay-intro').addEventListener('click', () => showIntro(false));

/* ================================================================= sidebar */

async function refreshSidebar() {
  const s = await bridge.settings.get();
  state.activeSession = await bridge.sessions.active();
  const card = $('#active-session-card');
  if (state.activeSession) {
    $('#active-session-info').innerHTML =
      `<strong>${esc(state.activeSession.book || 'Session')}</strong>` +
      (state.activeSession.author ? `<br/>${esc(state.activeSession.author)}` : '');
    card.hidden = false;
  } else {
    card.hidden = true;
  }
  const stats = await bridge.notes.stats();
  const parts = [`${stats.total} note${stats.total === 1 ? '' : 's'}`];
  const withContent = ['draft', 'poem'].filter((k) => stats.byCategory[k]);
  if (withContent.length) {
    parts.push(withContent.map((k) => `${(cats[k] && cats[k].label) || k}: ${stats.byCategory[k]}`).join(' · '));
  }
  $('#sidebar-stats').textContent = parts.join(' · ');
}

$('#btn-end-session').addEventListener('click', async () => {
  if (!state.activeSession) return;
  await bridge.sessions.end(state.activeSession.id);
  toast('Session ended');
  refreshSidebar();
  if (state.view === 'sessions') renderSessions();
});

/* ================================================================== intro */

function showIntro(markSeen) {
  $('#modal-intro').hidden = false;
  $('#btn-intro-begin').onclick = async () => {
    $('#modal-intro').hidden = true;
    if (markSeen) await bridge.settings.update({ introShown: true });
  };
}

/* ================================================================ pickers */

function pickFormat(formats) {
  return new Promise((resolve) => {
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.style.position = 'fixed';
    menu.style.top = '50%';
    menu.style.left = '50%';
    menu.style.transform = 'translate(-50%, -50%)';
    for (const [fmt, label] of formats) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { cleanup(); resolve(fmt); });
      menu.appendChild(b);
    }
    const cleanup = () => { menu.remove(); document.removeEventListener('click', outside, true); };
    const outside = (e) => { if (!menu.contains(e.target)) { cleanup(); resolve(null); } };
    setTimeout(() => document.addEventListener('click', outside, true), 0);
    document.body.appendChild(menu);
  });
}

/* ================================================================== boot */

// flush pending save when the window loses focus or closes
window.addEventListener('blur', () => {
  if (state.editingId && state.dirty) saveEditor(false);
});
window.addEventListener('beforeunload', () => {
  if (state.editingId && state.dirty) saveEditor(false);
});

(async function boot() {
  await refreshSidebar();
  const s = await bridge.settings.get();
  if (!s.introShown) showIntro(true);
  switchView('all');
})();

/* Mobile drawer (web build only; these elements do not exist in Electron). */
(function () {
  const menuBtn = document.getElementById('btn-menu');
  const backdrop = document.getElementById('backdrop');
  if (!menuBtn || !backdrop) return;
  const sidebar = document.getElementById('sidebar');
  const open = () => {
    sidebar.classList.add('open');
    backdrop.hidden = false;
  };
  const close = () => {
    sidebar.classList.remove('open');
    backdrop.hidden = true;
  };
  menuBtn.addEventListener('click', open);
  backdrop.addEventListener('click', close);
  document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', close));
  const newNoteMobile = document.getElementById('btn-new-note-mobile');
  if (newNoteMobile) {
    newNoteMobile.addEventListener('click', async () => {
      close();
      const note = await bridge.notes.create({ category: 'observe', content: '' });
      switchView('all');
      openEditor(note.id);
      $('#editor-title').focus();
    });
  }
})();
