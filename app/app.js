'use strict';

/* ================================================================ CONFIG */

const CATEGORIES = {
  observe:{label:'Observe',prompt:'What did you notice?'},
  image:{label:'Images',prompt:'What image stayed with you?'},
  connection:{label:'Connections',prompt:'What does this remind you of?'},
  feeling:{label:'Feelings',prompt:'What did this make you feel?'},
  idea:{label:'Ideas',prompt:'What thought came to you?'},
  line:{label:'Lines',prompt:'A line of your own?'},
  draft:{label:'Drafts',prompt:'Write a little.'},
  poem:{label:'Poems',prompt:'A finished piece.'}
};

const APP_VERSION = '1.2.0';
const CHECK_INTERVAL = 60 * 1000;

/* ============================================================ SUPABASE */

let sb = null; // supabase client
let currentUser = null;

function initSupabase() {
  if (window.SUPABASE_URL && window.SUPABASE_ANON && window.supabase) {
    sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);
    return true;
  }
  return false;
}

async function signUp(email, password) {
  if (!sb) throw new Error('Supabase not configured');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  currentUser = data.user;
  return data;
}

async function signIn(email, password) {
  if (!sb) throw new Error('Supabase not configured');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  await fullSync();
  return data;
}

async function signOut() {
  if (sb) await sb.auth.signOut();
  currentUser = null;
}

async function get_session_user() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user || null;
  return currentUser;
}

/* ================================================================ STORE */

const { Store } = window.MarginaliaStore || {};

const IDB = {
  async: true,
  ensureDir: async () => {},
  read: async (file) => {
    const key = file.endsWith('.bak') ? 'lib.bak' : 'lib';
    const db = await openDB();
    const v = await idbGet(db, key);
    if (v == null) throw new Error('not found');
    return v;
  },
  writeAtomic: async (file, json) => {
    const key = file.endsWith('.bak') ? 'lib.bak' : 'lib';
    const db = await openDB();
    await idbSet(db, key, json);
  }
};

let db = null;
function openDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('marginalia', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
    };
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
async function initStore() {
  if (Store) {
    store = new Store('idb', IDB);
    await store.loadAsync();
  }
}

/* ============================================================ HELPERS */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  return d.toLocaleDateString(undefined, d.getFullYear()===now.getFullYear()?{month:'short',day:'numeric'}:{year:'numeric',month:'short',day:'numeric'});
}
function fmtDT(iso) { return iso ? new Date(iso).toLocaleString() : ''; }
function title(n) {
  if (n.title) return n.title;
  const first = (n.content||'').split('\n').map(l=>l.trim()).find(Boolean);
  return first ? (first.length>50?first.slice(0,50)+'…':first) : 'Untitled';
}
function preview(n) {
  return (n.content||'').split('\n').map(l=>l.trim()).filter(Boolean).slice(1).join(' ').slice(0,120);
}
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3)|8).toString(16);});
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hide');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hide'), 2200);
}

/* ============================================================ STATE */

let state = { view:'all', catFilter:'all', search:'', editingId:null, activeSession:null, penY: null };
let penDragging = false, penStartY = 0, penStartScreenY = 0, penMoved = 0;

/* ============================================================ NAVIGATION */

function switchView(name) {
  state.view = name;
  $$('.view').forEach(v => v.classList.toggle('show', v.id === 'v-'+name));
  $$('.sb-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view===name));
  closeSidebar();
  if (name==='all') renderList();
  else if (name==='review') renderReview();
  else if (name==='sessions') renderSessions();
  else if (name==='settings') renderSettings();
}

/* ============================================================ SIDEBAR */

function openSidebar() { $('#sidebar').classList.add('open'); $('#backdrop').classList.add('show'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#backdrop').classList.remove('show'); }

$('#btn-menu').addEventListener('click', openSidebar);
$('#backdrop').addEventListener('click', closeSidebar);
$$('.sb-btn[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

/* ============================================================ NOTE LIST */

function renderChips() {
  const el = $('#chips');
  el.innerHTML = '';
  const add = (key,label) => {
    const b = document.createElement('button');
    b.className = 'chip'+(state.catFilter===key?' on':'');
    b.textContent = label;
    b.onclick = () => { state.catFilter=key; renderChips(); renderList(); };
    el.appendChild(b);
  };
  add('all','All');
  for (const [k,c] of Object.entries(CATEGORIES)) add(k,c.label);
}

async function renderList() {
  renderChips();
  const list = $('#list');
  const notes = await store.listNotes({
    category: state.catFilter==='all'?undefined:state.catFilter,
    query: state.search||undefined
  });
  list.innerHTML = '';
  if (!notes.length) {
    list.innerHTML = '<div class="empty">'+(state.search?'No matches.':'No notes yet. Tap the pen to start.')+'</div>';
    return;
  }
  for (const n of notes) {
    const card = document.createElement('div');
    card.className = 'card';
    const catLabel = (CATEGORIES[n.category]&&CATEGORIES[n.category].label)||n.category;
    const prev = preview(n);
    const src = n.sourceText ? '<div style="font-size:11px;color:var(--ac);margin-top:4px;font-style:italic">📎 '+esc(n.sourceText.slice(0,60))+'</div>' : '';
    card.innerHTML = '<div class="card-top"><span class="cc">'+esc(catLabel)+'</span><span class="ct">'+esc(title(n))+'</span></div>'+(prev?'<div class="cp">'+esc(prev)+'</div>':'')+(n.book?'<div class="cm">'+esc(n.book)+'</div>':'')+src;
    card.onclick = () => openEditor(n.id);
    list.appendChild(card);
  }
  const stats = await store.getStats();
  const parts = [stats.total+' note'+(stats.total===1?'':'s')];
  $('#sb-stats').textContent = parts.join(' · ');
}

$('#search').addEventListener('input', e => { state.search = e.target.value.trim(); renderList(); });

/* ============================================================ EDITOR */

let editTimer = null;

async function openEditor(id) {
  const note = await store.getNote(id);
  if (!note) return;
  state.editingId = id;

  const sel = $('#eb-cat');
  sel.innerHTML = '';
  for (const [k,c] of Object.entries(CATEGORIES)) {
    const opt = document.createElement('option');
    opt.value=k; opt.textContent=c.label; sel.appendChild(opt);
  }
  sel.value = note.category;
  $('#eb-title').value = note.title||'';
  $('#eb-content').value = note.content;
  $('#eb-book').value = note.book||'';
  $('#eb-author').value = note.author||'';
  $('#eb-page').value = note.page||'';
  $('#eb-source').value = note.sourceText||'';
  $('#eb-ts').textContent = 'Created '+fmtDT(note.createdAt)+' · Modified '+fmtDT(note.updatedAt);

  $('#editor').classList.add('show');
  $('#pc-close').click();
}

function closeEditor() {
  state.editingId = null;
  $('#editor').classList.remove('show');
}

function editorPatch() {
  return {
    category: $('#eb-cat').value,
    title: $('#eb-title').value.trim(),
    content: $('#eb-content').value,
    book: $('#eb-book').value.trim(),
    author: $('#eb-author').value.trim(),
    page: $('#eb-page').value.trim(),
    sourceText: $('#eb-source').value.trim()
  };
}

async function saveEditor() {
  if (!state.editingId) return;
  await store.updateNote(state.editingId, editorPatch());
  renderList();
}

['eb-title','eb-content','eb-book','eb-author','eb-page','eb-source'].forEach(id => {
  $('#'+id).addEventListener('input', () => {
    clearTimeout(editTimer);
    editTimer = setTimeout(saveEditor, 600);
  });
});
$('#eb-cat').addEventListener('change', saveEditor);

$('#eb-back').addEventListener('click', () => { saveEditor(); closeEditor(); });

let delArmed = false;
$('#eb-del').addEventListener('click', async () => {
  if (!state.editingId) return;
  if (!delArmed) {
    delArmed = true;
    $('#eb-del').textContent = 'Confirm?';
    setTimeout(() => { delArmed = false; $('#eb-del').textContent = 'Delete'; }, 3000);
    return;
  }
  await store.deleteNote(state.editingId);
  closeEditor();
  toast('Deleted');
  renderList();
});

$('#btn-new').addEventListener('click', async () => {
  const note = await store.createNote({category:'observe',content:''});
  openEditor(note.id);
  $('#eb-title').focus();
});
$('#sb-new').addEventListener('click', async () => {
  closeSidebar();
  const note = await store.createNote({category:'observe',content:''});
  openEditor(note.id);
  $('#eb-title').focus();
});

/* ============================================================ FLOATING PEN */

let panelCat = 'observe';

function renderPenChips() {
  const el = $('#pc-chips');
  el.innerHTML = '';
  for (const [k,c] of Object.entries(CATEGORIES)) {
    const b = document.createElement('button');
    b.className = 'chip'+(panelCat===k?' on':'');
    b.textContent = c.label;
    b.onclick = () => { panelCat=k; renderPenChips(); $('#pc-prompt').textContent=c.prompt; };
    el.appendChild(b);
  }
}

function openPanel() {
  $('#panel').classList.add('show');
  renderPenChips();
  $('#pc-prompt').textContent = CATEGORIES[panelCat].prompt;
  $('#pc-text').value = '';
  setTimeout(() => $('#pc-text').focus(), 250);
}

function closePanel() {
  $('#panel').classList.remove('show');
}

$('#pc-close').addEventListener('click', () => {
  const text = $('#pc-text').value.trim();
  if (text) {
    store.createNote({category:panelCat,content:text});
    toast('Saved');
  }
  closePanel();
  renderList();
});

$('#pc-save').addEventListener('click', async () => {
  const text = $('#pc-text').value.trim();
  if (!text) { toast('Nothing to save'); return; }
  await store.createNote({category:panelCat,content:text});
  $('#pc-text').value = '';
  $('#pc-saved').textContent = 'Saved';
  setTimeout(() => { $('#pc-saved').textContent=''; }, 1500);
  renderList();
});

// pen click/tap
let penTapTimeout = null;
$('#pen').addEventListener('click', (e) => {
  if (penMoved > 5) return; // was a drag, not a tap
  if ($('#panel').classList.contains('show')) { closePanel(); return; }
  openPanel();
});

// pen drag
$('#pen').addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  penDragging = true;
  penMoved = 0;
  penStartScreenY = e.screenY;
  penStartScreenY = e.clientY;
  penStartY = state.penY != null ? state.penY : parseInt(getComputedStyle($('#pen')).bottom);
  $('#pen').setPointerCapture(e.pointerId);
  e.preventDefault();
});

$('#pen').addEventListener('pointermove', (e) => {
  if (!penDragging) return;
  const dy = e.clientY - penStartScreenY;
  penMoved = Math.max(penMoved, Math.abs(dy));
  if (penMoved > 3) {
    const newY = Math.max(20, Math.min(window.innerHeight - 80, penStartY - dy));
    state.penY = newY;
    $('#pen').style.bottom = newY + 'px';
  }
});

$('#pen').addEventListener('pointerup', () => { penDragging = false; });

/* ============================================================ REVIEW */

async function renderReview() {
  const activeRange = $('#rf .chip.on');
  const range = activeRange ? activeRange.dataset.range : 'today';
  const all = await store.listNotes({});
  const now = Date.now();
  const day = 86400000;
  const startMap = { today: now - (now % day), week: now - 7*day, month: now - 30*day };
  const filtered = range==='older'
    ? all.filter(n => new Date(n.createdAt).getTime() < now - 30*day)
    : all.filter(n => new Date(n.createdAt).getTime() >= (startMap[range]||0));
  const list = $('#rl');
  list.innerHTML = '';
  if (!filtered.length) { list.innerHTML='<div class="empty">Nothing from this period yet.</div>'; return; }
  for (const n of filtered) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-top"><span class="cc">'+esc((CATEGORIES[n.category]&&CATEGORIES[n.category].label)||n.category)+'</span><span class="ct">'+esc(title(n))+'</span></div><div class="cp">'+esc(preview(n))+'</div>';
    card.onclick = () => openEditor(n.id);
    list.appendChild(card);
  }
}

$('#rf').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $$('#rf .chip').forEach(c => c.classList.toggle('on', c===chip));
  renderReview();
});

let revisitNote = null;
$('#rv-btn').addEventListener('click', async () => {
  revisitNote = await store.randomRevisit();
  const body = $('#rv-body');
  if (!revisitNote) { body.textContent='No observations, lines, or connections yet.'; $('#rv-open').hidden=true; return; }
  body.textContent = revisitNote.content;
  $('#rv-open').hidden = false;
});
$('#rv-open').addEventListener('click', () => { if (revisitNote) openEditor(revisitNote.id); });

/* ============================================================ SESSIONS */

async function renderSessions() {
  const sessions = await store.listSessions();
  const list = $('#sl');
  list.innerHTML = '';
  if (!sessions.length) { list.innerHTML='<div class="empty">No sessions yet. Start one while you read.</div>'; return; }
  for (const s of sessions) {
    const { notes } = await store.getSession(s.id);
    const item = document.createElement('div');
    item.className = 'card';
    item.style.marginBottom = '8px';
    const ongoing = !s.endedAt;
    item.innerHTML = '<div class="card-top"><span class="ct">'+esc(s.book||'Session')+'</span>'+(s.author?'<span class="cc">'+esc(s.author)+'</span>':'')+'</div><div class="cm">'+fmtDate(s.startedAt)+(ongoing?' · ongoing':' · ended')+' · '+notes.length+' note'+(notes.length===1?'':'s')+'</div>';
    list.appendChild(item);
  }
}

$('#s-new').addEventListener('click', () => $('#modal-session').classList.add('show'));
$('#ms-start').addEventListener('click', async () => {
  const book = $('#ms-book').value.trim();
  const author = $('#ms-author').value.trim();
  await store.createSession({book,author});
  closeModal('modal-session');
  state.activeSession = await store.getActiveSession();
  toast('Session started');
  renderSessions();
});

/* ============================================================ SETTINGS */

async function renderSettings() {
  const authEl = $('#auth-section');
  if (currentUser) {
    authEl.innerHTML = '<div style="font-size:13px;margin-bottom:8px">Signed in as <strong>'+esc(currentUser.email)+'</strong></div>' +
      '<div style="font-size:12px;color:var(--mt);margin-bottom:8px">Notes sync automatically when online.</div>' +
      '<button class="btn btn-g" style="width:100%" onclick="doSignOut()">Sign out</button>' +
      '<button class="btn btn-p" style="width:100%;margin-top:8px" onclick="doSyncNow()">Sync now</button>';
  } else {
    authEl.innerHTML = '<button class="btn btn-g" style="width:100%" onclick="showAuthModal()">Sign in to sync across devices</button>' +
      '<div style="font-size:11px;color:var(--ft);margin-top:6px">Create an account to access your notes from any device.</div>';
  }
}

function showAuthModal() { $('#modal-auth').classList.add('show'); }

window.showAuthModal = showAuthModal;
window.closeModal = (id) => { $('#'+id).classList.remove('show'); };

window.doSignOut = async () => {
  await signOut();
  renderSettings();
  toast('Signed out');
};

window.doSyncNow = async () => {
  if (!navigator.onLine) { toast('Offline. Will sync when connected.'); return; }
  toast('Syncing…');
  await fullSync();
};

// Auth modal handlers
let authMode = 'signin';
$('#auth-toggle').addEventListener('click', () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  $('#auth-title').textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
  $('#auth-sub').textContent = authMode === 'signin' ? 'Sign in to sync notes across devices.' : 'Create an account to access your notes from any device.';
  $('#auth-submit').textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
  $('#auth-toggle').textContent = authMode === 'signin' ? 'Create account' : 'Sign in instead';
});

$('#auth-submit').addEventListener('click', async () => {
  const email = $('#auth-email').value.trim();
  const pass = $('#auth-pass').value;
  if (!email || !pass) { toast('Enter email and password'); return; }
  try {
    if (authMode === 'signin') {
      await signIn(email, pass);
    } else {
      await signUp(email, pass);
      toast('Check your email to confirm');
    }
    closeModal('modal-auth');
    renderSettings();
    toast('Signed in');
  } catch (e) {
    toast(e.message || 'Auth failed');
  }
});

$('#set-export').addEventListener('click', async () => {
  const data = store.exportAll();
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='marginalia-backup-'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(url);
  toast('Exported');
});

$('#set-backup').addEventListener('click', async () => {
  const data = store.exportAll();
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='marginalia-backup-'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(url);
  toast('Backup created');
});

$('#set-restore').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type='file'; input.accept='.json'; input.style.display='none';
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    const text = await file.text();
    const payload = JSON.parse(text);
    store.importAll(payload);
    toast('Restored');
    renderList();
  };
  input.click();
});

/* ============================================================ INSTALL */

(function() {
  const bar = $('#install-bar');
  const btn = $('#btn-install');
  if (!bar) return;
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;

  let dp = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); dp = e;
    $('#install-text').textContent = 'Add Marginalia to your home screen';
    bar.hidden = false;
  });
  if (/iP(hone|ad|od)/.test(navigator.userAgent) && !navigator.standalone) {
    $('#install-text').textContent = 'Tap Share → Add to Home Screen';
    btn.hidden = true; bar.hidden = false;
  }
  btn.addEventListener('click', () => { if(dp){dp.prompt();dp.userChoice.then(()=>{bar.hidden=true;});} });
  window.addEventListener('appinstalled', () => { bar.hidden=true; });
})();

/* ============================================================ UPDATES */

(function() {
  const key = 'marginalia-version';
  const stored = localStorage.getItem(key);
  if (stored && stored !== APP_VERSION) {
    $('#update-bar').classList.add('show');
  }
  localStorage.setItem(key, APP_VERSION);
})();

/* ============================================================ SYNC */

const SYNC_KEY = 'marginalia-pending-sync';

async function getPendingSync() {
  try {
    const db = await openDB();
    const v = await idbGet(db, SYNC_KEY);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

async function setPendingSync(queue) {
  const db = await openDB();
  await idbSet(db, SYNC_KEY, JSON.stringify(queue));
}

async function addToSyncQueue(action, table, id, data) {
  const queue = await getPendingSync();
  queue.push({ action, table, id, data, ts: Date.now() });
  await setPendingSync(queue);
}

async function flushSyncQueue() {
  if (!sb || !currentUser) return;
  const queue = await getPendingSync();
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try {
      if (item.action === 'upsert') {
        await sb.from(item.table).upsert({ ...item.data, user_id: currentUser.id });
      } else if (item.action === 'delete') {
        await sb.from(item.table).delete().eq('id', item.id).eq('user_id', currentUser.id);
      }
    } catch { remaining.push(item); }
  }
  await setPendingSync(remaining);
  if (remaining.length === 0) toast('Synced to cloud');
}

async function fullSync() {
  if (!sb || !currentUser) return;
  // Pull remote and merge with local
  try {
    const { data: remoteNotes } = await sb.from('notes').select('*').eq('user_id', currentUser.id);
    const { data: remoteSessions } = await sb.from('sessions').select('*').eq('user_id', currentUser.id);
    // Upsert remote into local store
    if (remoteNotes) {
      for (const rn of remoteNotes) {
        const local = await store.getNote(rn.id);
        if (!local || new Date(rn.updated_at) > new Date(local.updatedAt)) {
          await store.updateNote(rn.id, {
            category: rn.category, title: rn.title, content: rn.content,
            book: rn.book, author: rn.author, page: rn.page,
            sourceText: rn.source_text, tags: rn.tags, sessionId: rn.session_id,
            links: rn.links, createdAt: rn.created_at, updatedAt: rn.updated_at
          });
        }
      }
    }
    if (remoteSessions) {
      for (const rs of remoteSessions) {
        const local = await store.getSession(rs.id);
        if (!local || new Date(rs.updated_at) > new Date(local.session?.updatedAt)) {
          await store.updateSession(rs.id, {
            book: rs.book, author: rs.author, chapter: rs.chapter,
            pageRange: rs.page_range, startedAt: rs.started_at,
            endedAt: rs.ended_at, createdAt: rs.created_at, updatedAt: rs.updated_at
          });
        }
      }
    }
    // Push local to remote
    const localNotes = await store.listNotes({});
    for (const ln of localNotes) {
      await sb.from('notes').upsert({
        id: ln.id, user_id: currentUser.id,
        category: ln.category, title: ln.title, content: ln.content,
        book: ln.book, author: ln.author, page: ln.page,
        source_text: ln.sourceText, tags: ln.tags, session_id: ln.sessionId,
        links: ln.links, created_at: ln.createdAt, updated_at: ln.updatedAt
      }, { onConflict: 'id' });
    }
    const localSessions = await store.listSessions();
    for (const ls of localSessions) {
      await sb.from('sessions').upsert({
        id: ls.id, user_id: currentUser.id,
        book: ls.book, author: ls.author, chapter: ls.chapter,
        page_range: ls.pageRange, started_at: ls.startedAt,
        ended_at: ls.endedAt, created_at: ls.createdAt, updated_at: ls.updatedAt
      }, { onConflict: 'id' });
    }
    await flushSyncQueue();
    renderList();
    toast('Synced with cloud');
  } catch (e) { console.error('Sync failed:', e); }
}

// Sync status indicator
function updateSyncDot() {
  const dot = $('#sync-dot');
  if (!dot) return;
  if (!currentUser) { dot.textContent = ''; dot.style.color = 'var(--ft)'; return; }
  if (navigator.onLine) { dot.textContent = '●'; dot.style.color = '#4caf50'; }
  else { dot.textContent = '○'; dot.style.color = '#ff9800'; }
}

// Auto-sync: when coming online, flush queue
window.addEventListener('online', () => {
  toast('Back online. Syncing…');
  updateSyncDot();
  flushSyncQueue();
});
window.addEventListener('offline', () => {
  toast('Offline. Saving locally.');
  updateSyncDot();
});
updateSyncDot();

// After each save, try to sync if online
const originalCreateNote = Store.prototype.createNote;
const originalUpdateNote = Store.prototype.updateNote;
const originalDeleteNote = Store.prototype.deleteNote;

if (Store) {
  Store.prototype.createNote = async function(input) {
    const note = originalCreateNote.call(this, input);
    if (navigator.onLine && sb && currentUser) {
      try {
        await sb.from('notes').upsert({
          id: note.id, user_id: currentUser.id,
          category: note.category, title: note.title, content: note.content,
          book: note.book, author: note.author, page: note.page,
          source_text: note.sourceText, tags: note.tags, session_id: note.sessionId,
          links: note.links, created_at: note.createdAt, updated_at: note.updatedAt
        });
      } catch { await addToSyncQueue('upsert', 'notes', note.id, note); }
    } else {
      await addToSyncQueue('upsert', 'notes', note.id, note);
    }
    return note;
  };

  Store.prototype.updateNote = async function(id, patch) {
    const note = originalUpdateNote.call(this, id, patch);
    if (!note) return null;
    if (navigator.onLine && sb && currentUser) {
      try {
        await sb.from('notes').upsert({
          id: note.id, user_id: currentUser.id,
          category: note.category, title: note.title, content: note.content,
          book: note.book, author: note.author, page: note.page,
          source_text: note.sourceText, tags: note.tags, session_id: note.sessionId,
          links: note.links, created_at: note.createdAt, updated_at: note.updatedAt
        }, { onConflict: 'id' });
      } catch { await addToSyncQueue('upsert', 'notes', note.id, note); }
    } else {
      await addToSyncQueue('upsert', 'notes', note.id, note);
    }
    return note;
  };

  Store.prototype.deleteNote = async function(id) {
    const result = originalDeleteNote.call(this, id);
    if (navigator.onLine && sb && currentUser) {
      try {
        await sb.from('notes').delete().eq('id', id).eq('user_id', currentUser.id);
      } catch { await addToSyncQueue('delete', 'notes', id); }
    } else {
      await addToSyncQueue('delete', 'notes', id);
    }
    return result;
  };

  // Session sync
  const origCreateSession = Store.prototype.createSession;
  const origEndSession = Store.prototype.endSession;

  Store.prototype.createSession = async function(data) {
    const session = origCreateSession.call(this, data);
    if (navigator.onLine && sb && currentUser) {
      try {
        await sb.from('sessions').upsert({
          id: session.id, user_id: currentUser.id,
          book: session.book, author: session.author, chapter: session.chapter,
          page_range: session.pageRange, started_at: session.startedAt,
          ended_at: session.endedAt, created_at: session.createdAt, updated_at: session.updatedAt
        });
      } catch { await addToSyncQueue('upsert', 'sessions', session.id, session); }
    } else {
      await addToSyncQueue('upsert', 'sessions', session.id, session);
    }
    return session;
  };

  Store.prototype.endSession = async function(id) {
    const session = origEndSession.call(this, id);
    if (!session) return null;
    if (navigator.onLine && sb && currentUser) {
      try {
        await sb.from('sessions').upsert({
          id: session.id, user_id: currentUser.id,
          book: session.book, author: session.author, chapter: session.chapter,
          page_range: session.pageRange, started_at: session.startedAt,
          ended_at: session.endedAt, created_at: session.createdAt, updated_at: session.updatedAt
        }, { onConflict: 'id' });
      } catch { await addToSyncQueue('upsert', 'sessions', session.id, session); }
    } else {
      await addToSyncQueue('upsert', 'sessions', session.id, session);
    }
    return session;
  };
}

/* ============================================================ INIT */

(async function boot() {
  initSupabase();
  await initStore();
  // Check for existing session
  await get_session_user();
  renderList();
  const s = await store.getSettings();
  state.activeSession = await store.getActiveSession();
  // If online and logged in, sync
  if (navigator.onLine && currentUser) flushSyncQueue();
})();

/* ============================================================ SERVICE WORKER */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
