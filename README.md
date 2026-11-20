<p align="center"><img src="docs/logo.png" width="128" alt="Kanarya logo"></p>

# Kanarya 🐤 — Context Canary for Claude Code & Codex

**A Claude canary that tells you when Claude Code (or OpenAI Codex) loses context or starts hallucinating.**
One small always-on-top window shows a canary for **every open session**: a single canary fills the cage, and 2–4 sessions share a 2×2 grid. Each canary is labelled with the session's title.
A cute 2.5D canary sits in a cage on your desktop. When Claude's context gets blurry, the canary gets hurt. When Claude *makes something up*, a cat comes out of the dark and eats it.

[🌐 Website](https://if-ies.github.io/Kanarya/) · [Türkçe ↓](#türkçe)

| Alive | Sick (the cat is watching) | Cat attack | Dead |
|---|---|---|---|
| ![Claude canary alive and singing](docs/mutlu.png) | ![Claude canary sick, cat eyes in the dark](docs/hasta.png) | ![Cat attacks the canary when Claude hallucinates](docs/kedi.png) | ![Canary died: Claude context lost](docs/oldu.png) |

## Why?

Long Claude Code sessions slowly degrade (often called *context rot*): instructions get forgotten, details get mixed up, and the model starts to confidently guess. Kanarya is a **canary in the coal mine** for that. It is a tiny, cheap, always-on context health check with a face you will not want to let die. So you `/compact` or start a fresh session *before* bad output lands in your code.

## How it works

1. At session start a `SessionStart` hook gives Claude a secret word (e.g. `TANGERINE-47`).
2. Every 4 messages (configurable) a `UserPromptSubmit` hook asks Claude to append the word as `<kanarya>…</kanarya>`. The word is **not** shown again.
3. A `Stop` hook reads the reply from the transcript and grades it:

| Claude's answer | Meaning | Canary |
|---|---|---|
| Exact word | Context is healthy | 🐤 Sings |
| Half right (`TANGERINE-74`) | Context is blurry | 🤕 Bandaged, −1 life |
| `?` (I don't know) | Forgot, but honest | 😵 Sick, cat eyes appear. **Never kills** |
| A different word | **Hallucination** | 💀 The cat eats the canary |

> **Saying "I don't know" never kills the canary. Making things up does.**

- 3 lives. The cat creeps closer as lives drop. 3 correct answers in a row heal one life.
- The canary gets sleepy as the context window fills (reads token usage from the transcript).
- `/compact`, `/clear` or a new session hatches a new egg with a new word.
- When the canary dies, each of these can be toggled in settings: a note to Claude ("your context drifted, suggest /compact"), a desktop notification, sound.
- No extra API calls. Each check adds only a few tokens to a reply.

## Install

Requires [Node.js](https://nodejs.org) 18+ and [Claude Code](https://claude.com/claude-code).

**As a Claude Code plugin (recommended):**
```
/plugin marketplace add IF-ies/Kanarya
/plugin install kanarya@kanarya
/kanarya:kur
```

**With the install script (Claude Code + Codex):**
```
git clone https://github.com/IF-ies/Kanarya && cd Kanarya
node install.js            # remove with: node install.js --uninstall
```

The script adds the hooks to `~/.claude/settings.json` and `~/.codex/hooks.json` (`--no-claude` / `--no-codex` to skip one). Restart Claude Code. In Codex, run `/hooks` once and trust the Kanarya hooks. The canary appears in the top-right corner of your screen.

**Many sessions at once:** each open Claude Code or Codex session gets its own canary in the same window, in its own color (yellow, orange, white, green, cinnamon). It is labelled with the session title (Claude Code's own title or your `/rename`), and Codex sessions are marked as such. When a session ends, its canary leaves; a new session hatches from an egg.

## Use

- **Tray icon** (Windows notification area / macOS menu bar): click to show or hide, right-click for settings and quit
- **Right-click:** Settings · New egg · Watch the cat attack · Hide · Quit
- **Double-click:** the canary hops and sings
- **Top strip:** drag the window (position is remembered)
- **Bottom corners:** drag to resize (the cage keeps its shape; size is remembered)
- Commands: `/kanarya:ac` (open window), `/kanarya:durum` (status), `/kanarya:kur` (install window)

**Settings:** language (English / Turkish), theme (dark / light / system), transparent background, check frequency, lives, healing, canary name, what happens on death, corner, size, always on top, auto start, context size (200K / 400K / 1M).

Data lives in `~/.claude/kanarya/`.

## Limits

- Works in **Claude Code** and **OpenAI Codex**, because both have hooks. It does not work in plain chat apps (claude.ai, ChatGPT).
- It measures a *symptom* of context loss, not proof of hallucination.
- The window is Electron. To save battery it draws 8 fps when idle and only animates smoothly while a scene plays.

## Development

```
npm install
npm test           # grading + end-to-end hook tests
npm run demo       # plays every scene
```

Related keywords: Claude canary, Claude Code canary, Codex canary, context canary, hallucination detector, context rot, context window monitor, Claude Code plugin, Claude Code hooks, Codex hooks.

---

## Türkçe

**Claude Code için bağlam kanaryası.** Madendeki kanarya gibi: Claude bağlamı kaybetmeye başlarsa masaüstündeki kanarya yaralanır. Bir şey uydurursa karanlıktan bir kedi gelir ve kanaryayı yer.

- Oturum açılınca Claude'a gizli bir kelime verilir. 4 mesajda bir (ayarlanabilir) kelimeyi cevabın sonuna `<kanarya>…</kanarya>` olarak yazması istenir.
- Tam doğru 🐤 şarkı. Yarı doğru 🤕 −1 can. `?` 😵 hasta ama ölmez. Uydurma 💀 kedi yer. **"Bilmiyorum" demek öldürmez, uydurmak öldürür.**
- 3 can vardır. Art arda 3 doğru cevap bir can geri verir. Bağlam doldukça kanarya uykulu görünür. `/compact` ya da yeni oturum açılınca yumurtadan yeni kanarya çıkar.
- Kanarya ölünce Claude'a not, Windows bildirimi ve ses (hepsi ayarlardan ayrı ayrı açılıp kapanır).
- Claude Code ve Codex'te çalışır. Açık her oturumun kendi kanaryası olur; hepsi tek pencerede, 2x2 ızgarada durur. Her kanaryanın altında oturumun başlığı yazar.
- **Kurulum:** `/plugin marketplace add IF-ies/Kanarya` → `/plugin install kanarya@kanarya` → `/kanarya:kur`, ya da `node install.js` (Claude Code + Codex; Codex'te bir kez `/hooks` ile onayla).
- Sağ tık: ayarlar, yeni yumurta, kedi saldırısını izle. Arayüz Türkçe ve İngilizce.

MIT License. All art is drawn in code and all sounds are synthesized, so there are no third-party assets.
