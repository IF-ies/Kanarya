'use strict';
// Kanarya 2.5D sahnesi: katmanlı çizim (arka parmaklık → tünek/kuş → ön parmaklık → kedi),
// fareyle paralaks, tek ışık kaynağı (sol üst), yumuşak gölgeler. Boştayken düşük kare hızı.

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 240; const H = 300;
const CX = 120; const CAGE_TOP = 62; const RING_Y = 104; const MID_Y = 150; const BASE_Y = 226;
const RX = 60; const RY = 11; const PERCH_Y = 182; const BIRD_Y = 161;
const IDLE_FPS = 8;

const TXT = {
  tr: { alive: (n) => `${n} yaşıyor`, dead: (n) => `${n} öldü`, died: 'KANARYA ÖLDÜ', hall: 'uydurdu — kedi geldi',
    blur: 'bağlam bulanıklaştı', week: (k) => (k ? `Bu hafta ${k} kanarya öldü` : 'Bu hafta kanarya ölmedi'),
    hint: '/compact ya da sağ tık → yeni yumurta', wait: 'Claude Code oturumu bekleniyor…', tired: 'bağlam doluyor' },
  en: { alive: (n) => `${n} is alive`, dead: (n) => `${n} died`, died: 'CANARY DIED', hall: 'made things up — the cat came',
    blur: 'context got blurry', week: (k) => (k ? `${k} canar${k === 1 ? 'y' : 'ies'} died this week` : 'No canary died this week'),
    hint: '/compact or right-click → new egg', wait: 'Waiting for a Claude Code session…', tired: 'context filling up' },
};

// ---------- durum ----------
let model = { state: null, settings: { lang: 'tr', onDeath: { sound: true } }, weeklyDeaths: 0 };
let lastEventId = null;
let scene = null;            // { name, start }
let frozen = null;           // anlık görüntü için sabit zaman
let mouse = { x: 0, y: 0, tx: 0, ty: 0, over: false };
let particles = [];
const seed = Math.random() * 1000;

const SCENES = { egg: 3.4, injured: 1.6, sick: 1.8, death: 6.6, heal: 1.6, ok: 1.5 };

function L() { return TXT[model.settings.lang] || TXT.tr; }
function nowS() { return frozen ? frozen.t : performance.now() / 1000; }

function play(name) {
  if (!SCENES[name]) return;
  scene = { name, start: nowS() };
  if (name === 'death' && model.settings.onDeath && model.settings.onDeath.sound) { try { window.Sfx.death(); } catch { /* ses yok */ } }
  if (name === 'egg' && model.settings.onDeath && model.settings.onDeath.sound) { try { window.Sfx.chirp(2.5, 2); } catch { /* */ } }
  kick();
}

// ---------- yardımcılar ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function ellipse(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }

function radial(x, y, r0, x1, y1, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function linear(x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

// ---------- arka plan ----------
function drawPanel(danger, ox, oy) {
  rrect(8, 6, 224, 288, 24);
  ctx.fillStyle = linear(0, 6, 0, 294, [[0, 'rgba(46,38,62,0.93)'], [1, 'rgba(16,13,22,0.95)']]);
  ctx.fill();
  ctx.save(); ctx.clip();
  // pencereden gelen sıcak ışık (paralaks: en arka katman)
  ctx.fillStyle = radial(70 + ox, 50 + oy, 4, 70 + ox, 50 + oy, 170, [[0, `rgba(255,214,120,${0.30 - danger * 0.22})`], [1, 'rgba(255,214,120,0)']]);
  ctx.fillRect(0, 0, W, H);
  // tehlike arttıkça karanlık sol alttan yayılır
  if (danger > 0) {
    ctx.fillStyle = radial(20, 260, 10, 20, 260, 200, [[0, `rgba(0,0,0,${0.75 * danger})`], [1, 'rgba(0,0,0,0)']]);
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  rrect(8.5, 6.5, 223, 287, 24);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
}

// ---------- kafes ----------
const BARS = 14;
function barX(th) { return CX + RX * Math.cos(th); }
function barDY(th) { return RY * Math.sin(th); }

function drawCageBack(sway) {
  ctx.save(); pivot(sway);
  // zemin (kum)
  ellipse(CX, BASE_Y, RX, RY);
  ctx.fillStyle = radial(CX - 15, BASE_Y - 4, 2, CX, BASE_Y, RX, [[0, '#6d5a3b'], [1, '#3b2f20']]);
  ctx.fill();
  // arka halkalar
  ctx.strokeStyle = 'rgba(150,118,58,0.55)'; ctx.lineWidth = 1.3;
  for (const y of [RING_Y, MID_Y]) { ctx.beginPath(); ctx.ellipse(CX, y, RX, RY, 0, Math.PI, Math.PI * 2); ctx.stroke(); }
  // arka parmaklıklar (uzak, ince, koyu)
  for (let i = 0; i < BARS; i++) {
    const th = (i / BARS) * Math.PI * 2 + 0.11;
    if (Math.sin(th) >= 0) continue;
    bar(th, 'rgba(140,108,50,0.5)', 1.2);
  }
  ctx.restore();
}

function bar(th, style, w) {
  const x = barX(th); const dy = barDY(th);
  ctx.beginPath();
  ctx.moveTo(x, BASE_Y + dy);
  ctx.lineTo(x, RING_Y + dy);
  ctx.quadraticCurveTo(lerp(x, CX, 0.12), CAGE_TOP + 8 + dy * 0.4, CX, CAGE_TOP);
  ctx.strokeStyle = style; ctx.lineWidth = w; ctx.stroke();
}

function drawCageFront(sway, doorOpen, t) {
  ctx.save(); pivot(sway);
  const brass = linear(CX - RX, 0, CX + RX, 0, [[0, '#7a5717'], [0.3, '#f6d983'], [0.55, '#c9992f'], [1, '#6a4a12']]);
  for (let i = 0; i < BARS; i++) {
    const th = (i / BARS) * Math.PI * 2 + 0.11;
    if (Math.sin(th) < 0) continue;
    if (Math.abs(barX(th) - CX) < 15) continue; // kapı aralığı
    bar(th, brass, 2.1);
  }
  ctx.strokeStyle = brass; ctx.lineWidth = 2.2;
  for (const y of [RING_Y, MID_Y]) { ctx.beginPath(); ctx.ellipse(CX, y, RX, RY, 0, 0, Math.PI); ctx.stroke(); }
  // kapı
  const dTop = 176; const dBot = BASE_Y + RY - 1; const dw = 28;
  const ang = doorOpen ? 1.15 + Math.sin(t * 2) * 0.06 * Math.exp(-t * 0.3) : 0;
  const w = dw * Math.cos(ang); const skew = dw * Math.sin(ang) * 0.35;
  const x0 = CX - dw / 2;
  ctx.beginPath();
  ctx.moveTo(x0, dTop); ctx.lineTo(x0 - (doorOpen ? 0 : 0), dBot);
  ctx.moveTo(x0, dTop); ctx.lineTo(x0 + (doorOpen ? -w : w), dTop + skew);
  ctx.lineTo(x0 + (doorOpen ? -w : w), dBot + skew); ctx.lineTo(x0, dBot);
  for (let k = 1; k < 3; k++) {
    const xx = x0 + (doorOpen ? -w : w) * (k / 3);
    ctx.moveTo(xx, dTop + skew * (k / 3)); ctx.lineTo(xx, dBot + skew * (k / 3));
  }
  ctx.strokeStyle = '#d9b354'; ctx.lineWidth = 1.6; ctx.stroke();
  // taban tepsisi
  ctx.beginPath();
  ctx.ellipse(CX, BASE_Y, RX + 6, RY + 2, 0, 0, Math.PI);
  ctx.lineTo(CX - RX - 6, BASE_Y + 10);
  ctx.ellipse(CX, BASE_Y + 10, RX + 6, RY + 2, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = linear(CX - RX, 0, CX + RX, 0, [[0, '#5b3f10'], [0.28, '#e9c263'], [0.5, '#b8862a'], [1, '#4d350c']]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,190,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(CX, BASE_Y, RX + 6, RY + 2, 0, 0.3, Math.PI - 0.3); ctx.stroke();
  // tepe topuzu + askı halkası
  ctx.fillStyle = radial(CX - 3, CAGE_TOP - 6, 1, CX, CAGE_TOP - 3, 8, [[0, '#fff0b8'], [1, '#9c7322']]);
  ellipse(CX, CAGE_TOP - 3, 7, 5); ctx.fill();
  ctx.beginPath(); ctx.arc(CX, CAGE_TOP - 14, 7, 0, Math.PI * 2); ctx.strokeStyle = '#c99d3b'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

function drawChain(sway) {
  ctx.save();
  ctx.strokeStyle = 'rgba(190,160,90,0.6)'; ctx.lineWidth = 1.5;
  const x1 = CX + Math.sin(sway) * (CAGE_TOP - 21 - 6);
  ctx.beginPath(); ctx.moveTo(CX, 6); ctx.lineTo(x1, CAGE_TOP - 21); ctx.stroke();
  ctx.restore();
}

function pivot(sway) { ctx.translate(CX, 6); ctx.rotate(sway); ctx.translate(-CX, -6); }

function drawPerch(sway) {
  ctx.save(); pivot(sway);
  rrect(CX - 54, PERCH_Y - 3, 108, 6, 3);
  ctx.fillStyle = linear(0, PERCH_Y - 3, 0, PERCH_Y + 3, [[0, '#d39a5c'], [0.5, '#8b5a2b'], [1, '#4e3016']]);
  ctx.fill();
  // su kabı
  rrect(CX + 30, BASE_Y - 14, 18, 11, 3);
  ctx.fillStyle = linear(CX + 30, 0, CX + 48, 0, [[0, 'rgba(160,210,255,0.35)'], [1, 'rgba(90,140,200,0.5)']]);
  ctx.fill();
  ctx.restore();
}

// ---------- kanarya ----------
function palette(mood) {
  if (mood === 'sick') return { hi: '#f4f3c4', mid: '#d9d57a', lo: '#9c9b45', wing: '#bdb85a', head: '#e2de8c' };
  return { hi: '#fffbd2', mid: '#ffd93a', lo: '#d08f00', wing: '#efb000', head: '#ffe065' };
}

function drawCanary(o) {
  const p = palette(o.mood);
  ctx.save();
  ctx.translate(o.x, o.y); ctx.rotate(o.lean || 0); ctx.scale(o.s, o.s * (o.squash || 1));
  ctx.globalAlpha = o.alpha ?? 1;
  // kuyruk
  ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(-33, 20); ctx.lineTo(-28, 26); ctx.lineTo(-8, 14); ctx.closePath();
  ctx.fillStyle = linear(-30, 20, -10, 10, [[0, p.lo], [1, p.wing]]); ctx.fill();
  // gövde
  ellipse(0, 0, 22, 19);
  ctx.fillStyle = radial(-8, -9, 2, 0, 0, 27, [[0, p.hi], [0.35, p.mid], [0.85, p.lo], [1, p.lo]]); ctx.fill();
  ellipse(6, 7, 13, 9); ctx.fillStyle = 'rgba(255,250,215,0.45)'; ctx.fill();
  if (o.mood === 'injured') { // dökülmüş tüyler
    ctx.fillStyle = '#e9a99a';
    ellipse(-6, 4, 4, 3, 0.4); ctx.fill(); ellipse(9, -2, 3, 2.2, -0.3); ctx.fill();
  }
  // kanat
  ctx.save(); ctx.translate(-4, -1); ctx.rotate(-0.25 - (o.flap || 0) * 0.95);
  ellipse(-2, 5, 15, 9, 0.15);
  ctx.fillStyle = linear(-12, 0, 10, 10, [[0, p.lo], [0.6, p.wing], [1, p.mid]]); ctx.fill();
  ctx.strokeStyle = 'rgba(120,70,0,0.35)'; ctx.lineWidth = 0.9;
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-12 + k * 2, 6 + k * 2); ctx.lineTo(4 + k * 2, 8 + k); ctx.stroke(); }
  ctx.restore();
  // baş
  ellipse(8, -17, 14.5, 14);
  ctx.fillStyle = radial(2, -24, 1, 8, -17, 17, [[0, p.hi], [0.45, p.head], [1, p.lo]]); ctx.fill();
  // tepe tüyleri
  ctx.strokeStyle = p.lo; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (const [a, b] of [[4, -6], [7, -9], [10, -5]]) { ctx.beginPath(); ctx.moveTo(a, -30); ctx.quadraticCurveTo(a + b * 0.3, -36, a + b * 0.5, -37); ctx.stroke(); }
  // yanak
  ellipse(14, -11, 4, 2.4); ctx.fillStyle = 'rgba(255,120,120,0.42)'; ctx.fill();
  // göz
  const lid = clamp(o.lid || 0, 0, 1);
  if (lid >= 0.97) {
    ctx.beginPath(); ctx.arc(12, -19, 4.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = '#2a1a05'; ctx.lineWidth = 1.6; ctx.stroke();
  } else {
    ellipse(12, -19, 4.6, 4.9); ctx.fillStyle = '#140c05'; ctx.fill();
    ctx.fillStyle = '#fff'; ellipse(13.7, -21, 1.7, 1.7); ctx.fill(); ellipse(10.7, -17.4, 0.8, 0.8); ctx.fill();
    if (lid > 0) {
      ctx.save(); ellipse(12, -19, 5.2, 5.4); ctx.clip();
      ctx.fillStyle = p.head; ctx.fillRect(6, -25, 12, 10.5 * lid);
      ctx.strokeStyle = 'rgba(110,60,0,0.6)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(6.5, -24.4 + 10.5 * lid); ctx.lineTo(17.5, -24.4 + 10.5 * lid); ctx.stroke();
      ctx.restore();
    }
  }
  // gaga
  const open = o.sing || 0;
  ctx.fillStyle = linear(20, -19, 29, -13, [[0, '#ffb04a'], [1, '#e66d12']]);
  ctx.beginPath(); ctx.moveTo(20, -19.5); ctx.lineTo(29.5, -16.5 - open * 1.5); ctx.lineTo(20, -15.5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(20, -15.2 + open * 0.5); ctx.lineTo(27, -14 + open * 2.5); ctx.lineTo(20, -12.5 + open); ctx.closePath(); ctx.fill();
  // ayaklar
  ctx.strokeStyle = '#e8892a'; ctx.lineWidth = 1.8;
  for (const fx of [-3, 6]) { ctx.beginPath(); ctx.moveTo(fx, 17); ctx.lineTo(fx - 1, 21.5); ctx.lineTo(fx + 3, 22.5); ctx.stroke(); }
  // sargı (yaralı)
  if (o.mood === 'injured') {
    ctx.save(); ctx.translate(6, -28); ctx.rotate(-0.35);
    rrect(-9, -3, 18, 6, 2); ctx.fillStyle = '#f5f1ea'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.fillStyle = '#d33'; ctx.fillRect(-1, -2, 2, 4); ctx.fillRect(-2, -1, 4, 2);
    ctx.restore();
  }
  if (o.mood === 'sick') { // ter damlası
    ctx.fillStyle = 'rgba(150,210,255,0.9)';
    ctx.beginPath(); ctx.moveTo(-1, -30); ctx.quadraticCurveTo(-5, -23, -1, -22); ctx.quadraticCurveTo(3, -23, -1, -30); ctx.fill();
  }
  ctx.restore();
}

function birdShadow(x, s, a = 0.35) {
  ellipse(x, BASE_Y - 1, 20 * s, 4.5 * s);
  ctx.fillStyle = radial(x, BASE_Y - 1, 1, x, BASE_Y - 1, 20 * s, [[0, `rgba(0,0,0,${a})`], [1, 'rgba(0,0,0,0)']]);
  ctx.fill();
}

// ---------- kedi ----------
function drawCat(o) {
  ctx.save();
  ctx.translate(o.x, o.y); ctx.scale(o.s, o.s); ctx.rotate(o.rot || 0);
  ctx.globalAlpha = o.alpha ?? 1;
  const fur = '#17131f';
  const rim = 'rgba(160,150,215,0.55)';
  const stretch = o.stretch || 1;
  // kuyruk
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-34 * stretch, 0);
  ctx.bezierCurveTo(-58 * stretch, -4, -62 * stretch, -32 + Math.sin(o.t * 6) * 4, -48 * stretch, -44);
  ctx.strokeStyle = fur; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = rim; ctx.lineWidth = 1; ctx.stroke();
  // arka bacak
  ellipse(-26 * stretch, 8, 12, 10, -0.3); ctx.fillStyle = fur; ctx.fill();
  // gövde
  ellipse(-4, 2, 36 * stretch, 15 / Math.sqrt(stretch));
  ctx.fillStyle = radial(-10, -10, 2, -4, 2, 40 * stretch, [[0, '#2c2638'], [1, fur]]); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(-4, 2, 36 * stretch, 15 / Math.sqrt(stretch), 0, Math.PI * 1.1, Math.PI * 1.85); ctx.stroke();
  // ön patiler + pençeler
  const reach = o.reach || 0;
  ctx.fillStyle = fur;
  for (const [px, py] of [[22 + reach * 14, 13 - reach * 10], [30 + reach * 18, 12 - reach * 6]]) {
    ellipse(px, py, 7, 4.5, -0.2 - reach * 0.4); ctx.fill();
    if (reach > 0.2) {
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.9;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(px + 6, py + k * 2); ctx.lineTo(px + 9, py + k * 2 + 1.5); ctx.stroke(); }
    }
  }
  // kafa
  const hx = 30; const hy = -10;
  // geriye yatık kulaklar
  ctx.fillStyle = fur;
  ctx.beginPath(); ctx.moveTo(hx - 8, hy - 11); ctx.lineTo(hx - 24, hy - 17); ctx.lineTo(hx - 4, hy - 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(hx + 2, hy - 14); ctx.lineTo(hx - 12, hy - 23); ctx.lineTo(hx + 7, hy - 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a2b3c';
  ctx.beginPath(); ctx.moveTo(hx - 9, hy - 10); ctx.lineTo(hx - 19, hy - 15); ctx.lineTo(hx - 6, hy - 5); ctx.closePath(); ctx.fill();
  ellipse(hx, hy, 17, 15);
  ctx.fillStyle = radial(hx - 6, hy - 8, 1, hx, hy, 19, [[0, '#2e2839'], [1, fur]]); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(hx, hy, 17, 15, 0, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
  // gözler: parlayan sarı, yarık göz bebeği, öfkeli kaş
  for (const [ex, ey] of [[hx + 3, hy - 4], [hx + 12, hy - 3]]) {
    ctx.fillStyle = radial(ex, ey, 0, ex, ey, 11, [[0, 'rgba(255,215,60,0.5)'], [1, 'rgba(255,215,60,0)']]);
    ctx.fillRect(ex - 11, ey - 11, 22, 22);
    ellipse(ex, ey, 4.2, 3.2); ctx.fillStyle = '#ffd43b'; ctx.fill();
    ellipse(ex + 0.6, ey, 0.9, 2.9); ctx.fillStyle = '#000'; ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.moveTo(ex - 5, ey - 5); ctx.lineTo(ex + 5, ey - 1.5); ctx.lineTo(ex + 5, ey - 5); ctx.closePath(); ctx.fill();
  }
  // burun + ağız + dişler
  ctx.fillStyle = '#3a2430'; ellipse(hx + 15, hy + 2, 1.6, 1.1); ctx.fill();
  const m = o.mouth || 0;
  ctx.beginPath(); ctx.moveTo(hx + 6, hy + 5); ctx.quadraticCurveTo(hx + 12, hy + 7 + m * 9, hx + 17, hy + 5); ctx.closePath();
  ctx.fillStyle = m > 0.05 ? '#6e0f1c' : fur; ctx.fill();
  ctx.fillStyle = '#f4f4f4';
  for (const fx of [hx + 8.5, hx + 14.5]) { ctx.beginPath(); ctx.moveTo(fx - 1.4, hy + 5.2); ctx.lineTo(fx, hy + 9 + m * 2); ctx.lineTo(fx + 1.4, hy + 5.2); ctx.fill(); }
  // bıyık
  ctx.strokeStyle = 'rgba(220,220,235,0.45)'; ctx.lineWidth = 0.6;
  for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(hx + 15, hy + 3); ctx.lineTo(hx + 30, hy + 1 + k * 4); ctx.stroke(); }
  ctx.restore();
}

function lurkingEyes(x, y, s, t) {
  const blink = (Math.sin(t * 0.9 + seed) > 0.96) ? 0.15 : 1;
  for (const dx of [0, 11 * s]) {
    ctx.fillStyle = radial(x + dx, y, 0, x + dx, y, 9 * s, [[0, `rgba(255,210,60,${0.55 * blink})`], [1, 'rgba(255,210,60,0)']]);
    ctx.fillRect(x + dx - 10 * s, y - 10 * s, 20 * s, 20 * s);
    ellipse(x + dx, y, 3.2 * s, 2.3 * s * blink, 0.15); ctx.fillStyle = '#ffd43b'; ctx.fill();
    ellipse(x + dx + 0.4, y, 0.7 * s, 2 * s * blink); ctx.fillStyle = '#000'; ctx.fill();
  }
}

// ---------- parçacıklar ----------
function burstFeathers(x, y, n, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (40 + Math.random() * 90) * power;
    particles.push({ kind: 'feather', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60 * power, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, life: 3.2, age: 0 });
  }
}

function addNote(x, y) {
  particles.push({ kind: 'note', x, y, vx: 6 + Math.random() * 10, vy: -22, rot: 0, vr: 0, life: 2.2, age: 0, ch: Math.random() < 0.5 ? '♪' : '♫' });
}

function addSpark(x, y, ch = '✦', color = '#fff6b0') {
  particles.push({ kind: 'spark', x, y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, rot: 0, vr: 0, life: 1.3, age: 0, ch, color });
}

function stepParticles(dt) {
  for (const p of particles) {
    p.age += dt;
    if (p.kind === 'feather') {
      p.vy += 140 * dt; p.vx *= 1 - 1.8 * dt; p.vy *= 1 - 1.2 * dt;
      p.x += p.vx * dt + Math.sin(p.age * 5 + p.rot) * 0.4; p.y = Math.min(BASE_Y - 2, p.y + p.vy * dt);
      p.rot += p.vr * dt * (p.y >= BASE_Y - 2 ? 0 : 1);
    } else { p.x += p.vx * dt; p.y += p.vy * dt; }
  }
  particles = particles.filter((p) => p.age < p.life);
}

function drawParticles() {
  for (const p of particles) {
    const a = clamp(1 - p.age / p.life, 0, 1);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a;
    if (p.kind === 'feather') {
      ellipse(0, 0, 5, 1.8); ctx.fillStyle = '#ffd84a'; ctx.fill();
      ctx.strokeStyle = 'rgba(150,90,0,0.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(5, 0); ctx.stroke();
    } else {
      ctx.font = p.kind === 'note' ? 'bold 14px "Segoe UI Symbol", sans-serif' : '11px "Segoe UI Symbol", sans-serif';
      ctx.fillStyle = p.color || 'rgba(255,240,180,0.95)'; ctx.textAlign = 'center'; ctx.fillText(p.ch, 0, 0);
    }
    ctx.restore();
  }
}

// ---------- alt bilgi ----------
function heart(x, y, s, filled) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-7, -2, -4, -8, 0, -4); ctx.bezierCurveTo(4, -8, 7, -2, 0, 3); ctx.closePath();
  if (filled) { ctx.fillStyle = radial(-2, -4, 0, 0, -1, 7, [[0, '#ff9aa2'], [1, '#d81e3a']]); ctx.fill(); } else { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}

function footer(st, t) {
  const l = L();
  ctx.textAlign = 'center';
  let title; let color = '#fff4c8';
  if (!st) { title = l.wait; color = 'rgba(255,255,255,0.55)'; } else if (st.status === 'dead') { title = l.dead(st.name); color = '#ff8a8a'; } else title = l.alive(st.name);
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  const tw = ctx.measureText(title).width + 22;
  rrect(CX - tw / 2, 244, tw, 21, 10.5); ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();
  ctx.fillStyle = color; ctx.fillText(title, CX, 259);
  if (st) {
    const n = st.maxLives || 3;
    for (let i = 0; i < n; i++) heart(CX + (i - (n - 1) / 2) * 17, 276, 1.05, i < (st.status === 'dead' ? 0 : st.lives));
  }
  ctx.font = '10.5px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(st && st.status === 'dead' ? l.hint : l.week(model.weeklyDeaths || 0), CX, 291);
  if (st && st.status !== 'dead' && (st.contextPct || 0) > 0.6) {
    ctx.font = '9.5px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = 'rgba(180,200,255,0.6)';
    ctx.textAlign = 'right'; ctx.fillText(`${l.tired} ${Math.round(st.contextPct * 100)}%`, 222, 26);
  }
}

// ---------- ana çizim ----------
let lastT = null;

function render() {
  const t = nowS();
  const dt = lastT === null ? 0 : clamp(t - lastT, 0, 0.1);
  lastT = t;
  const st = model.state;
  const s = scene ? t - scene.start : 0;
  if (scene && s > SCENES[scene.name]) scene = null;
  const name = scene ? scene.name : null;

  mouse.x = lerp(mouse.x, mouse.tx, 0.12); mouse.y = lerp(mouse.y, mouse.ty, 0.12);
  const ox = -mouse.x * 4; const oy = -mouse.y * 3;

  const dead = st && st.status === 'dead' && name !== 'egg' && !(name === 'death' && s < 3);
  const alive = !st || st.status === 'alive' || name === 'egg' || (name === 'death' && s < 3);
  const lost = st ? (st.maxLives - st.lives) / Math.max(1, st.maxLives) : 0;
  let danger = st && st.status === 'dead' ? 0.9 : lost * 0.85;
  if (name === 'death') danger = Math.max(danger, ease(seg(s, 0, 1.4)) * 0.95);
  const mood = st ? st.mood : 'happy';
  const fatigue = st ? st.contextPct || 0 : 0;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const k = cv.width / W; ctx.setTransform(k, 0, 0, k, 0, 0);

  let shake = 0;
  if (name === 'death' && s > 2.1 && s < 3.0) shake = (1 - seg(s, 2.1, 3.0)) * 4;
  if (name === 'injured' && s < 0.5) shake = 2.5 * (1 - s / 0.5);
  if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  drawPanel(danger, ox, oy);

  // pusudaki gözler (paralaks: arka katman)
  if (!dead && name !== 'death') {
    if (lost > 0.01 || mood === 'sick') {
      const near = clamp(lost, 0.3, 1);
      lurkingEyes(26 + near * 10 + ox * 0.5, 262 - near * 50 + oy * 0.5, 0.8 + near * 0.6, t);
    }
  }

  let sway = Math.sin(t * 0.9) * 0.012 + mouse.x * 0.01;
  if (name === 'death' && s > 2.1) sway += Math.sin(s * 14) * 0.05 * Math.exp(-(s - 2.1) * 1.5);
  if (name === 'injured') sway += Math.sin(s * 18) * 0.02 * Math.exp(-s * 2);

  drawChain(sway);
  drawCageBack(sway);

  ctx.save(); pivot(sway);
  // kuş + tünek
  drawPerch(0);
  let bird = null;
  if (alive && !(name === 'death' && s > 2.25)) {
    const breathe = Math.sin(t * (fatigue > 0.6 ? 1.6 : 2.6)) * 0.02;
    bird = { x: CX, y: BIRD_Y, s: 1, mood, lid: 0, flap: 0, sing: 0, lean: 0, squash: 1 + breathe };
    if (fatigue > 0.6) bird.lid = fatigue > 0.8 ? 0.75 : 0.5;
    if (mood === 'sick') { bird.lid = Math.max(bird.lid, 0.45); bird.lean = 0.12; bird.y += 2; }
    if (mood === 'injured') { bird.x += Math.sin(t * 40) * 0.6; bird.lean = -0.05; }
    if ((t + seed) % 4.3 < 0.13) bird.lid = 1;
    if (mood === 'happy' && fatigue <= 0.8 && !name) {
      const cyc = (t + seed) % 7;
      if (cyc < 1.6) { bird.sing = Math.abs(Math.sin(cyc * 9)); if (Math.random() < dt * 3) addNote(CX + 30, BIRD_Y - 22); }
      if (cyc > 5 && cyc < 5.5) { bird.y -= Math.sin((cyc - 5) / 0.5 * Math.PI) * 6; bird.flap = Math.abs(Math.sin(cyc * 30)); }
    }
    if (fatigue > 0.8 && !name && Math.random() < dt * 0.7) particles.push({ kind: 'spark', x: CX + 22, y: BIRD_Y - 30, vx: 8, vy: -12, rot: 0, vr: 0, life: 2, age: 0, ch: 'z', color: 'rgba(190,210,255,0.85)' });

    if (name === 'ok') {
      bird.y -= Math.abs(Math.sin(s * 6)) * 7 * (1 - s / SCENES.ok); bird.flap = Math.abs(Math.sin(s * 25)); bird.sing = 1;
      if (Math.random() < dt * 6) addNote(CX + 30, BIRD_Y - 22);
    }
    if (name === 'heal' && Math.random() < dt * 10) addSpark(CX + (Math.random() - 0.5) * 40, BIRD_Y - 10, Math.random() < 0.3 ? '♥' : '✦', Math.random() < 0.3 ? '#ff8fa0' : '#fff6b0');
    if (name === 'injured') { bird.flap = s < 0.6 ? Math.abs(Math.sin(s * 30)) : 0; if (s < 0.05 && !scene.burst) { scene.burst = 1; burstFeathers(CX, BIRD_Y, 7, 0.7); } }
    if (name === 'sick' && s < 1) bird.lean = 0.12 + Math.sin(s * 10) * 0.05;
    if (name === 'death') {
      const panic = seg(s, 0.2, 2.1);
      bird.x += Math.sin(s * 50) * 1.4 * panic; bird.flap = panic > 0 ? Math.abs(Math.sin(s * 35)) : 0; bird.sing = panic; bird.lid = 0;
    }
    if (name === 'egg') {
      const g = seg(s, 2.3, 3.3);
      bird.s = lerp(0.35, 1, ease(g)); bird.x = CX; bird.y = lerp(BASE_Y - 12, BIRD_Y, ease(g)); bird.alpha = s < 2.3 ? 0 : 1;
      bird.mood = 'happy'; bird.flap = g < 1 ? Math.abs(Math.sin(s * 20)) * 0.6 : 0;
    }
    birdShadow(bird.x, bird.s * (1 - (BIRD_Y - bird.y) / 120), 0.3);
    drawCanary(bird);
  }
  if (mood === 'injured' && alive && !name) {
    // tabanda dökülmüş tüyler
    ctx.save(); ctx.globalAlpha = 0.85;
    for (const [fx, r] of [[CX - 24, 0.4], [CX + 12, -0.6], [CX - 6, 1.2]]) { ctx.save(); ctx.translate(fx, BASE_Y - 2); ctx.rotate(r); ellipse(0, 0, 5, 1.6); ctx.fillStyle = '#e8c23d'; ctx.fill(); ctx.restore(); }
    ctx.restore();
  }
  if (name === 'egg') drawEgg(s);
  if (dead || (name === 'death' && s > 4)) {
    ctx.save(); ctx.globalAlpha = name === 'death' ? seg(s, 4, 4.6) : 1;
    for (const [fx, r] of [[CX - 30, 0.3], [CX - 8, -0.8], [CX + 18, 1.1], [CX + 34, -0.2], [CX + 2, 0.6]]) { ctx.save(); ctx.translate(fx, BASE_Y - 2); ctx.rotate(r); ellipse(0, 0, 5, 1.6); ctx.fillStyle = '#d9b437'; ctx.fill(); ctx.restore(); }
    ctx.restore();
  }
  ctx.restore();

  drawCageFront(sway, dead || (name === 'death' && s > 2.2), name === 'death' ? Math.max(0, s - 2.2) : t);

  // kedi saldırısı (en ön katman)
  if (name === 'death') drawAttack(s, t, ox);

  stepParticles(dt);
  drawParticles();

  if (name === 'injured' && s < 0.4) { ctx.fillStyle = `rgba(255,40,40,${0.28 * (1 - s / 0.4)})`; rrect(8, 6, 224, 288, 24); ctx.fill(); }
  if (name === 'sick' && s < 1.2) { ctx.fillStyle = `rgba(120,220,90,${0.18 * Math.sin(s / 1.2 * Math.PI)})`; rrect(8, 6, 224, 288, 24); ctx.fill(); }

  if (dead || (name === 'death' && s > 4.3)) deathText(name === 'death' ? seg(s, 4.3, 5.2) : 1, st);
  let shown = st;
  if (st && name === 'egg') shown = { ...st, status: 'alive', lives: st.maxLives };
  else if (st && name === 'death' && s < 3.1) shown = { ...st, status: 'alive', lives: 1 };
  footer(shown, t);
}

function drawAttack(s, t, ox) {
  // 0–1.6 sinsice yaklaşır, 1.6–2.25 zıplar, 2.25–3.1 yer, 3.1–4.2 çekip gider
  let x; let y; let rot = 0; let stretch = 1; let mouth = 0; let reach = 0; let alpha = 1;
  if (s < 1.6) {
    const k = ease(seg(s, 0, 1.6));
    x = lerp(-70, 48, k); y = 214 + Math.sin(s * 7) * 1.2; mouth = 0.3 * k;
  } else if (s < 2.25) {
    const k = seg(s, 1.6, 2.25);
    x = lerp(48, CX - 22, k); y = lerp(214, BIRD_Y + 6, k) - Math.sin(k * Math.PI) * 38; rot = lerp(-0.5, 0.15, k); stretch = 1.25; reach = 1; mouth = 1;
  } else if (s < 3.1) {
    const k = seg(s, 2.25, 3.1);
    x = CX - 22; y = BIRD_Y + 6; mouth = Math.abs(Math.sin(k * Math.PI * 3)); reach = 0.6;
    if (!scene.burst) { scene.burst = 1; burstFeathers(CX, BIRD_Y, 26, 1.3); }
  } else {
    const k = ease(seg(s, 3.1, 4.2));
    x = lerp(CX - 22, 300, k); y = lerp(BIRD_Y + 6, 214, k); alpha = 1 - seg(s, 3.8, 4.2); mouth = 0.2;
  }
  if (s > 2.2 && s < 2.5) { ctx.fillStyle = `rgba(255,30,30,${0.45 * (1 - seg(s, 2.2, 2.5))})`; rrect(8, 6, 224, 288, 24); ctx.fill(); }
  if (s < 2.25 && s > 0.2) { // kuşun "!" paniği
    ctx.font = 'bold 18px "Segoe UI", sans-serif'; ctx.fillStyle = '#ff5050'; ctx.textAlign = 'center'; ctx.fillText('!', CX + 26, BIRD_Y - 34);
  }
  drawCat({ x: x + ox * 0.6, y, s: 1.1, rot, stretch, mouth, reach, alpha, t });
}

function drawEgg(s) {
  const wob = s < 2.3 ? Math.sin(s * (s < 1.5 ? 6 : 16)) * (s < 1.5 ? 0.08 : 0.16) : 0;
  const ex = CX; const ey = BASE_Y - 13;
  if (s < 2.3) {
    ctx.save(); ctx.translate(ex, ey + 12); ctx.rotate(wob); ctx.translate(0, -12);
    ellipse(0, 0, 10, 13);
    ctx.fillStyle = radial(-4, -6, 1, 0, 0, 15, [[0, '#fffdf3'], [1, '#e7d9b8']]); ctx.fill();
    ctx.fillStyle = 'rgba(160,120,70,0.35)';
    for (const [a, b] of [[-3, -5], [4, -1], [-1, 5], [5, 6], [-6, 2]]) { ellipse(a, b, 1.1, 0.8); ctx.fill(); }
    if (s > 1.5) {
      ctx.strokeStyle = '#7a5d38'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(-5, -4); ctx.lineTo(-1, 0); ctx.lineTo(3, -4); ctx.lineTo(6, 0); ctx.lineTo(9, -2); ctx.stroke();
    }
    ctx.restore();
  } else {
    const k = seg(s, 2.3, 3.0); const a = 1 - seg(s, 2.8, 3.4);
    ctx.save(); ctx.globalAlpha = a;
    for (const dir of [-1, 1]) {
      ctx.save(); ctx.translate(ex + dir * (6 + k * 16), ey - 2 + k * 10 - Math.sin(k * Math.PI) * 14); ctx.rotate(dir * k * 1.6);
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 7, 0, dir < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, dir < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
      ctx.fillStyle = '#f4ead2'; ctx.fill(); ctx.restore();
    }
    ctx.restore();
    if (s < 2.35 && !scene.burst) { scene.burst = 1; for (let i = 0; i < 8; i++) addSpark(ex, ey - 6); }
  }
}

function deathText(a, st) {
  const l = L();
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
  ctx.font = '800 21px "Segoe UI", system-ui, sans-serif';
  ctx.shadowColor = 'rgba(255,0,0,0.8)'; ctx.shadowBlur = 12;
  ctx.fillStyle = '#ff3b3b'; ctx.fillText(l.died, CX, 138);
  ctx.shadowBlur = 0;
  ctx.font = '600 11.5px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,190,190,0.92)';
  ctx.fillText(st && st.deathCause === 'blur' ? l.blur : l.hall, CX, 156);
  ctx.restore();
}

// ---------- döngü ----------
let timer = null; let raf = null;
function kick() { clearTimeout(timer); if (!raf) raf = requestAnimationFrame(loop); }
function loop() {
  raf = null;
  render();
  if (frozen) return;
  const busy = scene || particles.length || mouse.over || Math.abs(mouse.x - mouse.tx) > 0.01;
  if (busy) raf = requestAnimationFrame(loop);
  else timer = setTimeout(() => { raf = requestAnimationFrame(loop); }, 1000 / (document.hidden ? 1 : IDLE_FPS));
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(window.innerWidth * dpr); cv.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', () => { resize(); kick(); });
resize();

cv.addEventListener('mousemove', (e) => {
  mouse.tx = clamp(e.clientX / window.innerWidth * 2 - 1, -1, 1); mouse.ty = clamp(e.clientY / window.innerHeight * 2 - 1, -1, 1);
  mouse.over = true; kick();
});
cv.addEventListener('mouseleave', () => { mouse.tx = 0; mouse.ty = 0; mouse.over = false; });
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); window.kanarya && window.kanarya.menu(); });
cv.addEventListener('dblclick', () => { if (model.state && model.state.status === 'alive') play('ok'); });

if (window.kanarya) {
  window.kanarya.onState((p) => {
    const ev = p.state && p.state.event;
    const prevStatus = model.state && model.state.status;
    model = p;
    if (ev && ev.id !== lastEventId) {
      if (lastEventId !== null || p.replay) play(ev.type);
      lastEventId = ev.id;
    } else if (prevStatus === 'dead' && p.state && p.state.status === 'alive') play('egg');
    kick();
  });
  window.kanarya.onPlay((name) => play(name));
  window.kanarya.onDemo(() => {
    const seq = [['happy', 'ok', 4], ['injured', 'injured', 4], ['sick', 'sick', 4], ['dead', 'death', 8], ['happy', 'egg', 5]];
    let i = 0;
    const lives = { happy: 3, injured: 2, sick: 1, dead: 0 };
    const next = () => {
      const [m, sc, dur] = seq[i++ % seq.length];
      model.state = { name: 'Limon', status: m === 'dead' ? 'dead' : 'alive', mood: m === 'dead' ? 'injured' : m, lives: lives[m], maxLives: 3, contextPct: 0.3, deathCause: 'hallucination' };
      play(sc); setTimeout(next, dur * 1000);
    };
    next();
  });
}

// Anlık görüntü / test: window.kanaryaFreeze('death', 2.5, 'tr')
window.kanaryaFreeze = (what, sec, lang) => {
  const states = {
    happy: { mood: 'happy', lives: 3, status: 'alive', contextPct: 0.2 },
    sleepy: { mood: 'happy', lives: 3, status: 'alive', contextPct: 0.85 },
    injured: { mood: 'injured', lives: 2, status: 'alive', contextPct: 0.4 },
    sick: { mood: 'sick', lives: 1, status: 'alive', contextPct: 0.5 },
    dead: { mood: 'injured', lives: 0, status: 'dead', contextPct: 0.5, deathCause: 'hallucination' },
  };
  const base = states[what] || (what === 'death' ? states.injured : states.happy);
  model = { state: { name: lang === 'en' ? 'Lemon' : 'Limon', maxLives: 3, ...base }, settings: { lang, onDeath: { sound: false } }, weeklyDeaths: 2 };
  frozen = { t: 10 };
  particles = [];
  if (SCENES[what]) {
    if (what === 'death') model.state = { ...model.state, status: 'dead', lives: 0, deathCause: 'hallucination' };
    scene = { name: what, start: 10 };
    // parçacıkları o ana kadar simüle et
    lastT = null;
    for (let tt = 0; tt <= sec; tt += 1 / 60) { frozen.t = 10 + tt; render(); }
  } else { frozen.t = 10 + sec; render(); }
  return true;
};

kick();
