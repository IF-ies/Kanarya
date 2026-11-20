'use strict';
// Kanarya çekirdeği: ayarlar, oturum durumu, kelime üretimi, puanlama, transcript okuma.
// Bağımlılık yok; hook'lar ve masaüstü penceresi bu modülü paylaşır.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = process.env.KANARYA_HOME || path.join(os.homedir(), '.claude', 'kanarya');
const PATHS = {
  home: HOME,
  sessions: path.join(HOME, 'sessions'),
  settings: path.join(HOME, 'settings.json'),
  stats: path.join(HOME, 'stats.json'),
  pid: path.join(HOME, 'app.pid'),
  runtime: path.join(HOME, 'runtime'),
};

const DEFAULTS = {
  lang: 'tr',               // 'tr' | 'en'
  checkEvery: 4,            // kaç mesajda bir kontrol
  lives: 3,                 // can sayısı
  healAfter: 3,             // art arda kaç doğru cevap bir can geri verir (0 = kapalı)
  onDeath: { claudeNote: true, notification: true, sound: true },
  contextWindow: 200000,    // yorgunluk hesabı için bağlam boyu (token)
  canaryName: '',           // boşsa rastgele
  autoStart: true,          // oturum açılınca pencereyi başlat
  alwaysOnTop: true,
  corner: 'top-right',      // top-right | top-left | bottom-right | bottom-left
  position: null,           // sürüklenince {x,y}
  scale: 1,
};

const WORDS = {
  tr: ['MANDALINA', 'ZEYTIN', 'PUSULA', 'KESTANE', 'FENER', 'LACIVERT', 'KARANFIL', 'SIMIT',
    'MARTI', 'LODOS', 'KEHRIBAR', 'TARCIN', 'PAPATYA', 'YOSUN', 'KAYISI', 'BADEM', 'FIRTINA',
    'KILIM', 'MERCAN', 'SAFRAN', 'PALAMUT', 'ARMUT', 'KUMRU', 'DEFNE'],
  en: ['TANGERINE', 'COMPASS', 'CHESTNUT', 'LANTERN', 'MARIGOLD', 'PRETZEL', 'SEAGULL',
    'AMBER', 'CINNAMON', 'DAISY', 'APRICOT', 'ALMOND', 'TEMPEST', 'CORAL', 'SAFFRON',
    'MAPLE', 'PEBBLE', 'JUNIPER', 'WALNUT', 'THISTLE', 'BISCUIT', 'NUTMEG', 'GLACIER', 'FALCON'],
};
const NAMES = {
  tr: ['Limon', 'Pamuk', 'Fıstık', 'Tarçın', 'Ballı', 'Güneş', 'Civciv', 'Muz', 'Lokum', 'Sarıkız', 'Bal', 'Zerdali'],
  en: ['Lemon', 'Sunny', 'Butter', 'Pip', 'Mango', 'Honey', 'Biscuit', 'Peaches', 'Nugget', 'Goldie', 'Tweety Jr', 'Saffy'],
};

// ---------- dosya yardımcıları ----------
function ensureDirs() {
  fs.mkdirSync(PATHS.sessions, { recursive: true });
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return fallback; }
}

function writeJson(file, data) {
  ensureDirs();
  const tmp = `${file}.${process.pid}.tmp`;
  const text = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* yok */ }
    fs.writeFileSync(file, text);
  }
}

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object'
      ? merge(base[k], v) : v;
  }
  return out;
}

function loadSettings() {
  const s = merge(DEFAULTS, readJson(PATHS.settings, {}));
  s.checkEvery = clampInt(s.checkEvery, 1, 50, DEFAULTS.checkEvery);
  s.lives = clampInt(s.lives, 1, 9, DEFAULTS.lives);
  s.healAfter = clampInt(s.healAfter, 0, 50, DEFAULTS.healAfter);
  s.contextWindow = clampInt(s.contextWindow, 10000, 10000000, DEFAULTS.contextWindow);
  if (!['tr', 'en'].includes(s.lang)) s.lang = 'tr';
  return s;
}

function saveSettings(partial) {
  const s = merge(loadSettings(), partial);
  writeJson(PATHS.settings, s);
  return loadSettings();
}

function clampInt(v, min, max, def) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function safeId(id) {
  return String(id || 'oturum').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

function sessionFile(id) { return path.join(PATHS.sessions, `${safeId(id)}.json`); }
function loadSession(id) { return readJson(sessionFile(id), null); }
function saveSession(state) {
  state.updated = Date.now();
  writeJson(sessionFile(state.sessionId), state);
}

function listSessions() {
  try {
    return fs.readdirSync(PATHS.sessions)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson(path.join(PATHS.sessions, f), null))
      .filter(Boolean)
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  } catch { return []; }
}

// ---------- kanarya ----------
function pick(arr, rnd = Math.random) { return arr[Math.floor(rnd() * arr.length)]; }

function makeWord(lang, rnd = Math.random) {
  const n = 10 + Math.floor(rnd() * 90);
  return `${pick(WORDS[lang] || WORDS.tr, rnd)}-${n}`;
}

const VARIANTS = 5; // sarı, turuncu, beyaz, yeşil, tarçın (çizim app/scene.js'te)

function liveSessions(now = Date.now()) {
  return listSessions().filter((x) => !x.ended && now - (x.updated || 0) < 24 * 36e5);
}

function newCanary(sessionId, settings, prev, extra = {}) {
  const now = Date.now();
  const others = liveSessions(now).filter((x) => x.sessionId !== sessionId);
  const usedNames = new Set(others.map((x) => x.name));
  const usedVar = new Set(others.map((x) => x.variant));
  const names = (NAMES[settings.lang] || NAMES.tr).filter((n) => !usedNames.has(n));
  const vars = [...Array(VARIANTS).keys()].filter((v) => !usedVar.has(v));
  return {
    sessionId,
    agent: extra.agent || (prev && prev.agent) || 'claude',
    cwd: extra.cwd || (prev && prev.cwd) || '',
    word: makeWord(settings.lang),
    name: settings.canaryName || pick(names.length ? names : NAMES[settings.lang] || NAMES.tr),
    variant: prev && prev.variant !== undefined ? prev.variant : pick(vars.length ? vars : [...Array(VARIANTS).keys()]),
    ended: false,
    generation: prev ? (prev.generation || 1) + 1 : 1,
    lives: settings.lives,
    maxLives: settings.lives,
    status: 'alive',          // alive | dead
    mood: 'happy',            // happy | injured | sick
    streak: 0,
    prompts: 0,
    checks: 0,
    passes: 0,
    pendingCheck: false,
    pendingWord: false,       // Claude'a yeni kelime bildirilmeli mi
    noteForClaude: false,
    requestEgg: false,
    contextPct: prev ? 0 : 0,
    lastAnswer: null,
    lastGrade: null,
    born: now,
    updated: now,
    event: { id: `${now}-egg`, type: 'egg', at: now },
  };
}

// ---------- puanlama ----------
function norm(s) {
  return String(s || '')
    .toLocaleUpperCase('tr')
    .replace(/[ÇĞİÖŞÜ]/g, (c) => ({ Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' }[c]))
    .replace(/[`"'*\s.]/g, '')
    .replace(/[–—_]/g, '-');
}

function lev(a, b) {
  const m = a.length; const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

/** exact | partial | unknown | missing | wrong */
function grade(answer, word) {
  if (answer === null || answer === undefined) return 'missing';
  const a = norm(answer);
  const w = norm(word);
  if (a === '' || /^(\?+|BILMIYORUM|BILMIYOR|HATIRLAMIYORUM|UNKNOWN|IDK|IDONTKNOW|DONTKNOW)$/.test(a)) return 'unknown';
  if (a === w) return 'exact';
  const [ww, wn] = w.split('-');
  const [aw, an] = a.split('-');
  if (aw === ww || (an && an === wn && lev(aw || '', ww) <= Math.ceil(ww.length / 2))) return 'partial';
  if (lev(a, w) <= Math.max(2, Math.floor(w.length * 0.25))) return 'partial';
  return 'wrong';
}

/** Puanı duruma uygular; olay tipini döndürür. */
function applyGrade(state, g, settings, now = Date.now()) {
  state.checks += 1;
  state.lastGrade = g;
  let type;
  if (g === 'exact') {
    state.passes += 1;
    state.streak += 1;
    type = 'ok';
    if (settings.healAfter > 0 && state.lives < state.maxLives && state.streak >= settings.healAfter) {
      state.lives += 1;
      state.streak = 0;
      type = 'heal';
    }
    state.mood = state.lives >= state.maxLives ? 'happy' : 'injured';
  } else if (g === 'partial') {
    state.streak = 0;
    state.lives -= 1;
    type = state.lives <= 0 ? 'death' : 'injured';
    state.mood = 'injured';
  } else if (g === 'unknown' || g === 'missing') {
    // "Bilmiyorum" demek öldürmez: can azalır ama 1'in altına inmez.
    state.streak = 0;
    state.lives = Math.max(1, state.lives - 1);
    state.mood = 'sick';
    type = 'sick';
  } else {
    // Uydurdu: kedi gelir.
    state.streak = 0;
    state.lives = 0;
    type = 'death';
  }
  if (type === 'death') {
    state.status = 'dead';
    state.deathCause = g === 'wrong' ? 'hallucination' : 'blur';
    state.diedAt = now;
    if (settings.onDeath.claudeNote) state.noteForClaude = true;
    recordDeath(state, now);
  }
  state.event = { id: `${now}-${type}`, type, grade: g, at: now };
  return type;
}

function recordDeath(state, now) {
  const stats = readJson(PATHS.stats, { deaths: [] });
  stats.deaths = (stats.deaths || []).filter((d) => now - d.at < 400 * 864e5);
  stats.deaths.push({ at: now, name: state.name, cause: state.deathCause, session: state.sessionId });
  writeJson(PATHS.stats, stats);
}

function weeklyDeaths(now = Date.now()) {
  const stats = readJson(PATHS.stats, { deaths: [] });
  return (stats.deaths || []).filter((d) => now - d.at < 7 * 864e5).length;
}

// ---------- transcript ----------
function readTail(file, maxBytes = 3 * 1024 * 1024) {
  try {
    const st = fs.statSync(file);
    const start = Math.max(0, st.size - maxBytes);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    let text = buf.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    return text;
  } catch { return ''; }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c && c.type === 'text').map((c) => c.text || '').join('\n');
}

function isRealUserPrompt(entry) {
  if (entry.type !== 'user' || entry.isSidechain || entry.isMeta) return false;
  const c = entry.message && entry.message.content;
  if (typeof c === 'string') return true;
  return Array.isArray(c) && c.some((x) => x && x.type === 'text') && !c.some((x) => x && x.type === 'tool_result');
}

/** Son kullanıcı mesajından sonraki asistan metni + son bağlam token sayısı. */
// JSON satırlarındaki son "anahtar":"değer" dizesi (Claude Code oturum başlığı için).
function lastJsonString(raw, key) {
  const re = new RegExp(`"${key}":("(?:[^"\\\\]|\\\\.)*")`, 'g');
  let m; let last = null;
  while ((m = re.exec(raw)) !== null) last = m[1];
  try { return last ? JSON.parse(last) : null; } catch { return null; }
}

function parseTranscript(file) {
  const raw = readTail(file);
  // /rename ile verilen ad önce, yoksa Claude Code'un kendi başlığı
  const title = lastJsonString(raw, 'customTitle') || lastJsonString(raw, 'aiTitle');
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];
  for (const l of lines) { try { entries.push(JSON.parse(l)); } catch { /* yarım satır */ } }
  let tokens = null; let window = null;
  const texts = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.isSidechain) continue;
    // Codex rollout biçimi: token_count olayı bağlam penceresini de verir.
    if (e.type === 'event_msg' && e.payload && e.payload.type === 'token_count' && e.payload.info) {
      const u = e.payload.info.last_token_usage;
      if (tokens === null && u) { tokens = u.total_tokens || u.input_tokens || null; window = e.payload.info.model_context_window || null; }
      continue;
    }
    if (e.type === 'assistant' && e.message) {
      const u = e.message.usage;
      if (tokens === null && u) {
        tokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
      }
      texts.unshift(textOf(e.message.content));
    } else if (isRealUserPrompt(e)) {
      break;
    }
  }
  return { text: texts.join('\n'), tokens, window, title };
}

function extractTag(text) {
  const re = /<kanarya>([\s\S]*?)<\/kanarya>/gi;
  let m; let last = null;
  while ((m = re.exec(String(text || ''))) !== null) last = m[1].trim();
  return last;
}

module.exports = {
  PATHS, DEFAULTS, WORDS, NAMES,
  ensureDirs, readJson, writeJson, loadSettings, saveSettings,
  sessionFile, loadSession, saveSession, listSessions, liveSessions, VARIANTS,
  makeWord, newCanary, norm, lev, grade, applyGrade, weeklyDeaths,
  parseTranscript, extractTag,
};
