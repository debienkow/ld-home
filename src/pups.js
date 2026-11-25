/* Easter-Egg: spielt eine zufällige echte Pups-Aufnahme (public/sounds, Quellen in public/sounds/QUELLEN.txt) */
import { PUPS_COUNT } from './pups-list.js';

let last = -1;
let current = null;

export function pups() {
  if (!PUPS_COUNT) return;
  let i = Math.floor(Math.random() * PUPS_COUNT);
  if (PUPS_COUNT > 1 && i === last) i = (i + 1) % PUPS_COUNT;
  last = i;
  if (current) current.pause();
  current = new Audio(`${import.meta.env.BASE_URL}sounds/pups-${String(i + 1).padStart(2, '0')}.mp3`);
  current.play().catch(() => {});
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
