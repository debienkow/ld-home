/* Tab Home */
import { el, icon } from './dom.js';
import { myKey, nameOfKey, state, subscribe } from './store.js';
import { fmt, todayStr } from './finlogic.js';
import { openEntrySheet, saldoText } from './finance.js';
import { docRow, openDocSheet, recentDocs } from './dms.js';
import { eventRow, needsAnswer, openEventSheet, upcoming } from './events.js';

const dateDe = (iso) => new Date(iso + 'T00:00').toLocaleDateString('de-DE');
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Hallo' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Moin' : 'Guten Abend'; };

/* Kartenkopf: Titel führt in den Bereich */
const head = (id, title, go) =>
  el('button', { class: 'card-head', type: 'button', onclick: () => go(id) },
    icon(id), el('h2', { class: 'grow' }, title), el('span', { class: 'more' }, 'Öffnen ›'));

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
    const due = state.fin.entries.filter((x) => x.planned && x.date <= todayStr());
    const saldo = saldoText();
    const pending = upcoming().filter(needsAnswer);
    const rest = upcoming().filter((e) => !pending.includes(e));
    const sub = (t) => el('h3', { class: 'section-title card-sub' }, t);
    const rows = (list) => el('div', { class: 'card-list' }, ...list.map((e) => eventRow(e, null, true)));
    const docs = recentDocs(3);

    root.replaceChildren(
      el('div', { class: 'greet' },
        el('h1', { class: 'greeting' }, `${greeting()}, ${nameOfKey(myKey())} 👋`),
        el('p', { class: 'hint' }, new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }))),
      ...(due.length ? [el('section', { class: 'card note-card' },
        el('h2', null, due.length === 1 ? 'Geplante Ausgabe fällig' : `${due.length} geplante Ausgaben fällig`),
        el('p', { class: 'hint' }, 'Das Datum ist erreicht. Verbuche die Ausgabe, wenn sie wirklich bezahlt wurde, oder lösche sie.'),
        ...due.map((x) => el('button', { class: 'item fin-row', type: 'button', onclick: () => openEntrySheet(x) },
          el('span', { class: 'grow fin-main' }, el('span', { class: 'item-name' }, x.title), el('span', { class: 'hint' }, `fällig seit ${dateDe(x.date)}`)),
          el('span', { class: 'amount' }, fmt(x.cents)))))] : []),
      el('div', { class: 'grid' },
        el('section', { class: 'card' },
          head('einkauf', 'Einkaufsliste', go),
          el('p', { class: 'big-number' }, open.length === 1 ? '1 Artikel' : `${open.length} Artikel`),
          tags.length ? el('div', { class: 'tags' }, ...tags) : null,
          !open.length ? el('p', { class: 'hint' }, 'Nichts auf der Liste.') : null,
          el('button', { class: 'btn soft wide', type: 'button', onclick: () => go('einkauf') }, open.length ? 'Liste öffnen' : '+ Artikel hinzufügen')),
        el('section', { class: 'card' },
          head('finanzen', 'Finanzen', go),
          el('p', { class: 'saldo-text' }, saldo.text),
          saldo.cents ? el('p', { class: 'big-number' }, fmt(saldo.cents)) : null,
          el('button', { class: 'btn primary wide', type: 'button', onclick: () => openEntrySheet() }, '+ Neuer Eintrag')),
        el('section', { class: 'card' },
          head('events', 'Nächste Events', go),
          ...(pending.length ? [sub(`Ausstehende Einladungen (${pending.length})`), rows(pending)] : []),
          ...(rest.length ? [sub('Nächstes Event'), rows(rest.slice(0, 1))] : [el('p', { class: 'hint card-sub' }, pending.length ? 'Sonst keine anstehenden Termine.' : 'Keine anstehenden Termine.')]),
          ...(rest.length > 1 ? [sub('Demnächst'), rows(rest.slice(1, 4))] : []),
          el('button', { class: 'btn primary wide', type: 'button', onclick: () => openEventSheet() }, '+ Neuer Termin')),
        el('section', { class: 'card' },
          head('dms', 'Neueste Dokumente', go),
          el('div', { class: 'card-list' }, ...(docs.length ? docs.map(docRow) : [el('p', { class: 'hint' }, 'Noch keine Dokumente.')])),
          el('button', { class: 'btn primary wide', type: 'button', onclick: () => openDocSheet() }, '📷 Dokument aufnehmen')))
    );
  }
  render();
  return subscribe(render);
}
