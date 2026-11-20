'use strict';
const S = {
  tr: { title: 'Kanarya ayarları', general: 'Genel', lang: 'Dil', every: 'Kaç mesajda bir kontrol', everyHint: 'Düşük sayı hatayı erken yakalar, biraz daha token harcar',
    lives: 'Can sayısı', heal: 'İyileşme', healHint: 'Art arda bu kadar doğru cevap bir can geri verir (0 = kapalı)',
    name: 'Kanaryanın adı', nameHint: 'Boş bırakılırsa her yumurtada rastgele', death: 'Kanarya ölünce',
    note: "Claude'a not gönder", noteHint: 'Bir sonraki mesajda "bağlamın kaydı, /compact öner" der',
    notif: 'Windows bildirimi', sound: 'Ses (tıslama, miyav, çığlık)', window: 'Pencere', corner: 'Köşe', scale: 'Boyut',
    top: 'Hep üstte dursun', auto: 'Oturum açılınca kendiliğinden başlasın', ctx: 'Bağlam boyu', ctxHint: 'Yorgunluk hesabı için (modelinize göre)',
    save: 'Kaydet', saved: 'Kaydedildi ✓', backdrop: 'Zemin koyuluğu', clear: 'Şeffaf arka plan', clearHint: 'Kart zemini olmaz, kafes masaüstünde asılı durur', theme: 'Tema', themes: { dark: 'Koyu', light: 'Açık', system: 'Sistem' }, corners: { 'top-right': 'Sağ üst', 'top-left': 'Sol üst', 'bottom-right': 'Sağ alt', 'bottom-left': 'Sol alt' } },
  en: { title: 'Kanarya settings', general: 'General', lang: 'Language', every: 'Check every N messages', everyHint: 'Lower catches problems earlier, costs a few more tokens',
    lives: 'Lives', heal: 'Healing', healHint: 'This many correct answers in a row restore one life (0 = off)',
    name: "Canary's name", nameHint: 'Leave empty for a random name per egg', death: 'When the canary dies',
    note: 'Send Claude a note', noteHint: 'Next message tells it "your context drifted, suggest /compact"',
    notif: 'Desktop notification', sound: 'Sound (hiss, meow, squawk)', window: 'Window', corner: 'Corner', scale: 'Size',
    top: 'Always on top', auto: 'Start automatically with a session', ctx: 'Context size', ctxHint: 'Used for fatigue (match your model)',
    save: 'Save', saved: 'Saved ✓', backdrop: 'Backdrop darkness', clear: 'Transparent background', clearHint: 'No card behind the cage; it hangs on your desktop', theme: 'Theme', themes: { dark: 'Dark', light: 'Light', system: 'System' }, corners: { 'top-right': 'Top right', 'top-left': 'Top left', 'bottom-right': 'Bottom right', 'bottom-left': 'Bottom left' } },
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
  const th = $('theme'); const tv = th.value || (current && current.theme);
  th.innerHTML = Object.entries(t.themes).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  th.value = tv || 'dark';
  applyTheme(th.value);
  if (typeof refreshDropdowns === 'function') refreshDropdowns();
}

function applyTheme(v) {
  const light = v === 'light' || (v === 'system' && window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
}

async function load() {
  current = await window.kanarya.getSettings();
  paint(current.lang);
  for (const k of ['lang', 'checkEvery', 'lives', 'healAfter', 'canaryName', 'corner']) $(k).value = current[k];
  $('theme').value = current.theme || 'dark'; applyTheme($('theme').value);
  $('scale').value = String(current.scale);
  $('contextWindow').value = String(current.contextWindow);
  if (!$('contextWindow').value) { $('contextWindow').insertAdjacentHTML('beforeend', `<option value="${current.contextWindow}">${current.contextWindow}</option>`); $('contextWindow').value = String(current.contextWindow); }
  $('transparent').checked = !!current.transparent;
  $('backdrop').value = current.backdrop ?? 40; syncBackdrop();
  $('alwaysOnTop').checked = current.alwaysOnTop; $('autoStart').checked = current.autoStart;
  for (const k of ['claudeNote', 'notification', 'sound']) $(k).checked = !!current.onDeath[k];
  refreshDropdowns();
}

// ---------- temaya uygun açılır liste ----------
// Windows'un yerel <select> açılır listesi CSS ile boyanamıyor (mavi vurgu); yerine kendi listemiz.
// Gerçek <select> gizli kalır, değer ve 'change' olayı onun üzerinden akar.
let openDd = null;
function closeDd() { if (openDd) { openDd.classList.remove('open', 'up'); openDd = null; } }
function refreshDropdowns() {
  document.querySelectorAll('.dd').forEach((dd) => {
    const sel = dd.querySelector('select');
    const opt = sel.options[sel.selectedIndex];
    dd.querySelector('.dd-btn span').textContent = opt ? opt.textContent : '';
  });
}
function enhanceSelect(sel) {
  const dd = document.createElement('span'); dd.className = 'dd';
  sel.parentNode.insertBefore(dd, sel); dd.appendChild(sel);
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd-btn';
  btn.innerHTML = '<span></span><svg width="12" height="8" viewBox="0 0 12 8"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const list = document.createElement('div'); list.className = 'dd-list'; list.setAttribute('role', 'listbox');
  dd.append(btn, list);
  const choose = (v) => { sel.value = v; sel.dispatchEvent(new Event('change')); refreshDropdowns(); closeDd(); btn.focus(); };
  const build = () => {
    list.innerHTML = '';
    [...sel.options].forEach((o) => {
      const it = document.createElement('div');
      it.className = `dd-item${o.value === sel.value ? ' sel' : ''}`; it.textContent = o.textContent; it.dataset.v = o.value;
      it.addEventListener('mousedown', (e) => { e.preventDefault(); choose(o.value); });
      list.appendChild(it);
    });
  };
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (openDd === dd) { closeDd(); return; }
    closeDd(); build();
    dd.classList.add('open'); openDd = dd;
    const r = list.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 6) dd.classList.add('up'); // altta yer yoksa yukarı aç
  });
  btn.addEventListener('keydown', (e) => {
    const i = sel.selectedIndex;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = Math.min(sel.options.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
      sel.selectedIndex = n; sel.dispatchEvent(new Event('change')); refreshDropdowns(); if (openDd === dd) build();
    } else if (e.key === 'Escape') closeDd();
  });
}
document.querySelectorAll('select').forEach(enhanceSelect);
document.addEventListener('mousedown', (e) => { if (openDd && !openDd.contains(e.target)) closeDd(); });
window.addEventListener('blur', closeDd);

$('lang').addEventListener('change', (e) => { paint(e.target.value); fit(); });
$('theme').addEventListener('change', (e) => applyTheme(e.target.value));
function syncBackdrop() {
  $('backdropVal').textContent = `%${$('backdrop').value}`;
  $('backdropRow').classList.toggle('off', !$('transparent').checked);
}
$('backdrop').addEventListener('input', syncBackdrop);
$('transparent').addEventListener('change', syncBackdrop);
document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  const el = $(b.dataset.step); const v = Number(el.value || 0) + Number(b.dataset.d);
  el.value = Math.min(Number(el.max), Math.max(Number(el.min), v));
}));
// Pencereyi içeriğe göre boyutla (kaydırma çubuğu olmasın)
function fit() { window.kanarya.fitSettings && window.kanarya.fitSettings(Math.ceil(document.querySelector('main').getBoundingClientRect().height)); }
$('save').addEventListener('click', async () => {
  current = await window.kanarya.saveSettings({
    lang: $('lang').value, theme: $('theme').value,
    checkEvery: Number($('checkEvery').value), lives: Number($('lives').value), healAfter: Number($('healAfter').value),
    canaryName: $('canaryName').value.trim(), corner: $('corner').value, scale: Number($('scale').value),
    transparent: $('transparent').checked, backdrop: Number($('backdrop').value), alwaysOnTop: $('alwaysOnTop').checked, autoStart: $('autoStart').checked, contextWindow: Number($('contextWindow').value),
    onDeath: { claudeNote: $('claudeNote').checked, notification: $('notification').checked, sound: $('sound').checked },
  });
  load();
  const ok = $('ok'); ok.textContent = (S[current.lang] || S.tr).saved; ok.style.opacity = 1;
  setTimeout(() => { ok.style.opacity = 0; }, 1600);
});
load().then(fit);
