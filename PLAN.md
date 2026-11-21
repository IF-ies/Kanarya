# Kanarya 🐤 — Plan ve Durum

> **Durum (21 Kas 2026):** Yayında, public → https://github.com/IF-ies/Kanarya · site https://if-ies.github.io/Kanarya/
> Furkan'ın makinesine kurulu (`node install.js`; Claude Code + `~/.codex/hooks.json`). Uygulama doğrudan bu repodan çalışır.

## Kararlar (Furkan)
- 2.5D canvas çizimi; kontrol 4 mesajda bir (ayarlardan); ölünce not + bildirim + ses ayrı ayrı seçilir; TR + EN.
- **Tek pencere** (240×300, sağ üst). Çok oturum → aynı pencerede ızgara; ayrı pencereler İSTENMEDİ.
  - 1 tam · 2 üstte iki kafes + altta geniş özet · 3 2x2 + özet · 4 2x2 · 5–6 2x3 (kısa hücrede kubbe kırpılır) · 7+ ilk 5 + "+N" özet.
- Etiket: oturum başlığı (Claude Code `customTitle`/`aiTitle`, Codex'te ilk mesaj), **sabit 11px**, sığmazsa "…".
- Ajan: Claude Code (`entrypoint: cli`) · Claude App (`claude-desktop`) · Codex. Simgeler resmî logo değil (marka hakkı), çağrışım.
- Bağlam rozeti **sol üst**, haftalık ölüm sağ üst. 1M bağlam: kullanım ayarı aşınca otomatik.
- Tema koyu / açık / sistem; şeffaf arka plan + zemin koyuluğu kaydırıcısı (vars. %40); tıklamalar arkaya geçsin.
- Bildirim alanı simgesi: tek tık menü (Ayarlar en üstte), çift tık ayarlar. Simge temaya göre (açık/koyu logo).
- Ayarlar penceresi 460×560 açılır, boyutlanır, kaydırılır; listeler kendi açılır menümüz (Windows yerel listesi boyanmıyor).
- Kanarya penceresi alt köşelerden boyutlanır (oran korunur, ölçek + konum kaydedilir).
- Kedi saldırısı ~6 sn: gözler → sinsi yürüyüş → popo sallama → sıçrayış → ÇAT! → ağızda kuyruk → dudak yalama → burnunda tüyle çıkış.
- Eklenti (hook'lar + komutlar) + masaüstü uygulaması; skill/MCP değil (README'de gerekçesi var).

## Mimari
- `lib/core.js` ayarlar, oturum durumu, kelime, puanlama, transcript (Claude + Codex rollout), başlık/entrypoint.
- `hooks/kanarya-hook.js` session-start / prompt / stop / session-end / kur / ac (`--codex`). Başlatmadan önce `node --check`.
- `app/` Electron: `main.js` (tek pencere, tray, boyutlandırma, bildirim, test kancaları), `scene.js` (2.5D sahne, ızgara, tema), `sound.js`, `settings.*`.
- `tools/` logo (koyu/açık SVG → PNG), og görseli, `apng.js` (karelerden hareketli PNG).
- Veri: `~/.claude/kanarya/` (settings, sessions, stats, app.pid, hata.log).

## Test ve araçlar
- `npm test` (9 test): puanlama, can kuralları, Claude akışı, Codex biçimli akış, Codex rollout, yumurta, bozuk girdi, **tüm JS sözdizimi**. JS düzenledikten sonra MUTLAKA çalıştır (uygulama canlı çalışıyor; bozuk dosya Furkan'a hata penceresi açar).
- Görüntü: `electron app --snapshot=sahne:sn:çıktı.png:renk:adet` · kare kare `--snapshot=death:0-6.6-0.15:klasör:1:1` → `node tools/apng.js klasör çıktı.png 150 2200`
- Ayarlar görüntüsü: `--settings-snapshot=çıktı.png` (+ `KANARYA_SHOT_JS`, `KANARYA_SHOT_WHEEL`). Boyutlandırma testi: `KANARYA_TEST_RESIZE=1`. Konum/görünürlük: `KANARYA_DEBUG=1`.
- PowerShell CopyFromScreen şeffaf pencereyi yakalamaz → görsel kontrol snapshot ile.

## Açık işler
- [ ] **Codex gerçek oturumda test** (Codex bu makinede yok; `npm i -g @openai/codex`, giriş Furkan'da, sonra Codex'te `/hooks` ile onay). En riskli nokta: Windows'ta hook komutunun kabuğu.
- [ ] **macOS / Linux test** (README'de "test edilmedi" yazıyor).
- [ ] Ayarlar penceresinin büyütülmüş boyutu hatırlansın mı? (Furkan'a soruldu, cevap yok)
- [ ] (İsteğe bağlı) Google Search Console'a sitemap, Claude Code eklenti listelerine başvuru — dışa gönderim, Furkan onayıyla.
- [ ] (İleri) 3D sahne.
