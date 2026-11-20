'use strict';
const S = {
  tr: { title: 'Kanarya ayarları', general: 'Genel', lang: 'Dil', every: 'Kaç mesajda bir kontrol', everyHint: 'Düşük sayı hatayı erken yakalar, biraz daha token harcar',
    lives: 'Can sayısı', heal: 'İyileşme', healHint: 'Art arda bu kadar doğru cevap bir can geri verir (0 = kapalı)',
    name: 'Kanaryanın adı', nameHint: 'Boş bırakılırsa her yumurtada rastgele', death: 'Kanarya ölünce',
    note: "Claude'a not gönder", noteHint: 'Bir sonraki mesajda "bağlamın kaydı, /compact öner" der',
    notif: 'Windows bildirimi', sound: 'Ses (tıslama, miyav, çığlık)', window: 'Pencere', corner: 'Köşe', scale: 'Boyut',
    top: 'Hep üstte dursun', auto: 'Oturum açılınca kendiliğinden başlasın', ctx: 'Bağlam boyu', ctxHint: 'Yorgunluk hesabı için (modelinize göre)',
    save: 'Kaydet', saved: 'Kaydedildi ✓', corners: { 'top-right': 'Sağ üst', 'top-left': 'Sol üst', 'bottom-right': 'Sağ alt', 'bottom-left': 'Sol alt' } },
  en: { title: 'Kanarya settings', general: 'General', lang: 'Language', every: 'Check every N messages', everyHint: 'Lower catches problems earlier, costs a few more tokens',
    lives: 'Lives', heal: 'Healing', healHint: 'This many correct answers in a row restore one life (0 = off)',
    name: "Canary's name", nameHint: 'Leave empty for a random name per egg', death: 'When the canary dies',
    note: 'Send Claude a note', noteHint: 'Next message tells it "your context drifted, suggest /compact"',
    notif: 'Desktop notification', sound: 'Sound (hiss, meow, squawk)', window: 'Window', corner: 'Corner', scale: 'Size',
    top: 'Always on top', auto: 'Start automatically with a session', ctx: 'Context size', ctxHint: 'Used for fatigue (match your model)',
    save: 'Save', saved: 'Saved ✓', corners: { 'top-right': 'Top right', 'top-left': 'Top left', 'bottom-right': 'Bottom right', 'bottom-left': 'Bottom left' } },
};

const $ = (id) => document.getElementById(id);
let current = null;

function paint(lang) {
  const t = S[lang] || S.tr;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t[el.dataset.t]; });
  document.title = t.title;
  const c = $('corner'); const v = c.value || (current && current.corner);
  c.innerHTML = Object.entries(t.corners).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  c.value = v || 'top-right';
}

async function load() {
  current = await window.kanarya.getSettings();
  paint(current.lang);
  for (const k of ['lang', 'checkEvery', 'lives', 'healAfter', 'canaryName', 'corner']) $(k).value = current[k];
  $('scale').value = String(current.scale);
  $('contextWindow').value = String(current.contextWindow);
  if (!$('contextWindow').value) { $('contextWindow').insertAdjacentHTML('beforeend', `<option value="${current.contextWindow}">${current.contextWindow}</option>`); $('contextWindow').value = String(current.contextWindow); }
  $('alwaysOnTop').checked = current.alwaysOnTop; $('autoStart').checked = current.autoStart;
  for (const k of ['claudeNote', 'notification', 'sound']) $(k).checked = !!current.onDeath[k];
}

$('lang').addEventListener('change', (e) => { paint(e.target.value); fit(); });
document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  const el = $(b.dataset.step); const v = Number(el.value || 0) + Number(b.dataset.d);
  el.value = Math.min(Number(el.max), Math.max(Number(el.min), v));
}));
// Pencereyi içeriğe göre boyutla (kaydırma çubuğu olmasın)
function fit() { window.kanarya.fitSettings && window.kanarya.fitSettings(Math.ceil(document.querySelector('main').getBoundingClientRect().height)); }
$('save').addEventListener('click', async () => {
  current = await window.kanarya.saveSettings({
    lang: $('lang').value,
    checkEvery: Number($('checkEvery').value), lives: Number($('lives').value), healAfter: Number($('healAfter').value),
    canaryName: $('canaryName').value.trim(), corner: $('corner').value, scale: Number($('scale').value),
    alwaysOnTop: $('alwaysOnTop').checked, autoStart: $('autoStart').checked, contextWindow: Number($('contextWindow').value),
    onDeath: { claudeNote: $('claudeNote').checked, notification: $('notification').checked, sound: $('sound').checked },
  });
  load();
  const ok = $('ok'); ok.textContent = (S[current.lang] || S.tr).saved; ok.style.opacity = 1;
  setTimeout(() => { ok.style.opacity = 0; }, 1600);
});
load().then(fit);
