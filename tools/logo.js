'use strict';
// Logoyu PNG'ye çevirir: electron tools/logo.js → app/icon.png (256), docs/logo.png (512), docs/favicon.png (64)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.setPath('userData', path.join(require('os').tmpdir(), 'kanarya-logo'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, useContentSize: true, transparent: true, frame: false });
  const svg = fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8');
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const root = path.join(__dirname, '..');
  fs.writeFileSync(path.join(root, 'docs', 'logo.png'), img.resize({ width: 512, height: 512, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(root, 'app', 'icon.png'), img.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(root, 'docs', 'favicon.png'), img.resize({ width: 64, height: 64, quality: 'best' }).toPNG());
  app.quit();
});
