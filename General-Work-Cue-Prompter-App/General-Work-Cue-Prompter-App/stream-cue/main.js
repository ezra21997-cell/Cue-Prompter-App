'use strict';

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Data persistence ──────────────────────────────────────────────────────────

const DATA_PATH = path.join(app.getPath('userData'), 'stream-cue-data.json');

const DEFAULT_DATA = {
  cards: [
    {
      id: 1,
      title: 'Sponsor Read',
      script: 'Hey everyone — quick shoutout to our sponsor. Thanks to them for making this stream possible. Head over to their link in the description to check them out and support the channel.',
      dismissed: false,
      mode: 'scroll'
    },
    {
      id: 2,
      title: 'Discord Plug',
      script: 'If you want to hang out between streams, join the Discord — link is in the description. Great community, we post schedules, clips, and behind-the-scenes stuff there.',
      dismissed: false,
      mode: 'scroll'
    },
    {
      id: 3,
      title: 'Subscribe Reminder',
      script: "If you're enjoying the stream and haven't subscribed yet, now's a great time. Hit that Subscribe button and the bell so you never miss a stream.",
      dismissed: false,
      mode: 'static'
    }
  ],
  intervalMinutes: 30,
  nextId: 4
};

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ── App state ─────────────────────────────────────────────────────────────────

let win      = null;
let timerRef = null;
let data     = loadData();

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width:  900,
    height: 660,
    x: Math.round((width  - 900) / 2),
    y: Math.round((height - 660) / 2),
    minWidth:  620,
    minHeight: 440,
    backgroundColor: '#1a1a1e',
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    hasShadow: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function nextActiveCard() {
  return data.cards.find(c => !c.dismissed) || null;
}

function startTimer() {
  stopTimer();
  if (!nextActiveCard()) return;
  const ms = Math.max(1, data.intervalMinutes) * 60 * 1000;
  timerRef = setInterval(fireCue, ms);
}

function stopTimer() {
  if (timerRef) { clearInterval(timerRef); timerRef = null; }
}

function fireCue() {
  const card = nextActiveCard();
  if (!card) { stopTimer(); return; }
  if (!win)  return;

  // Force above OBS, games, fullscreen apps
  win.setAlwaysOnTop(true, 'screen-saver');
  win.show();
  win.focus();
  app.focus({ steal: true });

  const active   = data.cards.filter(c => !c.dismissed);
  const position = active.indexOf(card) + 1;

  win.webContents.send('show-cue', { card, position, total: active.length });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-data', () => data);

ipcMain.handle('save-cards', (_e, cards) => {
  data.cards = cards;
  saveData(data);
  if (!timerRef && nextActiveCard()) startTimer();
  if (!nextActiveCard()) stopTimer();
  return data;
});

ipcMain.handle('save-interval', (_e, minutes) => {
  data.intervalMinutes = minutes;
  saveData(data);
  if (timerRef) startTimer(); // restart with new interval
  return data;
});

ipcMain.handle('next-id', () => {
  const id = data.nextId;
  data.nextId += 1;
  saveData(data);
  return id;
});

ipcMain.handle('start-timer', () => {
  startTimer();
  return { running: !!timerRef };
});

ipcMain.handle('stop-timer', () => {
  stopTimer();
  return { running: false };
});

ipcMain.handle('timer-status', () => ({ running: !!timerRef }));

ipcMain.handle('reset-cards', () => {
  data.cards = data.cards.map(c => ({ ...c, dismissed: false }));
  saveData(data);
  return data;
});

ipcMain.handle('dismiss-cue', () => {
  const card = nextActiveCard();
  if (card) {
    card.dismissed = true;
    saveData(data);
  }

  if (win) win.setAlwaysOnTop(false);

  if (!nextActiveCard()) {
    stopTimer();
    return { done: true };
  }

  startTimer(); // reset countdown so next card fires after a full interval
  return { done: false };
});

ipcMain.handle('close-read', () => {
  if (win) win.setAlwaysOnTop(false);
  return {};
});

// Window controls
ipcMain.handle('window-minimize', () => win && win.minimize());
ipcMain.handle('window-maximize', () => {
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.handle('window-close', () => win && win.close());

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  if (nextActiveCard()) startTimer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopTimer();
  if (process.platform !== 'darwin') app.quit();
});
