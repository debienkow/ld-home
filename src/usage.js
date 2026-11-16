/* Geschätzte Speichernutzung in Firestore (Spark-Plan: 1 GiB) */
import { el } from './dom.js';
import { state } from './store.js';

const LIMIT = 1024 ** 3;
const size = (list) => list.reduce((a, x) => a + JSON.stringify(x).length + 40, 0);

export function usageBytes() {
  const dmsPages = state.dms.docs.reduce((a, d) => a + (d.bytes || 0), 0);
  return size(state.items) + size(state.fin.entries) + size(state.fin.recurring) + size(state.ev.events) + size(state.ev.ideas) + size(state.dms.docs) + dmsPages + size([...state.learned.values()]);
}

export const mb = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0)} MB`).replace('.', ',');

export function usageCard() {
  const used = usageBytes();
  const pct = Math.min(100, (used / LIMIT) * 100);
  return el('section', { class: 'card' },
    el('p', { class: 'hint' }, 'Speicher (Schätzung)'),
    el('p', null, `${mb(used)} von 1 GB belegt (${pct < 0.1 ? '< 0,1' : pct.toFixed(1).replace('.', ',')} %)`),
    el('div', { class: 'bar' }, el('div', { class: 'bar-fill', style: { width: `${Math.max(1, pct)}%`, background: pct > 80 ? 'var(--danger)' : 'var(--primary)' } })),
    el('p', { class: 'hint' }, 'Gerechnet aus euren Daten und Dokumentbildern. Den genauen Wert zeigt die Firebase-Konsole unter „Nutzung“. Das kostenlose Kontingent erlaubt 1 GB Daten.'));
}
