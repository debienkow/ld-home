/* Tab Einkauf */
import { el, icon, openSheet, swipeActions, toast, uid } from './dom.js';
import {
  addItem, catalogEntries, learn, norm, removeItem, restoreItem, saveProfile, saveSettings, setDone, showCatHeaders, state, subscribe, updateItem
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
    const doneItems = items.filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 12);
    doneBox.replaceChildren(
      ...(doneItems.length
        ? [el('h3', { class: 'section-title' }, 'Zuletzt abgehakt'), ...doneItems.map((i) => row(i, true))]
        : [])
    );

    const open = items.filter((i) => !i.done && (selectedStore === '__mine' ? !!i.owner : !selectedStore || !i.store || i.store === selectedStore));
    const blocks = [];
    for (const cat of orderedCategories()) {
      const inCat = open.filter((i) => (catOf(i.categoryId).id) === cat.id).sort((a, b) => a.name.localeCompare(b.name));
      if (!inCat.length) continue;
      blocks.push(...(showCatHeaders() ? [el('h3', { class: 'section-title cat' }, iconCircle(cat, 'small'), cat.name)] : []), ...inCat.map((i) => row(i, false)));
    }
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

  root.replaceChildren(
    el('div', { class: 'search-wrap' }, search),
    chips, suggestBox, listBox, doneBox
  );
  render();
  return subscribe(render);
}

/* Einstellungen: Kategorien und Läden */
function openSettings() {
  openSheet('Einkauf einrichten', (body, close) => {
    const cats = state.settings.categories.map((c) => ({ ...c }));
    const stores = state.settings.stores.map((s) => ({ ...s, order: [...(s.order || [])] }));
    const area = el('div');
    const headerToggle = el('label', { class: 'toggle-row' },
      el('span', null, 'Kategorie-Überschriften anzeigen'),
      el('input', { type: 'checkbox', checked: showCatHeaders(), onchange: (e) => saveProfile({ showCatHeaders: e.target.checked }) }));

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
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { stores.push({ id: 's' + uid(), name: 'Neuer Laden', order: cats.map((c) => c.id) }); draw(); } }, '+ Laden')
      );
    }
    draw();
    body.prepend(headerToggle);
    body.append(area, el('div', { class: 'row end actions' },
      el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!cats.some((c) => c.name.trim())) return;
        await saveSettings({ categories: cats.filter((c) => c.name.trim()), stores: stores.filter((s) => s.name.trim()) });
        close();
      } }, 'Speichern')));
  });
}
