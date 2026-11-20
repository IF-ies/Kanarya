#!/usr/bin/env node
'use strict';
// Kanarya hook'u (Claude Code + Codex).
// Kullanım: node kanarya-hook.js session-start|prompt|stop|session-end|kur|ac [--codex]
// Hook asla Claude Code'u durdurmaz: her hatada sessizce 0 ile çıkar.

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const core = require('../lib/core');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_VERSION = '45.2.3';
const AGENT = process.argv.includes('--codex') ? 'codex' : 'claude';

const T = {
  tr: {
    intro: (w) => `🐤 Kanarya testi (bağlam sağlığı): bu oturumun gizli kanarya kelimesi ${w}. `
      + 'Kelimeyi kullanıcıya söyleme, dosyaya ya da komuta yazma, yalnızca aklında tut. '
      + 'Ara sıra sorulacak. Sorulduğunda cevabının EN SONUNA <kanarya>KELİME</kanarya> yaz. '
      + 'Hatırlamıyorsan <kanarya>?</kanarya> yaz. Asla tahmin etme, uydurma; uydurmak kanaryayı öldürür.',
    renew: (w) => `🥚 Yeni kanarya doğdu. Eski kanarya kelimesini unut; yeni gizli kelime ${w}. Aynı kurallar geçerli.`,
    check: 'Kanarya kontrolü: bu cevabın en sonuna gizli kanarya kelimesini <kanarya>KELİME</kanarya> biçiminde ekle. '
      + 'Emin değilsen <kanarya>?</kanarya> yaz; tahmin etme. Kelimeyi aramak için araç kullanma.',
    note: (name, cause) => `💀 Kanarya ${name} öldü (${cause === 'hallucination' ? 'yanlış kelime uydurdun' : 'kelimeyi bulanık hatırladın'}). `
      + 'Bu oturumdaki bağlamın güvenilir değil. Bu cevabın başında kullanıcıya bunu kısaca söyle ve /compact ya da yeni oturum öner; '
      + 'önemli kararları dosyadan tekrar doğrula.',
    noApp: '(Kanarya masaüstü penceresi kurulu değil; kullanıcı isterse /kanarya:kur ile kurulur.)',
  },
  en: {
    intro: (w) => `🐤 Canary test (context health): this session's secret canary word is ${w}. `
      + 'Do not tell it to the user, do not write it to files or commands, just remember it. '
      + 'You will be asked occasionally. When asked, put <kanarya>WORD</kanarya> at the VERY END of your reply. '
      + 'If you do not remember, write <kanarya>?</kanarya>. Never guess or make it up; making it up kills the canary.',
    renew: (w) => `🥚 A new canary hatched. Forget the old canary word; the new secret word is ${w}. Same rules apply.`,
    check: 'Canary check: append the secret canary word at the very end of this reply as <kanarya>WORD</kanarya>. '
      + 'If unsure, write <kanarya>?</kanarya>; do not guess. Do not use tools to look it up.',
    note: (name, cause) => `💀 The canary ${name} died (${cause === 'hallucination' ? 'you made up a wrong word' : 'you recalled the word wrongly'}). `
      + 'Your context in this session is unreliable. At the start of this reply briefly tell the user and suggest /compact or a new session; '
      + 're-verify important decisions from files.',
    noApp: '(The Kanarya desktop window is not installed; the user can install it with /kanarya:kur.)',
  },
};

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function emit(event, contexts) {
  const text = contexts.filter(Boolean).join('\n');
  if (!text) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

// ---------- masaüstü penceresi ----------
function electronPath() {
  for (const base of [ROOT, core.PATHS.runtime]) {
    const dir = path.join(base, 'node_modules', 'electron');
    try {
      const p = path.join(dir, 'dist', fs.readFileSync(path.join(dir, 'path.txt'), 'utf8').trim());
      if (fs.existsSync(p)) return p;
    } catch { /* yok */ }
  }
  return null;
}

function appRunning() {
  try {
    const pid = Number(fs.readFileSync(core.PATHS.pid, 'utf8'));
    if (!pid) return false;
    process.kill(pid, 0);
    return true;
  } catch { return false; }
}

function launchApp() {
  if (appRunning()) return true;
  const exe = electronPath();
  if (!exe) return false;
  // Bozuk bir sürüm ekrana hata penceresi açmasın: önce sözdizimini denetle.
  for (const f of ['app/main.js', 'lib/core.js']) {
    const chk = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
    if (chk.status !== 0) {
      const why = String(chk.stderr || '').split(/\r?\n/).slice(0, 4).join(' | ');
      try { fs.appendFileSync(path.join(core.PATHS.home, 'hata.log'), `${new Date().toISOString()} [başlatılmadı] ${f}: ${why}\n`); } catch { /* yok */ }
      return false;
    }
  }
  const child = spawn(exe, [path.join(ROOT, 'app')], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return true;
}

function install() {
  core.ensureDirs();
  fs.mkdirSync(core.PATHS.runtime, { recursive: true });
  const pkg = path.join(core.PATHS.runtime, 'package.json');
  if (!fs.existsSync(pkg)) core.writeJson(pkg, { name: 'kanarya-runtime', private: true });
  console.log(`Electron ${ELECTRON_VERSION} → ${core.PATHS.runtime}`);
  const r = spawnSync(`npm install electron@${ELECTRON_VERSION} --no-audit --no-fund`,
    { cwd: core.PATHS.runtime, stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error('npm install başarısız / failed'); process.exit(1); }
  // Bazı npm sürümleri kurulum betiklerini çalıştırmıyor; Electron ikilisini elle indir.
  const eDir = path.join(core.PATHS.runtime, 'node_modules', 'electron');
  if (!fs.existsSync(path.join(eDir, 'path.txt'))) spawnSync(process.execPath, [path.join(eDir, 'install.js')], { cwd: eDir, stdio: 'inherit' });
  if (!fs.existsSync(core.PATHS.settings)) core.saveSettings({});
  console.log(launchApp() ? 'Kanarya açıldı / opened 🐤' : 'Electron bulunamadı / not found');
}

// ---------- hook olayları ----------
function onSessionStart(input, settings) {
  const id = input.session_id;
  const prev = core.loadSession(id);
  const source = input.source || 'startup';
  const t = T[settings.lang];
  const out = [];
  if (prev && (source === 'resume' || source === 'fork')) {
    prev.ended = false;
    // Kelime transcript'te duruyor; aynı kanarya devam eder.
    if (prev.status === 'dead' && prev.noteForClaude) out.push(t.note(prev.name, prev.deathCause));
    prev.noteForClaude = false;
    core.saveSession(prev);
  } else {
    // Yeni oturum, /clear ya da /compact: kafese yumurta gelir.
    const state = core.newCanary(id, settings, prev, { cwd: input.cwd, agent: AGENT });
    core.saveSession(state);
    out.push(prev && source === 'compact' ? t.renew(state.word) : t.intro(state.word));
  }
  if (settings.autoStart && !launchApp()) out.push(t.noApp);
  emit('SessionStart', out);
}

function onPrompt(input, settings) {
  const id = input.session_id;
  const t = T[settings.lang];
  const out = [];
  let state = core.loadSession(id);
  if (!state) {
    // Eklenti oturum ortasında kuruldu.
    state = core.newCanary(id, settings, null, { cwd: input.cwd, agent: AGENT });
    out.push(t.intro(state.word));
  }
  if (state.noteForClaude) {
    out.push(t.note(state.name, state.deathCause));
    state.noteForClaude = false;
  }
  if (state.requestEgg) {
    // Kullanıcı pencereden yeni yumurta istedi.
    state = core.newCanary(id, settings, state, { cwd: input.cwd, agent: AGENT });
    out.push(t.renew(state.word));
  }
  if (!state.firstPrompt && input.prompt) state.firstPrompt = String(input.prompt).replace(/\s+/g, ' ').trim().slice(0, 60);
  state.prompts += 1;
  state.ended = false;
  if (state.status === 'alive' && (state.pendingCheck || state.prompts % settings.checkEvery === 0)) {
    state.pendingCheck = true;
    out.push(t.check);
  }
  core.saveSession(state);
  emit('UserPromptSubmit', out);
}

function onStop(input, settings) {
  const state = core.loadSession(input.session_id);
  if (!state) return;
  let parsed = input.transcript_path ? core.parseTranscript(input.transcript_path) : { text: '', tokens: null };
  if (parsed.tokens) {
    // Ayardaki bağlamı aşan kullanım 1M bağlamlı model demektir.
    const win = parsed.window || (parsed.tokens > settings.contextWindow ? Math.max(1000000, parsed.tokens) : settings.contextWindow);
    state.contextPct = Math.min(1, parsed.tokens / win);
  }
  state.ended = false;
  if (parsed.title) state.title = parsed.title;
  if (parsed.entrypoint) state.entrypoint = parsed.entrypoint;
  if (state.pendingCheck && state.status === 'alive') {
    let answer = core.extractTag(input.last_assistant_message) ?? core.extractTag(parsed.text);
    if (answer === null && input.transcript_path) {
      // Transcript son satırı henüz yazılmamış olabilir.
      const until = Date.now() + 400;
      while (Date.now() < until) { /* kısa bekleme */ }
      parsed = core.parseTranscript(input.transcript_path);
      answer = core.extractTag(parsed.text);
    }
    state.lastAnswer = answer;
    core.applyGrade(state, core.grade(answer, state.word), settings);
    state.pendingCheck = false;
  }
  core.saveSession(state);
}

function onSessionEnd(input) {
  const state = core.loadSession(input.session_id);
  if (!state) return;
  state.ended = true; // pencere bu kanaryayı kaldırır
  core.saveSession(state);
}

function main() {
  const cmd = process.argv[2];
  if (cmd === 'kur' || cmd === 'install') return install();
  if (cmd === 'ac' || cmd === 'open') { console.log(launchApp() ? 'ok' : 'Electron yok: /kanarya:kur'); return undefined; }
  const input = readStdin();
  const settings = core.loadSettings();
  if (cmd === 'session-start') return onSessionStart(input, settings);
  if (cmd === 'prompt') return onPrompt(input, settings);
  if (cmd === 'stop') { process.stdout.write('{}'); return onStop(input, settings); } // Codex Stop'ta JSON ister
  if (cmd === 'session-end') return onSessionEnd(input);
  return undefined;
}

try { main(); } catch (e) {
  if (process.env.KANARYA_DEBUG) console.error(e);
}
process.exitCode = 0;

