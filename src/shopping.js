/* Tab Einkauf */
import { confirmSheet, el, icon, openSheet, swipeActions, toast, uid } from './dom.js';
import {
  addItem, catalogEntries, learn, norm, removeItem, removeStock, restoreItem, saveProfile, saveSettings, saveShopMeta, saveStock, setDone, setStockCount,
  showCatHeaders, state, stockEntries, stockKey, subscribe, updateItem
} from './store.js';

let selectedStore = '';
try {
  selectedStore = localStorage.getItem('ld-store') || '';
} catch (e) { /* ignorieren */ }

const catOf = (id) => state.settings.categories.find((c) => c.id === id) || state.settings.categories[state.settings.categories.length - 1];
const storeOf = (id) => state.settings.stores.find((s) => s.id === id);

/* Kreis mit Symbol */
export const iconCircle = (cat, size = '') =>
  el('span', { class: 'circle ' + size, style: { background: cat.color } }, cat.icon);

/* "Milch x2" oder "2x Milch" zerlegen */
function parseInput(text) {
  const t = text.trim();
  let m = t.match(/^(.*?)\s+x\s*(\d+)$/i) || t.match(/^(.*?)\s+(\d+)\s*x$/i);
  if (m) return { name: m[1].trim(), qty: m[2] + 'x' };
  m = t.match(/^(\d+)\s*x\s+(.+)$/i);
  if (m) return { name: m[2].trim(), qty: m[1] + 'x' };
  m = t.match(/^(.*?)\s+(\d+[.,]?\d*\s?(?:ml|l|g|kg|stk|pck|st))$/i);
  if (m) return { name: m[1].trim(), qty: m[2].trim() };
  return { name: t, qty: '' };
}

/* Kategorien in Reihenfolge des gewählten Ladens */
function orderedCategories() {
  const all = state.settings.categories;
  const store = storeOf(selectedStore);
  if (!store) return all;
  const ids = store.order || [];
  const first = ids.map((id) => all.find((c) => c.id === id)).filter(Boolean);
  const rest = all.filter((c) => !ids.includes(c.id));
  return [...first, ...rest];
}

export function mountShopping(root) {
  if (location.hash.replace('#', '') === 'einkauf/vorrat') return mountStock(root);
  const search = el('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Wir brauchen …',
    autocomplete: 'off',
    enterkeyhint: 'done'
  });
  const suggestBox = el('div', { class: 'suggest hidden' });
  const chips = el('div', { class: 'chips' });
  const doneBox = el('div');
  const listBox = el('div');
  const stockBox = el('div');
  let expiryTimer = null;

  /* Artikel hinzufügen */
  const add = (name, qty, categoryId) => {
    if (!name) return;
    const known = catalogEntries().find((e) => norm(e.name) === norm(name));
    addItem({ name: known ? known.name : name, qty, categoryId: categoryId || (known && known.categoryId) || 'sonstiges', owner: selectedStore === '__mine' ? state.user.uid : '' });
    search.value = '';
    renderSuggest();
  };

  function renderSuggest() {
    const raw = search.value;
    if (!raw.trim()) {
      suggestBox.classList.add('hidden');
      listBox.classList.remove('hidden');
      doneBox.classList.remove('hidden');
      stockBox.classList.remove('hidden');
      return;
    }
    const { name, qty } = parseInput(raw);
    const term = norm(name);
    const hits = catalogEntries()
      .filter((e) => norm(e.name).includes(term))
      .sort((a, b) => Number(!norm(a.name).startsWith(term)) - Number(!norm(b.name).startsWith(term)) || a.name.localeCompare(b.name))
      .slice(0, 8);
    const rows = hits.map((e) =>
      el('button', { class: 'suggest-row', type: 'button', onclick: () => add(e.name, qty, e.categoryId) },
        iconCircle(catOf(e.categoryId)), el('span', { class: 'grow' }, e.name), qty && el('span', { class: 'pill' }, qty))
    );
    if (!hits.some((e) => norm(e.name) === term)) {
      rows.push(
        el('button', { class: 'suggest-row new', type: 'button', onclick: () => add(name, qty) },
          el('span', { class: 'circle plus' }, '+'), el('span', { class: 'grow' }, `„${name}“ hinzufügen`))
      );
    }
    suggestBox.replaceChildren(...rows);
    suggestBox.classList.remove('hidden');
    listBox.classList.add('hidden');
    doneBox.classList.add('hidden');
    stockBox.classList.add('hidden');
  }

  search.addEventListener('input', renderSuggest);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && search.value.trim()) {
      const { name, qty } = parseInput(search.value);
      const exact = catalogEntries().find((x) => norm(x.name) === norm(name));
      add(name, qty, exact && exact.categoryId);
    }
  });

  function renderChips() {
    const mk = (id, label) =>
      el('button', {
        class: 'chip' + (selectedStore === id ? ' active' : ''),
        type: 'button',
        onclick: () => {
          selectedStore = id;
          try { localStorage.setItem('ld-store', id); } catch (e) { /* ignorieren */ }
          render();
        }
      }, label);
    chips.replaceChildren(
      mk('', 'Alle'),
      ...state.settings.stores.map((s) => mk(s.id, s.name)),
      mk('__mine', '🔒 Nur meine'),
      el('button', { class: 'chip gear', type: 'button', onclick: openSettings, 'aria-label': 'Einkauf-Einstellungen' }, icon('gear'))
    );
  }

  const drop = (item) => {
    removeItem(item.id);
    toast(`„${item.name}“ gelöscht`, { action: 'Rückgängig', onAction: () => restoreItem(item) });
  };

  function row(item, done) {
    const cat = catOf(item.categoryId);
    const store = storeOf(item.store);
    const inner = el('div', { class: 'item' + (done ? ' done' : '') },
      el('button', { class: 'item-main', type: 'button', onclick: () => openItemSheet(item) },
        iconCircle(cat),
        el('span', { class: 'item-name' }, `${item.owner ? '🔒 ' : ''}${item.name}`),
        item.qty && el('span', { class: 'pill' }, item.qty),
        store && el('span', { class: 'tag' }, store.name)),
      el('button', { class: 'check-btn' + (done ? ' on' : ''), type: 'button', 'aria-label': done ? `${item.name} wieder auf die Liste` : `${item.name} abhaken`, onclick: () => { setDone(item.id, !done); } }, icon(done ? 'undo' : 'check'))
    );
    return swipeActions(inner, { onLeft: () => drop(item), onRight: () => setDone(item.id, !done), rightLabel: done ? '↩ Wieder auf die Liste' : '✓ Abgehakt' });
  }

  function render() {
    if (selectedStore && selectedStore !== '__mine' && !storeOf(selectedStore)) selectedStore = '';
    renderChips();
    const items = state.items;
    const keepMs = (state.settings.doneMinutes ?? 60) * 60000;
    const now = Date.now();
    const doneItems = items.filter((i) => i.done && (!keepMs || (i.doneAt || 0) > now - keepMs)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    clearTimeout(expiryTimer);
    if (keepMs && doneItems.length) {
      const next = Math.min(...doneItems.map((i) => (i.doneAt || 0) + keepMs)) - now;
      expiryTimer = setTimeout(render, Math.max(1000, Math.min(next + 500, 2147000000)));
    }
    doneBox.replaceChildren(
      el('h3', { class: 'section-title' }, 'Zuletzt abgehakt'),
      ...(doneItems.length ? doneItems.map((i) => row(i, true)) : [el('p', { class: 'hint empty-line' }, 'Derzeit keine Einträge.')])
    );

    const open = items.filter((i) => !i.done && (selectedStore === '__mine' ? !!i.owner : !selectedStore || !i.store || i.store === selectedStore));
    const blocks = [];
    for (const cat of orderedCategories()) {
      const inCat = open.filter((i) => (catOf(i.categoryId).id) === cat.id).sort((a, b) => a.name.localeCompare(b.name));
      if (!inCat.length) continue;
      blocks.push(...(showCatHeaders() ? [el('h3', { class: 'section-title cat' }, iconCircle(cat, 'small'), cat.name)] : []), ...inCat.map((i) => row(i, false)));
    }
    renderStockCard();
    listBox.replaceChildren(...(blocks.length ? blocks : [el('p', { class: 'empty' }, selectedStore === '__mine' ? 'Keine privaten Artikel. Artikel antippen und „Nur für mich anzeigen“ wählen.' : selectedStore && items.some((i) => !i.done) ? 'Für diesen Laden steht nichts auf der Liste.' : 'Die Liste ist leer. Tippe oben ein, was ihr braucht.')]));
    if (search.value.trim()) renderSuggest();
  }

  function openItemSheet(item) {
    openSheet(item.name, (body, close) => {
      const qty = el('input', { type: 'text', value: item.qty || '', placeholder: 'z. B. 2x oder 400 ml' });
      const cat = el('select', null, ...state.settings.categories.map((c) => el('option', { value: c.id, selected: c.id === item.categoryId }, `${c.icon} ${c.name}`)));
      const store = el('select', null,
        el('option', { value: '' }, 'Alle Läden'),
        ...state.settings.stores.map((s) => el('option', { value: s.id, selected: s.id === item.store }, `Nur ${s.name}`)));
      const priv = el('input', { type: 'checkbox', checked: !!item.owner });
      body.append(
        el('label', null, 'Menge', qty),
        el('label', null, 'Kategorie', cat),
        el('label', null, 'Laden', store),
        el('label', { class: 'toggle-row' }, el('span', null, '🔒 Nur für mich anzeigen'), priv),
        el('div', { class: 'row between actions' },
          el('button', { class: 'btn danger', type: 'button', onclick: () => { close(); drop(item); } }, 'Löschen'),
          el('button', { class: 'btn primary', onclick: () => {
            updateItem(item.id, { qty: qty.value.trim(), categoryId: cat.value, store: store.value || null, owner: priv.checked ? state.user.uid : '' });
            if (cat.value !== item.categoryId) learn(item.name, cat.value);
            close();
          } }, 'Speichern'))
      );
    });
  }

  function renderStockCard() {
    const list = stockEntries();
    const low = list.filter((x) => isLow(x.stock));
    stockBox.replaceChildren(
      el('h3', { class: 'section-title' }, 'Vorrat'),
      el('button', { class: 'card stock-card', type: 'button', onclick: () => { fromList = true; location.hash = 'einkauf/vorrat'; } },
        el('span', { class: 'circle' , style: { background: 'var(--card-2)' } }, '📦'),
        el('span', { class: 'grow fin-main' },
          el('span', { class: 'item-name' }, list.length ? `${list.length} Artikel im Vorrat` : 'Vorrat einrichten'),
          el('span', { class: 'hint' }, `Letzte Prüfung: ${checkedText()}${low.length ? ` · ${low.length} nachkaufen` : ''}`)),
        el('span', { class: 'chev' }, '›')));
  }

  root.replaceChildren(
    el('div', { class: 'search-wrap' }, search),
    chips, suggestBox, listBox, doneBox, stockBox
  );
  render();
  const unsub = subscribe(render);
  return () => { clearTimeout(expiryTimer); unsub(); };
}

/* Vorrat */
const num = (v) => { const n = parseInt(String(v).replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : null; };
const isLow = (s) => s && Number.isFinite(s.count) && s.count <= (s.min || 0);
const stockSorted = () => {
  const order = state.settings.categories.map((c) => c.id);
  const places = state.settings.places.map((p) => p.id);
  const pIdx = (x) => { const i = places.indexOf(x.stock.place); return i < 0 ? places.length : i; };
  return stockEntries().sort((a, b) => (pIdx(a) - pIdx(b)) || (order.indexOf(catOf(a.categoryId).id) - order.indexOf(catOf(b.categoryId).id)) || a.name.localeCompare(b.name, 'de'));
};
const onList = (name) => state.items.some((i) => !i.done && norm(i.name) === norm(name));
function checkedText() {
  const t = state.settings.stockCheckedAt;
  if (!t) return 'noch nie';
  const d = new Date(t);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  const rel = days === 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`;
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} (${rel})`;
}
const numInput = (value, placeholder) => el('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', value: value ?? '', placeholder: placeholder || '', oninput: (e) => { const v = e.target.value.replace(/\D/g, ''); if (v !== e.target.value) e.target.value = v; } });

let fromList = false;
const placeOf = (id) => state.settings.places.find((p) => p.id === id);

/* Vorrat als eigene Seite im Einkauf */
function mountStock(root) {
  const back = () => { if (fromList) { fromList = false; history.back(); } else location.hash = 'einkauf'; };
  const draw = () => {
    const list = stockSorted();
    let lastPlace = null;
    const rows = list.flatMap((x) => {
      const s = x.stock;
      const low = isLow(s);
      const pl = placeOf(s.place);
      const head = (pl ? pl.id : '') !== lastPlace ? [el('h3', { class: 'section-title place' }, pl ? `📍 ${pl.name}` : 'Ohne Lagerort')] : [];
      lastPlace = pl ? pl.id : '';
      return [...head, el('button', { class: 'item fin-row stock-row' + (low ? ' low' : ''), type: 'button', onclick: () => openStockItem(x) },
        iconCircle(catOf(x.categoryId)),
        el('span', { class: 'grow fin-main' },
          el('span', { class: 'item-name' }, x.name),
          el('span', { class: 'hint' }, `Nachkaufen ab ${s.min || 0}${onList(x.name) ? ' · steht auf der Liste' : ''}`)),
        el('span', { class: 'stock-count' }, el('b', null, Number.isFinite(s.count) ? String(s.count) : '–'), ` / ${s.target || 0}`))];
    });
    root.replaceChildren(
      el('div', { class: 'page-head' },
        el('button', { class: 'icon-btn back-btn', type: 'button', 'aria-label': 'Zurück zum Einkauf', onclick: back }, '‹'),
        el('h2', null, 'Vorrat')),
      el('div', { class: 'stock-head card' },
        el('span', { class: 'hint' }, 'Letzte Prüfung'),
        el('strong', null, checkedText())),
      el('button', { class: 'btn primary wide stock-check-btn', type: 'button', disabled: !list.length, onclick: runCheck }, '✓ Vorrat aktualisieren'),
      ...(rows.length ? rows : [el('p', { class: 'empty' }, 'Noch nichts im Vorrat. Lege mit + Artikel an, die ihr immer zu Hause haben wollt, z. B. Klopapier oder Hafermilch.')]),
      el('button', { class: 'fab', type: 'button', 'aria-label': 'Neuer Vorrat-Artikel', onclick: () => openStockItem(null) }, icon('plus')));
  };
  draw();
  return subscribe(draw);
}

/* Vorrat-Artikel anlegen oder bearbeiten */
function openStockItem(entry) {
  const s = (entry && entry.stock) || {};
  openSheet(entry ? entry.name : 'Neuer Vorrat-Artikel', (body, close) => {
    const name = el('input', { type: 'text', value: entry ? entry.name : '', placeholder: 'z. B. Hafermilch', autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'next' });
    const sugg = el('div', { class: 'suggest stock-sugg hidden' });
    const cat = el('select', null, ...state.settings.categories.map((c) => el('option', { value: c.id, selected: c.id === (entry ? entry.categoryId : 'sonstiges') }, `${c.icon} ${c.name}`)));
    const pick = (e) => {
      name.value = e.name;
      cat.value = catOf(e.categoryId).id;
      sugg.classList.add('hidden');
    };
    const drawSugg = () => {
      const term = norm(name.value);
      if (!term) return sugg.classList.add('hidden');
      const taken = new Set(stockEntries().filter((x) => !entry || x.key !== entry.key).map((x) => norm(x.name)));
      const hits = catalogEntries()
        .filter((e) => norm(e.name).includes(term) && norm(e.name) !== term && !taken.has(norm(e.name)))
        .sort((a, b) => Number(!norm(a.name).startsWith(term)) - Number(!norm(b.name).startsWith(term)) || a.name.localeCompare(b.name, 'de'))
        .slice(0, 4);
      sugg.replaceChildren(...hits.map((e) => el('button', { class: 'suggest-row', type: 'button', onmousedown: (ev) => ev.preventDefault(), onclick: () => pick(e) },
        iconCircle(catOf(e.categoryId), 'small'), el('span', { class: 'grow' }, e.name))));
      sugg.classList.toggle('hidden', !hits.length);
    };
    name.addEventListener('input', () => {
      drawSugg();
      const known = !entry && catalogEntries().find((e) => norm(e.name) === norm(name.value));
      if (known) cat.value = catOf(known.categoryId).id;
    });
    name.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); sugg.classList.add('hidden'); target.focus(); } });
    name.addEventListener('blur', () => setTimeout(() => sugg.classList.add('hidden'), 150));
    const target = numInput(s.target, 'z. B. 8');
    const min = numInput(s.min, 'z. B. 2');
    const place = el('select', null,
      el('option', { value: '' }, 'Kein Lagerort'),
      ...state.settings.places.map((x) => el('option', { value: x.id, selected: x.id === s.place }, x.name)));
    const store = el('select', null,
      el('option', { value: '' }, 'Alle Läden'),
      ...state.settings.stores.map((x) => el('option', { value: x.id, selected: x.id === s.store }, `Nur ${x.name}`)));
    const err = el('p', { class: 'form-info bad' });
    body.closest('.sheet').classList.add('tall');
    body.append(
      el('div', { class: 'stock-name' }, el('label', null, 'Artikel', name), sugg),
      el('label', null, 'Kategorie', cat),
      el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Wunschvorrat', target), el('label', { class: 'grow' }, 'Nachkaufen ab', min)),
      el('p', { class: 'hint' }, 'Liegt der Bestand bei der Prüfung bei „Nachkaufen ab“ oder darunter, kommt der Artikel mit der Menge „Vorrat“ auf die Einkaufsliste.'),
      el('label', null, 'Lagerort', place),
      el('label', null, 'Laden', store),
      err,
      el('div', { class: 'row between actions' },
        entry ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Aus dem Vorrat entfernen?', `„${entry.name}“ wird aus der Vorratsliste entfernt. Die Einkaufsliste bleibt unverändert.`, 'Entfernen')) { await removeStock(entry.key); close(); }
        } }, 'Entfernen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const n = name.value.trim();
          const t = num(target.value), m = num(min.value) ?? 0;
          if (!n) return (err.textContent = 'Bitte einen Artikel eingeben.');
          if (!t) return (err.textContent = 'Bitte einen Wunschvorrat von mindestens 1 eingeben.');
          if (m >= t) return (err.textContent = '„Nachkaufen ab“ muss kleiner als der Wunschvorrat sein.');
          const key = stockKey(n);
          const other = state.learned.get(key);
          if (other && other.stock && (!entry || entry.key !== key)) return (err.textContent = 'Dieser Artikel steht schon im Vorrat.');
          await saveStock(entry && entry.key, n, cat.value, { target: t, min: m, place: place.value || '', store: store.value || '' });
          close();
        } }, 'Speichern'))
    );
  });
}

/* Vorrat prüfen: Artikel für Artikel nur die Zahl eingeben */
function runCheck() {
  const list = stockSorted();
  if (!list.length) return;
  let idx = 0;
  const entered = new Map();
  const added = [];
  const keep = (e) => e.preventDefault();
  openSheet('Vorrat prüfen', (body, close) => {
    const step = el('p', { class: 'hint stock-step' });
    const title = el('div', { class: 'stock-check-name' });
    const input = numInput('', '');
    input.classList.add('stock-input');
    input.setAttribute('enterkeyhint', 'next');
    input.setAttribute('aria-label', 'Bestand');
    const of = el('span', { class: 'stock-of' });
    const info = el('p', { class: 'hint' });
    const back = el('button', { class: 'btn ghost', type: 'button', onmousedown: keep, onclick: () => { if (idx > 0) { idx--; show(); } } }, 'Zurück');
    const next = el('button', { class: 'btn primary', type: 'button', onmousedown: keep, onclick: () => confirm() });
    const finish = () => {
      saveShopMeta({ stockCheckedAt: Date.now() });
      close();
      toast(added.length ? `Vorrat geprüft. Auf die Einkaufsliste: ${added.join(', ')}` : 'Vorrat geprüft. Alles ausreichend da.', { ms: 6000 });
    };
    function show() {
      const x = list[idx];
      const s = x.stock;
      const pl = placeOf(s.place);
      step.textContent = `${idx + 1} von ${list.length}${pl ? ` · 📍 ${pl.name}` : ''}`;
      title.replaceChildren(iconCircle(catOf(x.categoryId)), el('span', null, x.name));
      of.textContent = `/ ${s.target || 0}`;
      info.textContent = `Nachkaufen ab ${s.min || 0}${Number.isFinite(s.count) ? ` · zuletzt ${s.count}` : ''}. Leer lassen überspringt.`;
      input.value = entered.has(x.key) ? String(entered.get(x.key)) : '';
      back.disabled = idx === 0;
      next.replaceChildren(idx === list.length - 1 ? '✓ Fertig' : '✓ Weiter');
      input.focus({ preventScroll: true });
    }
    function confirm() {
      const x = list[idx];
      const n = num(input.value);
      if (n !== null) {
        entered.set(x.key, n);
        setStockCount(x.key, n);
        if (n <= (x.stock.min || 0) && !onList(x.name) && !added.includes(x.name)) {
          addItem({ name: x.name, qty: 'Vorrat', categoryId: x.categoryId, store: x.stock.store || null });
          added.push(x.name);
        }
      }
      if (idx >= list.length - 1) return finish();
      idx++;
      show();
    }
    body.append(step, title, el('div', { class: 'stock-entry' }, input, of), info,
      el('div', { class: 'row between actions' }, back, next));
    show();
  });
  const i = document.querySelector('.stock-input');
  if (i) i.focus();
}

/* Einstellungen: Kategorien und Läden */
function openSettings() {
  openSheet('Einkauf einrichten', (body, close) => {
    const cats = state.settings.categories.map((c) => ({ ...c }));
    const stores = state.settings.stores.map((s) => ({ ...s, order: [...(s.order || [])] }));
    const places = state.settings.places.map((p) => ({ ...p }));
    const area = el('div');
    const headerToggle = el('label', { class: 'toggle-row' },
      el('span', null, 'Kategorie-Überschriften anzeigen'),
      el('input', { type: 'checkbox', checked: showCatHeaders(), onchange: (e) => saveProfile({ showCatHeaders: e.target.checked }) }));
    const doneMin = numInput(String(state.settings.doneMinutes ?? 60), '60');
    const doneRow = el('div', null,
      el('label', null, '„Zuletzt abgehakt“ ausblenden nach (Minuten)', doneMin),
      el('p', { class: 'hint' }, 'Abgehakte Artikel verschwinden nach dieser Zeit von selbst aus „Zuletzt abgehakt“. 0 = nie ausblenden.'));

    const openStores = new Set();
    const move = (arr, i, d) => {
      const j = i + d;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      draw();
    };

    function draw() {
      const catRows = cats.map((c, i) =>
        el('div', { class: 'edit-row' },
          el('input', { class: 'emoji', value: c.icon, maxlength: '4', oninput: (e) => (c.icon = e.target.value) }),
          el('input', { class: 'grow', value: c.name, oninput: (e) => (c.name = e.target.value) }),
          el('input', { type: 'color', value: c.color, oninput: (e) => (c.color = e.target.value) }),
          el('button', { class: 'icon-btn', type: 'button', onclick: () => move(cats, i, -1) }, '↑'),
          el('button', { class: 'icon-btn', type: 'button', onclick: () => move(cats, i, 1) }, '↓'),
          el('button', { class: 'icon-btn', type: 'button', onclick: () => { cats.splice(i, 1); draw(); } }, '🗑')
        )
      );
      const storeBlocks = stores.map((s, si) => {
        const ids = [...s.order.filter((id) => cats.some((c) => c.id === id)), ...cats.map((c) => c.id).filter((id) => !s.order.includes(id))];
        s.order = ids;
        const det = el('details', { class: 'store-edit', open: openStores.has(s.id), ontoggle: (e) => { if (e.target.open) openStores.add(s.id); else openStores.delete(s.id); } },
          el('summary', null, s.name),
          el('div', { class: 'edit-row' },
            el('input', { class: 'grow', value: s.name, oninput: (e) => (s.name = e.target.value) }),
            el('button', { class: 'icon-btn', type: 'button', onclick: () => { stores.splice(si, 1); draw(); } }, '🗑')),
          el('p', { class: 'hint' }, 'Reihenfolge im Laden (von Eingang bis Kasse):'),
          ...ids.map((id, i) => {
            const c = cats.find((x) => x.id === id);
            return el('div', { class: 'edit-row' },
              el('span', { class: 'grow' }, `${c.icon} ${c.name}`),
              el('button', { class: 'icon-btn', type: 'button', onclick: () => move(s.order, i, -1) }, '↑'),
              el('button', { class: 'icon-btn', type: 'button', onclick: () => move(s.order, i, 1) }, '↓'));
          })
        );
        return det;
      });
      area.replaceChildren(
        el('h3', null, 'Kategorien'), ...catRows,
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { cats.push({ id: 'k' + uid(), name: 'Neu', icon: '🛒', color: '#9aa0a6' }); draw(); } }, '+ Kategorie'),
        el('h3', null, 'Läden'), ...storeBlocks,
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { stores.push({ id: 's' + uid(), name: 'Neuer Laden', order: cats.map((c) => c.id) }); draw(); } }, '+ Laden'),
        el('h3', null, 'Lagerorte (Vorrat)'),
        el('p', { class: 'hint' }, 'Die Reihenfolge bestimmt die Sortierung der Vorratsliste und der Prüfung.'),
        ...places.map((p, i) => el('div', { class: 'edit-row' },
          el('input', { class: 'grow', value: p.name, oninput: (e) => (p.name = e.target.value) }),
          el('button', { class: 'icon-btn', type: 'button', onclick: () => move(places, i, -1) }, '↑'),
          el('button', { class: 'icon-btn', type: 'button', onclick: () => move(places, i, 1) }, '↓'),
          el('button', { class: 'icon-btn', type: 'button', onclick: () => { places.splice(i, 1); draw(); } }, '🗑'))),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { places.push({ id: 'o' + uid(), name: 'Neuer Ort' }); draw(); } }, '+ Lagerort')
      );
    }
    draw();
    body.prepend(headerToggle, doneRow);
    body.append(area, el('div', { class: 'row end actions' },
      el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!cats.some((c) => c.name.trim())) return;
        const dm = num(doneMin.value);
        await saveSettings({ categories: cats.filter((c) => c.name.trim()), stores: stores.filter((s) => s.name.trim()), places: places.filter((p) => p.name.trim()), doneMinutes: dm === null ? 60 : dm });
        close();
      } }, 'Speichern')));
  });
}
