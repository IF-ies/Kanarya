# Kanarya 🐤 — Plan ve Durum

> **Durum (20 Kas 2026):** Faz 1–5 kodu yazıldı ve test edildi, git'te yerel commit var. **Push yok**: public yayın Furkan onaylayınca.
> Furkan'ın kendi Claude Code'una kurulmadı; kurmak için `node install.js` ya da eklenti yolu (README).

## Kararlar (20 Kas, Furkan)
- Görsel: **2.5D** (katmanlı canvas çizimi, paralaks, tek ışık, gölgeler). İleride 3D yalnızca görünüm katmanının değişmesi olur.
- Kontrol: **4 mesajda bir**, ayarlar sayfasından değiştirilebilir.
- Ölünce: **Claude'a not + Windows bildirimi + ses**; üçü de ayarlardan ayrı ayrı açılıp kapanır.
- Dağıtım: **Claude Code eklentisi + kurulum betiği**, dil **TR + EN**.

## Mimari
- `lib/core.js`: ayarlar, oturum durumu, kelime, puanlama (exact / partial / unknown / missing / wrong), transcript okuma. Bağımlılık yok.
- `hooks/kanarya-hook.js`: `session-start` (kelime + yumurta + pencereyi başlatma), `prompt` (N mesajda bir kontrol isteği, ölüm notu, yeni yumurta isteği), `stop` (cevabı puanla, bağlam yüzdesi), `kur` (Electron'u `~/.claude/kanarya/runtime`'a kurar; eklenti güncellenince silinmez), `ac`.
- `app/`: Electron penceresi (şeffaf, hep üstte, sağ üst köşe). `scene.js` 2.5D sahne, `sound.js` WebAudio sesleri, `settings.html/js` ayarlar.
- Veri: `~/.claude/kanarya/` → `settings.json`, `sessions/<id>.json`, `stats.json`, `app.pid`, `hata.log`.
- Kelime pencereye hiç gönderilmez.

## Kurallar
- Tam doğru → can aynı (art arda 3 doğru = +1 can). Yarı doğru → −1 can (0 olursa ölür: "bulanık").
- `?` / etiket yok → −1 can ama 1'in altına inmez ("bilmiyorum öldürmez").
- Yanlış kelime → anında ölüm ("uydurdu").
- `/compact`, `/clear`, yeni oturum ya da sağ tık → yeni yumurta, yeni kelime. `resume` aynı kanaryayla sürer.

## Adımlar
- [x] Faz 1: Hook'lar + durum dosyası + puanlama
- [x] Faz 2: Masaüstü penceresi (şeffaf, hep üstte, sürüklenebilir, yeri hatırlanır)
- [x] Faz 3: Sahneler (şarkı / yaralı / hasta / uykulu / kedi saldırısı / ölü kafes / yumurta)
- [x] Faz 4: Bağlam yorgunluğu, haftalık ölüm sayacı, ayarlar sayfası, ölünce yapılacaklar
- [x] Faz 5: README (TR/EN), kurulum betiği, eklenti manifesti, MIT lisansı
- [ ] Furkan kendi makinesinde gerçek oturumla denesin (kur: `node install.js`)
- [ ] GitHub'a public push (repo adı: IF-ies/Kanarya?) — **Furkan onayıyla**
- [ ] (İleri) macOS/Linux denemesi, 3D sahne

## Test
- `npm test`: puanlama, can kuralları, 4 mesajda bir kontrol, transcript'ten etiket + bağlam yüzdesi, ölüm notu, compact'ta yumurta, yeni yumurta isteği, bozuk girdi.
- Görsel: `electron app --snapshot=<sahne>:<saniye>:<çıktı.png>` (sahneler: happy, sleepy, injured, sick, dead, death, egg, ok, heal).
- Not: npm 11 Electron'un kurulum betiğini çalıştırmayabiliyor; `kur` bunu elle tamamlıyor.
