'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('streamCue', {
  // Data
  getData:       ()        => ipcRenderer.invoke('get-data'),
  saveCards:     (cards)   => ipcRenderer.invoke('save-cards', cards),
  saveInterval:  (minutes) => ipcRenderer.invoke('save-interval', minutes),
  nextId:        ()        => ipcRenderer.invoke('next-id'),

  // Timer
  startTimer:    ()        => ipcRenderer.invoke('start-timer'),
  stopTimer:     ()        => ipcRenderer.invoke('stop-timer'),
  timerStatus:   ()        => ipcRenderer.invoke('timer-status'),

  // Cards
  resetCards:    ()        => ipcRenderer.invoke('reset-cards'),
  dismissCue:    ()        => ipcRenderer.invoke('dismiss-cue'),
  closeRead:     ()        => ipcRenderer.invoke('close-read'),

  // Main → renderer: fire cue
  onShowCue: (callback) => {
    ipcRenderer.removeAllListeners('show-cue');
    ipcRenderer.on('show-cue', (_e, payload) => callback(payload));
  },

  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close:    () => ipcRenderer.invoke('window-close'),
});
