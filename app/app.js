'use strict';

/* ================================================================ CONFIG */
const CATEGORIES = {
  observe:{label:'Observe',icon:'&#128065;',prompt:'What did you notice?'},
  image:{label:'Images',icon:'&#127912;',prompt:'What image stayed with you?'},
  connection:{label:'Connections',icon:'&#128279;',prompt:'What does this remind you of?'},
  feeling:{label:'Feelings',icon:'&#10084;',prompt:'What did this make you feel?'},
  idea:{label:'Ideas',icon:'&#128161;',prompt:'What thought came to you?'},
  line:{label:'Lines',icon:'&#9998;',prompt:'A line of your own?'},
  draft:{label:'Drafts',icon:'&#128221;',prompt:'Write a little.'},
  poem:{label:'Poems',icon:'&#127925;',prompt:'A finished piece.'}
};
const APP_VERSION = '1.3.0';

/* ================================================================ STORE */
const { Store } = window.MarginaliaStore || {};
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
let state = { view:'all', catFilter:'all', catView:null, search:'', editingId:null, activeSession:null };

/* ============================================================ NAVIGATION */
function switchView(name) {
  state.view = name;
  $$('.view').forEach(v => v.classList.toggle('show', v.id === 'v-'+name));
  $$('.sb-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view===name));
  closeSidebar();
  if (name==='all') renderList();
  else if (name==='categories') renderCategories();
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

/* ============================================================ CATEGORIES VIEW */
async function renderCategories() {
  const grid = $('#cat-grid'); grid.innerHTML = '';
  for (const [k,c] of Object.entries(CATEGORIES)) {
    const card = document.createElement('div'); card.className = 'cat-card';
    card.innerHTML = '<div class="cat-icon">'+c.icon+'</div><div class="cat-name">'+c.label+'</div>';
    card.onclick = () => { state.catView = k; showCategoryNotes(k); };
    grid.appendChild(card);
  }
  $('#cat-list').innerHTML = '';
}
async function showCategoryNotes(cat) {
  const notes = await store.listNotes({ category: cat });
  const el = $('#cat-list'); el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><button class="btn btn-g btn-sm" id="cat-back">&larr; Back</button><span style="font-size:14px;font-weight:600">'+CATEGORIES[cat].label+'</span></div>';
  $('#cat-back').onclick = () => { state.catView = null; renderCategories(); };
  if (!notes.length) { el.innerHTML += '<div class="empty">No notes in this category yet.</div>'; return; }
  for (const n of notes) {
    const card = document.createElement('div'); card.className = 'card'; card.style.marginBottom='8px';
    card.innerHTML = '<div class="card-top"><span class="ct">'+esc(noteTitle(n))+'</span></div>'+(notePreview(n)?'<div class="cp">'+esc(notePreview(n))+'</div>':'')+(n.book?'<div class="cm">'+esc(n.book)+'</div>':'');
    card.onclick = () => openEditor(n.id); el.appendChild(card);
  }
}

/* ============================================================ NOTE LIST */
function renderChips() {
  const el = $('#chips'); el.innerHTML = '';
  const add = (key,label) => {
    const b = document.createElement('button'); b.className = 'chip'+(state.catFilter===key?' on':'');
    b.textContent = label; b.onclick = () => { state.catFilter=key; renderChips(); renderList(); }; el.appendChild(b);
  };
  add('all','All');
  for (const [k,c] of Object.entries(CATEGORIES)) add(k,c.label);
}
async function renderList() {
  renderChips();
  const list = $('#list');
  const notes = await store.listNotes({ category: state.catFilter==='all'?undefined:state.catFilter, query: state.search||undefined });
  list.innerHTML = '';
  if (!notes.length) { list.innerHTML = '<div class="empty">'+(state.search?'No matches.':'No notes yet. Tap the pen to start.')+'</div>'; return; }
  for (const n of notes) {
    const card = document.createElement('div'); card.className = 'card';
    const catLabel = (CATEGORIES[n.category]&&CATEGORIES[n.category].label)||n.category;
    const prev = notePreview(n);
    const src = n.sourceText ? '<div class="cs">Source: '+esc(n.sourceText.slice(0,80))+'</div>' : '';
    card.innerHTML = '<div class="card-top"><span class="cc">'+esc(catLabel)+'</span><span class="ct">'+esc(noteTitle(n))+'</span></div>'+(prev?'<div class="cp">'+esc(prev)+'</div>':'')+(n.book?'<div class="cm">'+esc(n.book)+(n.page?' p.'+esc(n.page):'')+'</div>':'')+src;
    card.onclick = () => openEditor(n.id); list.appendChild(card);
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
}
function closeEditor() { state.editingId = null; $('#editor').classList.remove('show'); }
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
}
function closePanel() { $('#panel').classList.remove('show'); }
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
  let filtered;
  if (range==='older') filtered = all.filter(n => new Date(n.updatedAt||n.createdAt).getTime() < now-30*day);
  else if (range==='week') filtered = all.filter(n => new Date(n.updatedAt||n.createdAt).getTime() >= now-7*day);
  else filtered = all.filter(n => new Date(n.updatedAt||n.createdAt).getTime() >= now-30*day);
  const list = $('#rl'); list.innerHTML = '';
  if (!filtered.length) { list.innerHTML='<div class="empty">Nothing in this range yet.</div>'; return; }
  for (const n of filtered) {
    const card = document.createElement('div'); card.className = 'card'; card.style.marginBottom='8px';
    const src = n.sourceText ? '<div class="cs">Source: '+esc(n.sourceText.slice(0,60))+'</div>' : '';
    card.innerHTML = '<div class="card-top"><span class="cc">'+esc((CATEGORIES[n.category]&&CATEGORIES[n.category].label)||n.category)+'</span><span class="ct">'+esc(noteTitle(n))+'</span></div>'+(notePreview(n)?'<div class="cp">'+esc(notePreview(n))+'</div>':'')+src;
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
async function renderSessions() {
  const sessions = await store.listSessions(); const list=$('#sl'); list.innerHTML='';
  if (!sessions.length) { list.innerHTML='<div class="empty">No sessions yet.</div>'; return; }
  for (const s of sessions) {
    const {notes} = await store.getSession(s.id);
    const item = document.createElement('div'); item.className='card'; item.style.marginBottom='8px';
    const status = s.endedAt ? 'ended' : 'ongoing';
    item.innerHTML = '<div class="card-top"><span class="ct">'+esc(s.book||'Reading session')+'</span>'+(s.author?'<span class="cc">'+esc(s.author)+'</span>':'')+'</div><div class="cm">'+fmtDate(s.startedAt)+' / '+status+' / '+notes.length+' note'+(notes.length===1?'':'s')+'</div>';
    list.appendChild(item);
  }
}
$('#s-new').addEventListener('click', () => $('#modal-session').classList.add('show'));
$('#ms-start').addEventListener('click', async () => {
  const book=$('#ms-book').value.trim(), author=$('#ms-author').value.trim();
  await store.createSession({book,author}); closeModal('modal-session');
  state.activeSession=await store.getActiveSession(); toast('Session started'); renderSessions();
});

/* ============================================================ SETTINGS */
async function renderSettings() {
  const authEl = $('#auth-section');
  if (currentUser) {
    authEl.innerHTML = '<div style="font-size:13px;margin-bottom:8px">Signed in as <strong>'+esc(currentUser.email)+'</strong></div>'+
      '<div style="font-size:12px;color:var(--mt);margin-bottom:8px">Notes sync automatically when online.</div>'+
      '<button class="btn btn-g" style="width:100%" onclick="doSignOut()">Sign out</button>'+
      '<button class="btn btn-p" style="width:100%;margin-top:8px" onclick="doSyncNow()">Sync now</button>';
  } else {
    authEl.innerHTML = '<button class="btn btn-g" style="width:100%" onclick="showAuthModal()">Sign in to sync across devices</button>'+
      '<div style="font-size:11px;color:var(--ft);margin-top:6px">Create an account to sync notes from any device.</div>';
  }
}
window.showAuthModal = () => { $('#modal-auth').classList.add('show'); };
window.closeModal = (id) => { document.getElementById(id).classList.remove('show'); };
window.doSignOut = async () => { await signOut(); renderSettings(); toast('Signed out'); };
window.doSyncNow = async () => { if (!navigator.onLine) { toast('Offline. Will sync when connected.'); return; } toast('Syncing...'); await fullSync(); };

/* ============================================================ AUTH */
let sb = null, currentUser = null;
function initSupabase() {
  if (window.SUPABASE_URL && window.SUPABASE_ANON && window.supabase) {
    try { sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON); return true; }
    catch(e) { console.error('Supabase init failed:', e); return false; }
  }
  return false;
}
async function signUp(email, password) {
  if (!sb) throw new Error('Sync not configured');
  const { data, error } = await sb.auth.signUp({ email, password }, {
    emailRedirectTo: window.location.origin + window.location.pathname
  });
  if (error) throw error;
  currentUser = data.user;
  if (data.session) { currentUser = data.session.user; await fullSync(); }
  return data;
}
async function signIn(email, password) {
  if (!sb) throw new Error('Sync not configured');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user; await fullSync(); return data;
}
async function signOut() { if (sb) await sb.auth.signOut(); currentUser = null; }
async function getSessionUser() {
  if (!sb) return null;
  try { const { data } = await sb.auth.getSession(); currentUser = data.session?.user || null; } catch {}
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
  if (!email||!pass) { toast('Enter email and password'); return; }
  try {
    if (authMode==='signin') {
      await signIn(email,pass);
      toast('Signed in');
      closeModal('modal-auth'); renderSettings();
    } else {
      const r = await signUp(email,pass);
      if (!r.session) {
        toast('Account created! Check your email to confirm.');
        closeModal('modal-auth');
      } else {
        toast('Account created and signed in');
        closeModal('modal-auth'); renderSettings();
      }
    }
  } catch (e) {
    let msg = e.message || 'Auth failed';
    if (msg.includes('already registered')) msg = 'This email is already registered. Try signing in.';
    else if (msg.includes('Invalid login')) msg = 'Wrong email or password.';
    else if (msg.includes('Email not confirmed')) msg = 'Email not confirmed. Check your inbox.';
    else if (msg.includes('over_email_send')) msg = 'Too many attempts. Wait a minute and try again.';
    toast(msg);
  }
});

// Password eye toggle
$('#auth-eye').addEventListener('click', () => {
  const input = document.getElementById('auth-pass');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  document.getElementById('auth-eye').innerHTML = isPassword ? '&#128064;' : '&#128065;';
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
    } catch { rem.push(item); }
  }
  await setPendingSync(rem);
  if (rem.length===0) toast('Synced to cloud');
}
async function fullSync() {
  if (!sb||!currentUser) return;
  try {
    const {data:rn, err:e1} = await sb.from('notes').select('*').eq('user_id',currentUser.id);
    const {data:rs, err:e2} = await sb.from('sessions').select('*').eq('user_id',currentUser.id);
    if (e1) console.error('Sync notes fetch error:', e1);
    if (e2) console.error('Sync sessions fetch error:', e2);
    if (rn) for (const n of rn) {
      const local=await store.getNote(n.id);
      if (!local||new Date(n.updated_at)>new Date(local.updatedAt)) {
        await store.updateNote(n.id,{category:n.category,title:n.title,content:n.content,book:n.book,author:n.author,page:n.page,sourceText:n.source_text,tags:n.tags,sessionId:n.session_id,links:n.links,createdAt:n.created_at,updatedAt:n.updated_at}).catch(()=>{});
      }
    }
    if (rs) for (const s of rs) {
      const local=await store.getSession(s.id);
      if (!local||!local.session||new Date(s.updated_at)>new Date(local.session.updatedAt)) {
        await store.updateSession(s.id,{book:s.book,author:s.author,chapter:s.chapter,pageRange:s.page_range,startedAt:s.started_at,endedAt:s.ended_at,createdAt:s.created_at,updatedAt:s.updated_at}).catch(()=>{});
      }
    }
    const ln=await store.listNotes({});
    for (const n of ln) await sb.from('notes').upsert({id:n.id,user_id:currentUser.id,category:n.category,title:n.title,content:n.content,book:n.book,author:n.author,page:n.page,source_text:n.sourceText,tags:n.tags||[],session_id:n.sessionId,links:n.links||[],created_at:n.createdAt,updated_at:n.updatedAt},{onConflict:'id'}).catch(()=>{});
    const ls=await store.listSessions();
    for (const s of ls) await sb.from('sessions').upsert({id:s.id,user_id:currentUser.id,book:s.book,author:s.author,chapter:s.chapter,page_range:s.pageRange,started_at:s.startedAt,ended_at:s.endedAt,created_at:s.createdAt,updated_at:s.updatedAt},{onConflict:'id'}).catch(()=>{});
    await flushSyncQueue(); renderList(); toast('Synced with cloud');
  } catch(e) { console.error('Sync failed:',e); }
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
  Store.prototype.createNote=async function(i){const n=origCreate.call(this,i);if(navigator.onLine&&sb&&currentUser){try{await sb.from('notes').upsert({id:n.id,user_id:currentUser.id,category:n.category,title:n.title,content:n.content,book:n.book,author:n.author,page:n.page,source_text:n.sourceText,tags:n.tags||[],session_id:n.sessionId,links:n.links||[],created_at:n.createdAt,updated_at:n.updatedAt});}catch{await addToSyncQueue('upsert','notes',n.id,n);}}else{await addToSyncQueue('upsert','notes',n.id,n);}return n;};
  Store.prototype.updateNote=async function(id,p){const n=origUpdate.call(this,id,p);if(!n)return null;if(navigator.onLine&&sb&&currentUser){try{await sb.from('notes').upsert({id:n.id,user_id:currentUser.id,category:n.category,title:n.title,content:n.content,book:n.book,author:n.author,page:n.page,source_text:n.sourceText,tags:n.tags||[],session_id:n.sessionId,links:n.links||[],created_at:n.createdAt,updated_at:n.updatedAt},{onConflict:'id'});}catch{await addToSyncQueue('upsert','notes',n.id,n);}}else{await addToSyncQueue('upsert','notes',n.id,n);}return n;};
  Store.prototype.deleteNote=async function(id){const r=origDelete.call(this,id);if(navigator.onLine&&sb&&currentUser){try{await sb.from('notes').delete().eq('id',id).eq('user_id',currentUser.id);}catch{await addToSyncQueue('delete','notes',id);}}else{await addToSyncQueue('delete','notes',id);}return r;};
  Store.prototype.createSession=async function(d){const s=origCreateSess.call(this,d);if(navigator.onLine&&sb&&currentUser){try{await sb.from('sessions').upsert({id:s.id,user_id:currentUser.id,book:s.book,author:s.author,chapter:s.chapter,page_range:s.pageRange,started_at:s.startedAt,ended_at:s.endedAt,created_at:s.createdAt,updated_at:s.updatedAt});}catch{await addToSyncQueue('upsert','sessions',s.id,s);}}else{await addToSyncQueue('upsert','sessions',s.id,s);}return s;};
  Store.prototype.endSession=async function(id){const s=origEndSess.call(this,id);if(!s)return null;if(navigator.onLine&&sb&&currentUser){try{await sb.from('sessions').upsert({id:s.id,user_id:currentUser.id,book:s.book,author:s.author,chapter:s.chapter,page_range:s.pageRange,started_at:s.startedAt,ended_at:s.endedAt,created_at:s.createdAt,updated_at:s.updatedAt},{onConflict:'id'});}catch{await addToSyncQueue('upsert','sessions',s.id,s);}}else{await addToSyncQueue('upsert','sessions',s.id,s);}return s;};
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

/* ============================================================ UPDATE CHECK */
let latestVersion = null;
async function checkForUpdates() {
  try {
    const res = await fetch('./version.json?t='+Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const { version } = await res.json();
      latestVersion = version;
      if (version && version !== APP_VERSION) {
        const bar = document.getElementById('update-bar');
        if (bar) {
          bar.classList.add('show');
          bar.querySelector('span').textContent = 'New version available (v'+version+'). Tap Restart to update.';
        }
      }
    }
  } catch (e) { console.log('Update check failed:', e); }
}
// Check on load
checkForUpdates();
// Check every time user comes back to the tab
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkForUpdates();
});
// Check every 5 minutes
setInterval(checkForUpdates, 5*60*1000);
// Settings button
const checkBtn = document.getElementById('set-check-update');
if (checkBtn) checkBtn.addEventListener('click', async () => {
  toast('Checking for updates...');
  await checkForUpdates();
  if (latestVersion && latestVersion !== APP_VERSION) {
    toast('Update found: v'+latestVersion+'. Restart to apply.');
  } else {
    toast('App is up to date (v'+APP_VERSION+')');
  }
});

/* ============================================================ SERVICE WORKER */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(reg => {
  // Check for service worker updates every minute
  setInterval(() => reg.update().catch(()=>{}), 60*1000);
});

/* ============================================================ INIT */
(async function boot() {
  initSupabase(); await initStore(); await getSessionUser();
  renderList(); state.activeSession = await store.getActiveSession();
  updateSyncDot();
  if (navigator.onLine && currentUser) flushSyncQueue();
})();
