/* Tab Finanzen */
import { confirmSheet, el, openSheet, uid } from './dom.js';
import {
  balance, currentCents, fmt, monthLabel, monthOf, nowTime, otherOf, parseMoney, recurringSummary, suggestCategory, todayStr, PEOPLE
} from './finlogic.js';
import {
  myKey, nameOfKey, removeEntry, removeRecurring, saveEntry, saveFinConfig, saveRecurring, state, subscribe
} from './store.js';
import { importFile } from './dataio.js';

const catList = (type) => (type === 'income' ? state.fin.config.incomeCategories : state.fin.config.categories);
const catOf = (type, id) => catList(type).find((c) => c.id === id) || { icon: '🧾', name: 'Sonstiges', color: '#9aa7c2' };

export function saldoText() {
  const b = balance(state.fin.entries);
  if (b === 0) return { text: 'Alles ausgeglichen', cents: 0 };
  const [debtor, creditor] = b > 0 ? ['logi', 'dudi'] : ['dudi', 'logi'];
  return { text: `${nameOfKey(debtor)} schuldet ${nameOfKey(creditor)}`, cents: Math.abs(b) };
}

const circle = (cat, small) => el('span', { class: 'circle' + (small ? ' small' : ''), style: { background: cat.color } }, cat.icon);

/* Eintrag anlegen oder bearbeiten */
export function openEntrySheet(entry, preset) {
  const e = entry || { type: 'expense', date: todayStr(), time: nowTime(), title: '', cents: 0, categoryId: '', payer: myKey(), noSplit: false, note: '', ...(preset || {}) };
  openSheet(entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag', (body, close) => {
    let type = e.type;
    let catTouched = !!entry;

    const seg = el('div', { class: 'seg' });
    const title = el('input', { type: 'text', value: e.title, placeholder: 'z. B. Lidl', autocomplete: 'off' });
    const suggest = el('div', { class: 'suggest hidden' });
    const amount = el('input', { type: 'text', inputmode: 'decimal', value: e.cents ? (e.cents / 100).toFixed(2).replace('.', ',') : '', placeholder: '0,00' });
    const date = el('input', { type: 'date', value: e.date });
    const time = el('input', { type: 'time', value: e.time || '' });
    const cat = el('select');
    const payer = el('select', null, ...PEOPLE.map((k) => el('option', { value: k, selected: k === e.payer }, nameOfKey(k))));
    const noSplit = el('input', { type: 'checkbox', checked: e.noSplit });
    const note = el('input', { type: 'text', value: e.note || '', placeholder: 'Notiz (optional)' });
    const info = el('p', { class: 'hint' });
    const err = el('p', { class: 'form-info bad' });
    const catBox = el('label', null, 'Kategorie', cat);
    const splitBox = el('label', { class: 'toggle-row' }, el('span', null, 'Gesamtkosten nicht teilen (andere Person schuldet alles)'), noSplit);
    const payerLabel = el('label', null, 'Bezahlt von', payer);

    const fillCats = (selected) => {
      cat.replaceChildren(...catList(type).map((c) => el('option', { value: c.id, selected: c.id === selected }, `${c.icon} ${c.name}`)));
    };
    const refresh = () => {
      catBox.classList.toggle('hidden', type === 'settlement');
      splitBox.classList.toggle('hidden', type !== 'expense');
      payerLabel.firstChild.textContent = type === 'income' ? 'Erhalten von' : type === 'settlement' ? 'Zahlt (Ausgleich)' : 'Bezahlt von';
      info.textContent = type === 'settlement' ? `${nameOfKey(payer.value)} zahlt an ${nameOfKey(otherOf(payer.value))}` : '';
      seg.replaceChildren(...[['expense', 'Ausgabe'], ['income', 'Einnahme'], ['settlement', 'Ausgleich']].map(([k, l]) =>
        el('button', { type: 'button', class: 'seg-btn' + (type === k ? ' active' : ''), onclick: () => { type = k; catTouched = false; fillCats(''); refresh(); } }, l)));
    };
    fillCats(e.categoryId || (type === 'income' ? 'gehalt' : 'sonstiges'));
    payer.addEventListener('change', refresh);
    cat.addEventListener('change', () => (catTouched = true));

    const history = () => {
      const map = new Map();
      for (const x of state.fin.entries) {
        if (x.type !== 'expense' || !x.title) continue;
        const k = x.title.trim();
        const cur = map.get(k) || { title: k, n: 0, categoryId: x.categoryId };
        cur.n++;
        map.set(k, cur);
      }
      return [...map.values()].sort((a, b) => b.n - a.n);
    };
    title.addEventListener('input', () => {
      const t = title.value.trim().toLowerCase();
      if (type === 'expense' && !catTouched) {
        const c = suggestCategory(t, state.fin.config.rules);
        if (c) fillCats(c);
      }
      if (!t || type !== 'expense') return suggest.classList.add('hidden');
      const hits = history().filter((h) => h.title.toLowerCase().includes(t) && h.title.toLowerCase() !== t).slice(0, 5);
      suggest.replaceChildren(...hits.map((h) =>
        el('button', { type: 'button', class: 'suggest-row', onclick: () => { title.value = h.title; fillCats(h.categoryId); suggest.classList.add('hidden'); } },
          circle(catOf('expense', h.categoryId), true), el('span', { class: 'grow' }, h.title))));
      suggest.classList.toggle('hidden', !hits.length);
    });

    refresh();
    body.append(
      seg,
      el('label', null, 'Titel', title), suggest,
      el('label', null, 'Betrag (€)', amount),
      el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Datum', date), el('label', { class: 'grow' }, 'Uhrzeit', time)),
      catBox, payerLabel, splitBox, info,
      el('label', null, 'Notiz', note), err,
      el('div', { class: 'row between' },
        entry ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Eintrag löschen?', `„${e.title}“ wirklich löschen?`, 'Löschen')) { await removeEntry(entry.id); close(); }
        } }, 'Löschen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const cents = parseMoney(amount.value);
          if (cents === null || cents === 0) return (err.textContent = 'Bitte einen gültigen Betrag eingeben.');
          if (!title.value.trim() && type !== 'settlement') return (err.textContent = 'Bitte einen Titel eingeben.');
          if (!date.value) return (err.textContent = 'Bitte ein Datum wählen.');
          await saveEntry(entry && entry.id, {
            type,
            title: title.value.trim() || 'Haushaltsausgleich',
            cents,
            date: date.value,
            time: time.value || '',
            payer: payer.value,
            categoryId: type === 'settlement' ? 'ausgleich' : cat.value,
            noSplit: type === 'expense' && noSplit.checked,
            note: note.value.trim()
          });
          close();
        } }, 'Speichern'))
    );
  });
}

const barChart = (series, labels, colors) => {
  const max = Math.max(1, ...series.flat());
  const w = 100 / labels.length;
  const bars = labels.flatMap((_, i) => series.map((s, j) => {
    const h = Math.round((s[i] / max) * 100);
    const bw = (w * 0.8) / series.length;
    return `<rect x="${i * w + w * 0.1 + j * bw}" y="${100 - h}" width="${bw - 0.4}" height="${h}" rx="0.8" fill="${colors[j]}"/>`;
  })).join('');
  const box = el('div', { class: 'chart' });
  box.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${bars}</svg>`;
  const axis = el('div', { class: 'chart-axis' }, ...labels.map((l) => el('span', null, l)));
  return el('div', null, box, axis);
};

function renderOverview(root) {
  const { entries, recurring, config } = state.fin;
  const saldo = saldoText();
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString('sv-SE').slice(0, 7));
  }
  const sum = (type, ym) => entries.filter((x) => x.type === type && monthOf(x.date) === ym).reduce((a, x) => a + x.cents, 0);
  const exp = months.map((m) => Math.max(0, sum('expense', m)) / 100);
  const inc = months.map((m) => Math.max(0, sum('income', m)) / 100);
  const labels = months.map((m) => monthLabel(m).slice(0, 3));

  const year = String(now.getFullYear());
  const byCat = {};
  for (const x of entries) if (x.type === 'expense' && x.date.startsWith(year)) byCat[x.categoryId] = (byCat[x.categoryId] || 0) + x.cents;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));
  const rec = recurringSummary(recurring, config.salaries, todayStr().slice(0, 7));

  root.replaceChildren(
    el('section', { class: 'card saldo' },
      el('p', { class: 'hint' }, 'Saldo (ohne laufende Kosten)'),
      el('p', { class: 'saldo-text' }, saldo.text),
      saldo.cents ? el('p', { class: 'big-number' }, fmt(saldo.cents)) : null,
      saldo.cents ? el('button', { class: 'btn ghost', onclick: () => {
        const b = balance(entries);
        openEntrySheet(null, { type: 'settlement', payer: b > 0 ? 'logi' : 'dudi', cents: Math.abs(b), title: 'Haushaltsausgleich' });
      } }, 'Ausgleich eintragen') : null),
    el('section', { class: 'card' },
      el('p', { class: 'hint' }, 'Laufende Kosten pro Monat'),
      el('p', { class: 'big-number' }, fmt(rec.total)),
      rec.total ? el('p', null, `${nameOfKey(rec.transfer.from)} überweist ${nameOfKey(rec.transfer.to)} ${fmt(rec.transfer.cents)}`) : null),
    el('section', { class: 'card' },
      el('h2', null, 'Letzte 12 Monate'),
      el('p', { class: 'legend' }, el('span', { class: 'dot', style: { background: '#4d8dff' } }), ' Ausgaben  ', el('span', { class: 'dot', style: { background: '#5fd39a' } }), ' Einnahmen'),
      barChart([exp, inc], labels, ['#4d8dff', '#5fd39a'])),
    el('section', { class: 'card' },
      el('h2', null, `Ausgaben nach Kategorie ${year}`),
      ...(cats.length ? cats.map(([id, c]) => {
        const cat = catOf('expense', id);
        return el('div', { class: 'cat-bar' }, circle(cat, true),
          el('div', { class: 'grow' }, el('div', { class: 'cat-bar-head' }, el('span', null, cat.name), el('span', null, fmt(c))),
            el('div', { class: 'bar' }, el('div', { class: 'bar-fill', style: { width: `${Math.max(2, (c / maxCat) * 100)}%`, background: cat.color } }))));
      }) : [el('p', { class: 'hint' }, 'Noch keine Ausgaben in diesem Jahr.')]))
  );
}

function renderList(root, type, view) {
  const q = view.q.trim().toLowerCase();
  let list = state.fin.entries.filter((x) => (type === 'income' ? x.type === 'income' : x.type !== 'income'));
  if (q) list = list.filter((x) => `${x.title} ${x.note || ''}`.toLowerCase().includes(q));
  list.sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const months = [...new Set(list.map((x) => monthOf(x.date)))];
  const shown = q ? months : months.slice(0, view.monthsShown);
  const blocks = [];
  for (const m of shown) {
    const inM = list.filter((x) => monthOf(x.date) === m);
    const total = inM.filter((x) => x.type !== 'settlement').reduce((a, x) => a + x.cents, 0);
    blocks.push(el('h3', { class: 'section-title month' }, el('span', null, monthLabel(m)), el('span', null, fmt(total))));
    for (const x of inM) {
      const settle = x.type === 'settlement';
      const cat = settle ? { icon: '🤝', color: '#4d8dff' } : catOf(x.type, x.categoryId);
      blocks.push(el('button', { class: 'item fin-row', type: 'button', onclick: () => openEntrySheet(x) },
        circle(cat),
        el('span', { class: 'grow fin-main' },
          el('span', { class: 'item-name' }, x.title),
          el('span', { class: 'hint' }, `${new Date(x.date + 'T00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })} · ${settle ? `${nameOfKey(x.payer)} → ${nameOfKey(otherOf(x.payer))}` : nameOfKey(x.payer)}${x.noSplit ? ' · nicht geteilt' : ''}`)),
        el('span', { class: 'amount' + (x.type === 'income' ? ' plus' : '') }, (x.type === 'income' ? '+' : '') + fmt(x.cents))));
    }
  }
  if (!q && months.length > shown.length) {
    blocks.push(el('button', { class: 'btn ghost wide', onclick: () => { view.monthsShown += 3; view.redraw(); } }, 'Ältere Monate anzeigen'));
  }
  root.replaceChildren(...(blocks.length ? blocks : [el('p', { class: 'empty' }, 'Noch keine Einträge. Tippe unten auf +.')]));
}

/* Laufende Kosten */
function renderRecurring(root) {
  const { recurring, config } = state.fin;
  const ym = todayStr().slice(0, 7);
  const s = recurringSummary(recurring, config.salaries, ym);
  const modeText = (w) => ({ equal: '50/50', salary: 'nach Nettogehalt', percent: `${nameOfKey('logi')} ${(w.logiPercent || 50).toFixed(1).replace('.', ',')} %`, fixed: `${nameOfKey('logi')} fix ${fmt(w.logiFixedCents || 0)}` }[(w && w.mode) || 'equal']);
  root.replaceChildren(
    el('section', { class: 'card saldo' },
      el('p', { class: 'hint' }, 'Monatlich zu überweisen'),
      el('p', { class: 'big-number' }, fmt(s.transfer.cents)),
      el('p', null, s.total ? `${nameOfKey(s.transfer.from)} überweist an ${nameOfKey(s.transfer.to)}` : 'Noch keine laufenden Kosten'),
      el('p', { class: 'hint' }, `Gesamt ${fmt(s.total)} · Anteil ${nameOfKey('dudi')} ${fmt(s.share.dudi)} · Anteil ${nameOfKey('logi')} ${fmt(s.share.logi)}`),
      el('div', { class: 'row' },
        el('button', { class: 'btn ghost', onclick: () => openSalaries() }, 'Nettogehälter'),
        el('button', { class: 'btn primary', onclick: () => openRecurringSheet() }, '+ Posten'))),
    ...s.rows.map((r) => el('button', { class: 'item fin-row', type: 'button', onclick: () => openRecurringSheet(r.rec) },
      el('span', { class: 'grow fin-main' },
        el('span', { class: 'item-name' }, r.rec.title),
        el('span', { class: 'hint' }, `Konto ${nameOfKey(r.rec.payer)} · ${modeText(r.rec.weight)}${r.rec.intervalMonths > 1 ? ` · ${fmt(currentCents(r.rec, ym))} alle ${r.rec.intervalMonths} Monate` : ''}`)),
      el('span', { class: 'amount' }, fmt(r.monthly))))
  );
}

function openSalaries() {
  openSheet('Nettogehälter', (body, close) => {
    const sal = state.fin.config.salaries || {};
    const inputs = Object.fromEntries(PEOPLE.map((k) => [k, el('input', { type: 'text', inputmode: 'decimal', value: sal[k] ? (sal[k] / 100).toFixed(2).replace('.', ',') : '' })]));
    body.append(
      el('p', { class: 'hint' }, 'Wird für Posten mit Gewichtung „nach Nettogehalt“ gebraucht.'),
      ...PEOPLE.map((k) => el('label', null, nameOfKey(k), inputs[k])),
      el('div', { class: 'row end' }, el('button', { class: 'btn primary', onclick: async () => {
        await saveFinConfig({ salaries: Object.fromEntries(PEOPLE.map((k) => [k, parseMoney(inputs[k].value) || 0])) });
        close();
      } }, 'Speichern')));
  });
}

function openRecurringSheet(rec) {
  const r = rec || { title: '', payer: 'logi', intervalMonths: 1, weight: { mode: 'equal' }, versions: [], sort: state.fin.recurring.length };
  openSheet(rec ? r.title : 'Neuer laufender Posten', (body, close) => {
    const versions = (r.versions || []).map((v) => ({ ...v }));
    const title = el('input', { type: 'text', value: r.title, placeholder: 'z. B. Strom' });
    const payer = el('select', null, ...PEOPLE.map((k) => el('option', { value: k, selected: k === r.payer }, nameOfKey(k))));
    const interval = el('select', null, ...[[1, 'monatlich'], [3, 'vierteljährlich'], [6, 'halbjährlich'], [12, 'jährlich']].map(([n, l]) => el('option', { value: n, selected: n === (r.intervalMonths || 1) }, l)));
    const mode = el('select', null, ...[['equal', '50/50'], ['salary', 'nach Nettogehalt'], ['percent', 'Prozent'], ['fixed', 'Fester Betrag']].map(([k, l]) => el('option', { value: k, selected: k === ((r.weight && r.weight.mode) || 'equal') }, l)));
    const pct = el('input', { type: 'text', inputmode: 'decimal', value: r.weight && r.weight.logiPercent ? String(r.weight.logiPercent).replace('.', ',') : '50' });
    const fixed = el('input', { type: 'text', inputmode: 'decimal', value: r.weight && r.weight.logiFixedCents ? (r.weight.logiFixedCents / 100).toFixed(2).replace('.', ',') : '' });
    const pctBox = el('label', null, `Anteil ${nameOfKey('logi')} in %`, pct);
    const fixedBox = el('label', null, `Fester Anteil ${nameOfKey('logi')} (€ pro Monat)`, fixed);
    const vBox = el('div');
    const err = el('p', { class: 'form-info bad' });
    const newFrom = el('input', { type: 'month', value: todayStr().slice(0, 7) });
    const newAmt = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Betrag pro Zahlung' });

    const drawV = () => {
      versions.sort((a, b) => a.from.localeCompare(b.from));
      vBox.replaceChildren(...versions.map((v, i) => el('div', { class: 'edit-row' },
        el('span', { class: 'grow' }, `ab ${monthLabel(v.from)}`), el('strong', null, fmt(v.cents)),
        el('button', { class: 'icon-btn', type: 'button', onclick: () => { versions.splice(i, 1); drawV(); } }, '🗑'))));
    };
    const drawMode = () => {
      pctBox.classList.toggle('hidden', mode.value !== 'percent');
      fixedBox.classList.toggle('hidden', mode.value !== 'fixed');
    };
    mode.addEventListener('change', drawMode);
    drawV(); drawMode();

    body.append(
      el('label', null, 'Bezeichnung', title),
      el('label', null, 'Abgebucht von Konto', payer),
      el('label', null, 'Zahlweise', interval),
      el('label', null, 'Gewichtung', mode), pctBox, fixedBox,
      el('h3', null, 'Preisverlauf'),
      el('p', { class: 'hint' }, 'Ein neuer Preis gilt erst ab dem gewählten Monat. Ältere Zeiten bleiben unberührt.'),
      vBox,
      el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Gültig ab', newFrom), el('label', { class: 'grow' }, 'Betrag (€)', newAmt),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => {
          const c = parseMoney(newAmt.value);
          if (c === null || !newFrom.value) return (err.textContent = 'Monat und Betrag prüfen.');
          err.textContent = '';
          const ex = versions.find((v) => v.from === newFrom.value);
          if (ex) ex.cents = c; else versions.push({ from: newFrom.value, cents: c });
          newAmt.value = '';
          drawV();
        } }, '+')),
      err,
      el('div', { class: 'row between' },
        rec ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Posten löschen?', `„${r.title}“ wirklich löschen?`, 'Löschen')) { await removeRecurring(rec.id); close(); }
        } }, 'Löschen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!title.value.trim()) return (err.textContent = 'Bitte eine Bezeichnung eingeben.');
          if (!versions.length) return (err.textContent = 'Bitte mindestens einen Preis eintragen.');
          const weight = { mode: mode.value };
          if (mode.value === 'percent') weight.logiPercent = parseFloat(pct.value.replace(',', '.')) || 50;
          if (mode.value === 'fixed') weight.logiFixedCents = parseMoney(fixed.value) || 0;
          await saveRecurring(rec && rec.id, { title: title.value.trim(), payer: payer.value, intervalMonths: Number(interval.value), weight, versions, sort: r.sort || 0 });
          close();
        } }, 'Speichern')));
  });
}

/* Einstellungen: Kategorien, Regeln, Import */
function openFinSettings() {
  openSheet('Finanzen einrichten', (body, close) => {
    const cfg = state.fin.config;
    const cats = cfg.categories.map((c) => ({ ...c }));
    const rules = cfg.rules.map((r) => ({ ...r }));
    const area = el('div');
    const draw = () => {
      area.replaceChildren(
        el('h3', null, 'Kategorien'),
        ...cats.map((c, i) => el('div', { class: 'edit-row' },
          el('input', { class: 'emoji', value: c.icon, maxlength: '4', oninput: (e) => (c.icon = e.target.value) }),
          el('input', { class: 'grow', value: c.name, oninput: (e) => (c.name = e.target.value) }),
          el('input', { type: 'color', value: c.color, oninput: (e) => (c.color = e.target.value) }),
          el('button', { class: 'icon-btn', type: 'button', onclick: () => { cats.splice(i, 1); draw(); } }, '🗑'))),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { cats.push({ id: 'k' + uid(), name: 'Neu', icon: '🧾', color: '#9aa7c2' }); draw(); } }, '+ Kategorie'),
        el('h3', null, 'Automatische Kategorie'),
        el('p', { class: 'hint' }, 'Enthält der Titel den Text, springt die Kategorie automatisch.'),
        ...rules.map((r, i) => el('div', { class: 'edit-row' },
          el('input', { class: 'grow', value: r.match, oninput: (e) => (r.match = e.target.value) }),
          el('select', { onchange: (e) => (r.categoryId = e.target.value) }, ...cats.map((c) => el('option', { value: c.id, selected: c.id === r.categoryId }, `${c.icon} ${c.name}`))),
          el('button', { class: 'icon-btn', type: 'button', onclick: () => { rules.splice(i, 1); draw(); } }, '🗑'))),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { rules.push({ match: '', categoryId: cats[0].id }); draw(); } }, '+ Regel')
      );
    };
    draw();
    const file = el('input', { type: 'file', accept: 'application/json', class: 'hidden', onchange: async (e) => {
      if (e.target.files[0]) { await importFile(e.target.files[0]); close(); }
    } });
    body.append(area,
      el('div', { class: 'row end' }, el('button', { class: 'btn primary', onclick: async () => {
        await saveFinConfig({ categories: cats, rules: rules.filter((r) => r.match.trim()) });
        close();
      } }, 'Speichern')),
      el('h3', null, 'Daten importieren'),
      el('p', { class: 'hint' }, 'Import-Datei aus der Excel (JSON) auswählen. Mehrfaches Importieren legt nichts doppelt an.'),
      file, el('button', { class: 'btn ghost wide', onclick: () => file.click() }, 'Import-Datei wählen'));
  });
}

export function mountFinance(root) {
  const view = { sub: 'uebersicht', q: '', monthsShown: 3, redraw: null };
  const subnav = el('div', { class: 'chips' });
  const toolbar = el('div', { class: 'search-wrap' });
  const content = el('div');
  const search = el('input', { type: 'search', class: 'search', placeholder: 'Suchen …', oninput: (e) => { view.q = e.target.value; draw(); } });
  const fab = el('button', { class: 'fab', 'aria-label': 'Neuer Eintrag', onclick: () => openEntrySheet(null, view.sub === 'einnahmen' ? { type: 'income' } : null) }, '+');

  const SUBS = [['uebersicht', 'Übersicht'], ['ausgaben', 'Ausgaben'], ['einnahmen', 'Einnahmen'], ['laufend', 'Laufende Kosten']];
  function draw() {
    subnav.replaceChildren(...SUBS.map(([k, l]) => el('button', { class: 'chip' + (view.sub === k ? ' active' : ''), onclick: () => { view.sub = k; view.q = ''; search.value = ''; view.monthsShown = 3; draw(); } }, l)),
      el('button', { class: 'chip gear', onclick: openFinSettings, 'aria-label': 'Einstellungen' }, '⚙︎'));
    toolbar.replaceChildren(...(view.sub === 'ausgaben' || view.sub === 'einnahmen' ? [search] : []));
    toolbar.classList.toggle('hidden', !toolbar.children.length);
    fab.classList.toggle('hidden', view.sub === 'laufend');
    if (view.sub === 'uebersicht') renderOverview(content);
    else if (view.sub === 'laufend') renderRecurring(content);
    else renderList(content, view.sub === 'einnahmen' ? 'income' : 'expense', view);
  }
  view.redraw = draw;
  root.replaceChildren(subnav, toolbar, content, fab);
  draw();
  return subscribe(draw);
}
