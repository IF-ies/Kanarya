'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kanarya', {
  onState: (cb) => ipcRenderer.on('kanarya:state', (_e, p) => cb(p)),
  onPlay: (cb) => ipcRenderer.on('kanarya:play', (_e, p) => cb(p)),
  onDemo: (cb) => ipcRenderer.on('kanarya:demo', () => cb()),
  menu: (id) => ipcRenderer.send('menu', id || null),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  fitSettings: (h) => ipcRenderer.send('settings:fit', h),
  resizeStart: (corner) => ipcRenderer.send('resize:start', corner),
  resizeMove: (dx, dy) => ipcRenderer.send('resize:move', dx, dy),
  resizeEnd: () => ipcRenderer.send('resize:end'),
});
