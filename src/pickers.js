/* Datum- und Uhrzeit-Auswahl im App-Design */
import { el, openSheet } from './dom.js';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoOf(new Date());
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/* Kalenderblatt */
function dateSheet(field) {
  const min = field.min;
  const max = field.max;
  const base = new Date((field.value || (min && min > todayIso() ? min : todayIso())) + 'T00:00');
  let y = base.getFullYear();
  let m = base.getMonth();
  openSheet('Datum wählen', (body, close) => {
    const grid = el('div', { class: 'dp-grid' });
    const label = el('strong', { class: 'grow dp-title' });
    const draw = () => {
      label.textContent = new Date(y, m, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      const first = (new Date(y, m, 1).getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      const cells = WD.map((w) => el('span', { class: 'dp-wd' }, w));
      for (let i = 0; i < first; i++) cells.push(el('span'));
      for (let d = 1; d <= days; d++) {
        const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
        const off = !!((min && iso < min) || (max && iso > max));
        cells.push(el('button', {
          type: 'button',
          class: 'dp-day' + (iso === field.value ? ' sel' : '') + (iso === todayIso() ? ' today' : ''),
          disabled: off,
          onclick: () => { field.set(iso); close(); }
        }, String(d)));
      }
      grid.replaceChildren(...cells);
    };
    const step = (n) => { m += n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } draw(); };
    const t = todayIso();
    const canToday = !(min && t < min) && !(max && t > max);
    body.append(
      el('div', { class: 'row dp-head' },
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Vorheriger Monat', onclick: () => step(-1) }, '‹'),
        label,
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nächster Monat', onclick: () => step(1) }, '›')),
      grid,
      el('div', { class: 'row between actions' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Abbrechen'),
        canToday ? el('button', { class: 'btn soft', type: 'button', onclick: () => { field.set(t); close(); } }, 'Heute') : el('span')));
    draw();
  });
}

/* Uhrzeit: Stunde und Minute antippen */
function timeSheet(field) {
  const [minH, minM] = field.min ? field.min.split(':').map(Number) : [-1, -1];
  const cur = field.value ? field.value.split(':').map(Number) : null;
  let h = cur ? cur[0] : Math.max(minH, new Date().getHours());
  let m = cur ? cur[1] : 0;
  const mins = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!mins.includes(m)) mins.push(m), mins.sort((a, b) => a - b);
  openSheet('Uhrzeit wählen', (body, close) => {
    const show = el('p', { class: 'tp-show' });
    const hours = el('div', { class: 'tp-grid' });
    const minutes = el('div', { class: 'tp-grid' });
    const fix = () => { if (h === minH && m < minM) m = mins.find((x) => x >= minM) ?? m; };
    const draw = () => {
      fix();
      show.textContent = `${pad(h)}:${pad(m)}`;
      hours.replaceChildren(...Array.from({ length: 24 }, (_, i) => el('button', {
        type: 'button', class: 'tp-cell' + (i === h ? ' sel' : ''), disabled: i < minH, onclick: () => { h = i; draw(); }
      }, pad(i))));
      minutes.replaceChildren(...mins.map((x) => el('button', {
        type: 'button', class: 'tp-cell' + (x === m ? ' sel' : ''), disabled: h === minH && x < minM, onclick: () => { m = x; draw(); }
      }, pad(x))));
    };
    body.append(
      show,
      el('p', { class: 'section-title' }, 'Stunde'), hours,
      el('p', { class: 'section-title' }, 'Minute'), minutes,
      el('div', { class: 'row between actions' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { field.set(''); close(); } }, 'Leeren'),
        el('button', { class: 'btn primary', type: 'button', onclick: () => { field.set(`${pad(h)}:${pad(m)}`); close(); } }, 'Übernehmen')));
    draw();
  });
}

/* Feld-Element mit value, min, max und change-Ereignis */
class WcPick extends HTMLElement {
  constructor() {
    super();
    this._v = '';
    this._btn = document.createElement('button');
    this._btn.type = 'button';
    this._btn.className = 'pick-btn';
    this._btn.addEventListener('click', () => (this.type === 'time' ? timeSheet(this) : dateSheet(this)));
  }
  connectedCallback() {
    if (!this._btn.isConnected) this.append(this._btn);
    this.render();
  }
  get type() { return this.getAttribute('type') || 'date'; }
  get value() { return this._v; }
  set value(v) { this._v = v || ''; this.render(); }
  get min() { return this.getAttribute('min') || ''; }
  set min(v) { if (v) this.setAttribute('min', v); else this.removeAttribute('min'); }
  get max() { return this.getAttribute('max') || ''; }
  set max(v) { if (v) this.setAttribute('max', v); else this.removeAttribute('max'); }
  focus(o) { this._btn.focus(o); }
  set(v) {
    if (v === this._v) return;
    this.value = v;
    this.dispatchEvent(new Event('input', { bubbles: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }
  render() {
    const v = this._v;
    this._btn.classList.toggle('empty', !v);
    if (this.type === 'time') this._btn.textContent = v || '––:––';
    else this._btn.textContent = v ? new Date(v + 'T00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Datum wählen';
  }
}
if (!customElements.get('wc-pick')) customElements.define('wc-pick', WcPick);
