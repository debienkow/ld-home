/* Tab Finanzen */
import { confirmSheet, el, icon, keepChips, openSheet, uid } from './dom.js';
import {
  balance, currentCents, isDue, DEFAULT_PRESETS, fmt, logiShare, monthLabel, monthOf, nowTime, otherOf, parseMoney, recurringSummary, suggestCategory, todayStr, PEOPLE
} from './finlogic.js';
import {
  myKey, nameOfKey, removeEntry, removeRecurring, saveEntry, saveFinConfig, saveRecurring, state, subscribe
} from './store.js';
import { importFile } from './dataio.js';
import { addDays } from './evlogic.js';

const catList = (type) => (type === 'income' ? state.fin.config.incomeCategories : state.fin.config.categories);
const catOf = (type, id) => catList(type).find((c) => c.id === id) || (id ? { icon: '🧾', name: 'Sonstiges', color: '#9aa7c2' } : { icon: '▫️', name: 'Keine', color: '#5d6f96' });
const presets = () => state.fin.config.presets || DEFAULT_PRESETS;
const PAYER_NONE = 'Noch nicht festgelegt';

export function saldoText() {
  const b = balance(state.fin.entries);
  if (b === 0) return { text: 'Alles ausgeglichen', cents: 0 };
  const [debtor, creditor] = b > 0 ? ['logi', 'dudi'] : ['dudi', 'logi'];
  return { text: `${nameOfKey(debtor)} schuldet ${nameOfKey(creditor)}`, cents: Math.abs(b) };
}

const circle = (cat, small) => el('span', { class: 'circle' + (small ? ' small' : ''), style: { background: cat.color } }, cat.icon);

/* Eintrag anlegen oder bearbeiten */
export function openEntrySheet(entry, preset) {
  const e = entry || { type: 'expense', date: todayStr(), time: nowTime(), title: '', cents: 0, categoryId: '', payer: myKey(), noSplit: false, planned: false, note: '', ...(preset || {}) };
  openSheet(entry ? 'Eintrag bearbeiten' : e.planned ? 'Geplante Ausgabe' : 'Neuer Eintrag', (body, close) => {
    let type = e.type;
    let catTouched = !!entry;

    const seg = el('div', { class: 'seg' });
    const title = el('input', { type: 'text', value: e.title, placeholder: 'z. B. Lidl', autocomplete: 'off' });
    const suggest = el('div', { class: 'suggest hidden' });
    const amount = el('input', { type: 'text', inputmode: 'decimal', value: e.cents ? (e.cents / 100).toFixed(2).replace('.', ',') : '', placeholder: '0,00' });
    const date = el('input', { type: 'date', value: e.date });
    const time = el('input', { type: 'time', value: e.time || '' });
    const timeLabel = el('label', { class: 'grow' }, 'Uhrzeit', time);
    const dateText = el('span', null, 'Datum');
    const ahead = () => type === 'expense' && !!date.value && (date.value > todayStr() || (date.value === todayStr() && !!time.value && time.value > nowTime()));
    const plan = el('input', { type: 'checkbox', checked: entry ? !!entry.planned : true });
    let planTouched = !!entry;
    plan.addEventListener('change', () => { planTouched = true; refresh(); });
    const planBox = el('label', { class: 'toggle-row' }, el('span', null, '🗓 Als geplant speichern (noch nicht im Saldo)'), plan);
    const offerPlan = () => type === 'expense' && (ahead() || !!(entry && entry.planned));
    const future = () => offerPlan() && plan.checked;
    const cat = el('select');
    const payer = el('select');
    const noSplit = el('input', { type: 'checkbox', checked: e.noSplit });
    let splitTouched = !!entry;
    noSplit.addEventListener('change', () => (splitTouched = true));
    const note = el('input', { type: 'text', value: e.note || '', placeholder: 'Notiz (optional)' });
    const info = el('p', { class: 'hint' });
    const err = el('p', { class: 'form-info bad' });
    const catBox = el('label', null, 'Kategorie', cat);
    const splitText = el('span');
    const splitBox = el('label', { class: 'toggle-row' }, splitText, noSplit);
    const payerText = el('span', null, 'Bezahlt von');
    const payerLabel = el('label', null, payerText, payer);
    const quick = el('div', { class: 'quick' });

    const fillCats = (selected) => {
      const opts = type === 'income' ? [] : [el('option', { value: '', selected: !selected }, 'Keine')];
      cat.replaceChildren(...opts, ...catList(type).map((c) => el('option', { value: c.id, selected: c.id === selected }, `${c.icon} ${c.name}`)));
    };
    const fillPayers = (selected) => {
      const keys = future() ? [...PEOPLE, ''] : PEOPLE;
      payer.replaceChildren(...keys.map((k) => el('option', { value: k, selected: k === selected }, k ? nameOfKey(k) : PAYER_NONE)));
    };
    const refresh = () => {
      if (!planTouched && ahead()) plan.checked = true;
      const isPlanned = future();
      planBox.classList.toggle('hidden', !offerPlan());
      const keep = payer.value;
      if (isPlanned && payer.options.length !== 3) fillPayers(keep);
      else if (!isPlanned && payer.options.length !== 2) fillPayers(PEOPLE.includes(keep) ? keep : myKey());
      dateText.textContent = type === 'expense' ? 'Fälligkeit' : 'Datum';
      timeLabel.classList.toggle('hidden', isPlanned && date.value > todayStr());
      catBox.classList.toggle('hidden', type === 'settlement');
      splitBox.classList.toggle('hidden', type === 'settlement');
      splitText.textContent = type === 'income'
        ? `Nicht teilen (gehört allein ${payer.value ? nameOfKey(payer.value) : 'dem Empfänger'}, z. B. Gehalt)`
        : 'Gesamtkosten nicht teilen (andere Person schuldet alles)';
      quick.classList.toggle('hidden', !!entry || type !== 'expense' || !quick.children.length);
      payerText.textContent = type === 'income' ? 'Eingegangen bei (Konto von)' : type === 'settlement' ? 'Wer zahlt den Ausgleich?' : isPlanned ? 'Wird abgebucht von' : 'Bezahlt von';
      info.textContent = type === 'settlement' && payer.value
        ? `${nameOfKey(payer.value)} zahlt an ${nameOfKey(otherOf(payer.value))}`
        : isPlanned ? 'Wird als geplante Ausgabe vorgemerkt und erst eingerechnet, wenn du sie verbuchst.' : offerPlan() ? 'Wird sofort als Ausgabe eingerechnet.' : '';
      seg.replaceChildren(...[['expense', 'Ausgabe'], ['income', 'Einnahme'], ['settlement', 'Ausgleich']].map(([k, l]) =>
        el('button', { type: 'button', class: 'seg-btn' + (type === k ? ' active' : ''), onclick: () => {
          const prev = payer.value;
          type = k; catTouched = false;
          fillCats(k === 'income' ? 'sonstige-einnahme' : '');
          if (!splitTouched) noSplit.checked = false;
          if (k === 'settlement') {
            const b = balance(state.fin.entries);
            if (!title.value.trim()) title.value = 'Haushaltsausgleich';
            if (!amount.value.trim() && b) amount.value = (Math.abs(b) / 100).toFixed(2).replace('.', ',');
            fillPayers(b ? (b > 0 ? 'logi' : 'dudi') : prev);
          } else {
            if (title.value === 'Haushaltsausgleich') title.value = '';
            fillPayers(prev || myKey());
          }
          refresh();
        } }, l)));
    };
    fillCats(entry ? e.categoryId : e.categoryId || (type === 'income' ? 'sonstige-einnahme' : ''));
    fillPayers(e.payer);
    payer.addEventListener('change', refresh);
    date.addEventListener('change', refresh);
    time.addEventListener('change', refresh);
    cat.addEventListener('change', () => {
      catTouched = true;
      if (type === 'income' && !splitTouched) noSplit.checked = cat.value === 'gehalt';
    });

    quick.replaceChildren(...presets().map((p) => el('button', { type: 'button', class: 'chip', onclick: () => {
      title.value = p.title;
      catTouched = false;
      fillCats(p.categoryId ?? suggestCategory(p.title, state.fin.config.rules) ?? '');
      suggest.classList.add('hidden');
      amount.focus();
    } }, p.title)));

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

    const save = async (book) => {
      const cents = parseMoney(amount.value);
      const isPlanned = future() && !book;
      if (cents === null || cents === 0) return (err.textContent = 'Bitte einen gültigen Betrag eingeben.');
      if (!title.value.trim() && type !== 'settlement') return (err.textContent = 'Bitte einen Titel eingeben.');
      if (!date.value) return (err.textContent = 'Bitte ein Datum wählen.');
      if (!isPlanned && !payer.value) return (err.textContent = 'Bitte festlegen, von wem bezahlt wird.');
      await saveEntry(entry && entry.id, {
        type,
        title: title.value.trim() || 'Haushaltsausgleich',
        cents,
        date: book ? todayStr() : date.value,
        time: isPlanned && date.value > todayStr() ? '' : time.value || '',
        payer: payer.value,
        categoryId: type === 'settlement' ? 'ausgleich' : cat.value,
        noSplit: type !== 'settlement' && noSplit.checked,
        planned: isPlanned,
        note: note.value.trim()
      });
      close();
    };

    refresh();
    body.append(
      seg, quick,
      el('label', null, 'Titel', title), suggest,
      el('label', null, 'Betrag (€)', amount),
      el('div', { class: 'row' }, el('label', { class: 'grow' }, dateText, date), timeLabel),
      planBox, catBox, payerLabel, splitBox, info,
      el('label', null, 'Notiz', note), err,
      ...(entry && entry.planned ? [el('button', { class: 'btn primary wide', type: 'button', onclick: () => save(true) }, 'Jetzt als bezahlt verbuchen')] : []),
      el('div', { class: 'row between actions' },
        entry ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Eintrag löschen?', `„${e.title}“ wirklich löschen?`, 'Löschen')) { await removeEntry(entry.id); close(); }
        } }, 'Löschen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: () => save(false) }, 'Speichern'))
    );
  });
}

const barChart = (series, labels, colors) => {
  const max = Math.max(1, ...series.flat());
  const w = 100 / labels.length;
  const bars = labels.flatMap((_, i) => series.map((s, j) => {
    const h = Math.max(0, Math.round(((Number(s[i]) || 0) / max) * 100));
    const bw = (w * 0.8) / series.length;
    return `<rect x="${i * w + w * 0.1 + j * bw}" y="${100 - h}" width="${bw - 0.4}" height="${h}" rx="0.8" fill="${colors[j]}"/>`;
  })).join('');
  const box = el('div', { class: 'chart' });
  box.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Balkendiagramm">${bars}</svg>`;
  const axis = el('div', { class: 'chart-axis' }, ...labels.map((l) => el('span', null, l)));
  return el('div', null, box, axis);
};

const chipRow = (opts, cur, pick) => el('div', { class: 'chips small' }, ...opts.map(([k, l]) => el('button', { class: 'chip' + (cur === k ? ' active' : ''), type: 'button', onclick: () => pick(k) }, l)));

function monthsOf(p) {
  const now = new Date();
  if (/^\d{4}$/.test(p)) return Array.from({ length: 12 }, (_, i) => `${p}-${String(i + 1).padStart(2, '0')}`);
  const n = parseInt(p, 10) || 12;
  return Array.from({ length: n }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1).toLocaleDateString('sv-SE').slice(0, 7));
}

function renderOverview(root, view) {
  const { entries, recurring, config } = state.fin;
  const saldo = saldoText();
  const cur = todayStr().slice(0, 4);
  const first = entries.reduce((a, x) => (x.date < a ? x.date : a), `${cur}-01-01`).slice(0, 4);
  const years = [];
  for (let y = Number(cur); y >= Number(first); y--) years.push(String(y));
  const chartOpts = [['3', '3 Monate'], ['6', '6 Monate'], ['12', '12 Monate'], ...years.map((y) => [y, y])];
  const catOpts = [['1', 'Dieser Monat'], ['3', '3 Monate'], ['12', '12 Monate'], ...years.map((y) => [y, y])];
  const cp = view.chartP || '12', kp = view.catP || cur;
  const months = monthsOf(cp);
  const sum = (type, ym) => entries.filter((x) => !x.planned && x.type === type && monthOf(x.date) === ym).reduce((a, x) => a + x.cents, 0);
  const exp = months.map((m) => Math.max(0, sum('expense', m)) / 100);
  const inc = months.map((m) => Math.max(0, sum('income', m)) / 100);
  const labels = months.map((m) => monthLabel(m).slice(0, 3));

  const catMonths = new Set(monthsOf(kp));
  const byCat = {};
  for (const x of entries) if (!x.planned && x.type === 'expense' && catMonths.has(monthOf(x.date))) byCat[x.categoryId] = (byCat[x.categoryId] || 0) + x.cents;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));
  const rec = recurringSummary(recurring, config.salaries, todayStr().slice(0, 7));
  const plannedList = entries.filter((x) => x.planned);
  const plannedSum = plannedList.reduce((a, x) => a + x.cents, 0);
  const plannedDue = plannedList.filter(isDue).length;
  const goRec = () => { view.sub = 'laufend'; view.q = ''; view.redraw(); };

  root.replaceChildren(el('div', { class: 'grid stats' },
    el('section', { class: 'card saldo' },
      el('p', { class: 'hint' }, 'Saldo (ohne laufende Kosten)'),
      el('p', { class: 'saldo-text' }, saldo.text),
      saldo.cents ? el('p', { class: 'big-number' }, fmt(saldo.cents)) : null,
      el('div', { class: 'row wrap' },
        saldo.cents ? el('button', { class: 'btn ghost', type: 'button', onclick: () => {
          const b = balance(entries);
          openEntrySheet(null, { type: 'settlement', payer: b > 0 ? 'logi' : 'dudi', cents: Math.abs(b), title: 'Haushaltsausgleich' });
        } }, 'Ausgleich eintragen') : null,
        el('button', { class: 'btn primary', onclick: () => openEntrySheet(null) }, '+ Neuer Eintrag'))),
    el('section', { class: 'card tap', role: 'button', tabindex: '0', onclick: goRec },
      el('p', { class: 'hint' }, 'Laufende Kosten pro Monat'),
      el('p', { class: 'big-number' }, fmt(rec.total)),
      rec.total ? el('p', null, `${nameOfKey(rec.transfer.from)} überweist ${nameOfKey(rec.transfer.to)} ${fmt(rec.transfer.cents)} monatlich`) : null),
    ...(plannedList.length ? [el('section', { class: 'card tap' + (plannedDue ? ' due' : ''), role: 'button', tabindex: '0', onclick: () => { view.sub = 'geplant'; view.q = ''; view.redraw(); } },
      el('p', { class: 'hint' }, 'Geplante Ausgaben (noch nicht eingerechnet)'),
      el('p', { class: 'big-number' }, fmt(plannedSum)),
      plannedDue ? el('p', { class: 'due-text' }, `⚠️ ${plannedDue === 1 ? '1 ist fällig' : `${plannedDue} sind fällig`}: verbuchen oder löschen`) : null,
      el('p', { class: 'hint' }, `${plannedList.length} vorgemerkt – siehe Reiter „Geplant“`))] : [])),
    el('div', { class: 'grid top' },
    el('section', { class: 'card' },
      el('h2', null, /^\d{4}$/.test(cp) ? `Jahr ${cp}` : `Letzte ${cp} Monate`),
      chipRow(chartOpts, cp, (k) => { view.chartP = k; view.redraw(); }),
      el('p', { class: 'legend' }, el('span', { class: 'dot', style: { background: '#4d8dff' } }), ' Ausgaben  ', el('span', { class: 'dot', style: { background: '#5fd39a' } }), ' Einnahmen'),
      barChart([exp, inc], labels, ['#4d8dff', '#5fd39a'])),
    el('section', { class: 'card' },
      el('h2', null, `Ausgaben nach Kategorie ${/^\d{4}$/.test(kp) ? kp : kp === '1' ? '(dieser Monat)' : `(letzte ${kp} Monate)`}`),
      chipRow(catOpts, kp, (k) => { view.catP = k; view.redraw(); }),
      ...(cats.length ? cats.map(([id, c]) => {
        const cat = catOf('expense', id);
        return el('div', { class: 'cat-bar' }, circle(cat, true),
          el('div', { class: 'grow' }, el('div', { class: 'cat-bar-head' }, el('span', null, cat.name), el('span', null, fmt(c))),
            el('div', { class: 'bar' }, el('div', { class: 'bar-fill', style: { width: `${Math.max(2, (c / maxCat) * 100)}%`, background: cat.color } }))));
      }) : [el('p', { class: 'hint' }, 'Keine Ausgaben in diesem Zeitraum.')]))
  ));
}

function renderList(root, type, view) {
  const q = view.q.trim().toLowerCase();
  let list = state.fin.entries.filter((x) => !x.planned && (type === 'income' ? x.type === 'income' : x.type !== 'income'));
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

/* Geplante Ausgaben */
function renderPlanned(root) {
  const list = state.fin.entries.filter((x) => x.planned).sort((a, b) => a.date.localeCompare(b.date));
  const total = list.reduce((a, x) => a + x.cents, 0);
  root.replaceChildren(
    el('section', { class: 'card' },
      el('h2', null, 'Geplante Ausgaben'),
      el('p', { class: 'hint' }, 'Diese Ausgaben sind vorgemerkt, aber noch nicht abgebucht. Sie werden nicht in den Saldo eingerechnet und verschieben kein Geld, bis du sie als bezahlt verbuchst.'),
      list.length ? el('p', { class: 'big-number' }, fmt(total)) : null),
    ...(list.length ? list.map((x) => {
      const cat = catOf('expense', x.categoryId);
      const due = isDue(x);
      return el('button', { class: 'item fin-row' + (due ? ' due' : ''), type: 'button', onclick: () => openEntrySheet(x) },
        circle(cat),
        el('span', { class: 'grow fin-main' },
          el('span', { class: 'item-name' }, `${due ? '⚠️ ' : ''}${x.title}`),
          due ? el('span', { class: 'due-text' }, 'Fällig: verbuchen oder löschen') : null,
          el('span', { class: 'hint' }, `${new Date(x.date + 'T00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${x.payer ? `Konto ${nameOfKey(x.payer)}` : PAYER_NONE}${x.noSplit ? ' · nicht geteilt' : ''}`)),
        el('span', { class: 'amount' }, fmt(x.cents)));
    }) : [el('p', { class: 'empty' }, 'Nichts geplant. Tippe unten auf +.')])
  );
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
    const offset = el('input', { type: 'text', inputmode: 'decimal', value: r.weight && r.weight.logiOffsetPercent ? String(r.weight.logiOffsetPercent).replace('.', ',') : '' , placeholder: '0' });
    const offsetBox = el('label', null, `Zusatz-Ausgleich für ${nameOfKey('logi')} in Prozentpunkten (negativ = ${nameOfKey('logi')} zahlt weniger, z. B. wegen Zimmergröße)`, offset);
    const preview = el('p', { class: 'hint' });
    const pctBox = el('label', null, `Anteil ${nameOfKey('logi')} in %`, pct);
    const fixedBox = el('label', null, `Fester Anteil ${nameOfKey('logi')} (€ pro Monat)`, fixed);
    const vBox = el('div');
    const err = el('p', { class: 'form-info bad' });
    const newFrom = el('input', { type: 'month', value: todayStr().slice(0, 7) });
    const newAmt = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00' });

    const drawV = () => {
      versions.sort((a, b) => a.from.localeCompare(b.from));
      vBox.replaceChildren(...versions.map((v, i) => el('div', { class: 'edit-row' },
        el('span', { class: 'grow' }, `ab ${monthLabel(v.from)}`), el('strong', null, fmt(v.cents)),
        el('button', { class: 'icon-btn', type: 'button', onclick: () => { versions.splice(i, 1); drawV(); } }, '🗑'))));
    };
    const currentWeight = () => {
      const w = { mode: mode.value };
      if (mode.value === 'percent') w.logiPercent = parseFloat(pct.value.replace(',', '.')) || 50;
      if (mode.value === 'fixed') w.logiFixedCents = parseMoney(fixed.value) || 0;
      if (mode.value === 'salary') w.logiOffsetPercent = parseFloat(offset.value.replace(',', '.')) || 0;
      return w;
    };
    const drawMode = () => {
      pctBox.classList.toggle('hidden', mode.value !== 'percent');
      fixedBox.classList.toggle('hidden', mode.value !== 'fixed');
      offsetBox.classList.toggle('hidden', mode.value !== 'salary');
      const pc = logiShare(1000000, currentWeight(), state.fin.config.salaries) / 10000;
      preview.textContent = `Aktueller Anteil ${nameOfKey('logi')}: ${pc.toFixed(2).replace('.', ',')} % · ${nameOfKey('dudi')}: ${(100 - pc).toFixed(2).replace('.', ',')} %`;
    };
    [mode, pct, fixed, offset].forEach((i) => i.addEventListener(i === mode ? 'change' : 'input', drawMode));
    const intervalText = () => ({ 1: 'jeden Monat', 3: 'alle 3 Monate', 6: 'alle 6 Monate', 12: 'einmal im Jahr' }[Number(interval.value)] || 'je Zahlung');
    const amtHint = el('p', { class: 'hint' });
    const drawAmtHint = () => (amtHint.textContent = `Der Betrag gilt pro Abbuchung und wird ${intervalText()} abgebucht.`);
    interval.addEventListener('change', drawAmtHint);
    drawAmtHint();
    drawV(); drawMode();

    body.append(
      el('label', null, 'Bezeichnung', title),
      el('label', null, 'Abgebucht von Konto', payer),
      el('label', null, 'Zahlweise', interval),
      el('label', null, 'Gewichtung', mode), pctBox, fixedBox, offsetBox, preview,
      el('h3', null, 'Preisverlauf'),
      el('p', { class: 'hint' }, 'Ein neuer Preis gilt erst ab dem gewählten Monat. Ältere Zeiten bleiben unberührt.'),
      vBox,
      el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Gültig ab', newFrom), el('label', { class: 'grow' }, 'Betrag pro Abbuchung (€)', newAmt)),
      amtHint,
      el('button', { class: 'btn ghost wide', type: 'button', onclick: () => {
          const c = parseMoney(newAmt.value);
          if (c === null || !newFrom.value) return (err.textContent = 'Monat und Betrag prüfen.');
          err.textContent = '';
          const ex = versions.find((v) => v.from === newFrom.value);
          if (ex) ex.cents = c; else versions.push({ from: newFrom.value, cents: c });
          newAmt.value = '';
          drawV();
        } }, '+ Preis hinzufügen'),
      err,
      el('div', { class: 'row between actions' },
        rec ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Posten löschen?', `„${r.title}“ wirklich löschen?`, 'Löschen')) { await removeRecurring(rec.id); close(); }
        } }, 'Löschen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!title.value.trim()) return (err.textContent = 'Bitte eine Bezeichnung eingeben.');
          if (!versions.length) return (err.textContent = 'Bitte mindestens einen Preis eintragen.');
          const weight = currentWeight();
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
    const quick = (cfg.presets || DEFAULT_PRESETS).map((p) => ({ ...p }));
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
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { if (cats.length) { rules.push({ match: '', categoryId: cats[0].id }); draw(); } } }, '+ Regel'),
        el('h3', null, 'Schnellauswahl'),
        el('p', { class: 'hint' }, 'Diese Chips erscheinen beim Anlegen einer Ausgabe: ein Tipp setzt Titel und Kategorie.'),
        ...quick.map((q, i) => el('div', { class: 'edit-row' },
          el('input', { class: 'grow', value: q.title, oninput: (e) => (q.title = e.target.value) }),
          el('select', { onchange: (e) => (q.categoryId = e.target.value) }, el('option', { value: '' }, 'Keine'), ...cats.map((c) => el('option', { value: c.id, selected: c.id === q.categoryId }, `${c.icon} ${c.name}`))),
          el('button', { class: 'icon-btn', type: 'button', onclick: () => { quick.splice(i, 1); draw(); } }, '🗑'))),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { quick.push({ title: '', categoryId: '' }); draw(); } }, '+ Chip')
      );
    };
    draw();
    const file = el('input', { type: 'file', accept: 'application/json', class: 'hidden', onchange: async (e) => {
      if (e.target.files[0]) { await importFile(e.target.files[0]); close(); }
    } });
    body.append(area,
      el('div', { class: 'row end' }, el('button', { class: 'btn primary', onclick: async () => {
        if (!cats.some((c) => c.name.trim())) return;
        await saveFinConfig({ categories: cats.filter((c) => c.name.trim()), rules: rules.filter((r) => r.match.trim()), presets: quick.filter((q) => q.title.trim()) });
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
  const search = el('input', { type: 'search', class: 'search', placeholder: 'Suchen …', oninput: (e) => { view.q = e.target.value; drawContent(); } });
  const fab = el('button', { class: 'fab', type: 'button', 'aria-label': 'Neuer Eintrag', onclick: () => openEntrySheet(null, view.sub === 'einnahmen' ? { type: 'income' } : view.sub === 'geplant' ? { date: addDays(todayStr(), 1) } : null) }, icon('plus'));

  const SUBS = [['uebersicht', 'Übersicht'], ['ausgaben', 'Ausgaben'], ['einnahmen', 'Einnahmen'], ['geplant', 'Geplant'], ['laufend', 'Laufende Kosten']];
  function drawContent() {
    if (view.sub === 'uebersicht') renderOverview(content, view);
    else if (view.sub === 'laufend') renderRecurring(content);
    else if (view.sub === 'geplant') renderPlanned(content);
    else renderList(content, view.sub === 'einnahmen' ? 'income' : 'expense', view);
  }
  let toolSub = null;
  function draw() { keepChips(drawNow); }
  function drawNow() {
    subnav.replaceChildren(...SUBS.map(([k, l]) => el('button', { class: 'chip' + (view.sub === k ? ' active' : ''), onclick: () => { view.sub = k; view.q = ''; search.value = ''; view.monthsShown = 3; draw(); } }, l)),
      el('button', { class: 'chip gear', type: 'button', onclick: openFinSettings, 'aria-label': 'Einstellungen' }, icon('gear')));
    if (toolSub !== view.sub) {
      toolSub = view.sub;
      toolbar.replaceChildren(...(view.sub === 'ausgaben' || view.sub === 'einnahmen' ? [search] : []));
      toolbar.classList.toggle('hidden', !toolbar.children.length);
    }
    fab.classList.toggle('hidden', view.sub === 'laufend');
    root.classList.toggle('wide', view.sub === 'uebersicht');
    drawContent();
  }
  view.redraw = draw;
  root.replaceChildren(subnav, toolbar, content, fab);
  draw();
  return subscribe(draw);
}
