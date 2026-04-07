'use strict';

// ─── App state ────────────────────────────────────────────────────────────────
let appData = { cards: [], intervalMinutes: 30, nextId: 1 };
let editingCardId = null; // null = new card

// ─── Scroll state (identical engine to Simple Teleprompter) ───────────────────
const scroll = {
  scrolling: false,
  offset:    0,       // px scrolled (positive = down)
  maxOffset: 0,
  lastTime:  null,
  rafId:     null,
  speed:     50,      // px/sec
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

// Views
const editView = document.getElementById('edit-view');
const readView = document.getElementById('read-view');

// Edit view
const statusDot      = document.getElementById('status-dot');
const statusText     = document.getElementById('status-text');
const startTimerBtn  = document.getElementById('start-timer-btn');
const stopTimerBtn   = document.getElementById('stop-timer-btn');
const intervalInput  = document.getElementById('interval-input');
const cardList       = document.getElementById('card-list');
const emptyState     = document.getElementById('empty-state');
const addCardBtn     = document.getElementById('add-card-btn');
const resetBtn       = document.getElementById('reset-btn');

// Read view
const positionBadge  = document.getElementById('position-badge');
const cueTitle       = document.getElementById('cue-title');
const cueScroller    = document.getElementById('cue-scroller');
const cueText        = document.getElementById('cue-text');
const playPauseBtn   = document.getElementById('play-pause-btn');
const playIcon       = document.getElementById('play-icon');
const hudSpeed       = document.getElementById('hud-speed');
const hudSpeedVal    = document.getElementById('hud-speed-val');
const progressFill   = document.getElementById('progress-bar-fill');

// Modal
const modalOverlay     = document.getElementById('modal-overlay');
const modalTitle       = document.getElementById('modal-title');
const modalCardTitle   = document.getElementById('modal-card-title');
const modalCardScript  = document.getElementById('modal-card-script');
const modalSave        = document.getElementById('modal-save');
const modalCancel      = document.getElementById('modal-cancel');
const modalClose       = document.getElementById('modal-close');

// Window controls
const btnClose    = document.getElementById('btn-close');
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');

// ─── Window controls ──────────────────────────────────────────────────────────
btnClose.addEventListener('click',    () => window.streamCue.close());
btnMinimize.addEventListener('click', () => window.streamCue.minimize());
btnMaximize.addEventListener('click', () => window.streamCue.maximize());

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  appData = await window.streamCue.getData();
  intervalInput.value = appData.intervalMinutes;
  renderCardList();

  const { running } = await window.streamCue.timerStatus();
  setTimerStatus(running);

  window.streamCue.onShowCue((payload) => {
    showReadView(payload.card, payload.position, payload.total);
  });
}

// ─── Timer controls ───────────────────────────────────────────────────────────
startTimerBtn.addEventListener('click', async () => {
  const { running } = await window.streamCue.startTimer();
  setTimerStatus(running);
});

stopTimerBtn.addEventListener('click', async () => {
  const { running } = await window.streamCue.stopTimer();
  setTimerStatus(running);
});

intervalInput.addEventListener('change', async () => {
  const minutes = Math.max(1, parseInt(intervalInput.value) || 1);
  intervalInput.value = minutes;
  appData = await window.streamCue.saveInterval(minutes);
});

function setTimerStatus(running) {
  statusDot.classList.toggle('running', running);
  statusText.textContent = running
    ? `Timer running — fires every ${appData.intervalMinutes} min`
    : 'Timer stopped';
  startTimerBtn.disabled = running;
  stopTimerBtn.disabled  = !running;
}

// ─── Reset dismissed ──────────────────────────────────────────────────────────
resetBtn.addEventListener('click', async () => {
  appData = await window.streamCue.resetCards();
  renderCardList();
  const { running } = await window.streamCue.timerStatus();
  setTimerStatus(running);
});

// ─── Card list rendering ──────────────────────────────────────────────────────
function renderCardList() {
  cardList.innerHTML = '';
  const cards = appData.cards;

  if (cards.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  cards.forEach((card, index) => {
    const item = document.createElement('div');
    item.className = 'card-item' + (card.dismissed ? ' dismissed' : '');
    item.dataset.id = card.id;

    const preview = card.script.trim().slice(0, 100).replace(/\s+/g, ' ');

    item.innerHTML = `
      <div class="card-drag-handle" title="Drag to reorder">&#8942;&#8942;</div>
      <div class="card-content">
        <div class="card-title">${escHtml(card.title)}</div>
        <div class="card-preview">${escHtml(preview)}${card.script.length > 100 ? '…' : ''}</div>
        <div class="card-meta">
          <span class="mode-badge ${card.mode === 'static' ? 'static' : ''}">${card.mode === 'static' ? '&#9776; Static' : '&#9654; Scroll'}</span>
          ${card.dismissed ? '<span class="dismissed-badge">Dismissed</span>' : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="card-btn move up"    title="Move up"   ${index === 0 ? 'disabled' : ''}>&#8679;</button>
        <button class="card-btn move down"  title="Move down" ${index === cards.length - 1 ? 'disabled' : ''}>&#8681;</button>
        <button class="card-btn edit"       title="Edit">&#9998;</button>
        <button class="card-btn delete"     title="Delete">&#10005;</button>
      </div>
    `;

    item.querySelector('.up').addEventListener('click',     () => moveCard(index, -1));
    item.querySelector('.down').addEventListener('click',   () => moveCard(index,  1));
    item.querySelector('.edit').addEventListener('click',   () => openModal(card));
    item.querySelector('.delete').addEventListener('click', () => deleteCard(card.id));

    cardList.appendChild(item);
  });
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Card CRUD ────────────────────────────────────────────────────────────────
addCardBtn.addEventListener('click', () => openModal(null));

async function moveCard(index, dir) {
  const cards = appData.cards;
  const target = index + dir;
  if (target < 0 || target >= cards.length) return;
  [cards[index], cards[target]] = [cards[target], cards[index]];
  appData = await window.streamCue.saveCards(cards);
  renderCardList();
}

async function deleteCard(id) {
  appData.cards = appData.cards.filter(c => c.id !== id);
  appData = await window.streamCue.saveCards(appData.cards);
  renderCardList();
  const { running } = await window.streamCue.timerStatus();
  setTimerStatus(running);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
const modeBtns = document.querySelectorAll('.mode-btn');

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function getSelectedMode() {
  return document.querySelector('.mode-btn.active').dataset.mode;
}

function setSelectedMode(mode) {
  modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}

function openModal(card) {
  editingCardId = card ? card.id : null;
  modalTitle.textContent      = card ? 'Edit Card' : 'Add Card';
  modalCardTitle.value        = card ? card.title  : '';
  modalCardScript.value       = card ? card.script : '';
  setSelectedMode(card ? (card.mode || 'scroll') : 'scroll');
  modalOverlay.classList.remove('hidden');
  // Focus title input on next frame so it's visible first
  requestAnimationFrame(() => modalCardTitle.focus());
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  editingCardId = null;
}

modalClose.addEventListener('click',  closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) closeModal();
});

modalSave.addEventListener('click', saveModal);
modalCardTitle.addEventListener('keydown',  (e) => { if (e.key === 'Enter') saveModal(); });

async function saveModal() {
  const title  = modalCardTitle.value.trim();
  const script = modalCardScript.value.trim();
  if (!title) { shake(modalCardTitle); return; }

  const mode = getSelectedMode();

  if (editingCardId === null) {
    // New card
    const id = await window.streamCue.nextId();
    appData.cards.push({ id, title, script, dismissed: false, mode });
  } else {
    const card = appData.cards.find(c => c.id === editingCardId);
    if (card) { card.title = title; card.script = script; card.mode = mode; }
  }

  appData = await window.streamCue.saveCards(appData.cards);
  renderCardList();
  closeModal();

  // Auto-start timer if stopped and we now have active cards
  const { running } = await window.streamCue.timerStatus();
  if (!running) {
    const newData = await window.streamCue.startTimer();
    setTimerStatus(newData.running);
  }
}

function shake(el) {
  el.style.borderColor = '#ff5f57';
  el.focus();
  setTimeout(() => { el.style.borderColor = ''; }, 1000);
}

// ─── Read view ────────────────────────────────────────────────────────────────
function showReadView(card, position, total) {
  cueTitle.textContent      = card.title;
  cueText.textContent       = card.script;
  positionBadge.textContent = `${position} of ${total}`;

  const isStatic = (card.mode || 'scroll') === 'static';
  readView.classList.toggle('static-mode', isStatic);

  // Switch views
  editView.classList.remove('active');
  readView.classList.add('active');

  if (isStatic) {
    // Static mode: reset manual scroll position, no rAF loop
    stopScrollLoop();
    cueScroller.scrollTop = 0;
    progressFill.style.width = '0%';
  } else {
    // Scroll mode: identical to teleprompter
    scroll.offset    = 0;
    scroll.scrolling = true;
    scroll.lastTime  = null;
    applyOffset();
    setPlayState(true);

    hudSpeed.value = scroll.speed;
    hudSpeedVal.textContent = scroll.speed;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        computeMaxOffset();
        startScrollLoop();
      });
    });
  }
}

function showEditView() {
  stopScrollLoop();
  readView.classList.remove('active');
  editView.classList.add('active');
  window.streamCue.closeRead();
}

// ─── Dismiss cue ──────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (!readView.classList.contains('active')) return;
  if (modalOverlay && !modalOverlay.classList.contains('hidden')) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    handleDismiss();
  }
});

async function handleDismiss() {
  stopScrollLoop();
  const result = await window.streamCue.dismissCue();

  // Reload data so card list reflects the dismissal
  appData = await window.streamCue.getData();
  renderCardList();

  const { running } = await window.streamCue.timerStatus();
  setTimerStatus(running);

  showEditView();
}

// ─── HUD controls ─────────────────────────────────────────────────────────────
playPauseBtn.addEventListener('click', toggleScroll);

hudSpeed.addEventListener('input', () => {
  scroll.speed = parseInt(hudSpeed.value);
  hudSpeedVal.textContent = scroll.speed;
});

// ─── Scroll engine (identical to Simple Teleprompter) ────────────────────────
function computeMaxOffset() {
  scroll.maxOffset = cueText.scrollHeight;
}

function startScrollLoop() {
  if (scroll.rafId) cancelAnimationFrame(scroll.rafId);
  scroll.lastTime = null;
  scroll.rafId = requestAnimationFrame(tick);
}

function stopScrollLoop() {
  if (scroll.rafId) {
    cancelAnimationFrame(scroll.rafId);
    scroll.rafId = null;
  }
}

function tick(timestamp) {
  if (!scroll.scrolling) {
    scroll.rafId = requestAnimationFrame(tick);
    return;
  }

  if (!scroll.lastTime) scroll.lastTime = timestamp;
  const delta = (timestamp - scroll.lastTime) / 1000; // seconds
  scroll.lastTime = timestamp;

  scroll.offset += scroll.speed * delta;

  computeMaxOffset();

  if (scroll.offset >= scroll.maxOffset) {
    scroll.offset = scroll.maxOffset;
    applyOffset();
    updateProgress();
    setPlayState(false);
    stopScrollLoop();
    return;
  }

  applyOffset();
  updateProgress();
  scroll.rafId = requestAnimationFrame(tick);
}

function applyOffset() {
  cueText.style.transform = `translateY(${-scroll.offset}px)`;
}

function updateProgress() {
  const pct = scroll.maxOffset > 0 ? (scroll.offset / scroll.maxOffset) * 100 : 0;
  progressFill.style.width = Math.min(100, pct) + '%';
}

function toggleScroll() {
  scroll.scrolling = !scroll.scrolling;
  setPlayState(scroll.scrolling);
  if (scroll.scrolling) scroll.lastTime = null; // reset delta to avoid jump
}

function setPlayState(playing) {
  scroll.scrolling = playing;
  if (playing) {
    playIcon.innerHTML = '&#9646;&#9646;';
    playPauseBtn.classList.add('playing');
    playPauseBtn.title = 'Pause';
  } else {
    playIcon.innerHTML = '&#9654;';
    playPauseBtn.classList.remove('playing');
    playPauseBtn.title = 'Play';
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
