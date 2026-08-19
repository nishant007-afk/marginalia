'use strict';

/* ================================================================ CONFIG */
const CATEGORIES = {
  observe:{label:'Observe',icon:'<i class="fa-solid fa-eye" aria-hidden="true"></i>',prompt:'What did you notice?'},
  connection:{label:'Connections',icon:'<i class="fa-solid fa-link" aria-hidden="true"></i>',prompt:'What does this remind you of?'},
  thought:{label:'Thoughts',icon:'<i class="fa-solid fa-brain" aria-hidden="true"></i>',prompt:'What thought came to you?'},
  line:{label:'Lines',icon:'<i class="fa-solid fa-pen" aria-hidden="true"></i>',prompt:'A line of your own?'},
  quote:{label:'Quotes',icon:'<i class="fa-solid fa-quote" aria-hidden="true"></i>',prompt:'A favorite line or passage'},
  draft:{label:'Drafts',icon:'<i class="fa-solid fa-note-sticky" aria-hidden="true"></i>',prompt:'Write a little.'}
};
const APP_VERSION = '1.4.0';

/* ---- Capture web-side errors for diagnostics ---- */
function logJsError(msg) {
  try {
    const arr = JSON.parse(localStorage.getItem('marg-js-errors') || '[]');
    arr.push({ t: new Date().toISOString(), m: String(msg).slice(0, 300) });
    localStorage.setItem('marg-js-errors', JSON.stringify(arr.slice(-20)));
  } catch (e) { /* storage full or unavailable */ }
}
window.addEventListener('error', (e) => logJsError(e.message || 'Unknown error'));
window.addEventListener('unhandledrejection', (e) => logJsError('Promise: ' + (e.reason || 'Unknown')));

function getJsErrors() {
  try { return JSON.parse(localStorage.getItem('marg-js-errors') || '[]'); }
  catch (e) { return []; }
}

/* ================================================================ STORE */
const Store = window.MarginaliaStore && window.MarginaliaStore.Store || (function() {
  // Fallback Store class if MarginaliaStore is not globally defined
  class Store {
    constructor(dbName, dbType) {
      this.dbName = dbName;
      this.dbType = dbType;
      this.db = null;
    }
    async loadAsync() {
      try {
        const request = indexedDB.open(this.dbName, 1);
        await new Promise((resolve, reject) => {
          request.onupgradeneeded = (e) => {
            const db = request.result;
            if (!db.objectStoreNames.contains('kv')) {
              db.createObjectStore('kv');
            }
          };
          request.onsuccess = (e) => {
            this.db = e.target.result;
            resolve();
          };
          request.onerror = (e) => reject(e);
        });
      } catch (e) { /* IndexedDB not available */ }
    }
  }
  return Store;
})();
const IDB = {
  async: true, ensureDir: async () => {},
  read: async (file) => {
    const key = file.endsWith('.bak') ? 'lib.bak' : 'lib';
    const db = await openDB(); const v = await idbGet(db, key);
    if (v == null) throw new Error('not found'); return v;
  },
  writeAtomic: async (file, json) => {
    const key = file.endsWith('.bak') ? 'lib.bak' : 'lib';
    const db = await openDB(); await idbSet(db, key, json);
  }
};
let db = null;
function openDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('marginalia', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}
function idbGet(database, key) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbSet(database, key, value) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
let store = null;
async function initStore() { if (Store) { store = new Store('idb', IDB); await store.loadAsync(); } }

/* ============================================================ HELPERS */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso); const now = new Date();
  return d.toLocaleDateString(undefined, d.getFullYear()===now.getFullYear()?{month:'short',day:'numeric'}:{year:'numeric',month:'short',day:'numeric'});
}
function fmtDT(iso) { return iso ? new Date(iso).toLocaleString() : ''; }
function fmtRel(iso) {
  if (!iso) return '';
  const d = new Date(iso); const now = new Date();
  const s = Math.floor((now - d) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h';
  return fmtDate(iso);
}
function noteTitle(n) {
  if (n.title) return n.title;
  const first = (n.content||'').split('\n').map(l=>l.trim()).find(Boolean);
  return first ? (first.length>50?first.slice(0,50)+'...':first) : 'Untitled';
}
function notePreview(n) { return (n.content||'').split('\n').map(l=>l.trim()).filter(Boolean).slice(1).join(' ').slice(0,120); }
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3)|8).toString(16);});
}
let toastTimer = null;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.remove('hide');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hide'), 2800);
}

/* ============================================================ STATE */
let state = { view:'all', catFilter:'all', catView:null, search:'', editingId:null, activeSession:null, pageFilter:null };

/* ============================================================ NAVIGATION */
function switchView(name) {
  state.view = name;
  if (!name.startsWith('set-') && name !== 'cat') state.catView = null;
  $$('.view').forEach(v => v.classList.toggle('show', v.id === 'v-'+name));
  $$('.sb-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view===name));
  $$('#tabbar .tab').forEach(t => {
    const active = t.dataset.view===name || (name.startsWith('set-') && t.dataset.view==='settings');
    t.classList.toggle('active', active);
  });
  closeSidebar();
  setPageTitle(pageTitleFor(name));
  if (name==='all') renderList();
  else if (name==='categories') renderCategories();
  else if (name==='review') renderReview();
  else if (name==='sessions') renderSessions();
  else if (name==='settings') renderSettings();
  else if (name.startsWith('set-')) renderSettingsPage(name);
  updateBackButton();
}

function updateBackButton() {
  const panel = $('#panel'), editor = $('#editor');
  const show = state.view !== 'all' || !!state.catView || !!state.editingId ||
    (panel && panel.classList.contains('show')) || (editor && editor.classList.contains('show')) ||
    !!document.querySelector('.modal.show');
  const backBtn = $('#btn-back'), menuBtn = $('#btn-menu');
  backBtn.style.display = show ? 'flex' : 'none';
  if (menuBtn) menuBtn.style.display = show ? 'none' : 'flex';
}

function setPageTitle(t) {
  const el = $('#tb-brand');
  if (el) el.textContent = t;
}
function pageTitleFor(name) {
  const map = { all:'Marginalia', categories:'Categories', review:'Review', sessions:'Sessions', settings:'Settings',
    'set-account':'Account', 'set-appearance':'Appearance', 'set-updates':'Updates', 'set-data':'Data & backup', 'set-pen':'Floating pen', 'set-help':'Help' };
  return map[name] || 'Marginalia';
}

function goBack() {
  const panel = $('#panel'), editor = $('#editor');
  if (editor && editor.classList.contains('show')) { closeEditor(); return true; }
  if (panel && panel.classList.contains('show')) { closePanel(); return true; }
  const modal = document.querySelector('.modal.show');
  if (modal) { closeModal(modal.id); return true; }
  if (state.view.startsWith('set-')) { switchView('settings'); return true; }
  if (state.catView) { state.catView = null; renderCategories(); switchView('categories'); return true; }
  if (state.view !== 'all') { switchView('all'); return true; }
  state.pageFilter = null;
  return false;
}
window.__dispatchBack = goBack;
$('#btn-back').addEventListener('click', goBack);

/* ============================================================ SIDEBAR */
function openSidebar() { $('#sidebar').classList.add('open'); $('#backdrop').classList.add('show'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#backdrop').classList.remove('show'); }
$('#btn-menu').addEventListener('click', openSidebar);
$('#backdrop').addEventListener('click', closeSidebar);
$$('.sb-btn[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

/* ============================================================ CATEGORIES VIEW */
async function renderCategories() {
  const grid = $('#cat-grid'); grid.innerHTML = '';
  for (const [k,c] of Object.entries(CATEGORIES)) {
    const card = document.createElement('div'); card.className = 'cat-card';
    card.innerHTML = '<div class="cat-icon">'+c.icon+'</div><div class="cat-name">'+c.label+'</div>';
    card.onclick = () => openCategoryPage(k);
    grid.appendChild(card);
  }
  updateBackButton();
}
async function openCategoryPage(cat) {
  state.catView = cat;
  $$('.view').forEach(v => v.classList.remove('show'));
  $('#v-cat').classList.add('show');
  setPageTitle(CATEGORIES[cat].label);
  $('#cat-page-title').textContent = CATEGORIES[cat].label;
  $('#cat-page-sub').textContent = CATEGORIES[cat].prompt;
  const notes = await store.listNotes({ category: cat });
  const el = $('#cat-list2'); el.innerHTML = '';
  if (!notes.length) { el.innerHTML = '<div class="empty"><div class="ei"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></div>No notes in this category yet.</div>'; }
  else {
    for (const n of notes) {
      const card = document.createElement('div'); card.className = 'card'; card.style.marginBottom='10px';
      card.innerHTML = '<div class="c-top"><span class="c-cat">'+esc(CATEGORIES[cat].label)+'</span><span class="c-date">'+fmtRel(n.updatedAt||n.createdAt)+'</span></div><div class="c-title">'+esc(noteTitle(n))+'</div>'+(notePreview(n)?'<div class="c-prev">'+esc(notePreview(n))+'</div>':'')+(n.book?'<div class="c-meta"><i class="fa-solid fa-book" aria-hidden="true"></i> '+esc(n.book)+'</div>':'');
      card.onclick = () => openEditor(n.id); el.appendChild(card);
    }
  }
  $('#cat-back2').onclick = () => { state.catView = null; renderCategories(); switchView('categories'); };
  updateBackButton();
}

/* ============================================================ NOTE LIST */
function renderChips() {
  const el = $('#chips'); el.innerHTML = '';
  const add = (key,label,icon) => {
    const b = document.createElement('button'); b.className = 'chip'+(state.catFilter===key?' on':'');
    b.innerHTML = (icon ? icon+'&nbsp;' : '')+esc(label); b.onclick = () => { state.catFilter=key; renderChips(); renderList(); }; el.appendChild(b);
  };
  add('all','All');
  for (const [k,c] of Object.entries(CATEGORIES)) add(k,c.label,c.icon);
  updateChipsMore();
}
async function renderList() {
  renderChips();
  renderActiveBanner();
  const list = $('#list');
  let notes = await store.listNotes({ category: state.catFilter==='all'?undefined:state.catFilter, query: state.search||undefined });
  // Filter by page if pageFilter is set
  if (state.pageFilter) {
    notes = notes.filter(n => n.page && n.page.trim() === state.pageFilter);
  }
  list.innerHTML = '';
  if (!notes.length) {
    const ei = state.search ? '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' : '<i class="fa-solid fa-pen-nib" aria-hidden="true"></i>';
    list.innerHTML = '<div class="empty"><div class="ei">'+ei+'</div>'+(state.search ? 'Nothing matches "'+esc(state.search)+'".' : 'No notes yet. Tap the pen or the + button to add your first one.')+'</div>';
    return;
  }
  for (const n of notes) {
    const card = document.createElement('div'); card.className = 'card';
    const catLabel = (CATEGORIES[n.category]&&CATEGORIES[n.category].label)||n.category;
    const prev = notePreview(n);
    const src = n.sourceText ? '<div class="c-source">Source: '+esc(n.sourceText.slice(0,80))+'</div>' : '';
    const bookLine = n.book ? '<div class="c-meta"><i class="fa-solid fa-book" aria-hidden="true"></i> '+esc(n.book)+(n.page?' · p.'+esc(n.page):'')+'</div>' : '';
    const marginNote = n.page && n.page.trim() ? '<span class="margin-note" data-page="'+n.page+'">•</span>' : '';
    card.innerHTML = '<div class="c-top"><span class="c-cat">'+esc(catLabel)+'</span><span class="c-date">'+fmtRel(n.updatedAt||n.createdAt)+'</span></div><div class="c-title">'+esc(noteTitle(n))+'</div>'+(prev?'<div class="c-prev">'+esc(prev)+'</div>':'')+bookLine+src+marginNote;
    card.onclick = () => openEditor(n.id);
    const mn = card.querySelector('.margin-note');
    if (mn) mn.onclick = (e) => { e.stopPropagation(); filterNotesByPage(n.page, n.book); };
  }
  const stats = await store.getStats();
  $('#sb-stats').textContent = stats.total+' note'+(stats.total===1?'':'s');
}
$('#search').addEventListener('input', e => { state.search = e.target.value.trim(); renderList(); });

/* ============================================================ EDITOR */
let editTimer = null;
async function openEditor(id) {
  const note = await store.getNote(id); if (!note) return;
  state.editingId = id;
  const sel = $('#eb-cat'); sel.innerHTML = '';
  for (const [k,c] of Object.entries(CATEGORIES)) { const opt = document.createElement('option'); opt.value=k; opt.textContent=c.label; sel.appendChild(opt); }
  sel.value = note.category;
  $('#eb-title').value = note.title||''; $('#eb-content').value = note.content;
  $('#eb-book').value = note.book||''; $('#eb-author').value = note.author||'';
  $('#eb-page').value = note.page||''; $('#eb-source').value = note.sourceText||'';
  $('#eb-ts').textContent = 'Created '+fmtDT(note.createdAt)+' / Modified '+fmtDT(note.updatedAt);
  $('#editor').classList.add('show'); closePanel();
  updateBackButton();
}
function closeEditor() { state.editingId = null; $('#editor').classList.remove('show'); updateBackButton(); }
function editorPatch() {
  return { category: $('#eb-cat').value, title: $('#eb-title').value.trim(), content: $('#eb-content').value,
    book: $('#eb-book').value.trim(), author: $('#eb-author').value.trim(), page: $('#eb-page').value.trim(), sourceText: $('#eb-source').value.trim() };
}
async function saveEditor() { if (!state.editingId) return; await store.updateNote(state.editingId, editorPatch()); renderList(); }
['eb-title','eb-content','eb-book','eb-author','eb-page','eb-source'].forEach(id => {
  $('#'+id).addEventListener('input', () => { clearTimeout(editTimer); editTimer = setTimeout(saveEditor, 600); });
});
$('#eb-cat').addEventListener('change', saveEditor);
$('#eb-back').addEventListener('click', () => { saveEditor(); closeEditor(); });
$('#eb-copy-source').addEventListener('click', async () => {
  const text = $('#eb-source').value;
  if (!text) { toast('No source text to copy'); return; }
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
  catch { toast('Could not copy'); }
});
let delArmed = false;
$('#eb-del').addEventListener('click', async () => {
  if (!state.editingId) return;
  if (!delArmed) { delArmed=true; $('#eb-del').textContent='Confirm?'; setTimeout(()=>{delArmed=false;$('#eb-del').textContent='Delete';},3000); return; }
  await store.deleteNote(state.editingId); closeEditor(); toast('Deleted'); renderList();
});
$('#btn-new').addEventListener('click', async () => { const note = await store.createNote({category:'observe',content:''}); openEditor(note.id); setTimeout(()=>$('#eb-title').focus(),200); });
$('#sb-new').addEventListener('click', async () => { closeSidebar(); const note = await store.createNote({category:'observe',content:''}); openEditor(note.id); setTimeout(()=>$('#eb-title').focus(),200); });

/* ============================================================ FLOATING PEN (DRAGGABLE ALL DIRECTIONS) */
let panelCat = 'observe';
function renderPenChips() {
  const el = $('#pc-chips'); el.innerHTML = '';
  for (const [k,c] of Object.entries(CATEGORIES)) {
    const b = document.createElement('button'); b.className = 'chip'+(panelCat===k?' on':'');
    b.textContent = c.label; b.onclick = () => { panelCat=k; renderPenChips(); $('#pc-prompt').textContent=c.prompt; }; el.appendChild(b);
  }
}
function openPanel() {
  $('#panel').classList.add('show'); renderPenChips();
  $('#pc-prompt').textContent = CATEGORIES[panelCat].prompt;
  $('#pc-text').value = ''; setTimeout(() => $('#pc-text').focus(), 300);
  updateBackButton();
}
function closePanel() { $('#panel').classList.remove('show'); updateBackButton(); }
$('#pc-close').addEventListener('click', async () => {
  const text = $('#pc-text').value.trim();
  if (text) { await store.createNote({category:panelCat,content:text}); toast('Saved'); renderList(); }
  closePanel();
});
$('#pc-save').addEventListener('click', async () => {
  const text = $('#pc-text').value.trim(); if (!text) { toast('Nothing to save'); return; }
  await store.createNote({category:panelCat,content:text});
  $('#pc-text').value = ''; $('#pc-saved').textContent='Saved'; setTimeout(()=>{$('#pc-saved').textContent='';},1500); renderList();
});

// Pen: fully draggable anywhere on screen
const pen = $('#pen');
let penDrag = false, penMoved = 0, penSX = 0, penSY = 0, penOX = 0, penOY = 0;
function loadPenPos() {
  try { const p = JSON.parse(localStorage.getItem('pen-pos')); if (p && typeof p.x==='number' && typeof p.y==='number') {
    pen.style.left = Math.max(4, Math.min(window.innerWidth-60, p.x))+'px';
    pen.style.top = Math.max(4, Math.min(window.innerHeight-60, p.y))+'px';
    return;
  }} catch {}
  pen.style.left = '12px';
  pen.style.top = Math.max(100, window.innerHeight - 140)+'px';
}
function savePenPos() { localStorage.setItem('pen-pos', JSON.stringify({x:parseInt(pen.style.left)||12,y:parseInt(pen.style.top)||100})); }
loadPenPos();
window.addEventListener('resize', () => {
  const x = parseInt(pen.style.left)||12, y = parseInt(pen.style.top)||100;
  pen.style.left = Math.max(4, Math.min(window.innerWidth-60, x))+'px';
  pen.style.top = Math.max(4, Math.min(window.innerHeight-60, y))+'px';
});
pen.addEventListener('pointerdown', (e) => {
  if (e.button!==0) return;
  penDrag=true; penMoved=0; penSX=e.clientX; penSY=e.clientY;
  penOX=parseInt(pen.style.left)||0; penOY=parseInt(pen.style.top)||0;
  pen.setPointerCapture(e.pointerId); e.preventDefault();
});
pen.addEventListener('pointermove', (e) => {
  if (!penDrag) return;
  const dx=e.clientX-penSX, dy=e.clientY-penSY;
  penMoved=Math.max(penMoved, Math.abs(dx), Math.abs(dy));
  if (penMoved>4) {
    const nx=Math.max(4, Math.min(window.innerWidth-60, penOX+dx));
    const ny=Math.max(4, Math.min(window.innerHeight-60, penOY+dy));
    pen.style.left=nx+'px'; pen.style.top=ny+'px';
    pen.classList.add('dragging');
  }
});
pen.addEventListener('pointerup', () => { penDrag=false; pen.classList.remove('dragging'); savePenPos(); });
pen.addEventListener('click', (e) => { if (penMoved>5) return; if ($('#panel').classList.contains('show')) { closePanel(); } else { openPanel(); } });

/* ============================================================ REVIEW */
async function renderReview() {
  const activeChip = $('#rf .chip.on'); const range = activeChip ? activeChip.dataset.range : 'older';
  const all = await store.listNotes({}); const now = Date.now(); const day = 86400000;
  let filtered = all.filter(n => {
    const withinRange = (
      (range==='older' ? new Date(n.updatedAt||n.createdAt).getTime() < now-30*day) :
      (range==='week' ? new Date(n.updatedAt||n.createdAt).getTime() >= now-7*day) :
      new Date(n.updatedAt||n.createdAt).getTime() >= now-30*day)
    );
    return withinRange && (!state.pageFilter || (n.page && n.page.trim() === state.pageFilter));
  });
  const list = $('#rl'); list.innerHTML = '';
  if (!filtered.length) { list.innerHTML='<div class="empty"><div class="ei"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></div>Nothing in this range yet.</div>'; return; }
  for (const n of filtered) {
    const card = document.createElement('div'); card.className = 'card'; card.style.marginBottom='10px';
    const src = n.sourceText ? '<div class="c-source">Source: '+esc(n.sourceText.slice(0,60))+'</div>' : '';
    // Margin notes indicator
    const hasPage = n.page && n.page.trim();
    const marginNote = hasPage ? '<span class="margin-note" data-page="'+n.page+'">•</span>' : '';
    card.innerHTML = '<div class="c-top"><span class="c-cat">'+esc((CATEGORIES[n.category]&&CATEGORIES[n.category].label)||n.category)+'</span><span class="c-date">'+fmtRel(n.updatedAt||n.createdAt)+'</span></div><div class="c-title">'+esc(noteTitle(n))+'</div>'+(notePreview(n)?'<div class="c-prev">'+esc(notePreview(n))+'</div>':'')+src+marginNote;
    card.onclick = () => openEditor(n.id); list.appendChild(card);
  }
}
(function(){
  const rf = $('#rf'); rf.innerHTML = '';
  [{r:'older',l:'Older than 30 days'},{r:'week',l:'This week'},{r:'month',l:'This month'}].forEach((item,i) => {
    const b = document.createElement('button'); b.className = 'chip'+(i===0?' on':''); b.textContent = item.l; b.dataset.range = item.r;
    rf.appendChild(b);
  });
  rf.addEventListener('click', e => { const chip=e.target.closest('.chip'); if(!chip)return; $$('#rf .chip').forEach(c=>c.classList.toggle('on',c===chip)); renderReview(); });
})();
let revisitNote = null;
$('#rv-btn').addEventListener('click', async () => {
  revisitNote = await store.randomRevisit(); const body=$('#rv-body');
  if (!revisitNote) { body.textContent='No notes to revisit yet.'; $('#rv-open').hidden=true; return; }
  body.textContent=revisitNote.content; $('#rv-open').hidden=false;
});
$('#rv-open').addEventListener('click', () => { if(revisitNote)openEditor(revisitNote.id); });

/* ============================================================ SESSIONS */
function sessionBtn(label, cls, fn) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

async function renderSessions() {
  const sessions = await store.listSessions(); const list=$('#sl'); list.innerHTML='';
  if (!sessions.length) {
    list.innerHTML='<div class="empty">No sessions yet. Tap "Start session" and every note you write while it is active will attach to it.</div>';
    return;
  }
  for (const s of sessions) {
    const {notes} = await store.getSession(s.id);
    const item = document.createElement('div'); item.className='card session-card'; item.style.marginBottom='10px';
    const status = s.endedAt ? 'ended' : 'ongoing';
    item.innerHTML = '<div class="c-top"><span class="c-cat">'+status+'</span><span class="c-date">'+fmtDate(s.startedAt)+'</span></div><div class="c-title">'+esc(s.book||'Reading session')+'</div>'+(s.author?'<div class="c-prev">'+esc(s.author)+'</div>':'')+'<div class="c-meta"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> '+notes.length+' note'+(notes.length===1?'':'s')+'</div>';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
    const isActive = state.activeSession && state.activeSession.id === s.id;
    if (isActive) {
      actions.appendChild(sessionBtn('End session', 'btn btn-p btn-sm', async () => {
        await store.endSession(s.id);
        await refreshActiveState();
        renderSessions();
        toast('Session ended');
      }));
    } else if (!s.endedAt) {
      actions.appendChild(sessionBtn('Resume', 'btn btn-g btn-sm', async () => {
        await store.resumeSession(s.id);
        await refreshActiveState();
        renderSessions();
        toast('Session resumed. New notes will attach to it.');
      }));
    }
    if (s.endedAt) {
      actions.appendChild(sessionBtn('Delete', 'btn btn-g btn-sm', async () => {
        await store.deleteSession(s.id);
        renderSessions();
        toast('Session deleted (its notes were kept)');
      }));
    }
    if (actions.children.length) item.appendChild(actions);
    list.appendChild(item);
  }
}
$('#s-new').addEventListener('click', () => {
  $('#modal-session').classList.add('show');
  updateBackButton();
  setTimeout(() => { const f = $('#ms-book'); if (f) f.focus(); }, 60);
});
const startSession = async () => {
  const f = $('#ms-start');
  if (f) f.disabled = true;
  try {
    const book = $('#ms-book').value.trim(), author = $('#ms-author').value.trim();
    await store.createSession({ book, author });
    $('#ms-book').value = ''; $('#ms-author').value = '';
    closeModal('modal-session');
    await refreshActiveState();
    toast('Session started');
    renderSessions();
    renderList();
  } catch (e) {
    closeModal('modal-session');
    toast('Could not start the session');
  } finally {
    if (f) f.disabled = false;
  }
};
$('#ms-start').addEventListener('click', startSession);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && $('#modal-session').classList.contains('show')) {
    const t = e.target;
    if (t && (t.id === 'ms-book' || t.id === 'ms-author')) { e.preventDefault(); startSession(); }
  }
});

/* ---- Text capture from PDF / text selection ---- */
window.__pendingText = '';
let mtCategory = 'observe';
function refreshReadingContext() {
  if (window.AndroidBridge && window.AndroidBridge.getReadingContext) {
    try {
      const s = window.AndroidBridge.getReadingContext();
      if (s) window.__readingContext = JSON.parse(s);
    } catch (e) {}
  }
}
window.__showTextCapture = function () {
  const text = (window.__pendingText || '').trim();
  if (!text) return;
  mtCategory = 'observe';
  $('#mt-text').textContent = text;
  refreshReadingContext();
  const ctx = window.__readingContext || null;
  const active = store && store.getActiveSession();
  let book = (ctx && (ctx.book || ctx.title)) || '';
  let author = (ctx && ctx.author) || '';
  let page = (ctx && ctx.page) || '';
  if (!book && active && active.book) { book = active.book; author = author || (active.author || ''); }
  $('#mt-book').value = book;
  $('#mt-author').value = author;
  $('#mt-page').value = page;
  const linkEl = $('#mt-link');
  const parts = [];
  if (book) parts.push('<i class="fa-solid fa-book"></i>' + esc(book));
  if (author) parts.push(esc(author));
  if (page) parts.push('<i class="fa-solid fa-hashtag"></i>' + esc(page));
  if (active && active.book && !book && !author) parts.push('Linked to reading session: ' + esc(active.book));
  if (parts.length) { linkEl.innerHTML = parts.join(' · '); linkEl.hidden = false; }
  else linkEl.hidden = true;
  // Show "highlighted text" banner above the capture area
  const highlightEl = $('#mt-highlight');
  highlightEl.textContent = text ? 'Selected text: ' + esc(text.substring(0, 100)) : '';
  highlightEl.hidden = !text;
  const chipsEl = $('#mt-chips'); chipsEl.innerHTML = '';
  for (const [k, c] of Object.entries(CATEGORIES)) {
    const b = document.createElement('button');
    b.className = 'chip' + (k === 'observe' ? ' on' : '');
    b.textContent = c.label;
    b.onclick = () => { mtCategory = k; [...chipsEl.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); };
    chipsEl.appendChild(b);
  }
  $('#modal-text').classList.add('show');
  updateBackButton();
};
$('#mt-save').addEventListener('click', async () => {
  const text = (window.__pendingText || '').trim();
  if (!text) return;
  closeModal('modal-text');
  window.__pendingText = '';
  const active = store.getActiveSession();
  const note = await store.createNote({
    category: mtCategory,
    content: text,
    book: $('#mt-book').value.trim() || null,
    author: $('#mt-author').value.trim() || null,
    page: $('#mt-page').value.trim() || null,
    sourceText: text,
    sessionId: active ? active.id : null
  });
  toast('Saved to Marginalia' + (note.book ? ' · ' + note.book : ''));
  renderList();
  openEditor(note.id);
});

/* ---- Bottom navigation ---- */
$$('#tabbar .tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

/* ============================================================ SETTINGS */
async function renderSettings() {
  renderTopbarAuth();
  const sub = $('#set-account-sub');
  if (sub) sub.textContent = currentUser ? esc(currentUser.email) : 'Not signed in';
  renderAppVersion();
}
function renderAuthSection() {
  const authEl = $('#auth-section');
  const sub = $('#set-account-sub');
  if (sub) sub.textContent = currentUser ? esc(currentUser.email) : 'Not signed in';
  if (!authEl) return;
  if (currentUser) {
    authEl.innerHTML = '<div style="font-size:13px;margin-bottom:8px">Signed in as <strong>'+esc(currentUser.email)+'</strong></div>'+
      '<div style="font-size:12px;color:var(--tx3);margin-bottom:8px">Notes sync automatically when online.</div>'+
      '<button class="btn btn-g" style="width:100%" onclick="doSignOut()">Sign out</button>'+
      '<button class="btn btn-p" style="width:100%;margin-top:8px" onclick="doSyncNow()">Sync now</button>';
  } else {
    authEl.innerHTML = '<button class="btn btn-g" style="width:100%" onclick="showAuthModal()">Sign in to sync across devices</button>'+
      '<div style="font-size:11px;color:var(--tx3);margin-top:6px">Create an account to sync notes from any device.</div>';
  }
}
function renderSettingsPage(name) {
  if (name === 'set-account') { renderAuthSection(); }
  else if (name === 'set-appearance') renderAppearance();
  else if (name === 'set-updates') renderAppVersion();
  else if (name === 'set-pen') renderPenToggle();
  renderTopbarAuth();
}
$$('.set-row[data-set]').forEach(r => r.addEventListener('click', () => switchView('set-' + r.dataset.set)));
$$('.set-back').forEach(b => b.addEventListener('click', () => switchView('settings')));

/* ---- Generic popup (account created, signed in, etc.) ---- */
function showPopup(title, msg) {

/* ---- Generic popup (account created, signed in, etc.) ---- */
function showPopup(title, msg) {
  $('#pop-title').textContent = title;
  $('#pop-msg').textContent = msg;
  $('#modal-pop').classList.add('show');
  updateBackButton();
}
$('#pop-ok').addEventListener('click', () => closeModal('modal-pop'));
window.closeModal = (id) => { document.getElementById(id).classList.remove('show'); updateBackButton(); };
window.doSignOut = async () => { await signOut(); renderSettings(); renderTopbarAuth(); showPopup('Signed out', 'You\'re signed out. Your notes stay safe on this device and will sync again if you sign back in.'); };
window.doSyncNow = async () => { if (!navigator.onLine) { toast('Offline. Will sync when connected.'); return; } toast('Syncing...'); await fullSync(); };

/* ---- Appearance ---- */
function getAppearance() { try { return JSON.parse(localStorage.getItem('marg-appearance') || '{}'); } catch (e) { return {}; } }
function applyAppearance() {
  const ap = getAppearance();
  document.body.classList.toggle('compact', !!ap.compact);
  document.body.classList.toggle('seriftitles', !!ap.serifTitles);
}
function renderAppearance() {
  const ap = getAppearance();
  const c = $('#set-compact'), s = $('#set-serif');
  if (c) c.checked = !!ap.compact;
  if (s) s.checked = !!ap.serifTitles;
}
const compactToggle = document.getElementById('set-compact');
const serifToggle = document.getElementById('set-serif');
if (compactToggle) compactToggle.addEventListener('change', e => { const ap = getAppearance(); ap.compact = e.target.checked; localStorage.setItem('marg-appearance', JSON.stringify(ap)); applyAppearance(); });
if (serifToggle) serifToggle.addEventListener('change', e => { const ap = getAppearance(); ap.serifTitles = e.target.checked; localStorage.setItem('marg-appearance', JSON.stringify(ap)); applyAppearance(); });

/* ---- Account button on the top bar ---- */
function renderTopbarAuth() {
  const el = $('#tb-account');
  if (!el) return;
  el.onclick = null;
  if (currentUser) {
    const meta = currentUser.user_metadata || {};
    const avatar = meta.avatar_url || meta.picture || '';
    if (avatar) {
      el.innerHTML = '<img class="tb-pic" src="' + esc(avatar) + '" alt="" onerror="this.style.display=\'none\'">';
      el.onclick = () => switchView('settings');
    } else {
      const initial = (currentUser.email || '?').charAt(0).toUpperCase();
      el.innerHTML = '<span class="tb-avatar">' + esc(initial) + '</span>';
      el.onclick = () => switchView('settings');
    }
  } else {
    el.innerHTML = '<span class="tb-signin">Sign in</span>';
    el.onclick = () => showAuthModal();
  }
}

/* ---- Active reading session banner + helpers ---- */
async function refreshActiveState() {
  state.activeSession = await store.getActiveSession();
  renderActiveBanner();
}

function renderActiveBanner() {
  const b = $('#active-banner');
  if (!b) return;
  if (state.activeSession) {
    const book = state.activeSession.book || 'a session';
    b.innerHTML = '<span class="ab-book"><i class="fa-solid fa-book-open" aria-hidden="true"></i>&nbsp; Reading: ' + esc(book) + '</span><button class="ab-end">End session</button>';
    b.hidden = false;
    b.querySelector('.ab-end').addEventListener('click', async () => {
      if (!state.activeSession) return;
      await store.endSession(state.activeSession.id);
      await refreshActiveState();
      toast('Session ended');
      if (state.view === 'sessions') renderSessions();
      renderList();
    });
  } else {
    b.hidden = true;
  }
}

function filterNotesByPage(page, book) {
  state.pageFilter = page;
  renderList();
  renderReview();
  const activeBanner = $('#active-banner');
  if (activeBanner) {
    activeBanner.innerHTML = '<span class="ab-book"><i class="fa-solid fa-book-open" aria-hidden="true"></i>&nbsp; Reading: ' + esc(book) + '</span>';
    activeBanner.hidden = false;
  }
}

/* ---- "More categories" hint on the chips row ---- */
const listChips = document.getElementById('chips');
const chipsMore = document.getElementById('chips-more');
function updateChipsMore() {
  if (listChips && chipsMore) {
    const atEnd = listChips.scrollLeft + listChips.clientWidth >= listChips.scrollWidth - 4;
    chipsMore.classList.toggle('hidden', atEnd);
  }
}
if (listChips) listChips.addEventListener('scroll', updateChipsMore);

/* ============================================================ AUTH */
let sb = null, currentUser = null;

const SYNC_CREDS_KEY = 'marginalia-sync-creds';

function getStoredCreds() {
  try {
    const v = JSON.parse(localStorage.getItem(SYNC_CREDS_KEY) || 'null');
    return (v && typeof v.url === 'string' && v.url && typeof v.key === 'string' && v.key) ? v : null;
  } catch (e) { return null; }
}

function getSupabaseConfig() {
  const stored = getStoredCreds();
  return {
    url: stored ? stored.url : window.SUPABASE_URL,
    key: stored ? stored.key : window.SUPABASE_ANON
  };
}

function initSupabase() {
  const cfg = getSupabaseConfig();
  if (cfg.url && cfg.key && window.supabase) {
    try {
      sb = window.supabase.createClient(cfg.url, cfg.key);
      return true;
    } catch (e) {
      console.error('Supabase init failed:', e);
      sb = null;
      return false;
    }
  }
  sb = null;
  return false;
}
async function signUp(email, password) {
  if (!sb) throw new Error('Sync could not start. Check your connection and try again.');
  const { data, error } = await sb.auth.signUp({ email, password }, {
    emailRedirectTo: window.location.origin + window.location.pathname
  });
  if (error) throw error;
  currentUser = data.session ? data.session.user : (data.user || null);
  if (data.session) await fullSync().catch(()=>{});
  return data;
}
async function signIn(email, password) {
  if (!sb) throw new Error('Sync could not start. Check your connection and try again.');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user; await fullSync().catch(()=>{}); return data;
}
async function signOut() { if (sb) await sb.auth.signOut(); currentUser = null; }
async function getSessionUser() {
  if (!sb) return null;
  try { const { data } = await sb.auth.getSession(); currentUser = data.session?.user || null; } catch (e) { console.error('getSession failed:', e); }
  return currentUser;
}

let authMode = 'signin';
$('#auth-toggle').addEventListener('click', () => {
  authMode = authMode==='signin' ? 'signup' : 'signin';
  $('#auth-title').textContent = authMode==='signin'?'Sign in':'Create account';
  $('#auth-sub').textContent = authMode==='signin'?'Sign in to sync notes across devices.':'Create an account to sync notes.';
  $('#auth-submit').textContent = authMode==='signin'?'Sign in':'Create account';
  $('#auth-toggle').textContent = authMode==='signin'?'Create account':'Sign in instead';
});

$('#auth-submit').addEventListener('click', async () => {
  const email=$('#auth-email').value.trim(), pass=$('#auth-pass').value;
  const btn=$('#auth-submit'), errEl=$('#auth-error');
  errEl.hidden = true;
  if (!email||!pass) { toast('Enter email and password'); return; }
  btn.disabled = true;
  btn.textContent = authMode==='signin' ? 'Signing in...' : 'Creating account...';
  try {
    if (authMode==='signin') {
      await signIn(email,pass);
      closeModal('modal-auth'); switchView('settings');
      showPopup('Signed in', 'Signed in as ' + email + '. Your notes now sync across devices.');
    } else {
      const r = await signUp(email,pass);
      closeModal('modal-auth');
      if (!r.session) {
        showPopup('Account created', 'Check your inbox (' + email + ') and click the confirmation link, then sign in. Until then, notes stay on this device.');
      } else {
        switchView('settings');
        showPopup('Account created', 'You\'re signed in as ' + email + '. Your notes now sync across devices.');
      }
    }
  } catch (e) {
    let msg = e.message || 'Sign in failed';
    if (/fetch|network|failed to fetch/i.test(msg)) {
      if (getStoredCreds()) {
        msg = "Can't reach your sync server. Check the URL in Account and your internet connection.";
      } else {
        msg = "The built-in sync server is no longer available. Connect your own server in Settings → Account.";
      }
    }
    else if (msg.includes('already registered')) msg = 'This email is already registered. Try signing in.';
    else if (msg.includes('Invalid login')) msg = 'Wrong email or password.';
    else if (msg.includes('Email not confirmed')) msg = 'Email not confirmed. Check your inbox.';
    else if (msg.includes('over_email_send')) msg = 'Too many attempts. Wait a minute and try again.';
    errEl.textContent = msg; errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = authMode==='signin' ? 'Sign in' : 'Create account';
  }
});
$('#auth-close').addEventListener('click', () => closeModal('modal-auth'));

// Password eye toggle
$('#auth-eye').addEventListener('click', () => {
  const input = document.getElementById('auth-pass');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  const eye = document.querySelector('#auth-eye i');
  if (eye) {
    eye.className = isPassword ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  }
});

/* ============================================================ SYNC */
async function getPendingSync() { try { const db=await openDB(); const v=await idbGet(db,'sync-q'); return v?JSON.parse(v):[]; } catch{return[];} }
async function setPendingSync(q) { const db=await openDB(); await idbSet(db,'sync-q',JSON.stringify(q)); }
async function addToSyncQueue(action,table,id,data) { const q=await getPendingSync(); q.push({action,table,id,data,ts:Date.now()}); await setPendingSync(q); }
async function flushSyncQueue() {
  if (!sb||!currentUser) return;
  const queue=await getPendingSync(); if(!queue.length) return;
  const rem=[];
  for (const item of queue) {
    try {
      if (item.action==='upsert') await sb.from(item.table).upsert({...item.data,user_id:currentUser.id});
      else if (item.action==='delete') await sb.from(item.table).delete().eq('id',item.id).eq('user_id',currentUser.id);
    } catch (e) { console.error('Sync queue item failed:', e); rem.push(item); }
  }
  await setPendingSync(rem);
  if (rem.length===0) toast('Synced to cloud');
  else toast('Some changes are waiting — will retry when connected');
}
async function fullSync() {
  if (!sb||!currentUser) return;
  let failures = 0;
  try {
    const {data:rn, error:e1} = await sb.from('notes').select('*').eq('user_id',currentUser.id);
    const {data:rs, error:e2} = await sb.from('sessions').select('*').eq('user_id',currentUser.id);
    if (e1) { console.error('Sync notes fetch error:', e1.message); failures++; }
    if (e2) { console.error('Sync sessions fetch error:', e2.message); failures++; }
    if (rn) for (const n of rn) {
      const local=await store.getNote(n.id);
      if (!local||new Date(n.updated_at)>new Date(local.updatedAt)) {
        await store.updateNote(n.id,{category:n.category,title:n.title,content:n.content,book:n.book,author:n.author,page:n.page,sourceText:n.source_text,tags:n.tags,sessionId:n.session_id,links:n.links,createdAt:n.created_at,updatedAt:n.updated_at}).catch(()=>{});
      }
    }
    if (rs) for (const s of rs) {
      const local=await store.getSession(s.id);
      if (!local||local.session.updatedAt==null||new Date(s.updated_at)>new Date(local.session.updatedAt)) {
        await store.updateSession(s.id,{book:s.book,author:s.author,chapter:s.chapter,pageRange:s.page_range,startedAt:s.started_at,endedAt:s.ended_at,createdAt:s.created_at,updatedAt:s.updated_at}).catch(()=>{});
      }
    }
    const ln=await store.listNotes({});
    for (const n of ln) {
      try {
        await sb.from('notes').upsert({id:n.id,user_id:currentUser.id,category:n.category,title:n.title,content:n.content,book:n.book,author:n.author,page:n.page,source_text:n.sourceText,tags:n.tags||[],session_id:n.sessionId,links:n.links||[],created_at:n.createdAt,updated_at:n.updatedAt},{onConflict:'id'});
      } catch (e) { console.error('Note upsert failed:', e); failures++; }
    }
    const ls=await store.listSessions();
    for (const s of ls) {
      try {
        await sb.from('sessions').upsert({id:s.id,user_id:currentUser.id,book:s.book,author:s.author,chapter:s.chapter,page_range:s.pageRange,started_at:s.startedAt,ended_at:s.endedAt,created_at:s.createdAt,updated_at:s.updatedAt},{onConflict:'id'});
      } catch (e) { console.error('Session upsert failed:', e); failures++; }
    }
    await flushSyncQueue(); renderList();
    if (failures) {
      toast('Synced with errors. Make sure the notes/sessions tables exist with RLS (supabase/schema.sql).');
    } else {
      toast('Synced with cloud');
    }
  } catch(e) { console.error('Sync failed:',e); toast('Sync failed: '+(e.message||'unknown error')); }
}
function updateSyncDot() {
  const dot=document.getElementById('sync-dot'); const label=document.getElementById('sync-label');
  if (!currentUser) { dot.className='sync-dot'; label.textContent=''; return; }
  if (navigator.onLine) { dot.className='sync-dot online'; label.textContent='online'; }
  else { dot.className='sync-dot'; label.textContent='offline'; }
}
window.addEventListener('online', () => { toast('Back online. Syncing...'); updateSyncDot(); flushSyncQueue(); });
window.addEventListener('offline', () => { toast('Offline. Saving locally.'); updateSyncDot(); });

// Patch store methods for sync
if (Store) {
  const origCreate=Store.prototype.createNote, origUpdate=Store.prototype.updateNote, origDelete=Store.prototype.deleteNote;
  const origCreateSess=Store.prototype.createSession, origEndSess=Store.prototype.endSession;
  const queueSafe = (action,table,id,data) => { try { return Promise.resolve(addToSyncQueue(action,table,id,data)).catch((e)=>console.log('sync queue failed',e)); } catch (e) { return Promise.resolve(); } };
  Store.prototype.createNote=async function(i){const n=origCreate.call(this,i);if(navigator.onLine&&sb&&currentUser){try{await sb.from('notes').upsert({id:n.id,user_id:currentUser.id,category:n.category,title:n.title,content:n.content,book:n.book,author:n.author,page:n.page,source_text:n.sourceText,tags:n.tags||[],session_id:n.sessionId,links:n.links||[],created_at:n.createdAt,updated_at:n.updatedAt});}catch{await queueSafe('upsert','notes',n.id,n);}}else{await queueSafe('upsert','notes',n.id,n);}return n;};
  Store.prototype.updateNote=async function(id,p){const n=origUpdate.call(this,id,p);if(!n)return null;if(navigator.onLine&&sb&&currentUser){try{await sb.from('notes').upsert({id:n.id,user_id:currentUser.id,category:n.category,title:n.title,content:n.content,book:n.book,author:n.author,page:n.page,source_text:n.sourceText,tags:n.tags||[],session_id:n.sessionId,links:n.links||[],created_at:n.createdAt,updated_at:n.updatedAt},{onConflict:'id'});}catch{await queueSafe('upsert','notes',n.id,n);}}else{await queueSafe('upsert','notes',n.id,n);}return n;};
  Store.prototype.deleteNote=async function(id){const r=origDelete.call(this,id);if(navigator.onLine&&sb&&currentUser){try{await sb.from('notes').delete().eq('id',id).eq('user_id',currentUser.id);}catch{await queueSafe('delete','notes',id);}}else{await queueSafe('delete','notes',id);}return r;};
  Store.prototype.createSession=async function(d){const s=origCreateSess.call(this,d);if(navigator.onLine&&sb&&currentUser){try{await sb.from('sessions').upsert({id:s.id,user_id:currentUser.id,book:s.book,author:s.author,chapter:s.chapter,page_range:s.pageRange,started_at:s.startedAt,ended_at:s.endedAt,created_at:s.createdAt,updated_at:s.updatedAt});}catch{await queueSafe('upsert','sessions',s.id,s);}}else{await queueSafe('upsert','sessions',s.id,s);}return s;};
  Store.prototype.endSession=async function(id){const s=origEndSess.call(this,id);if(!s)return null;if(navigator.onLine&&sb&&currentUser){try{await sb.from('sessions').upsert({id:s.id,user_id:currentUser.id,book:s.book,author:s.author,chapter:s.chapter,page_range:s.pageRange,started_at:s.startedAt,ended_at:s.endedAt,created_at:s.createdAt,updated_at:s.updatedAt},{onConflict:'id'});}catch{await queueSafe('upsert','sessions',s.id,s);}}else{await queueSafe('upsert','sessions',s.id,s);}return s;};
}

/* ============================================================ EXPORT */
$('#set-export').addEventListener('click', async () => {
  const data=store.exportAll(); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='marginalia-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(url); toast('Exported');
});
$('#set-backup').addEventListener('click', async () => {
  const data=store.exportAll(); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='marginalia-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(url); toast('Backup created');
});
$('#set-restore').addEventListener('click', () => {
  const input=document.createElement('input'); input.type='file'; input.accept='.json'; input.style.display='none';
  document.body.appendChild(input); input.onchange=async()=>{const f=input.files[0]; input.remove(); if(!f)return; try{const t=await f.text(); store.importAll(JSON.parse(t)); toast('Restored'); renderList();}catch(e){toast('Invalid backup file');}}; input.click();
});

/* ============================================================ INSTALL */
(function(){
  const bar=document.getElementById('install-bar'),btn=document.getElementById('btn-install');if(!bar)return;
  if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)return;
  let dp=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();dp=e;document.getElementById('install-text').textContent='Add Marginalia to your home screen';bar.hidden=false;});
  if(/iP(hone|ad|od)/.test(navigator.userAgent)&&!navigator.standalone){document.getElementById('install-text').textContent='Tap Share > Add to Home Screen';btn.hidden=true;bar.hidden=false;}
  btn.addEventListener('click',()=>{if(dp){dp.prompt();dp.userChoice.then(()=>{bar.hidden=true;});}});
  window.addEventListener('appinstalled',()=>{bar.hidden=true});
})();

/* ============================================================ ANDROID APP UPDATE */
let apkUpdate = null;

function setApkStatus(msg) {
  const el = $('#apk-update-status');
  if (el) el.textContent = msg;
}

function renderAppVersion() {
  const el = $('#apk-ver-line');
  if (el) {
    if (window.AndroidBridge && window.AndroidBridge.getAppVersionName) {
      el.textContent = 'v' + window.AndroidBridge.getAppVersionName();
    } else {
      el.textContent = '—';
    }
  }
  const sub = $('#set-upd-sub');
  if (sub) sub.textContent = window.AndroidBridge && window.AndroidBridge.getAppVersionName ? 'App version ' + window.AndroidBridge.getAppVersionName() : 'App version';
}

async function checkApkUpdate(force) {
  if (!window.AndroidBridge) return false;
  try {
    const base = location.href.replace(/\/app\/.*$/, '/');
    const res = await fetch(base + 'update.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) { setApkStatus('Could not reach the update server.'); return false; }
    const meta = await res.json();
    const installedCode = (window.AndroidBridge.getAppVersion) ? window.AndroidBridge.getAppVersion() : 0;
    if (!(meta && meta.versionCode && installedCode)) { setApkStatus('Could not read the version information.'); return false; }
    const installedName = (window.AndroidBridge.getAppVersionName) ? window.AndroidBridge.getAppVersionName() : String(installedCode);
    if (meta.versionCode > installedCode) {
      const laterFor = parseInt(localStorage.getItem('upd-later-v') || '0', 10);
      if (!force && laterFor >= meta.versionCode) {
        setApkStatus('An update is available (v' + meta.versionName + ') — tap "Check for app update" to view it.');
        return false;
      }
      apkUpdate = { meta, url: base + (meta.apkUrl || 'Marginalia.apk') };
      showApkUpdateModal();
      setApkStatus('Update available: v' + (installedName || installedCode) + ' → v' + meta.versionName);
      return true;
    }
    setApkStatus('You are up to date (v' + (installedName || installedCode) + ').');
    return false;
  } catch (e) {
    console.log('APK update check failed:', e);
    setApkStatus('Update check failed: ' + (e.message || 'network error'));
  }
  return false;
}

function showApkUpdateModal() {
  if (!apkUpdate) return;
  $('#upd-ver').textContent = apkUpdate.meta.versionName ? (' v' + apkUpdate.meta.versionName) : (' v' + apkUpdate.meta.versionCode);
  const ul = $('#upd-notes'); ul.innerHTML = '';
  const notes = (apkUpdate.meta.notes && apkUpdate.meta.notes.length) ? apkUpdate.meta.notes : ['General improvements and bug fixes.'];
  for (const line of notes) {
    const li = document.createElement('li');
    li.textContent = line;
    ul.appendChild(li);
  }
  $('#modal-update').classList.add('show');
  updateBackButton();
}

$('#upd-later').addEventListener('click', () => {
  if (apkUpdate) localStorage.setItem('upd-later-v', String(apkUpdate.meta.versionCode));
  $('#modal-update').classList.remove('show');
  updateBackButton();
});
$('#upd-now').addEventListener('click', () => {
  if (!apkUpdate) return;
  if (window.AndroidBridge && window.AndroidBridge.updateApp) {
    window.AndroidBridge.updateApp(apkUpdate.url);
    toast('Downloading update…');
  } else {
    const a = document.createElement('a');
    a.href = apkUpdate.url;
    a.download = 'Marginalia.apk';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Download started — open the file to install');
  }
  $('#modal-update').classList.remove('show');
  updateBackButton();
});

// Manual "Check for app update" in Settings
const apkCheckBtn = document.getElementById('set-check-apk');
if (apkCheckBtn) apkCheckBtn.addEventListener('click', async () => {
  if (!window.AndroidBridge) { toast('Open Marginalia from the Android app to check for app updates'); return; }
  toast('Checking for updates…');
  const found = await checkApkUpdate(true);
  if (!found) renderAppVersion();
});

/* ---- Crash log (diagnostics helper) ---- */
const crashBox = document.getElementById('crash-log-box');
document.getElementById('set-view-crash').addEventListener('click', () => {
  let text = '';
  if (window.AndroidBridge && window.AndroidBridge.getCrashLog) {
    text = window.AndroidBridge.getCrashLog();
  }
  const jsErrors = getJsErrors();
  if (jsErrors.length) {
    text += (text ? '\n------ Web errors ------\n' : '') + jsErrors.map((e) => e.t + '  ' + e.m).join('\n');
  }
  if (!text) {
    text = 'No crash log found. If the app crashes, the details are saved here automatically.';
  }
  crashBox.textContent = text;
  crashBox.style.display = 'block';
});
document.getElementById('set-clear-crash').addEventListener('click', () => {
  if (window.AndroidBridge && window.AndroidBridge.clearCrashLog) window.AndroidBridge.clearCrashLog();
  try { localStorage.removeItem('marg-js-errors'); } catch (e) {}
  crashBox.style.display = 'none';
  toast('Crash log cleared');
});

/* ---- Floating pen toggle ---- */
const penToggle = document.getElementById('set-pen-toggle');
function renderPenToggle() {
  if (penToggle && window.AndroidBridge && window.AndroidBridge.isPenEnabled) {
    penToggle.checked = !!window.AndroidBridge.isPenEnabled();
  }
}
if (penToggle) penToggle.addEventListener('change', () => {
  if (window.AndroidBridge && window.AndroidBridge.setPenEnabled) {
    window.AndroidBridge.setPenEnabled(penToggle.checked);
    toast(penToggle.checked ? 'Floating pen enabled' : 'Floating pen disabled');
  } else {
    toast('The floating pen is only available inside the Android app');
  }
});

/* ============================================================ APP UPDATES */
// Check on load
checkApkUpdate();
// Check every time the user comes back to the tab
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkApkUpdate();
});
// Check for updates less often (30 minutes)
setInterval(checkApkUpdate, 30*60*1000);

/* ============================================================ SERVICE WORKER */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    // Check for SW updates every 30 seconds
    setInterval(() => {
      reg.update().then(() => {
        if (reg.waiting) {
          // New SW is waiting, tell it to skip waiting
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }).catch(()=>{});
    }, 30*1000);
  });

  // Listen for controllerchange (new SW took over)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // New SW is now active, reload to get fresh content
    window.location.reload();
  });
}

/* ============================================================ ANDROID BRIDGE */
document.addEventListener('android-save-note', async (e) => {
  const d = e.detail || {};
  if (d.content) {
    const active = store.getActiveSession();
    const note = await store.createNote({
      category: d.category || 'observe',
      content: d.content,
      book: d.book || null,
      author: d.author || null,
      page: d.page || null,
      sourceText: d.sourceText || d.content,
      sessionId: d.sessionId || (active ? active.id : null)
    });
    toast('Saved from pen' + (note.book ? ' · ' + note.book : ''));
    renderList();
  }
});

/* ============================================================ INIT */
(async function boot() {
  function hideSplash() { const s = document.getElementById('splash'); if (s) s.classList.add('hide'); }
  setTimeout(hideSplash, 5000);
  if (window.AndroidBridge) {
    document.body.classList.add('android');
    // Keep the in-page pen and panel elements in the DOM (other code still
    // references them) but hide them, so only the OS-level floating pen shows.
    const penEl = document.getElementById('pen');
    if (penEl) penEl.style.display = 'none';
    const panelEl = document.getElementById('panel');
    if (panelEl) panelEl.style.display = 'none';
  }
  await initStore(); await initSupabase(); await getSessionUser();
  applyAppearance();
  if (!store) {
    setTimeout(() => toast('Could not open your notes. Check your connection and restart the app.'), 600);
    hideSplash();
    return;
  }
  renderList(); state.activeSession = await store.getActiveSession();
  updateSyncDot();
  renderAppVersion();
  renderTopbarAuth();
  renderActiveBanner();
  updateBackButton();
  setPageTitle('Marginalia');
  if (navigator.onLine && currentUser) flushSyncQueue();
  hideSplash();
})();
