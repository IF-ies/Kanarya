#!/usr/bin/env node
'use strict';
// Eklentisiz kurulum: hook'ları ~/.claude/settings.json'a ekler ve masaüstü penceresini kurar.
// Kullanım: node install.js            → kur
//           node install.js --uninstall → hook'ları kaldır (kanarya verisi kalır)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK = path.join(__dirname, 'hooks', 'kanarya-hook.js').replace(/\\/g, '/');
const EVENTS = { SessionStart: 'session-start', UserPromptSubmit: 'prompt', Stop: 'stop' };
const uninstall = process.argv.includes('--uninstall');

let settings = {};
if (fs.existsSync(SETTINGS)) {
  settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8').replace(/^﻿/, ''));
  fs.copyFileSync(SETTINGS, `${SETTINGS}.kanarya-yedek`);
}
settings.hooks = settings.hooks || {};

for (const [event, arg] of Object.entries(EVENTS)) {
  const groups = (settings.hooks[event] || [])
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !String(h.command || '').includes('kanarya-hook.js')) }))
    .filter((g) => g.hooks.length);
  if (!uninstall) groups.push({ hooks: [{ type: 'command', command: `node "${HOOK}" ${arg}`, timeout: 10 }] });
  if (groups.length) settings.hooks[event] = groups; else delete settings.hooks[event];
}
fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
fs.writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);

if (uninstall) {
  console.log('Kanarya hook\'ları kaldırıldı / hooks removed. (Yedek / backup: settings.json.kanarya-yedek)');
} else {
  console.log('Hook\'lar eklendi / hooks added → ' + SETTINGS);
  const r = process.argv.includes('--no-app') ? { status: 0 } : spawnSync(process.execPath, [path.join(__dirname, 'hooks', 'kanarya-hook.js'), 'kur'], { stdio: 'inherit' });
  process.exitCode = r.status || 0;
  console.log('Claude Code\'u yeniden başlat / restart Claude Code. 🐤');
}
