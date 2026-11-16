/* Tab Home */
import { el } from './dom.js';
import { state, subscribe } from './store.js';
import { fmt } from './finlogic.js';
import { openEntrySheet, saldoText } from './finance.js';

const soon = (title, icon, text) =>
  el('section', { class: 'card muted' },
    el('h2', null, `${icon} ${title}`), el('p', null, text));

export function mountHome(root, go) {
  function render() {
    const open = state.items.filter((i) => !i.done);
    const byStore = {};
    for (const i of open) {
      if (!i.store) continue;
      const s = state.settings.stores.find((x) => x.id === i.store);
      if (s) byStore[s.name] = (byStore[s.name] || 0) + 1;
    }
    const tags = Object.entries(byStore).map(([n, c]) => el('span', { class: 'tag big' }, `${n}: ${c}`));

    root.replaceChildren(
      el('section', { class: 'card', onclick: () => go('einkauf') },
        el('h2', null, '🛒 Einkauf'),
        el('p', { class: 'big-number' }, open.length === 1 ? '1 Artikel' : `${open.length} Artikel`),
        tags.length && el('div', { class: 'tags' }, ...tags),
        !open.length && el('p', { class: 'hint' }, 'Nichts auf der Liste.')),
      el('section', { class: 'card' },
        el('h2', { onclick: () => go('finanzen') }, '💶 Finanzen'),
        el('p', { class: 'saldo-text' }, saldoText().text),
        saldoText().cents ? el('p', { class: 'big-number' }, fmt(saldoText().cents)) : null,
        el('button', { class: 'btn primary wide', onclick: () => openEntrySheet() }, '+ Neuer Eintrag')),
      soon('Events', '📅', 'Kommt danach: gemeinsame Termine, Zu- und Absagen, Ideenliste.'),
      soon('Dokumente', '🗂', 'Kommt später: Dokumente fotografieren, ablegen und durchsuchen.')
    );
  }
  render();
  return subscribe(render);
}

export function mountSoon(root, title, text) {
  root.replaceChildren(el('section', { class: 'card muted' }, el('h2', null, title), el('p', null, text)));
  return () => {};
}
