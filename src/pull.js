/* Ziehen zum Aktualisieren */
import { el, icon, toast } from './dom.js';
import { gcalReady, syncNow } from './gcal.js';

const LIMIT = 80;

export function startPull() {
  const ind = el('div', { class: 'pull', 'aria-hidden': 'true' }, icon('refresh'));
  document.body.append(ind);
  let y0 = null, x0 = 0, dy = 0, busy = false;
  const set = (d) => {
    ind.style.transform = `translate(-50%, ${Math.min(d, LIMIT + 20) - 50}px) rotate(${d * 3}deg)`;
    ind.style.opacity = String(Math.min(1, d / LIMIT));
    ind.classList.toggle('ready', d >= LIMIT);
  };
  const reset = () => { y0 = null; dy = 0; ind.classList.remove('spin'); set(0); };

  window.addEventListener('touchstart', (e) => {
    if (busy || e.touches.length !== 1 || window.scrollY > 0 || document.body.classList.contains('no-scroll')) return;
    if (e.target.closest('.sheet, .chips, .swipe, input, textarea, select')) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    const t = e.touches[0];
    const d = t.clientY - y0, dx = Math.abs(t.clientX - x0);
    if (d <= 0 || dx > d || window.scrollY > 0) { if (dy) set(0); dy = 0; return; }
    dy = d * 0.5;
    set(dy);
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (y0 === null) return;
    if (dy < LIMIT) return reset();
    busy = true;
    set(LIMIT);
    ind.classList.add('spin');
    const r = gcalReady() ? await syncNow({ manual: true }) : { ok: true, changes: 0 };
    toast(r.ok ? (r.changes ? `Aktualisiert (${r.changes} Änderungen aus dem Kalender)` : 'Alles aktuell') : `Abgleich fehlgeschlagen: ${r.error || 'unbekannt'}`, { bad: !r.ok });
    busy = false;
    reset();
  });
}
