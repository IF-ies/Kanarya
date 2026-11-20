#!/usr/bin/env node
'use strict';
// Eklentisiz kurulum: hook'ları Claude Code (~/.claude/settings.json) ve Codex'e (~/.codex/hooks.json) ekler,
// sonra masaüstü penceresini kurar.
// Kullanım: node install.js [--no-claude] [--no-codex] [--no-app]
//           node install.js --uninstall   → hook'ları kaldır (kanarya verisi kalır)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const uninstall = argv.includes('--uninstall');
const HOOK = path.join(__dirname, 'hooks', 'kanarya-hook.js').replace(/\/g, '/');
const EVENTS = { SessionStart: 'session-start', UserPromptSubmit: 'prompt', Stop: 'stop', SessionEnd: 'session-end' };
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');

function patch(file, extra) {
  let data = {};
  if (fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '') || '{}');
    fs.copyFileSync(file, `${file}.kanarya-yedek`);
  }
  data.hooks = data.hooks || {};
  for (const [event, arg] of Object.entries(EVENTS)) {
    const groups = (data.hooks[event] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !String(h.command || '').includes('kanarya-hook.js')) }))
      .filter((g) => g.hooks.length);
    if (!uninstall) {
      groups.push({ hooks: [{ type: 'command', command: `node "${HOOK}" ${arg}${extra}`, timeout: event === 'SessionEnd' ? 3 : 10 }] });
    }
    if (groups.length) data.hooks[event] = groups; else delete data.hooks[event];
  }
  if (!Object.keys(data.hooks).length) delete data.hooks;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${uninstall ? '−' : '+'} ${file}`);
}

if (!argv.includes('--no-claude')) patch(path.join(os.homedir(), '.claude', 'settings.json'), '');
if (!argv.includes('--no-codex')) patch(path.join(CODEX_HOME, 'hooks.json'), ' --codex');

if (uninstall) {
  console.log('Kanarya hook\'ları kaldırıldı / hooks removed (yedek / backup: *.kanarya-yedek).');
} else {
  const r = argv.includes('--no-app') ? { status: 0 } : spawnSync(process.execPath, [HOOK, 'kur'], { stdio: 'inherit' });
  process.exitCode = r.status || 0;
  console.log('\nClaude Code: yeniden başlat / restart.');
  console.log('Codex: /hooks yaz ve Kanarya hook\'larını onayla (trust) / run /hooks and trust the Kanarya hooks.');
}
