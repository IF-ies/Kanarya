'use strict';
// Telifsiz, dosyasız sesler: hepsi WebAudio ile anında üretilir.
window.Sfx = (() => {
  let ac = null;
  const ctx = () => (ac || (ac = new AudioContext()));

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function chirp(at = 0, n = 3) {
    const c = ctx(); const t0 = c.currentTime + at;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.13; const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(2500 + Math.random() * 300, t);
      o.frequency.exponentialRampToValueAtTime(4300, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(3100, t + 0.1);
      env(g, t, 0.01, 0.12, 0.1);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.15);
    }
  }

  function noise(c, dur) {
    const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; return s;
  }

  function hiss(at = 0, dur = 0.7) {
    const c = ctx(); const t = c.currentTime + at;
    const s = noise(c, dur); const f = c.createBiquadFilter(); const g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 0.8;
    env(g, t, 0.06, 0.35, dur - 0.06);
    s.connect(f).connect(g).connect(c.destination); s.start(t); s.stop(t + dur);
  }

  function meow(at = 0) {
    const c = ctx(); const t = c.currentTime + at;
    const o = c.createOscillator(); const lp = c.createBiquadFilter(); const bp = c.createBiquadFilter(); const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.linearRampToValueAtTime(780, t + 0.25);
    o.frequency.linearRampToValueAtTime(360, t + 0.8);
    lp.type = 'lowpass'; lp.frequency.value = 2200;
    bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(1400, t + 0.3); bp.frequency.linearRampToValueAtTime(800, t + 0.8);
    env(g, t, 0.08, 0.3, 0.75);
    o.connect(lp).connect(bp).connect(g).connect(c.destination); o.start(t); o.stop(t + 0.9);
  }

  function squawk(at = 0) {
    const c = ctx(); const t = c.currentTime + at;
    const o = c.createOscillator(); const lfo = c.createOscillator(); const lg = c.createGain(); const g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(2100, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.35);
    lfo.frequency.value = 38; lg.gain.value = 260; lfo.connect(lg).connect(o.frequency);
    env(g, t, 0.01, 0.12, 0.35);
    o.connect(g).connect(c.destination); o.start(t); lfo.start(t); o.stop(t + 0.4); lfo.stop(t + 0.4);
  }

  function death() { hiss(1.3, 0.8); squawk(2.15); meow(2.6); }

  return { chirp, hiss, meow, squawk, death };
})();
