'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kanarya', {
  onState: (cb) => ipcRenderer.on('kanarya:state', (_e, p) => cb(p)),
  onPlay: (cb) => ipcRenderer.on('kanarya:play', (_e, scene) => cb(scene)),
  onDemo: (cb) => ipcRenderer.on('kanarya:demo', () => cb()),
  menu: () => ipcRenderer.send('menu'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  getSession: () => ipcRenderer.invoke('session:get'),
});
