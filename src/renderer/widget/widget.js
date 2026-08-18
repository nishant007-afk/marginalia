'use strict';

const bridge = window.api;

const widgetEl = document.getElementById('widget');
const penEl = document.getElementById('pen');
const tabsEl = document.getElementById('category-tabs');
const promptEl = document.getElementById('prompt');
const textEl = document.getElementById('note-text');
const metaRow = document.getElementById('meta-row');
const savedEl = document.getElementById('saved-indicator');
const sessionChip = document.getElementById('session-chip');
const sessionChipText = document.getElementById('session-chip-text');
const btnPin = document.getElementById('btn-pin');
const btnDetails = document.getElementById('btn-details');

const cats = bridge.categories;
let state = { expanded: false, penY: 0 };
let category = 'observe';

/* ------------------------------------------------------------ categories */

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const [key, c] of Object.entries(cats)) {
    const b = document.createElement('button');
    b.className = 'cat-tab' + (key === category ? ' active' : '');
    b.textContent = c.label;
    b.dataset.category = key;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => selectCategory(key, true));
    tabsEl.appendChild(b);
  }
}

function selectCategory(key, focus) {
  category = key;
  for (const b of tabsEl.querySelectorAll('.cat-tab')) {
    b.classList.toggle('active', b.dataset.category === key);
  }
  promptEl.textContent = cats[key].prompt;
  if (focus) textEl.focus();
}

/* ------------------------------------------------------------------ drag */

function makeDraggable(el, { onClick } = {}) {
  let dragging = false;
  let startScreenY = 0;
  let startPenY = 0;
  let moved = 0;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return; // let buttons do their thing
    dragging = true;
    moved = 0;
    startScreenY = e.screenY;
    startPenY = state.penY;
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) { /* ok */ }
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.screenY - startScreenY;
    moved = Math.max(moved, Math.abs(dy));
    if (moved > 3) bridge.setY(startPenY + dy);
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (moved <= 4 && onClick) onClick();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

makeDraggable(penEl, { onClick: () => bridge.toggle() });
makeDraggable(document.getElementById('panel-header'));

/* ------------------------------------------------------------------ save */

function parseTags(s) {
  return s ? s.split(',').map((t) => t.trim()).filter(Boolean) : [];
}

function fieldVal(id) {
  return document.getElementById(id).value.trim();
}

let flashTimer = null;
function flash(msg) {
  savedEl.textContent = msg;
  savedEl.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => savedEl.classList.remove('show'), 1400);
}

async function save() {
  const content = textEl.value.trim();
  if (!content) {
    flash('Nothing to save');
    return;
  }
  await bridge.saveNote({
    category,
    content,
    title: fieldVal('meta-title'),
    book: fieldVal('meta-book'),
    author: fieldVal('meta-author'),
    page: fieldVal('meta-page'),
    date: fieldVal('meta-date'),
    tags: parseTags(fieldVal('meta-tags'))
  });
  textEl.value = '';
  flash('Saved');
  refreshSession();
}

/* ------------------------------------------------------------- session */

async function refreshSession() {
  const { activeSession } = await bridge.getQuickContext();
  if (activeSession && activeSession.book) {
    sessionChipText.textContent = activeSession.book + (activeSession.author ? ` · ${activeSession.author}` : '');
    sessionChip.hidden = false;
  } else {
    sessionChip.hidden = true;
  }
}

/* ------------------------------------------------------------------ misc */

function applyState(s) {
  state = s;
  widgetEl.classList.toggle('expanded', s.expanded);
  btnPin.classList.toggle('active', s.pinExpanded);
  if (s.expanded) textEl.focus();
}

document.getElementById('btn-pin').addEventListener('click', () => {
  bridge.setPin(!state.pinExpanded);
});

document.getElementById('btn-library').addEventListener('click', () => bridge.openLibrary());
document.getElementById('btn-collapse').addEventListener('click', () => bridge.collapse());

btnDetails.addEventListener('click', () => {
  const hidden = metaRow.hidden;
  metaRow.hidden = !hidden;
});

document.getElementById('btn-save').addEventListener('click', save);

textEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    save();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.expanded) bridge.collapse();
});

textEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  bridge.contextMenu();
});
penEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  bridge.contextMenu();
});

/* ------------------------------------------------------------------ init */

renderTabs();
selectCategory('observe', false);
refreshSession();
bridge.onState(applyState);
bridge.onQuick((q) => {
  if (q && q.category) selectCategory(q.category);
  textEl.focus();
});
bridge.getState().then(applyState);
