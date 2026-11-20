'use strict';
// Kanarya masaüstü: tek şeffaf, hep üstte pencere. Açık her Claude Code / Codex oturumu için
// pencerenin içinde bir kafes çizilir (1 → tam boy, 2–4 → 2x2, daha fazlası → 2 sütunlu ızgara).
// Hata olursa pencere açılmaz, günlüğe yazılır.
process.on('uncaughtException', (e) => {
  try {
    const dir = process.env.KANARYA_HOME || require('path').join(require('os').homedir(), '.claude', 'kanarya');
    require('fs').mkdirSync(dir, { recursive: true });
    require('fs').appendFileSync(require('path').join(dir, 'hata.log'), `${new Date().toISOString()} ${e && e.stack}\n`);
  } catch { /* yok */ }
  process.exit(1);
});
const { app, BrowserWindow, ipcMain, Menu, Notification, screen, Tray, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const core = require('../lib/core');

const W = 240; const H = 300; const MARGIN = 12; const MAX = 12;
const ICON = path.join(__dirname, 'icon.png');
const args = process.argv.slice(1);
const snapshot = (args.find((a) => a.startsWith('--snapshot=')) || '').slice(11); // sahne:saniye:çıktı.png[:değişken[:adet]]
const demo = args.includes('--demo');
const setShot = (args.find((a) => a.startsWith('--settings-snapshot=')) || '').slice(20); // ayarlar penceresi görüntüsü (test)

let win = null; let settingsWin = null; let tray = null;
let settings = core.loadSettings();
let lastSig = '';
const seenEvents = new Set();
const known = new Set();
let firstScan = true;

const L = {
  tr: { settings: 'Ayarlar…', egg: (n) => `${n}: yeni yumurta 🥚`, demo: 'Kedi saldırısını izle', hide: 'Gizle', quit: 'Kanaryayı kapat',
    dead: (n, p) => `${n} öldü 💀${p ? ` · ${p}` : ''}`, deadBody: (a) => `${a} uydurmaya başladı ya da bağlamı bulanıklaştı. /compact ya da yeni oturum aç.` },
  en: { settings: 'Settings…', egg: (n) => `${n}: new egg 🥚`, demo: 'Watch the cat attack', hide: 'Hide', quit: 'Close canary',
    dead: (n, p) => `${n} died 💀${p ? ` · ${p}` : ''}`, deadBody: (a) => `${a} started making things up or its context got blurry. Run /compact or open a new session.` },
};
// Claude Code (terminal) · Claude App (masaüstü uygulamasının Code sekmesi) · Codex
const agentName = (a, entry) => (a === 'codex' ? 'Codex' : entry === 'claude-desktop' ? 'Claude App' : 'Claude Code');
const folder = (cwd) => (cwd ? path.basename(String(cwd).replace(/[\\/]+$/, '')) : '');
function label(s) {
  // Hangi kanaryanın hangi oturum olduğu: önce oturum başlığı, sonra ilk mesaj, en son klasör.
  return s.title || s.firstPrompt || folder(s.cwd) || s.sessionId.slice(0, 8);
}

if (!snapshot && !setShot && !app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('Kanarya');
if (snapshot || setShot) app.setPath('userData', path.join(require('os').tmpdir(), 'kanarya-snapshot'));
app.on('second-instance', () => { if (win) win.showInactive(); });

function placement() {
  const s = settings.scale || 1;
  const w = Math.round(W * s); const h = Math.round(H * s);
  if (settings.position && Number.isFinite(settings.position.x)) {
    const d = screen.getDisplayNearestPoint(settings.position).workArea;
    return { x: Math.min(Math.max(settings.position.x, d.x), d.x + d.width - w), y: Math.min(Math.max(settings.position.y, d.y), d.y + d.height - h), width: w, height: h };
  }
  const a = screen.getPrimaryDisplay().workArea;
  const right = settings.corner.endsWith('right'); const bottom = settings.corner.startsWith('bottom');
  return { x: right ? a.x + a.width - w - MARGIN : a.x + MARGIN, y: bottom ? a.y + a.height - h - MARGIN : a.y + MARGIN, width: w, height: h };
}

function createWindow() {
  win = new BrowserWindow({
    ...placement(),
    transparent: true, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: !snapshot, hasShadow: false, alwaysOnTop: settings.alwaysOnTop, show: false,
    backgroundColor: '#00000000', title: 'Kanarya', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: true },
  });
  if (settings.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') { try { fs.appendFileSync(path.join(core.PATHS.home, 'hata.log'), `${new Date().toISOString()} [sahne] ${e.message} (${e.sourceId}:${e.lineNumber})\n`); } catch { /* yok */ } }
  });
  win.once('ready-to-show', () => { if (snapshot) win.show(); else win.showInactive(); });
  win.webContents.on('render-process-gone', (_e, d) => {
    try { fs.appendFileSync(path.join(core.PATHS.home, 'hata.log'), `${new Date().toISOString()} [çöktü] ${d.reason} ${d.exitCode}\n`); } catch { /* yok */ }
  });
  let moveTimer = null;
  win.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => { const [x, y] = win.getPosition(); settings = core.saveSettings({ position: { x, y } }); }, 400);
  });
  win.webContents.once('did-finish-load', () => { lastSig = ''; scan(); });
  win.on('closed', () => { win = null; });
}

function scan() {
  if (!win || demo || snapshot) return;
  settings = core.loadSettings();
  // Kapanan ya da 24 saattir sessiz oturumlar gösterilmez; doğuş sırasına göre dizilir (yerler oynamasın).
  const sessions = core.liveSessions().sort((a, b) => (a.born || 0) - (b.born || 0)).slice(0, MAX);
  // Aynı renkte ya da aynı adda iki kanarya olmasın (eski oturumlar renk bilgisi olmadan doğmuş olabilir).
  const usedV = new Set(); const usedN = new Set();
  for (const s of sessions) {
    let changed = false;
    if (!Number.isInteger(s.variant) || usedV.has(s.variant)) {
      const v = [...Array(core.VARIANTS).keys()].find((x) => !usedV.has(x));
      if (v !== undefined) { s.variant = v; changed = true; }
    }
    usedV.add(s.variant);
    if (usedN.has(s.name) && !settings.canaryName) {
      const n = (core.NAMES[settings.lang] || core.NAMES.tr).find((x) => !usedN.has(x));
      if (n) { s.name = n; changed = true; }
    }
    usedN.add(s.name);
    if (changed) {
      const cur = core.loadSession(s.sessionId);
      if (cur) { cur.variant = s.variant; cur.name = s.name; core.saveSession(cur); }
    }
  }
  const fresh = [];
  for (const s of sessions) {
    if (!known.has(s.sessionId)) { known.add(s.sessionId); if (!firstScan) fresh.push(s.sessionId); }
    if (s.event && !seenEvents.has(s.event.id)) {
      seenEvents.add(s.event.id);
      if (!firstScan && s.event.type === 'death' && settings.onDeath.notification && Notification.isSupported()) {
        const l = L[settings.lang];
        new Notification({ title: l.dead(s.name, label(s)), body: l.deadBody(agentName(s.agent, s.entrypoint)), silent: !settings.onDeath.sound, icon: ICON }).show();
      }
    }
  }
  const pub = sessions.map((s) => ({ ...s, word: undefined, label: label(s), folder: folder(s.cwd), agentName: agentName(s.agent, s.entrypoint), agentKind: s.agent === 'codex' ? 'codex' : 'claude' })); // kelime pencereye gitmez
  const payload = { sessions: pub, settings, weeklyDeaths: core.weeklyDeaths(), replay: !firstScan };
  firstScan = false;
  const sig = JSON.stringify(payload);
  if (sig === lastSig && !fresh.length) return;
  lastSig = sig;
  win.webContents.send('kanarya:state', { ...payload, fresh });
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 500, height: 660, useContentSize: true, icon: ICON, resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true,
    title: settings.lang === 'en' ? 'Kanarya settings' : 'Kanarya ayarları', backgroundColor: '#141218',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// Bildirim alanı (Windows sağ alt / macOS menü çubuğu): tıkla göster-gizle, sağ tık menü.
function makeTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16, quality: 'best' });
  if (!tray) {
    tray = new Tray(img);
    tray.setToolTip('Kanarya');
    tray.on('click', () => tray.popUpContextMenu()); // tek tık: menü (en üstte Ayarlar)
    tray.on('double-click', openSettings);            // çift tık: doğrudan ayarlar
  }
  const l = TL[settings.lang] || TL.tr;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: l.settings, click: openSettings },
    { label: l.toggle, click: () => { if (win) { if (win.isVisible()) win.hide(); else win.showInactive(); } } },
    { type: 'separator' },
    { label: l.quit, click: () => app.quit() },
  ]));
}
const TL = { tr: { toggle: 'Göster / gizle', settings: 'Ayarlar…', quit: 'Kanaryayı kapat' }, en: { toggle: 'Show / hide', settings: 'Settings…', quit: 'Close canary' } };

ipcMain.handle('settings:get', () => core.loadSettings());
ipcMain.on('settings:fit', (_e, h) => {
  if (!settingsWin || !Number.isFinite(h)) return;
  const max = screen.getPrimaryDisplay().workArea.height - 40;
  settingsWin.setContentSize(500, Math.min(Math.ceil(h), max));
});
ipcMain.handle('settings:save', (_e, partial) => {
  const prev = settings;
  if (partial.corner && partial.corner !== prev.corner) partial.position = null;
  settings = core.saveSettings(partial);
  if (win) {
    if (prev.alwaysOnTop !== settings.alwaysOnTop) win.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
    if (prev.scale !== settings.scale || prev.corner !== settings.corner) win.setBounds(placement());
  }
  lastSig = ''; scan();
  if (tray) makeTray();
  return settings;
});
ipcMain.on('menu', (_e, id) => {
  const l = L[settings.lang];
  const s = id ? core.loadSession(id) : null;
  const items = [{ label: l.settings, click: openSettings }];
  if (s) {
    items.push({ label: l.egg(s.name), click: () => {
      const st = core.loadSession(id);
      if (!st) return;
      st.requestEgg = true; core.saveSession(st); // yeni kelime bir sonraki mesajda verilir
      win && win.webContents.send('kanarya:play', { id, scene: 'egg' });
    } });
    items.push({ label: l.demo, click: () => win && win.webContents.send('kanarya:play', { id, scene: 'death' }) });
  }
  items.push({ type: 'separator' }, { label: l.hide, click: () => win && win.hide() }, { label: l.quit, click: () => app.quit() });
  Menu.buildFromTemplate(items).popup({ window: win });
});

app.whenReady().then(() => {
  core.ensureDirs();
  if (setShot) { // ayarlar penceresinin görüntüsü (test)
    openSettings();
    setTimeout(async () => { fs.writeFileSync(setShot, (await settingsWin.webContents.capturePage()).toPNG()); app.quit(); }, 1500);
    return;
  }
  createWindow();
  if (snapshot) {
    const [scene, sec, out, variant, count] = snapshot.split(/:(?=[^\\/])/);
    win.webContents.once('did-finish-load', async () => {
      await win.webContents.executeJavaScript(`window.kanaryaFreeze(${JSON.stringify(scene)}, ${Number(sec) || 0}, ${JSON.stringify(settings.lang)}, ${Number(variant) || 0}, ${Number(count) || 1}, ${JSON.stringify(settings.theme)}, ${!!settings.transparent})`);
      await new Promise((r) => setTimeout(r, 300));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(out, img.toPNG());
      app.quit();
    });
    return;
  }
  fs.writeFileSync(core.PATHS.pid, String(process.pid));
  makeTray();
  if (process.env.KANARYA_DEBUG) {
    setTimeout(() => fs.appendFileSync(path.join(core.PATHS.home, 'hata.log'),
      `[debug] ${JSON.stringify(win && win.getBounds())} visible=${win && win.isVisible()} top=${win && win.isAlwaysOnTop()} display=${JSON.stringify(screen.getPrimaryDisplay().workArea)}\n`), 3000);
    setTimeout(async () => { if (win) fs.writeFileSync(path.join(core.PATHS.home, 'debug.png'), (await win.webContents.capturePage()).toPNG()); }, 3200);
  }
  if (demo) { win.webContents.once('did-finish-load', () => win.webContents.send('kanarya:demo')); return; }
  setInterval(scan, 1000);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  try { if (!snapshot && Number(fs.readFileSync(core.PATHS.pid, 'utf8')) === process.pid) fs.unlinkSync(core.PATHS.pid); } catch { /* yok */ }
});
