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
  tr: { alive: (n, m, tired) => `${n} · ${tired ? 'uykulu' : m === 'injured' ? 'yaralı' : m === 'sick' ? 'hasta' : 'yaşıyor'}`,
    dead: (n) => `${n} · öldü`, died: 'KANARYA ÖLDÜ', hall: 'uydurdu, kedi geldi', blur: 'bağlam bulanıklaştı',
    hint: '/compact ya da sağ tık → yeni yumurta', wait: 'Oturum bekleniyor', waitHint: 'Claude Code ya da Codex aç', ctx: 'bağlam',
    sumAlive: (n) => `${n} kanarya yaşıyor`, sumWeek: (k) => `bu hafta ${k} ölüm`, sumCtx: (p) => `en dolu bağlam %${p}`, sumHint: 'tıkla: ayarlar', sumMore: (n) => `+${n} oturum daha`,
    short: { alive: (n) => `${n} yaşıyor`, week: (k) => `${k} ölüm / 7 gün`, ctx: (p) => `en dolu %${p}`, more: (n) => `+${n} oturum` } },
  en: { alive: (n, m, tired) => `${n} · ${tired ? 'sleepy' : m === 'injured' ? 'injured' : m === 'sick' ? 'sick' : 'alive'}`,
    dead: (n) => `${n} · dead`, died: 'CANARY DIED', hall: 'made things up, the cat came', blur: 'context got blurry',
    hint: '/compact or right-click → new egg', wait: 'Waiting for a session', waitHint: 'Open Claude Code or Codex', ctx: 'context',
    sumAlive: (n) => `${n} canar${n === 1 ? 'y' : 'ies'} alive`, sumWeek: (k) => `${k} death${k === 1 ? '' : 's'} this week`, sumCtx: (p) => `fullest context ${p}%`, sumHint: 'click: settings', sumMore: (n) => `+${n} more session${n === 1 ? '' : 's'}`,
    short: { alive: (n) => `${n} alive`, week: (k) => `${k} deaths / 7d`, ctx: (p) => `max ${p}%`, more: (n) => `+${n} more` } },
};

// ---------- durum ----------
let model = { state: null, settings: { lang: 'tr', onDeath: { sound: true } }, weeklyDeaths: 0 };
let lastEventId = null;
let scene = null;            // { name, start }
let frozen = null;           // anlık görüntü için sabit zaman
let mouse = { x: 0, y: 0, tx: 0, ty: 0, over: false };
let particles = [];
let seed = Math.random() * 1000;

const SCENES = { egg: 3.4, injured: 1.6, sick: 1.8, death: 7.2, heal: 1.6, ok: 1.5 };

// Tema: koyu / açık / sistem
const THEMES = {
  dark: { top: '#2c253a', bot: '#110e17', stroke: 'rgba(255,255,255,0.08)', glow: '255,214,120', chip: 'rgba(0,0,0,0.38)', chipText: '#fff4c8', muted: 'rgba(255,255,255,0.5)', faint: 'rgba(255,255,255,0.4)', box: 'rgba(10,8,14,0.85)', title: '#fff6d6', sub: 'rgba(255,255,255,0.55)', badge: 'rgba(0,0,0,0.55)', badgeStroke: 'rgba(255,255,255,0.10)', track: 'rgba(255,255,255,0.15)', ok: '#bcd0ff', warn: '#ffd27a', bad: '#ff8a8a', accent: '#ffd43b', heart: 'rgba(255,255,255,0.3)', alive: '#fff2c2' },
  light: { top: '#fffaf0', bot: '#efe5d3', stroke: 'rgba(60,40,10,0.16)', glow: '255,196,80', chip: 'rgba(255,255,255,0.88)', chipText: '#3a2a10', muted: 'rgba(40,30,20,0.62)', faint: 'rgba(40,30,20,0.48)', box: 'rgba(255,253,247,0.94)', title: '#2a1f10', sub: 'rgba(40,30,20,0.62)', badge: 'rgba(255,255,255,0.9)', badgeStroke: 'rgba(60,40,10,0.16)', track: 'rgba(0,0,0,0.12)', ok: '#3b6fd8', warn: '#b7791f', bad: '#d33a3a', accent: '#a87808', heart: 'rgba(60,40,10,0.35)', alive: '#7a5a00' },
};
const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function TH() {
  const t = (model.settings && model.settings.theme) || 'dark';
  return THEMES[t === 'system' ? (darkMQ && !darkMQ.matches ? 'light' : 'dark') : t] || THEMES.dark;
}

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
const clearBg = () => !!(model.settings && model.settings.transparent);
function drawPanel(danger, ox, oy) {
  if (clearBg()) return; // şeffaf arka plan: kafes masaüstünde asılı durur
  rrect(8, 6, 224, 288, 24);
  ctx.fillStyle = linear(0, 6, 0, 294, [[0, TH().top], [1, TH().bot]]);
  ctx.fill();
  ctx.save(); ctx.clip();
  // pencereden gelen sıcak ışık (paralaks: en arka katman)
  ctx.fillStyle = radial(70 + ox, 50 + oy, 4, 70 + ox, 50 + oy, 170, [[0, `rgba(${TH().glow},${0.30 - danger * 0.22})`], [1, `rgba(${TH().glow},0)`]]);
  ctx.fillRect(0, 0, W, H);
  // tehlike arttıkça karanlık sol alttan yayılır
  if (danger > 0) {
    ctx.fillStyle = radial(20, 260, 10, 20, 260, 200, [[0, `rgba(0,0,0,${0.75 * danger})`], [1, 'rgba(0,0,0,0)']]);
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  rrect(8.5, 6.5, 223, 287, 24);
  ctx.strokeStyle = TH().stroke; ctx.lineWidth = 1; ctx.stroke();
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
// Gerçek kanarya renkleri: sarı, kırmızı faktör (turuncu), beyaz, yabani yeşil, tarçın.
const VARIANT_COLORS = [
  { hi: '#fffbd2', mid: '#ffd93a', lo: '#d08f00', wing: '#efb000', head: '#ffe065', feather: '#ffd84a' },
  { hi: '#fff0d8', mid: '#ffa53a', lo: '#c25a08', wing: '#e98a1f', head: '#ffb455', feather: '#ffa848' },
  { hi: '#ffffff', mid: '#f0ece2', lo: '#b7ae9c', wing: '#d6cfbf', head: '#f8f5ee', feather: '#f3efe6' },
  { hi: '#f6ffd2', mid: '#c8d846', lo: '#6c871b', wing: '#93a832', head: '#d6e45f', feather: '#c8d846' },
  { hi: '#fbe9d6', mid: '#d9a36d', lo: '#8c572b', wing: '#b87d48', head: '#e3b583', feather: '#d9a36d' },
];
function mix(a, b, k) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a); const y = p(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}
function palette(mood, variant = 0) {
  const base = VARIANT_COLORS[((variant % VARIANT_COLORS.length) + VARIANT_COLORS.length) % VARIANT_COLORS.length];
  if (mood !== 'sick') return base;
  const out = {};
  for (const k of Object.keys(base)) out[k] = mix(base[k], '#a9ad78', 0.45); // hasta: soluk, yeşilimsi
  return out;
}
const variantOf = () => (model.state && Number.isFinite(model.state.variant) ? model.state.variant : 0);

function drawCanary(o) {
  const p = palette(o.mood, o.variant ?? variantOf());
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
// o: { x, y, s, t, rot, stretch, mouth, reach, alpha, walk (adım fazı), wiggle, tongue, holding, noseFeather, pupil, tailUp }
function drawCat(o) {
  ctx.save();
  ctx.translate(o.x, o.y); ctx.scale(o.s, o.s); ctx.rotate(o.rot || 0);
  ctx.globalAlpha = o.alpha ?? 1;
  const fur = '#17131f'; const fur2 = '#2e2839';
  const rim = 'rgba(170,160,225,0.6)';
  const stretch = o.stretch || 1;
  const reach = o.reach || 0;
  const wig = o.wiggle || 0;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // kuyruk (yukarıda kıvrık = keyifli, alçakta seğiren = av modu)
  const tw = Math.sin(o.t * (o.tailUp ? 3 : 9)) * (o.tailUp ? 4 : 6);
  ctx.beginPath(); ctx.moveTo(-34 * stretch + wig, -2);
  if (o.tailUp) ctx.bezierCurveTo(-52 * stretch, -12, -50 * stretch + tw, -48, -36 * stretch + tw, -54);
  else ctx.bezierCurveTo(-58 * stretch + wig, -2, -64 * stretch, -26 + tw, -50 * stretch, -36 + tw);
  ctx.strokeStyle = fur; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = rim; ctx.lineWidth = 1; ctx.stroke();
  // bacaklar: yürürken adım atar, atlarken öne/arkaya uzanır
  const legs = [[-26, 0, true], [-16, Math.PI, true], [16, Math.PI * 0.5, false], [25, Math.PI * 1.5, false]];
  for (const [lx, ph, back] of legs) {
    const hip = back ? lx * stretch + wig : lx * stretch;
    let fx; let fy;
    if (reach > 0.2) { fx = hip + (back ? -16 : 22) * reach; fy = back ? 16 : 6 - reach * 8; } else {
      const w = o.walk === undefined ? 0 : o.walk;
      fx = hip + Math.sin(w + ph) * 6; fy = 20 - Math.max(0, Math.cos(w + ph)) * 4;
    }
    ctx.beginPath(); ctx.moveTo(hip, 6); ctx.lineTo(fx, fy);
    ctx.strokeStyle = fur; ctx.lineWidth = 7; ctx.stroke();
    ellipse(fx + 1.5, fy + 1, 5, 3); ctx.fillStyle = fur; ctx.fill();
    if (!back && reach > 0.2) {
      ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 1;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(fx + 5, fy + k * 2); ctx.lineTo(fx + 9, fy + k * 2.5 + 2); ctx.stroke(); }
    }
  }
  // gövde (popo sallanınca arkası oynar)
  ctx.beginPath();
  ctx.ellipse(-4 + wig * 0.5, 0, 36 * stretch, 15 / Math.sqrt(stretch), 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(-12, -12, 2, -4, 0, 42 * stretch, [[0, fur2], [1, fur]]); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(-4 + wig * 0.5, 0, 36 * stretch, 15 / Math.sqrt(stretch), 0, Math.PI * 1.08, Math.PI * 1.88); ctx.stroke();
  // kafa
  const hx = 30 + reach * 4; const hy = -10 - reach * 2;
  ctx.fillStyle = fur;
  ctx.beginPath(); ctx.moveTo(hx - 8, hy - 11); ctx.lineTo(hx - 25, hy - 16); ctx.lineTo(hx - 4, hy - 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(hx + 2, hy - 14); ctx.lineTo(hx - 12, hy - 24); ctx.lineTo(hx + 7, hy - 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a2b3c';
  ctx.beginPath(); ctx.moveTo(hx - 9, hy - 10); ctx.lineTo(hx - 20, hy - 14); ctx.lineTo(hx - 6, hy - 5); ctx.closePath(); ctx.fill();
  ellipse(hx, hy, 17, 15);
  ctx.fillStyle = radial(hx - 6, hy - 8, 1, hx, hy, 19, [[0, fur2], [1, fur]]); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(hx, hy, 17, 15, 0, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
  // gözler: parlayan sarı; göz bebeği av anında büyür, keyifliyken kapanır
  const happy = o.tongue > 0;
  for (const [ex, ey] of [[hx + 3, hy - 4], [hx + 12, hy - 3]]) {
    ctx.fillStyle = radial(ex, ey, 0, ex, ey, 12, [[0, 'rgba(255,215,60,0.55)'], [1, 'rgba(255,215,60,0)']]);
    ctx.fillRect(ex - 12, ey - 12, 24, 24);
    if (happy) {
      ctx.beginPath(); ctx.arc(ex, ey + 1, 3.6, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1.8; ctx.stroke();
      continue;
    }
    ellipse(ex, ey, 4.4, 3.3); ctx.fillStyle = '#ffd43b'; ctx.fill();
    ellipse(ex + 0.6, ey, 0.9 + (o.pupil || 0) * 2.4, 2.9); ctx.fillStyle = '#000'; ctx.fill();
    ctx.fillStyle = '#fff'; ellipse(ex - 1.4, ey - 1.2, 0.8, 0.8); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.moveTo(ex - 5, ey - 5.5); ctx.lineTo(ex + 5, ey - 1.6); ctx.lineTo(ex + 5, ey - 5.5); ctx.closePath(); ctx.fill();
  }
  // burun, ağız, dişler, dil
  ctx.fillStyle = '#4a2a38'; ellipse(hx + 15, hy + 2, 1.7, 1.2); ctx.fill();
  const m = o.mouth || 0;
  ctx.beginPath(); ctx.moveTo(hx + 5, hy + 5); ctx.quadraticCurveTo(hx + 12, hy + 7 + m * 10, hx + 18, hy + 5); ctx.closePath();
  ctx.fillStyle = m > 0.05 ? '#6e0f1c' : fur; ctx.fill();
  if (m > 0.05) {
    ctx.fillStyle = '#f6f6f6';
    for (const fx of [hx + 8, hx + 15]) { ctx.beginPath(); ctx.moveTo(fx - 1.5, hy + 5.2); ctx.lineTo(fx, hy + 9.5 + m * 2.5); ctx.lineTo(fx + 1.5, hy + 5.2); ctx.fill(); }
  }
  if (o.holding) { // ağızdan sarkan kanarya kuyruğu
    ctx.fillStyle = palette('happy', variantOf()).wing;
    ctx.beginPath(); ctx.moveTo(hx + 16, hy + 6); ctx.lineTo(hx + 27, hy + 13 + Math.sin(o.t * 20) * 1.5); ctx.lineTo(hx + 24, hy + 16); ctx.lineTo(hx + 13, hy + 8); ctx.closePath(); ctx.fill();
  }
  if (o.tongue > 0) {
    ctx.fillStyle = '#e46a86';
    ellipse(hx + 15 + o.tongue * 2, hy + 6.5, 3 * o.tongue, 2); ctx.fill();
  }
  // bıyık
  ctx.strokeStyle = 'rgba(225,225,240,0.5)'; ctx.lineWidth = 0.6;
  for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(hx + 15, hy + 3); ctx.lineTo(hx + 31, hy + 1 + k * 4); ctx.stroke(); }
  if (o.noseFeather) { // burnuna yapışmış tüy
    ctx.save(); ctx.translate(hx + 17, hy - 1); ctx.rotate(-0.6 + Math.sin(o.t * 4) * 0.15);
    ellipse(0, -4, 1.8, 5); ctx.fillStyle = palette('happy', variantOf()).feather; ctx.fill(); ctx.restore();
  }
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
      ellipse(0, 0, 5, 1.8); ctx.fillStyle = palette('happy', variantOf()).feather; ctx.fill();
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
  if (filled) { ctx.fillStyle = radial(-2, -4, 0, 0, -1, 7, [[0, '#ff9aa2'], [1, '#d81e3a']]); ctx.fill(); } else { ctx.strokeStyle = TH().heart; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}

// Metni genişliğe sığdır: önce küçült, yine sığmazsa sonuna … koy.
function fitText(text, maxW, size, weight = '600', min = 9, family = '"Segoe UI", system-ui, sans-serif') {
  let sz = size;
  for (;;) {
    ctx.font = `${weight} ${sz}px ${family}`;
    if (ctx.measureText(text).width <= maxW) return text;
    if (sz <= min) break;
    sz = Math.max(min, sz - 0.5);
  }
  ctx.font = `${weight} ${min}px ${family}`;
  let t = String(text);
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function badge(x, y, text, color, align) {
  ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  const bx = align === 'right' ? x - w : x;
  rrect(bx, y - 11, w, 16, 8); ctx.fillStyle = TH().badge; ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, bx + 6, y + 1);
  return w;
}

function footer(st) {
  const l = L();
  ctx.textAlign = 'center';
  const maxW = 196;
  // üst köşeler: haftalık ölüm (sol), bağlam doluluğu (sağ)
  const k = model.weeklyDeaths || 0;
  if (k) badge(222, 22, `💀 ${k}`, 'rgba(255,170,170,0.85)', 'right');
  if (st && st.status !== 'dead' && (st.contextPct || 0) > 0.005) {
    ctxBadge(st.contextPct, 1);
  }
  ctx.textAlign = 'center';
  // ad + durum kapsülü
  let title; let color = TH().chipText;
  if (!st) { title = l.wait; color = TH().muted; } else if (st.status === 'dead') { title = l.dead(st.name); color = TH().bad; } else title = l.alive(st.name, st.mood, (st.contextPct || 0) > 0.8);
  const shown = fitText(title, maxW - 20, 13, '600', 9.5);
  const tw = ctx.measureText(shown).width + 20;
  rrect(CX - tw / 2, 243, tw, 21, 10.5); ctx.fillStyle = TH().chip; ctx.fill();
  ctx.fillStyle = color; ctx.fillText(shown, CX, 258);
  // proje · ajan
  if (st && (st.label || st.agentName)) {
    const line = [st.label, st.agentName].filter(Boolean).join(' · ');
    const t2 = fitText(line, maxW - 16, 10.5, '500', 10.5, 'Consolas, "Cascadia Mono", monospace');
    const w2 = ctx.measureText(t2).width;
    if (clearBg()) { rrect(CX - w2 / 2 - 14, 266, w2 + 30, 16, 8); ctx.fillStyle = TH().chip; ctx.fill(); ctx.font = '500 10.5px Consolas, "Cascadia Mono", monospace'; }
    agentGlyph(st.agentKind || (st.agentName === 'Codex' ? 'codex' : 'claude'), CX - w2 / 2 - 2, 273.5, 5.5);
    ctx.fillStyle = TH().muted; ctx.fillText(t2, CX + 8, 277);
  } else if (!st) {
    ctx.font = '10px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = TH().faint; ctx.fillText(l.waitHint, CX, 277);
  }
  // canlar ya da ölü ipucu
  if (st && st.status === 'dead') {
    const h = fitText(l.hint, maxW, 10, '500', 8.5); ctx.fillStyle = 'rgba(255,200,200,0.6)'; ctx.fillText(h, CX, 291);
  } else if (st) {
    const n = st.maxLives || 3;
    for (let i = 0; i < n; i++) heart(CX + (i - (n - 1) / 2) * 15, 289, 0.95, i < st.lives);
  }
}

// ---------- ana çizim ----------
let lastT = null;

// Her kafesin kendi durumu, sahnesi ve parçacıkları var; çizerken genel değişkenlere takılır.
const cageMap = new Map();
let cages = [];
const emptyCage = { id: null, model, scene: null, particles: [], lastEventId: null, seed };
function mkCage(id) { return { id, model: { state: null, settings: model.settings, weeklyDeaths: 0 }, scene: null, particles: [], lastEventId: null, seed: Math.random() * 1000 }; }
function withCage(c, fn) {
  model = c.model; scene = c.scene; particles = c.particles; lastEventId = c.lastEventId; seed = c.seed;
  try { fn(); } finally { c.scene = scene; c.particles = particles; c.lastEventId = lastEventId; }
}

// Düzen: pencere (240x300) içinde kafes ve özet kartı yuvaları.
// 1 → tam boy · 2 → üstte 2 kafes + altta geniş özet · 3 → 2x2 (+özet) · 4 → 2x2
// 5–6 → 2x3 (5'te +özet) · 7+ → ilk 5 kafes + "+N" özet
const MAX_SHOWN = 6;
function layout(n) {
  const slots = [];
  const cell = (x, y, w, h, kind, i) => slots.push({ x, y, w, h, kind, i });
  if (n <= 1) { cell(0, 0, W, H, 'full', 0); return slots; }
  if (n === 2) { cell(0, 0, 120, 150, 'cage', 0); cell(120, 0, 120, 150, 'cage', 1); cell(0, 150, 240, 150, 'summary'); return slots; }
  if (n <= 4) {
    for (let i = 0; i < 4; i++) cell((i % 2) * 120, Math.floor(i / 2) * 150, 120, 150, i < n ? 'cage' : 'summary', i);
    return slots;
  }
  const shown = n > MAX_SHOWN ? 5 : n;
  for (let i = 0; i < 6; i++) cell((i % 2) * 120, Math.floor(i / 2) * 100, 120, 100, i < shown ? 'cage' : 'summary', i);
  return slots;
}

function render() {
  const t = nowS();
  const dt = lastT === null ? 0 : clamp(t - lastT, 0, 0.1);
  lastT = t;
  mouse.x = lerp(mouse.x, mouse.tx, 0.12); mouse.y = lerp(mouse.y, mouse.ty, 0.12);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const k = cv.width / W;
  const list = cages.length ? cages : [emptyCage];
  for (const sl of layout(list.length)) {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (sl.kind === 'full') { withCage(list[0], () => drawCage(t, dt, true)); continue; }
    if (sl.kind === 'summary') { summaryCard(list, sl); continue; }
    const c = list[sl.i];
    const compact = sl.h < 130; // kısa hücre: zincir/kubbe kırpılır, görünür bölge kafes biriminde y=CROP..294
    const CROP = 92;
    const s = compact ? Math.min((sl.w - 4) / 224, (sl.h - 4) / (294 - CROP)) : Math.min((sl.w - 4) / 224, (sl.h - 4) / 288);
    const top = compact ? CROP : 6;
    ctx.save();
    if (compact) { rrect(sl.x + 2, sl.y + 2, sl.w - 4, sl.h - 4, 12); ctx.clip(); }
    ctx.translate(sl.x + (sl.w - 224 * s) / 2 - 8 * s, sl.y + (sl.h - (294 - top) * s) / 2 - top * s);
    ctx.scale(s, s);
    withCage(c, () => { drawCage(t, dt, false); cellLabel(c.model.state, s, compact ? top + 4 : 12); });
    ctx.restore();
  }
}

// Özet kartı: gerçek piksel biriminde çizilir (yuvanın boyuna göre satır sayısı).
function summaryCard(list, sl) {
  const l = L();
  model = emptyCage.model;
  const x = sl.x + 3; const y = sl.y + 3; const w = sl.w - 6; const h = sl.h - 6;
  rrect(x, y, w, h, 12);
  ctx.fillStyle = clearBg() ? TH().box : linear(0, y, 0, y + h, [[0, TH().top], [1, TH().bot]]); ctx.fill();
  ctx.strokeStyle = TH().stroke; ctx.lineWidth = 1; ctx.stroke();
  const st = list.map((c) => c.model.state).filter(Boolean);
  const dead = st.filter((v) => v.status === 'dead').length;
  const maxCtx = Math.round(Math.max(0, ...st.map((v) => v.contextPct || 0)) * 100);
  const extra = Math.max(0, list.length - 5);
  const rows = [];
  const sh = w < 160 ? l.short : { alive: l.sumAlive, week: l.sumWeek, ctx: l.sumCtx, more: l.sumMore };
  if (list.length > MAX_SHOWN) rows.push(['➕', sh.more(extra), '#ffe9a8']);
  rows.push(['🐤', sh.alive(st.length - dead), TH().alive]);
  rows.push(['💀', sh.week(emptyCage.model.weeklyDeaths || 0), (emptyCage.model.weeklyDeaths || 0) ? TH().bad : TH().muted]);
  rows.push(['📈', sh.ctx(maxCtx), maxCtx >= 80 ? TH().bad : maxCtx >= 60 ? TH().warn : TH().ok]);
  const lineH = 16; const top = y + 10;
  ctx.textAlign = 'left';
  ctx.font = '700 12px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = TH().accent;
  ctx.fillText('Kanarya', x + 10, top + 10);
  const room = Math.floor((h - 34) / lineH);
  rows.slice(0, Math.max(1, room)).forEach(([ic, txt, col], i) => {
    const yy = top + 10 + (i + 1) * lineH;
    ctx.font = '10px "Segoe UI Emoji", sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(ic, x + 10, yy);
    ctx.fillStyle = col; ctx.fillText(fitText(txt, w - 38, 10.5, '600', 10.5), x + 26, yy);
  });
  if (h > 90) {
    ctx.font = '9px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = TH().faint;
    ctx.fillText(l.sumHint, x + 10, y + h - 8);
  }
  ctx.textAlign = 'center';
}

// Ajan simgesi (resmî logo değil, sade çağrışım): Claude → turuncu ışın, Codex → ">_" terminal.
function agentGlyph(kind, x, y, r) {
  ctx.save(); ctx.translate(x, y);
  if (kind === 'codex') {
    const lightT = TH() === THEMES.light;
    rrect(-r, -r, 2 * r, 2 * r, r * 0.45); ctx.fillStyle = lightT ? '#1b1b1b' : '#f4f4f4'; ctx.fill();
    ctx.strokeStyle = lightT ? '#f4f4f4' : '#111'; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.4); ctx.lineTo(-r * 0.1, 0); ctx.lineTo(-r * 0.5, r * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.05, r * 0.45); ctx.lineTo(r * 0.55, r * 0.45); ctx.stroke();
  } else {
    ctx.strokeStyle = '#d97757'; ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2; const len = i % 2 ? r * 0.72 : r;
      ctx.lineWidth = r * (i % 2 ? 0.2 : 0.26);
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke();
    }
  }
  ctx.restore();
}
const agentShort = (st) => (st.agentKind === 'codex' || st.agentName === 'Codex' ? 'Codex' : st.agentName === 'Claude App' ? 'App' : 'Code');

// Küçük hücre etiketi: yazı boyu SABİT (gerçek 11px / 9px); sığmazsa yalnızca "…" ile kısalır.
function cellLabel(st, s, badgeY = 12) {
  if (!st) return;
  const l = L(); const f = 1 / s; // f: gerçek pikseli kafes birimine çevirir
  const boxH = Math.min(120, 30 * f);
  const top = 294 - boxH;
  rrect(8, top, 224, boxH, Math.min(18, 8 * f)); ctx.fillStyle = TH().box; ctx.fill();
  const ty = top + 12 * f; const sy = top + 24.5 * f;
  agentGlyph(st.agentKind || (st.agentName === 'Codex' ? 'codex' : 'claude'), 16 + 5.5 * f, ty - 3.8 * f, 5 * f);
  ctx.textAlign = 'left';
  const title = fitText(st.label || st.name, 216 - 20 - 13 * f, 11 * f, '700', 11 * f);
  ctx.fillStyle = st.status === 'dead' ? TH().bad : TH().title; ctx.fillText(title, 16 + 13 * f, ty);
  // alt satır: kanarya adı (rengiyle) · ajan
  const n = st.maxLives || 3;
  const heartsW = st.status === 'dead' ? 0 : n * 8.5 * f;
  ctx.font = `600 ${9 * f}px "Segoe UI", system-ui, sans-serif`;
  const nameTxt = st.status === 'dead' ? l.dead(st.name) : st.name;
  ctx.fillStyle = st.status === 'dead' ? TH().bad : (TH() === THEMES.light ? palette('happy', st.variant || 0).lo : palette('happy', st.variant || 0).mid);
  const nm = fitText(nameTxt, 120, 9 * f, '600', 9 * f);
  ctx.fillText(nm, 16, sy);
  const nw = ctx.measureText(nm).width;
  ctx.fillStyle = TH().sub;
  ctx.fillText(fitText(` · ${agentShort(st)}`, Math.max(10, 224 - 16 - nw - heartsW - 6), 9 * f, '500', 9 * f), 16 + nw, sy);
  ctx.textAlign = 'center';
  if (st.status !== 'dead') for (let i = 0; i < n; i++) heart(226 - (n - 1 - i) * 8.5 * f - 4 * f, sy - 3 * f, 0.6 * f, i < st.lives);
  const pct = clamp(st.contextPct || 0, 0, 1);
  if (pct > 0.005 && st.status !== 'dead') ctxBadge(pct, f, badgeY);
}

// Bağlam doluluğu: yazılı rozet ("bağlam 42%") + rozetin içinde altta doluluk çubuğu.
// f: ızgarada küçülen kafeste yazının gerçek boyutta okunur kalması için büyütme.
function ctxBadge(p, f, y = 12) {
  const pct = Math.round(clamp(p || 0, 0, 1) * 100);
  const col = pct >= 80 ? TH().bad : pct >= 60 ? TH().warn : TH().ok;
  const txt = model.settings.lang === 'en' ? `${L().ctx} ${pct}%` : `${L().ctx} %${pct}`;
  ctx.font = `600 ${9.5 * f}px "Segoe UI", system-ui, sans-serif`;
  const pad = 7 * f; const w = ctx.measureText(txt).width + pad * 2; const h = 22 * f;
  const x = 16;
  rrect(x, y, w, h, 6 * f); ctx.fillStyle = TH().badge; ctx.fill();
  ctx.strokeStyle = TH().badgeStroke; ctx.lineWidth = f; ctx.stroke();
  ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(txt, x + pad, y + 11 * f);
  const bw = w - pad * 2; const by = y + h - 6 * f;
  rrect(x + pad, by, bw, 2.4 * f, 1.2 * f); ctx.fillStyle = TH().track; ctx.fill();
  rrect(x + pad, by, Math.max(2 * f, bw * pct / 100), 2.4 * f, 1.2 * f); ctx.fillStyle = col; ctx.fill();
  ctx.textAlign = 'center';
}

function drawCage(t, dt, full) {
  ctx.save();
  const st = model.state;
  const s = scene ? t - scene.start : 0;
  if (scene && s > SCENES[scene.name]) scene = null;
  const name = scene ? scene.name : null;
  const ox = -mouse.x * 4; const oy = -mouse.y * 3;

  const dead = st && st.status === 'dead' && name !== 'egg' && !(name === 'death' && s < 2.8);
  const alive = !st || st.status === 'alive' || name === 'egg' || (name === 'death' && s < 2.8);
  const lost = st ? (st.maxLives - st.lives) / Math.max(1, st.maxLives) : 0;
  let danger = st && st.status === 'dead' ? 0.9 : lost * 0.85;
  if (name === 'death') danger = Math.max(danger, ease(seg(s, 0, 0.7)) * 0.95);
  const mood = st ? st.mood : 'happy';
  const fatigue = st ? st.contextPct || 0 : 0;

  let shake = 0;
  if (name === 'death' && s > 2.75 && s < 3.7) shake = (1 - seg(s, 2.75, 3.7)) * 5;
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
  if (name === 'death' && s > 2.75) sway += Math.sin(s * 14) * 0.07 * Math.exp(-(s - 2.75) * 1.3);
  if (name === 'injured') sway += Math.sin(s * 18) * 0.02 * Math.exp(-s * 2);

  drawChain(sway);
  drawCageBack(sway);

  ctx.save(); pivot(sway);
  // kuş + tünek
  drawPerch(0);
  let bird = null;
  if (alive && !(name === 'death' && s > 2.8)) {
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
      const panic = seg(s, 0.4, 2.8);
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
    for (const [fx, r] of [[CX - 24, 0.4], [CX + 12, -0.6], [CX - 6, 1.2]]) { ctx.save(); ctx.translate(fx, BASE_Y - 2); ctx.rotate(r); ellipse(0, 0, 5, 1.6); ctx.fillStyle = palette('happy', variantOf()).feather; ctx.fill(); ctx.restore(); }
    ctx.restore();
  }
  if (name === 'egg') drawEgg(s);
  if (dead || (name === 'death' && s > 4.4)) {
    ctx.save(); ctx.globalAlpha = name === 'death' ? seg(s, 4.4, 5) : 1;
    for (const [fx, r] of [[CX - 30, 0.3], [CX - 8, -0.8], [CX + 18, 1.1], [CX + 34, -0.2], [CX + 2, 0.6]]) { ctx.save(); ctx.translate(fx, BASE_Y - 2); ctx.rotate(r); ellipse(0, 0, 5, 1.6); ctx.fillStyle = palette('happy', variantOf()).lo; ctx.fill(); ctx.restore(); }
    ctx.restore();
  }
  ctx.restore();

  drawCageFront(sway, dead || (name === 'death' && s > 2.8), name === 'death' ? Math.max(0, s - 2.8) : t);

  // kedi saldırısı (en ön katman)
  if (name === 'death') { ctx.save(); rrect(8, 6, 224, 288, 24); ctx.clip(); drawAttack(s, t, ox); ctx.restore(); }

  stepParticles(dt);
  drawParticles();

  if (name === 'injured' && s < 0.4) { ctx.fillStyle = `rgba(255,40,40,${0.28 * (1 - s / 0.4)})`; rrect(8, 6, 224, 288, 24); ctx.fill(); }
  if (name === 'sick' && s < 1.2) { ctx.fillStyle = `rgba(120,220,90,${0.18 * Math.sin(s / 1.2 * Math.PI)})`; rrect(8, 6, 224, 288, 24); ctx.fill(); }

  if (dead || (name === 'death' && s > 5.2)) deathText(name === 'death' ? seg(s, 5.2, 6) : 1, st);
  let shown = st;
  if (st && name === 'egg') shown = { ...st, status: 'alive', lives: st.maxLives };
  else if (st && name === 'death' && s < 3.7) shown = { ...st, status: 'alive', lives: 1 };
  ctx.restore();
  if (full) footer(shown);
}

// Kedi saldırısı zaman çizelgesi (saniye):
// 0–0.7 karanlıkta gözler · 0.7–1.8 sinsi yürüyüş · 1.8–2.3 popo sallama · 2.3–2.8 sıçrayış
// 2.8–3.7 ısırık (ÇAT!) + çiğneme · 3.7–4.5 dudak yalama · 4.5–5.5 keyifle çıkış
const ATTACK = { eyes: 0.7, creep: 1.8, wiggle: 2.3, pounce: 2.8, bite: 3.7, lick: 4.5, leave: 5.5 };
const GROUND = 238;

function drawAttack(s, t, ox) {
  let x; let y; let rot = 0; let stretch = 1; let mouth = 0; let reach = 0; let alpha = 1;
  let walk; let wiggle = 0; let tongue = 0; let holding = false; let noseFeather = false; let pupil = 0.3; let tailUp = false;
  const A = ATTACK;
  if (s < A.eyes) {
    // yalnızca gözler, karanlıkta yavaşça açılır
    const k = seg(s, 0, A.eyes);
    lurkingEyes(30 + ox * 0.6, 206, 1.1 + k * 0.4, t);
    return;
  }
  if (s < A.creep) {
    const k = ease(seg(s, A.eyes, A.creep));
    x = lerp(-60, 46, k); y = 216; walk = s * 9; mouth = 0.15; pupil = 0.5;
  } else if (s < A.wiggle) {
    const k = seg(s, A.creep, A.wiggle);
    x = 46; y = 219; wiggle = Math.sin(k * Math.PI * 7) * 5 * Math.sin(k * Math.PI); pupil = 1; mouth = 0.2; stretch = 0.92;
  } else if (s < A.pounce) {
    const k = seg(s, A.wiggle, A.pounce);
    x = lerp(46, CX - 24, ease(k)); y = lerp(216, BIRD_Y + 6, k) - Math.sin(k * Math.PI) * 42;
    rot = lerp(-0.55, 0.15, k); stretch = 1.3; reach = 1; mouth = 1; pupil = 1;
    // hız çizgileri
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const yy = y - 14 + i * 9; ctx.beginPath(); ctx.moveTo(x - 70 - i * 6, yy + 10); ctx.lineTo(x - 38 - i * 4, yy + 4); ctx.stroke(); }
    ctx.restore();
  } else if (s < A.bite) {
    const k = seg(s, A.pounce, A.bite);
    x = CX - 24; y = BIRD_Y + 6; mouth = Math.abs(Math.sin(k * Math.PI * 4)) * 0.7; reach = 0.5; holding = k > 0.25; pupil = 1;
    if (!scene.burst) { scene.burst = 1; burstFeathers(CX, BIRD_Y, 34, 1.4); }
    comicText(seg(s, A.pounce, A.pounce + 0.5));
  } else if (s < A.lick) {
    const k = seg(s, A.bite, A.lick);
    x = CX - 24; y = lerp(BIRD_Y + 6, 216, ease(seg(k, 0, 0.35))); tongue = Math.abs(Math.sin(k * Math.PI * 3)); noseFeather = true;
  } else {
    const k = ease(seg(s, A.lick, A.leave));
    x = lerp(CX - 24, 310, k); y = 216; walk = s * 7; tailUp = true; noseFeather = true; alpha = 1 - seg(s, A.leave - 0.3, A.leave);
  }
  // yer gölgesi (havadayken küçülür)
  const air = clamp((216 - y) / 60, 0, 1);
  ellipse(x + ox * 0.6, GROUND, 40 * (1 - air * 0.5), 5 * (1 - air * 0.5));
  ctx.fillStyle = `rgba(0,0,0,${0.4 * alpha * (1 - air * 0.6)})`; ctx.fill();
  if (s > A.pounce - 0.05 && s < A.pounce + 0.3) { ctx.fillStyle = `rgba(255,40,40,${0.5 * (1 - seg(s, A.pounce - 0.05, A.pounce + 0.3))})`; rrect(8, 6, 224, 288, 24); ctx.fill(); }
  if (s > A.eyes && s < A.pounce) { // kuşun paniği
    ctx.font = 'bold 18px "Segoe UI", sans-serif'; ctx.fillStyle = '#ff5050'; ctx.textAlign = 'center';
    ctx.fillText(s > A.creep ? '!!' : '!', CX + 26, BIRD_Y - 34);
  }
  drawCat({ x: x + ox * 0.6, y, s: 1.1, rot, stretch, mouth, reach, alpha, t, walk, wiggle, tongue, holding, noseFeather, pupil, tailUp });
}

function comicText(k) {
  if (k <= 0 || k >= 1) return;
  const pop = k < 0.3 ? ease(k / 0.3) * 1.25 : 1.25 - (k - 0.3) * 0.35;
  ctx.save(); ctx.translate(CX + 40, 92); ctx.rotate(-0.18); ctx.scale(pop, pop);
  ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
  ctx.font = '900 24px "Segoe UI Black", "Segoe UI", sans-serif'; ctx.textAlign = 'center';
  const word = model.settings.lang === 'en' ? 'CHOMP!' : 'ÇAT!';
  ctx.lineWidth = 5; ctx.strokeStyle = '#1a0a0a'; ctx.strokeText(word, 0, 0);
  ctx.fillStyle = '#ffde3b'; ctx.fillText(word, 0, 0);
  ctx.restore();
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
  const busy = cages.some((c) => c.scene || c.particles.length) || mouse.over || Math.abs(mouse.x - mouse.tx) > 0.01;
  if (busy) raf = requestAnimationFrame(loop);
  else timer = setTimeout(() => { raf = requestAnimationFrame(loop); }, 1000 / (document.hidden ? 1 : IDLE_FPS));
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(window.innerWidth * dpr); cv.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', () => { resize(); kick(); });
resize();

function slotAt(x, y) {
  const px = x / window.innerWidth * W; const py = y / window.innerHeight * H;
  return layout(Math.max(1, cages.length)).find((sl) => px >= sl.x && px < sl.x + sl.w && py >= sl.y && py < sl.y + sl.h) || null;
}
function cageAt(x, y) {
  const sl = slotAt(x, y);
  if (!sl || sl.kind === 'summary') return null;
  return cages[sl.kind === 'full' ? 0 : sl.i] || null;
}
function playOn(c, name) { if (c) withCage(c, () => play(name)); kick(); }

cv.addEventListener('mousemove', (e) => {
  mouse.tx = clamp(e.clientX / window.innerWidth * 2 - 1, -1, 1); mouse.ty = clamp(e.clientY / window.innerHeight * 2 - 1, -1, 1);
  mouse.over = true; kick();
});
cv.addEventListener('mouseleave', () => { mouse.tx = 0; mouse.ty = 0; mouse.over = false; });
cv.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const c = cageAt(e.clientX, e.clientY);
  window.kanarya && window.kanarya.menu(c ? c.id : null);
});
cv.addEventListener('click', (e) => {
  // Özet kartına tıklayınca menü (ayarlar)
  const sl = slotAt(e.clientX, e.clientY);
  if (sl && sl.kind === 'summary') window.kanarya && window.kanarya.menu(null);
});
cv.addEventListener('dblclick', (e) => {
  const c = cageAt(e.clientX, e.clientY);
  if (c && c.model.state && c.model.state.status === 'alive') playOn(c, 'ok');
});

if (window.kanarya) {
  window.kanarya.onState((p) => {
    emptyCage.model = { state: null, settings: p.settings, weeklyDeaths: p.weeklyDeaths };
    const next = [];
    for (const st of p.sessions || []) {
      let c = cageMap.get(st.sessionId);
      if (!c) { c = mkCage(st.sessionId); cageMap.set(st.sessionId, c); }
      const prevStatus = c.model.state && c.model.state.status;
      c.model = { state: st, settings: p.settings, weeklyDeaths: p.weeklyDeaths };
      const ev = st.event;
      if ((p.fresh || []).includes(st.sessionId)) { c.lastEventId = ev ? ev.id : null; playOn(c, 'egg'); } else if (ev && ev.id !== c.lastEventId) {
        if (c.lastEventId !== null || p.replay) playOn(c, ev.type);
        c.lastEventId = ev.id;
      } else if (prevStatus === 'dead' && st.status === 'alive') playOn(c, 'egg');
      next.push(c);
    }
    for (const id of [...cageMap.keys()]) if (!next.some((c) => c.id === id)) cageMap.delete(id);
    cages = next;
    kick();
  });
  window.kanarya.onPlay((p) => playOn(cageMap.get(p.id) || cages[0], p.scene));
  window.kanarya.onDemo(() => {
    const c = mkCage('demo'); cages = [c];
    const seq = [['happy', 'ok', 4], ['injured', 'injured', 4], ['sick', 'sick', 4], ['dead', 'death', 8], ['happy', 'egg', 5]];
    let i = 0;
    const lives = { happy: 3, injured: 2, sick: 1, dead: 0 };
    const step = () => {
      const [m, sc, dur] = seq[i++ % seq.length];
      c.model = { ...c.model, state: { name: 'Limon', label: 'Demo', agentName: 'Claude', status: m === 'dead' ? 'dead' : 'alive', mood: m === 'dead' ? 'injured' : m, lives: lives[m], maxLives: 3, contextPct: 0.3, deathCause: 'hallucination' } };
      playOn(c, sc); setTimeout(step, dur * 1000);
    };
    step();
  });
}

// Anlık görüntü / test: window.kanaryaFreeze('death', 2.5, 'tr', değişken, kafesSayısı)
window.kanaryaFreeze = (what, sec, lang, variant = 0, count = 1, theme = 'dark', transparent = false) => {
  const states = {
    happy: { mood: 'happy', lives: 3, status: 'alive', contextPct: 0.2 },
    sleepy: { mood: 'happy', lives: 3, status: 'alive', contextPct: 0.85 },
    injured: { mood: 'injured', lives: 2, status: 'alive', contextPct: 0.4 },
    sick: { mood: 'sick', lives: 1, status: 'alive', contextPct: 0.5 },
    dead: { mood: 'injured', lives: 0, status: 'dead', contextPct: 0.5, deathCause: 'hallucination' },
  };
  const names = lang === 'en' ? ['Lemon', 'Mango', 'Pip', 'Honey', 'Biscuit', 'Sunny', 'Butter', 'Peaches'] : ['Limon', 'Fıstık', 'Pamuk', 'Zerdali', 'Tarçın', 'Bal', 'Lokum', 'Güneş'];
  const labels = lang === 'en' ? ['Refactor auth module', 'Fix flaky checkout tests', 'Landing page SEO', 'Migrate API client', 'Release notes 2.1', 'Docs cleanup', 'Upgrade dependencies', 'Write onboarding guide'] : ['Giriş modülünü düzenle', 'Ödeme testlerini düzelt', 'Tanıtım sayfası SEO', 'API istemcisini taşı', 'Sürüm notları 2.1', 'Belge temizliği', 'Bağımlılık güncelleme', 'Başlangıç kılavuzu'];
  const order = [what, 'injured', 'sick', 'sleepy', 'happy', 'dead', 'happy', 'happy'];
  const agents = [['Claude Code', 'claude'], ['Claude App', 'claude'], ['Codex', 'codex']];
  frozen = { t: 10 };
  emptyCage.model = { state: null, settings: { lang, theme, transparent, onDeath: { sound: false } }, weeklyDeaths: 2 };
  cages = [];
  for (let i = 0; i < count; i++) {
    const v = (variant + i) % 5;
    const key = order[i] in states ? order[i] : (order[i] === 'death' ? 'injured' : 'happy');
    const c = mkCage(`c${i}`);
    c.model = { state: { name: names[i], variant: v, label: labels[i], agentName: agents[i % 3][0], agentKind: agents[i % 3][1], maxLives: 3, ...states[key] }, settings: { lang, theme, transparent, onDeath: { sound: false } }, weeklyDeaths: 2 };
    if (i === 0 && SCENES[what]) {
      if (what === 'death') c.model.state = { ...c.model.state, status: 'dead', lives: 0, deathCause: 'hallucination' };
      c.scene = { name: what, start: 10 };
    }
    cages.push(c);
  }
  lastT = null;
  // parçacıkları o ana kadar simüle et
  for (let tt = 0; tt <= sec; tt += 1 / 60) { frozen.t = 10 + tt; render(); }
  return true;
};

kick();
