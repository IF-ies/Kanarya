'use strict';
// Paylaşım görseli üretir: electron tools/og.js → docs/og.png (1280x640)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.setPath('userData', path.join(require('os').tmpdir(), 'kanarya-og'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 640, show: false, useContentSize: true, webPreferences: { zoomFactor: 1 } });
  await win.loadFile(path.join(__dirname, 'og.html'));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'og.png'), img.resize({ width: 1280, height: 640 }).toPNG());
  app.quit();
});
