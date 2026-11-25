/* Easter-Egg: zufälliges Pupsgeräusch, live per Web Audio erzeugt (keine Sounddateien) */
let ctx = null;
const rnd = (a, b) => a + Math.random() * (b - a);

export function pups() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = ctx || new AC();
  if (ctx.state === 'suspended') ctx.resume();
  const t0 = ctx.currentTime + 0.02;

  /* Typ würfeln: kurz & knackig, lang & flatternd, hoch & quietschig */
  const kind = Math.floor(Math.random() * 3);
  const dur = kind === 0 ? rnd(0.18, 0.4) : kind === 1 ? rnd(0.8, 1.8) : rnd(0.4, 0.9);
  const f0 = kind === 2 ? rnd(140, 260) : rnd(55, 110);
  const end = t0 + dur;

  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  /* Grundton: Sägezahn mit Tonhöhen-Verlauf */
  const osc = ctx.createOscillator();
  osc.type = Math.random() < 0.5 ? 'sawtooth' : 'square';
  osc.frequency.setValueAtTime(f0 * rnd(0.9, 1.25), t0);
  osc.frequency.linearRampToValueAtTime(f0 * rnd(0.6, 1.1), t0 + dur * rnd(0.3, 0.6));
  osc.frequency.linearRampToValueAtTime(f0 * rnd(0.45, 0.9), end);

  /* Flattern: Tonhöhe und Lautstärke wabern */
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rnd(8, 28);
  const lfoPitch = ctx.createGain();
  lfoPitch.gain.value = f0 * rnd(0.15, 0.45);
  lfo.connect(lfoPitch).connect(osc.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = kind === 2 ? rnd(1200, 2200) : rnd(450, 1000);
  filter.Q.value = rnd(1, 6);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.8, t0 + 0.03);
  amp.gain.setValueAtTime(0.8, end - dur * 0.35);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);

  const flutter = ctx.createGain();
  flutter.gain.value = 0.6;
  const lfoAmp = ctx.createGain();
  lfoAmp.gain.value = rnd(0.25, 0.4);
  lfo.connect(lfoAmp).connect(flutter.gain);

  osc.connect(filter).connect(flutter).connect(amp).connect(master);

  /* Etwas Rauschen für den „Luft“-Anteil */
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = rnd(200, 600);
  nf.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.value = rnd(0.08, 0.3);
  noise.connect(nf).connect(ng).connect(amp);

  for (const n of [osc, lfo, noise]) { n.start(t0); n.stop(end + 0.05); }
}

/* Zählt Klicks; löst aus, wenn 5 Klicks jeweils höchstens 5 s auseinander liegen */
export function tapCounter(need = 5, gap = 5000, fire = pups) {
  let n = 0, last = 0;
  return () => {
    const now = Date.now();
    n = now - last <= gap ? n + 1 : 1;
    last = now;
    if (n >= need) { n = 0; last = 0; fire(); }
  };
}
