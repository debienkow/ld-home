/* Easter-Egg: spielt eine zufällige echte Pups-Aufnahme (public/sounds, Quellen in public/sounds/QUELLEN.txt)
   und zeigt dazu einen tanzenden Kothaufen mit Konfetti, solange der Sound läuft. */
import { PUPS } from './pups-list.js';
import { lockSheets } from './dom.js';

const PUPS_COUNT = PUPS.length;
const SHOW_NAME = true; /* zum Testen: Dateinamen während der Party anzeigen */

let last = -1;
let current = null;
let party = null;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const COLORS = ['#ff4d6d', '#ffd23f', '#3bceac', '#4d96ff', '#b388ff', '#ff8c42', '#8b5a2b'];
const EMOJIS = ['💨', '💨', '💨', '🎉', '🎊', '✨', '🧻', '💩', '🌈', '🤢', '😂', '🦨'];

/* Animationen laufen über die Web Animations API, damit sie auch bei „Bewegung reduzieren“ laufen */
function startParty(label) {
  if (party) party.stop(true);
  const layer = document.createElement('div');
  layer.className = 'pups-party blocking';
  const poo = document.createElement('div');
  poo.className = 'pups-poo';
  poo.textContent = '💩';
  layer.append(poo);
  if (label) { const tag = document.createElement('div'); tag.className = 'pups-name'; tag.textContent = label; layer.append(tag); }
  /* Während der Party: alle Klicks, Tipps und Tasten schlucken, damit nichts versehentlich passiert */
  const swallow = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  const EVENTS = ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'contextmenu'];
  for (const t of EVENTS) window.addEventListener(t, swallow, { capture: true, passive: false });
  /* Zurück-Geste ebenfalls abfangen: Fenster bleibt offen */
  lockSheets(true);
  const release = () => {
    for (const t of EVENTS) window.removeEventListener(t, swallow, { capture: true });
    lockSheets(false);
  };
  document.documentElement.append(layer);

  poo.animate([
    { transform: 'scale(0) rotate(-200deg)' },
    { transform: 'scale(1.35) rotate(15deg)', offset: 0.6 },
    { transform: 'scale(1) rotate(0deg)' }
  ], { duration: 450, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
  const wobble = poo.animate([
    { transform: 'rotate(0deg) scale(1, 1)' },
    { transform: 'rotate(-14deg) scale(1.12, .9)' },
    { transform: 'rotate(0deg) scale(.92, 1.12) translateY(-6%)' },
    { transform: 'rotate(14deg) scale(1.12, .9)' },
    { transform: 'rotate(0deg) scale(1, 1)' }
  ], { duration: 420, delay: 450, iterations: Infinity, easing: 'ease-in-out' });

  /* Bildschirm wackelt kurz */
  document.body.animate([
    { transform: 'translate(0, 0)' }, { transform: 'translate(-6px, 3px) rotate(-.6deg)' },
    { transform: 'translate(6px, -3px) rotate(.6deg)' }, { transform: 'translate(-4px, -2px)' },
    { transform: 'translate(4px, 2px)' }, { transform: 'translate(0, 0)' }
  ], { duration: 420, easing: 'linear' });

  const burst = (n) => {
    const r = poo.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const reach = Math.max(innerWidth, innerHeight) * 0.6;
    for (let k = 0; k < n; k++) {
      const p = document.createElement('div');
      const emoji = Math.random() < 0.35;
      p.className = 'pups-bit';
      if (emoji) { p.textContent = pick(EMOJIS); p.style.fontSize = `${rnd(22, 46)}px`; }
      else {
        p.style.width = `${rnd(7, 13)}px`; p.style.height = `${rnd(10, 20)}px`;
        p.style.background = pick(COLORS); p.style.borderRadius = Math.random() < 0.3 ? '50%' : '2px';
      }
      p.style.left = `${cx}px`; p.style.top = `${cy}px`;
      layer.append(p);
      const ang = rnd(0, Math.PI * 2), dist = rnd(0.35, 1) * reach;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      const spin = rnd(-900, 900), dur = rnd(1100, 2000);
      p.animate([
        { transform: 'translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(.3)', opacity: 1 },
        { transform: `translate(-50%, -50%) translate(${dx * 0.75}px, ${dy * 0.75 - 60}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy + rnd(120, 260)}px) rotate(${spin}deg) scale(.9)`, opacity: 0 }
      ], { duration: dur, easing: 'cubic-bezier(.15,.7,.4,1)', fill: 'forwards' }).onfinish = () => p.remove();
    }
  };
  burst(70);
  const timer = setInterval(() => burst(26), 550);

  let done = false;
  const stop = (now) => {
    if (done) return;
    done = true;
    clearInterval(timer);
    if (party && party.stop === stop) party = null;
    if (now) { release(); layer.remove(); return; }
    wobble.cancel();
    poo.animate([
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
      { transform: 'scale(1.25) rotate(20deg)', opacity: 1, offset: 0.3 },
      { transform: 'scale(0) rotate(540deg)', opacity: 0 }
    ], { duration: 420, easing: 'ease-in', fill: 'forwards' });
    setTimeout(() => { release(); layer.classList.remove('blocking'); }, 450); /* Sperre endet, wenn der Haufen weg ist */
    setTimeout(() => layer.remove(), 2100);
  };
  party = { stop };
  return stop;
}

export function pups() {
  if (!PUPS_COUNT) return;
  let i = Math.floor(Math.random() * PUPS_COUNT);
  if (PUPS_COUNT > 1 && i === last) i = (i + 1) % PUPS_COUNT;
  last = i;
  if (current) current.pause();
  const audio = new Audio(`${import.meta.env.BASE_URL}sounds/pups-${String(i + 1).padStart(2, '0')}.mp3`);
  current = audio;
  const name = `pups-${String(i + 1).padStart(2, '0')}.mp3`;
  const stop = startParty(SHOW_NAME ? `${name} · ${PUPS[i]}` : '');
  const t0 = Date.now();
  const end = () => setTimeout(stop, Math.max(0, 1400 - (Date.now() - t0))); /* mindestens 1,4 s Party */
  const fallback = setTimeout(end, 8000);
  audio.addEventListener('ended', () => { clearTimeout(fallback); end(); });
  audio.play().catch(() => { clearTimeout(fallback); setTimeout(stop, 2000); });
}

/* Zählt Klicks; löst aus, wenn 5 Klicks jeweils höchstens 5 s auseinander liegen */
export function tapCounter(need = 5, gap = 5000, fire = pups) {
  let n = 0, prev = 0;
  return () => {
    const now = Date.now();
    n = now - prev <= gap ? n + 1 : 1;
    prev = now;
    if (n >= need) { n = 0; prev = 0; fire(); }
  };
}
