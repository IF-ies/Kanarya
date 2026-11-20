'use strict';
// Logoyu PNG'ye çevirir: electron tools/logo.js → koyu (app/icon.png, docs/logo.png, docs/favicon.png) + açık (app/icon-light.png, docs/logo-light.png)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.setPath('userData', path.join(require('os').tmpdir(), 'kanarya-logo'));
async function render(svgFile, outs) {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, useContentSize: true, transparent: true, frame: false });
  const svg = fs.readFileSync(path.join(__dirname, svgFile), 'utf8');
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const root = path.join(__dirname, '..');
  for (const [file, size] of outs) fs.writeFileSync(path.join(root, file), img.resize({ width: size, height: size, quality: 'best' }).toPNG());
  win.destroy();
}

app.on('window-all-closed', () => { /* iki logo sırayla çizilir; ilk pencere kapanınca çıkma */ });
app.whenReady().then(async () => {
  await render('logo.svg', [['docs/logo.png', 512], ['app/icon.png', 256], ['docs/favicon.png', 64]]);
  await render('logo-light.svg', [['docs/logo-light.png', 512], ['app/icon-light.png', 256]]);
  app.quit();
});
