'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'kanarya-test-'));
process.env.KANARYA_HOME = HOME;
const core = require('../lib/core');
const HOOK = path.join(__dirname, '..', 'hooks', 'kanarya-hook.js');

function hook(evt, input) {
  const out = execFileSync(process.execPath, [HOOK, evt], { input: JSON.stringify(input), env: { ...process.env, KANARYA_HOME: HOME } }).toString();
  const o = out ? JSON.parse(out) : {};
  return (o.hookSpecificOutput && o.hookSpecificOutput.additionalContext) || '';
}

function transcript(file, prompt, reply) {
  const lines = [
    { type: 'user', message: { role: 'user', content: prompt } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'Read', input: {} }], usage: { input_tokens: 10, cache_read_input_tokens: 50000, output_tokens: 10 } } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: reply }], usage: { input_tokens: 10, cache_read_input_tokens: 100000, output_tokens: 20 } } },
  ];
  fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

test('puanlama', () => {
  const w = 'MANDALINA-47';
  assert.strictEqual(core.grade('MANDALINA-47', w), 'exact');
  assert.strictEqual(core.grade(' mandalina-47 ', w), 'exact');
  assert.strictEqual(core.grade('MANDALİNA-47', w), 'exact');
  assert.strictEqual(core.grade('MANDALINA-74', w), 'partial');
  assert.strictEqual(core.grade('MANDARINA-47', w), 'partial');
  assert.strictEqual(core.grade('?', w), 'unknown');
  assert.strictEqual(core.grade('bilmiyorum', w), 'unknown');
  assert.strictEqual(core.grade(null, w), 'missing');
  assert.strictEqual(core.grade('PUSULA-12', w), 'wrong');
  assert.strictEqual(core.grade('KIRAZ-47', w), 'wrong');
});

test('etiket çıkarma son etiketi alır', () => {
  assert.strictEqual(core.extractTag('a <kanarya>X-1</kanarya> b <kanarya>Y-2</kanarya>'), 'Y-2');
  assert.strictEqual(core.extractTag('yok'), null);
});

test('can kuralları: bilmiyorum öldürmez, uydurmak öldürür', () => {
  const s = core.loadSettings();
  const st = core.newCanary('t1', s, null);
  core.applyGrade(st, 'unknown', s); core.applyGrade(st, 'unknown', s); core.applyGrade(st, 'missing', s);
  assert.strictEqual(st.lives, 1); assert.strictEqual(st.status, 'alive'); assert.strictEqual(st.mood, 'sick');
  for (let i = 0; i < 3; i++) core.applyGrade(st, 'exact', s);
  assert.strictEqual(st.lives, 2); assert.strictEqual(st.event.type, 'heal');
  core.applyGrade(st, 'partial', s); assert.strictEqual(st.event.type, 'injured');
  core.applyGrade(st, 'partial', s); assert.strictEqual(st.status, 'dead'); assert.strictEqual(st.deathCause, 'blur');
  const st2 = core.newCanary('t2', s, null);
  core.applyGrade(st2, 'wrong', s);
  assert.strictEqual(st2.status, 'dead'); assert.strictEqual(st2.deathCause, 'hallucination'); assert.strictEqual(st2.noteForClaude, true);
});

test('hook akışı uçtan uca (4 mesajda bir kontrol)', () => {
  core.saveSettings({ autoStart: false, checkEvery: 4 });
  const sid = 'uc-uca';
  const tp = path.join(HOME, 't.jsonl');
  const deaths0 = core.weeklyDeaths();
  const ctx = hook('session-start', { session_id: sid, source: 'startup', cwd: HOME });
  const word = core.loadSession(sid).word;
  assert.ok(ctx.includes(word), 'ilk bağlamda kelime var');
  for (let i = 1; i <= 3; i++) {
    assert.strictEqual(hook('prompt', { session_id: sid, prompt: `m${i}` }), '', `${i}. mesajda kontrol yok`);
    transcript(tp, `m${i}`, 'cevap');
    hook('stop', { session_id: sid, transcript_path: tp });
  }
  const c4 = hook('prompt', { session_id: sid, prompt: 'm4' });
  assert.ok(/kontrol/i.test(c4) && !c4.includes(word), '4. mesajda kontrol, kelime verilmez');
  transcript(tp, 'm4', `tamam\n<kanarya>${word}</kanarya>`);
  hook('stop', { session_id: sid, transcript_path: tp });
  let st = core.loadSession(sid);
  assert.strictEqual(st.lastGrade, 'exact'); assert.strictEqual(st.pendingCheck, false);
  assert.ok(Math.abs(st.contextPct - 100030 / 200000) < 1e-9, 'bağlam yüzdesi son kullanımdan');
  // 8. mesajda uydurma → ölüm → sonraki mesajda Claude'a not
  for (let i = 5; i <= 8; i++) hook('prompt', { session_id: sid, prompt: `m${i}` });
  transcript(tp, 'm8', '<kanarya>PUSULA-99</kanarya>');
  hook('stop', { session_id: sid, transcript_path: tp });
  st = core.loadSession(sid);
  assert.strictEqual(st.status, 'dead');
  assert.ok(/öldü/.test(hook('prompt', { session_id: sid, prompt: 'm9' })));
  assert.strictEqual(core.weeklyDeaths(), deaths0 + 1);
  // compact → yeni yumurta, yeni kelime
  const c = hook('session-start', { session_id: sid, source: 'compact' });
  const st2 = core.loadSession(sid);
  assert.strictEqual(st2.status, 'alive'); assert.strictEqual(st2.generation, 2);
  assert.ok(c.includes(st2.word));
});

test('yeni yumurta isteği ve ayarlar', () => {
  core.saveSettings({ checkEvery: 2, lang: 'en', onDeath: { claudeNote: false } });
  const s = core.loadSettings();
  assert.strictEqual(s.checkEvery, 2); assert.strictEqual(s.onDeath.sound, true); assert.strictEqual(s.onDeath.claudeNote, false);
  const sid = 'yumurta';
  hook('session-start', { session_id: sid, source: 'startup' });
  const st = core.loadSession(sid); const old = st.word;
  st.requestEgg = true; core.saveSession(st);
  const c = hook('prompt', { session_id: sid, prompt: 'x' });
  const st2 = core.loadSession(sid);
  assert.notStrictEqual(st2.word, old); assert.ok(c.includes(st2.word)); assert.ok(/hatched/.test(c));
  assert.ok(/WORD/.test(hook('prompt', { session_id: sid, prompt: 'y' })), '2 mesajda bir kontrol (İngilizce)');
});

test('bozuk girdi hook\'u çökertmez', () => {
  const out = execFileSync(process.execPath, [HOOK, 'stop'], { input: 'bozuk{', env: { ...process.env, KANARYA_HOME: HOME } });
  assert.strictEqual(out.toString(), '{}', 'Stop her zaman JSON yazar (Codex şartı)');
});

test('tüm JS dosyaları sözdizimi açısından geçerli', () => {
  const files = ['lib/core.js', 'hooks/kanarya-hook.js', 'install.js', 'tools/apng.js', 'app/main.js', 'app/preload.js', 'app/scene.js', 'app/sound.js', 'app/settings.js'];
  for (const f of files) {
    const r = require('child_process').spawnSync(process.execPath, ['--check', path.join(__dirname, '..', f)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('Codex girdileriyle uçtan uca (transcript yok, last_assistant_message var)', () => {
  core.saveSettings({ checkEvery: 2, lang: 'tr', autoStart: false, onDeath: { claudeNote: true } });
  const sid = 'codex-oturum';
  const run = (evt, input) => execFileSync(process.execPath, [HOOK, evt, '--codex'], { input: JSON.stringify(input), env: { ...process.env, KANARYA_HOME: HOME } }).toString();
  const ctx = JSON.parse(run('session-start', { session_id: sid, source: 'startup', cwd: HOME, hook_event_name: 'SessionStart', model: 'gpt-5-codex', transcript_path: null }));
  const st0 = core.loadSession(sid);
  assert.strictEqual(st0.agent, 'codex');
  assert.ok(ctx.hookSpecificOutput.additionalContext.includes(st0.word), 'kelime bağlama girdi');
  run('prompt', { session_id: sid, turn_id: 't1', prompt: 'merhaba', hook_event_name: 'UserPromptSubmit', transcript_path: null });
  const c2 = JSON.parse(run('prompt', { session_id: sid, turn_id: 't2', prompt: 'devam', hook_event_name: 'UserPromptSubmit', transcript_path: null }));
  assert.ok(/kontrol/i.test(c2.hookSpecificOutput.additionalContext), '2. mesajda kontrol');
  const out = run('stop', { session_id: sid, turn_id: 't2', stop_hook_active: false, last_assistant_message: `tamam\n<kanarya>${st0.word}</kanarya>`, transcript_path: null });
  assert.deepStrictEqual(JSON.parse(out), {}, 'Codex Stop JSON ister');
  const st = core.loadSession(sid);
  assert.strictEqual(st.lastGrade, 'exact');
  assert.strictEqual(st.firstPrompt, 'merhaba', 'Codex etiketi ilk mesajdan');
  run('session-end', { session_id: sid, reason: 'other', hook_event_name: 'SessionEnd', transcript_path: null });
  assert.strictEqual(core.loadSession(sid).ended, true, 'SessionEnd kanaryayı kaldırır');
});

test('Codex rollout transcript: bağlam penceresi token_count olayından', () => {
  const tp = path.join(HOME, 'rollout.jsonl');
  fs.writeFileSync(tp, [
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 64000 }, model_context_window: 256000 } } },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const p = core.parseTranscript(tp);
  assert.strictEqual(p.tokens, 64000); assert.strictEqual(p.window, 256000);
});
