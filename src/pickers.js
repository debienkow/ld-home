/* Datum- und Uhrzeit-Auswahl im App-Design */
import { el, openSheet } from './dom.js';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoOf(new Date());
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/* "17.11.2026", "17.11.26" oder "17112026" -> ISO, sonst "" */
function parseDe(t) {
  const d = String(t).replace(/\s/g, '');
  const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/) || d.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return '';
  let [, dd, mm, yy] = m.map(Number);
  if (yy < 100) yy += yy > 50 ? 1900 : 2000;
  const x = new Date(yy, mm - 1, dd);
  return x.getFullYear() === yy && x.getMonth() === mm - 1 && x.getDate() === dd ? isoOf(x) : '';
}
const deOf = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

/* Kalenderblatt mit Direkteingabe */
function dateSheet(field) {
  const min = field.min;
  const max = field.max;
  const allowed = (iso) => !(min && iso < min) && !(max && iso > max);
  let pick = field.value;
  const base = new Date((pick || (min && min > todayIso() ? min : todayIso())) + 'T00:00');
  let y = base.getFullYear();
  let m = base.getMonth();
  openSheet('Datum wählen', (body, close) => {
    const grid = el('div', { class: 'dp-grid' });
    const label = el('strong', { class: 'grow dp-title' });
    const msg = el('p', { class: 'form-info bad' });
    const typed = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'TT.MM.JJJJ', autocomplete: 'off', value: deOf(pick), 'aria-label': 'Datum eintippen' });
    const draw = () => {
      label.textContent = new Date(y, m, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      const first = (new Date(y, m, 1).getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      const cells = WD.map((w) => el('span', { class: 'dp-wd' }, w));
      for (let i = 0; i < 42; i++) {
        const d = i - first + 1;
        if (d < 1 || d > days) { cells.push(el('span', { class: 'dp-pad' })); continue; }
        const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
        cells.push(el('button', {
          type: 'button',
          class: 'dp-day' + (iso === pick ? ' sel' : '') + (iso === todayIso() ? ' today' : ''),
          disabled: !allowed(iso),
          onclick: () => { field.set(iso); close(); }
        }, String(d)));
      }
      grid.replaceChildren(...cells);
    };
    const step = (n) => { const x = new Date(y, m + n, 1); y = x.getFullYear(); m = x.getMonth(); draw(); };
    let x0 = null, y0 = 0;
    grid.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    grid.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    });
    const fromTyped = () => {
      const iso = parseDe(typed.value);
      if (!iso) return '';
      pick = iso; y = +iso.slice(0, 4); m = +iso.slice(5, 7) - 1; draw();
      return iso;
    };
    const apply = () => {
      const iso = fromTyped();
      if (!iso) return (msg.textContent = 'Bitte als TT.MM.JJJJ eingeben, z. B. 03.05.2020.');
      if (!allowed(iso)) return (msg.textContent = `Das Datum muss ${min && iso < min ? `ab ${deOf(min)}` : `bis ${deOf(max)}`} liegen.`);
      field.set(iso); close();
    };
    typed.addEventListener('input', () => {
      const digits = typed.value.replace(/\D/g, '').slice(0, 8);
      const dots = [...typed.value].map((c, i) => (c === '.' ? i : -1)).filter((i) => i >= 0);
      if (/^[\d.]*$/.test(typed.value) && dots.every((i) => i === 2 || i === 5)) {
        const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean);
        typed.value = parts.join('.');
      }
      msg.textContent = '';
      fromTyped();
    });
    let fresh = false;
    typed.addEventListener('focus', () => { typed.select(); fresh = true; });
    typed.addEventListener('mouseup', (e) => { if (fresh) e.preventDefault(); fresh = false; });
    typed.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply(); } });
    const t = todayIso();
    const nav = (txt, lab, n) => el('button', { class: 'icon-btn', type: 'button', 'aria-label': lab, onclick: () => step(n) }, txt);
    body.append(
      el('div', { class: 'row dp-type' }, typed, el('button', { class: 'btn soft', type: 'button', onclick: apply }, 'OK')),
      msg,
      el('div', { class: 'row dp-head' },
        nav('«', 'Ein Jahr zurück', -12), nav('‹', 'Vorheriger Monat', -1),
        label,
        nav('›', 'Nächster Monat', 1), nav('»', 'Ein Jahr vor', 12)),
      grid,
      el('div', { class: 'row between actions' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Abbrechen'),
        allowed(t) ? el('button', { class: 'btn soft', type: 'button', onclick: () => { field.set(t); close(); } }, 'Heute') : el('span')));
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
