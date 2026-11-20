'use strict';
// Kanarya masaüstü penceresi: şeffaf, çerçevesiz, hep üstte; durum dosyalarını izler.
// Hata olursa kullanıcıya pencere açmak yerine günlüğe yazılır.
process.on('uncaughtException', (e) => {
  try {
    const dir = process.env.KANARYA_HOME || require('path').join(require('os').homedir(), '.claude', 'kanarya');
    require('fs').mkdirSync(dir, { recursive: true });
    require('fs').appendFileSync(require('path').join(dir, 'hata.log'), `${new Date().toISOString()} ${e && e.stack}\n`);
  } catch { /* yok */ }
  process.exit(1);
});
const { app, BrowserWindow, ipcMain, Menu, Notification, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const core = require('../lib/core');

const W = 240; const H = 300;
const args = process.argv.slice(1);
const snapshot = (args.find((a) => a.startsWith('--snapshot=')) || '').slice(11); // sahne:saniye:çıktı.png
const demo = args.includes('--demo');

let win = null; let settingsWin = null;
let settings = core.loadSettings();
let lastSig = '';
const seenEvents = new Set();
let firstScan = true;

const L = {
  tr: { settings: 'Ayarlar…', egg: 'Yeni yumurta 🥚', demo: 'Kedi saldırısını izle', hide: 'Gizle', quit: 'Kanaryayı kapat',
    dead: (n) => `${n} öldü 💀`, deadBody: 'Claude uydurmaya başladı ya da bağlamı bulanıklaştı. /compact ya da yeni oturum aç.' },
  en: { settings: 'Settings…', egg: 'New egg 🥚', demo: 'Watch the cat attack', hide: 'Hide', quit: 'Close canary',
    dead: (n) => `${n} died 💀`, deadBody: 'Claude started making things up or its context got blurry. Run /compact or open a new session.' },
};

if (!snapshot && !app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('Kanarya');
app.on('second-instance', () => { if (win) { win.showInactive(); } });

function placement() {
  const s = settings.scale || 1;
  const w = Math.round(W * s); const h = Math.round(H * s);
  if (settings.position && Number.isFinite(settings.position.x)) {
    const d = screen.getDisplayNearestPoint(settings.position).workArea;
    const x = Math.min(Math.max(settings.position.x, d.x), d.x + d.width - w);
    const y = Math.min(Math.max(settings.position.y, d.y), d.y + d.height - h);
    return { x, y, width: w, height: h };
  }
  const a = screen.getPrimaryDisplay().workArea; const m = 12;
  const right = settings.corner.endsWith('right'); const bottom = settings.corner.startsWith('bottom');
  return { x: right ? a.x + a.width - w - m : a.x + m, y: bottom ? a.y + a.height - h - m : a.y + m, width: w, height: h };
}

function createWindow() {
  win = new BrowserWindow({
    ...placement(),
    transparent: true, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: !snapshot, hasShadow: false, alwaysOnTop: settings.alwaysOnTop, show: false,
    backgroundColor: '#00000000', title: 'Kanarya',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: true },
  });
  if (settings.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') { try { fs.appendFileSync(path.join(core.PATHS.home, 'hata.log'), `${new Date().toISOString()} [sahne] ${e.message} (${e.sourceId}:${e.lineNumber})\n`); } catch { /* yok */ } }
  });
  win.once('ready-to-show', () => { if (snapshot) win.show(); else win.showInactive(); });
  let moveTimer = null;
  win.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      const [x, y] = win.getPosition();
      settings = core.saveSettings({ position: { x, y } });
    }, 400);
  });
  win.on('closed', () => { win = null; });
}

function scan() {
  if (!win || demo || snapshot) return;
  settings = core.loadSettings();
  const sessions = core.listSessions();
  const state = sessions[0] || null;
  if (state && state.event) {
    for (const s of sessions) {
      if (!s.event || seenEvents.has(s.event.id)) continue;
      seenEvents.add(s.event.id);
      if (!firstScan && s === state && s.event.type === 'death' && settings.onDeath.notification && Notification.isSupported()) {
        const l = L[settings.lang];
        new Notification({ title: l.dead(s.name), body: l.deadBody, silent: !settings.onDeath.sound }).show();
      }
    }
  }
  const pub = state ? { ...state, word: undefined } : null; // kelime pencereye gitmez
  const payload = { state: pub, settings, weeklyDeaths: core.weeklyDeaths(), replay: !firstScan };
  const sig = JSON.stringify(payload);
  firstScan = false;
  if (sig === lastSig) return;
  lastSig = sig;
  win.webContents.send('kanarya:state', payload);
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 440, height: 640, resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true,
    title: settings.lang === 'en' ? 'Kanarya settings' : 'Kanarya ayarları', backgroundColor: '#141218',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function requestEgg() {
  const s = core.listSessions()[0];
  if (!s) return;
  s.requestEgg = true;
  core.saveSession(s);
  // Kelime bir sonraki mesajda Claude'a verilir; pencere yumurtayı hemen gösterir.
  win && win.webContents.send('kanarya:play', 'egg');
}

ipcMain.handle('settings:get', () => core.loadSettings());
ipcMain.handle('settings:save', (_e, partial) => {
  const prevTop = settings.alwaysOnTop; const prevScale = settings.scale; const prevCorner = settings.corner;
  if (partial.corner && partial.corner !== prevCorner) partial.position = null;
  settings = core.saveSettings(partial);
  if (win) {
    if (prevTop !== settings.alwaysOnTop) win.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
    if (prevScale !== settings.scale || prevCorner !== settings.corner) win.setBounds(placement());
  }
  lastSig = '';
  scan();
  return settings;
});
ipcMain.handle('session:get', () => {
  const s = core.listSessions()[0];
  return s ? { ...s, word: undefined } : null;
});
ipcMain.on('menu', () => {
  const l = L[settings.lang];
  Menu.buildFromTemplate([
    { label: l.settings, click: openSettings },
    { label: l.egg, click: requestEgg },
    { label: l.demo, click: () => win && win.webContents.send('kanarya:play', 'death') },
    { type: 'separator' },
    { label: l.hide, click: () => win && win.hide() },
    { label: l.quit, click: () => app.quit() },
  ]).popup({ window: win });
});

app.whenReady().then(() => {
  core.ensureDirs();
  if (!snapshot) fs.writeFileSync(core.PATHS.pid, String(process.pid));
  createWindow();
  if (snapshot) {
    const [scene, sec, out] = snapshot.split(/:(?=[^\\/])/);
    win.webContents.once('did-finish-load', async () => {
      await win.webContents.executeJavaScript(`window.kanaryaFreeze(${JSON.stringify(scene)}, ${Number(sec) || 0}, ${JSON.stringify(settings.lang)})`);
      await new Promise((r) => setTimeout(r, 300));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(out, img.toPNG());
      app.quit();
    });
    return;
  }
  if (demo) win.webContents.once('did-finish-load', () => win.webContents.send('kanarya:demo'));
  scan();
  setInterval(scan, 1000);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  try { if (!snapshot && Number(fs.readFileSync(core.PATHS.pid, 'utf8')) === process.pid) fs.unlinkSync(core.PATHS.pid); } catch { /* yok */ }
});
