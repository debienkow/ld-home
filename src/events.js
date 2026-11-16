/* Tab Events */
import { confirmSheet, el, openSheet, swipeDelete, uid } from './dom.js';
import {
  addDays, covers, DEFAULT_EVENT_CATEGORIES, downloadIcs, endOf, googleLink, isoOf, parseIso, rangeText, RSVP, todayIso, workdays
} from './evlogic.js';
import { myKey, nameOfKey, removeEvent, removeIdea, saveEvConfig, saveEvent, saveIdea, state, subscribe } from './store.js';
import { PEOPLE } from './finlogic.js';
import { navLink, placeField } from './places.js';

const cats = () => state.ev.config.categories || DEFAULT_EVENT_CATEGORIES;
const catOf = (id) => cats().find((c) => c.id === id) || cats()[cats().length - 1];
const circle = (cat, small) => el('span', { class: 'circle' + (small ? ' small' : ''), style: { background: cat.color } }, cat.icon);
const parts = (e) => e.participants || PEOPLE;
const myRsvp = (e) => (e.rsvp && e.rsvp[myKey()]) || '';
export const needsAnswer = (e) => endOf(e) >= todayIso() && parts(e).includes(myKey()) && !myRsvp(e);

export function upcoming(limit) {
  const t = todayIso();
  const list = state.ev.events.filter((e) => endOf(e) >= t).sort((a, b) => a.start.localeCompare(b.start) || (a.startTime || '').localeCompare(b.startTime || ''));
  return limit ? list.slice(0, limit) : list;
}

const badges = (e) => el('span', { class: 'rsvp-badges' }, ...parts(e).map((k) => {
  const v = (e.rsvp && e.rsvp[k]) || '';
  return el('span', { class: 'rsvp rsvp-' + (v || 'open'), title: `${nameOfKey(k)}: ${RSVP[v][1]}` }, `${nameOfKey(k).charAt(0)}${RSVP[v][0]}`);
}));

export function eventRow(e, onclick) {
  const days = (e.vacation || []).length ? workdays(e.start, endOf(e)) : 0;
  return el('button', { class: 'item fin-row ev-row' + (e.important ? ' important' : ''), type: 'button', onclick: onclick || (() => openEventSheet(e)) },
    circle(catOf(e.categoryId)),
    el('span', { class: 'grow fin-main' },
      el('span', { class: 'item-name' }, `${e.important ? '⭐ ' : ''}${e.title}`),
      el('span', { class: 'hint' }, `${rangeText(e)}${e.location ? ` · ${e.location.split(',')[0]}` : ''}${days ? ` · Urlaub ${days} ${days === 1 ? 'Tag' : 'Tage'}` : ''}`)),
    badges(e));
}

/* Termin anlegen, ansehen, bearbeiten */
export function openEventSheet(event, preset) {
  const me = myKey();
  const e = event || { title: '', categoryId: 'treffen', start: todayIso(), end: '', allDay: true, startTime: '', endTime: '', location: '', note: '', important: false, participants: [...PEOPLE], vacation: [], ...(preset || {}) };
  openSheet(event ? e.title : 'Neuer Termin', (body, close) => {
    const title = el('input', { type: 'text', value: e.title, placeholder: 'z. B. Konzert' });
    const cat = el('select', null, ...cats().map((c) => el('option', { value: c.id, selected: c.id === e.categoryId }, `${c.icon} ${c.name}`)));
    const allDay = el('input', { type: 'checkbox', checked: e.allDay !== false });
    const start = el('input', { type: 'date', value: e.start });
    const end = el('input', { type: 'date', value: endOf(e) });
    const startTime = el('input', { type: 'time', value: e.startTime || '' });
    const endTime = el('input', { type: 'time', value: e.endTime || '' });
    let place = { text: e.location || '', lat: e.lat ?? null, lon: e.lon ?? null };
    const locField = placeField(place.text, place, (p) => (place = p));
    const note = el('input', { type: 'text', value: e.note || '', placeholder: 'Notiz (optional)' });
    const important = el('input', { type: 'checkbox', checked: !!e.important });
    const who = Object.fromEntries(PEOPLE.map((k) => [k, el('input', { type: 'checkbox', checked: parts(e).includes(k) })]));
    const vac = Object.fromEntries(PEOPLE.map((k) => [k, el('input', { type: 'checkbox', checked: (e.vacation || []).includes(k) })]));
    const timesRow = el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Beginn (Uhrzeit)', startTime), el('label', { class: 'grow' }, 'Ende (Uhrzeit)', endTime));
    const vacInfo = el('p', { class: 'hint' });
    const err = el('p', { class: 'form-info bad' });

    const refresh = () => {
      timesRow.classList.toggle('hidden', allDay.checked);
      const n = workdays(start.value || e.start, (end.value && end.value >= start.value ? end.value : start.value) || e.start);
      vacInfo.textContent = `Zählt ${n} ${n === 1 ? 'Werktag' : 'Werktage'} (Mo–Fr) als Urlaub.`;
    };
    [allDay, start, end].forEach((i) => i.addEventListener('change', refresh));
    start.addEventListener('change', () => { if (!end.value || end.value < start.value) end.value = start.value; });
    refresh();

    const rsvpRow = event && parts(e).includes(me)
      ? el('div', { class: 'seg' }, ...[['yes', 'Zusagen'], ['maybe', 'Vielleicht'], ['no', 'Absagen']].map(([k, l]) =>
        el('button', { type: 'button', class: 'seg-btn' + (myRsvp(e) === k ? ' active' : ''), onclick: async () => {
          await saveEvent(event.id, { rsvp: { [me]: k } });
          close();
        } }, l)))
      : null;

    const save = async () => {
      if (!title.value.trim()) return (err.textContent = 'Bitte einen Titel eingeben.');
      if (!start.value) return (err.textContent = 'Bitte ein Startdatum wählen.');
      const endDate = end.value && end.value >= start.value ? end.value : start.value;
      const participants = PEOPLE.filter((k) => who[k].checked);
      const rsvp = { ...(e.rsvp || {}) };
      for (const k of PEOPLE) if (!participants.includes(k)) delete rsvp[k];
      if (!event && participants.includes(me)) rsvp[me] = 'yes';
      await saveEvent(event && event.id, {
        title: title.value.trim(), categoryId: cat.value, start: start.value, end: endDate, allDay: allDay.checked,
        startTime: allDay.checked ? '' : startTime.value, endTime: allDay.checked ? '' : endTime.value,
        location: place.text.trim(), lat: place.lat, lon: place.lon, note: note.value.trim(), important: important.checked,
        participants, vacation: PEOPLE.filter((k) => vac[k].checked && participants.includes(k)), rsvp
      });
      if (preset && preset.fromIdea) await removeIdea(preset.fromIdea);
      close();
    };

    body.append(
      ...(rsvpRow ? [el('p', { class: 'hint' }, 'Meine Antwort'), rsvpRow] : []),
      el('label', null, 'Titel', title),
      el('label', null, 'Kategorie', cat),
      el('label', { class: 'toggle-row' }, el('span', null, 'Ganztägig'), allDay),
      el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Von', start), el('label', { class: 'grow' }, 'Bis', end)),
      timesRow, locField, el('label', null, 'Notiz', note),
      el('label', { class: 'toggle-row' }, el('span', null, '⭐ Wichtig'), important),
      el('h3', null, 'Wer ist dabei?'),
      ...PEOPLE.map((k) => el('label', { class: 'toggle-row' }, el('span', null, nameOfKey(k)), who[k])),
      el('h3', null, 'Urlaubstage nehmen'),
      ...PEOPLE.map((k) => el('label', { class: 'toggle-row' }, el('span', null, nameOfKey(k)), vac[k])), vacInfo,
      err,
      ...(event ? [el('div', { class: 'row' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => downloadIcs({ ...e, id: event.id }) }, '📥 Kalender-Datei'),
        el('a', { class: 'btn ghost link', href: googleLink(e), target: '_blank', rel: 'noopener' }, '📆 Google Kalender'))] : []),
      el('div', { class: 'row between' },
        event ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Termin löschen?', `„${e.title}“ wirklich löschen?`, 'Löschen')) { await removeEvent(event.id); close(); }
        } }, 'Löschen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern'))
    );
  });
}

/* Ideenliste */
function openIdeaSheet(idea) {
  openSheet(idea ? idea.title : 'Neue Idee', (body, close) => {
    const title = el('input', { type: 'text', value: idea ? idea.title : '', placeholder: 'z. B. Wochenende an der Ostsee' });
    const note = el('input', { type: 'text', value: idea ? idea.note || '' : '', placeholder: 'Notiz oder Link (optional)' });
    body.append(
      el('label', null, 'Idee', title), el('label', null, 'Notiz', note),
      ...(idea ? [el('button', { class: 'btn ghost wide', type: 'button', onclick: () => { close(); openEventSheet(null, { title: idea.title, note: idea.note || '', fromIdea: idea.id }); } }, '📅 In Termin umwandeln')] : []),
      el('div', { class: 'row between' },
        idea ? el('button', { class: 'btn danger', type: 'button', onclick: async () => { await removeIdea(idea.id); close(); } }, 'Löschen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!title.value.trim()) return;
          await saveIdea(idea && idea.id, { title: title.value.trim(), note: note.value.trim() });
          close();
        } }, 'Speichern')));
  });
}

/* Kategorien bearbeiten */
function openEvSettings() {
  openSheet('Termin-Kategorien', (body, close) => {
    const list = cats().map((c) => ({ ...c }));
    const area = el('div');
    const draw = () => area.replaceChildren(
      ...list.map((c, i) => el('div', { class: 'edit-row' },
        el('input', { class: 'emoji', value: c.icon, maxlength: '4', oninput: (x) => (c.icon = x.target.value) }),
        el('input', { class: 'grow', value: c.name, oninput: (x) => (c.name = x.target.value) }),
        el('input', { type: 'color', value: c.color, oninput: (x) => (c.color = x.target.value) }),
        el('button', { class: 'icon-btn', type: 'button', onclick: () => { if (list.length > 1) { list.splice(i, 1); draw(); } } }, '🗑'))),
      el('button', { class: 'btn ghost', type: 'button', onclick: () => { list.push({ id: 'k' + uid(), name: 'Neu', icon: '📌', color: '#9aa7c2' }); draw(); } }, '+ Kategorie'));
    draw();
    body.append(area, el('div', { class: 'row end' }, el('button', { class: 'btn primary', onclick: async () => { await saveEvConfig({ categories: list }); close(); } }, 'Speichern')));
  });
}

const monthName = (d) => d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

function renderUpcoming(root, view) {
  const list = view.past
    ? state.ev.events.filter((e) => endOf(e) < todayIso()).sort((a, b) => b.start.localeCompare(a.start))
    : upcoming();
  const open = upcoming().filter(needsAnswer);
  const year = String(new Date().getFullYear());
  const vac = Object.fromEntries(PEOPLE.map((k) => [k, state.ev.events.filter((e) => (e.vacation || []).includes(k) && e.start.slice(0, 4) <= year && endOf(e).slice(0, 4) >= year)
    .reduce((a, e) => a + workdays(e.start < `${year}-01-01` ? `${year}-01-01` : e.start, endOf(e) > `${year}-12-31` ? `${year}-12-31` : endOf(e)), 0)]));
  const blocks = [];
  if (!view.past && open.length) {
    blocks.push(el('section', { class: 'card note-card' }, el('h2', null, `Wartet auf deine Antwort (${open.length})`), ...open.map((e) => eventRow(e))));
  }
  if (!view.past && PEOPLE.some((k) => vac[k])) {
    blocks.push(el('section', { class: 'card' }, el('p', { class: 'hint' }, `Geplante Urlaubstage ${year}`),
      el('p', null, PEOPLE.map((k) => `${nameOfKey(k)}: ${vac[k]}`).join(' · '))));
  }
  let lastMonth = '';
  for (const e of list) {
    const m = e.start.slice(0, 7);
    if (m !== lastMonth) { lastMonth = m; blocks.push(el('h3', { class: 'section-title month' }, el('span', null, monthName(parseIso(e.start))))); }
    blocks.push(eventRow(e));
  }
  if (!list.length) blocks.push(el('p', { class: 'empty' }, view.past ? 'Keine vergangenen Termine.' : 'Keine anstehenden Termine. Tippe unten auf +.'));
  blocks.push(el('button', { class: 'btn ghost wide', onclick: () => { view.past = !view.past; view.redraw(); } }, view.past ? 'Zurück zu kommenden Terminen' : 'Vergangene Termine anzeigen'));
  root.replaceChildren(...blocks);
}

function renderCalendar(root, view) {
  const first = new Date(view.month.getFullYear(), view.month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(el('span', { class: 'cal-cell empty' }));
  for (let d = 1; d <= daysIn; d++) {
    const iso = isoOf(new Date(first.getFullYear(), first.getMonth(), d));
    const evs = state.ev.events.filter((e) => covers(e, iso));
    cells.push(el('button', { class: 'cal-cell' + (iso === todayIso() ? ' today' : '') + (iso === view.day ? ' sel' : ''), onclick: () => { view.day = iso; view.redraw(); } },
      el('span', null, String(d)),
      el('span', { class: 'cal-dots' }, ...evs.slice(0, 3).map((e) => el('i', { style: { background: catOf(e.categoryId).color } })))));
  }
  const dayEvents = state.ev.events.filter((e) => covers(e, view.day)).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  root.replaceChildren(
    el('div', { class: 'cal-head' },
      el('button', { class: 'icon-btn', onclick: () => { view.month = new Date(first.getFullYear(), first.getMonth() - 1, 1); view.redraw(); } }, '‹'),
      el('strong', null, monthName(first)),
      el('button', { class: 'icon-btn', onclick: () => { view.month = new Date(first.getFullYear(), first.getMonth() + 1, 1); view.redraw(); } }, '›')),
    el('div', { class: 'cal-grid' }, ...['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => el('span', { class: 'cal-wd' }, w)), ...cells),
    el('h3', { class: 'section-title month' }, el('span', null, parseIso(view.day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }))),
    ...(dayEvents.length ? dayEvents.map((e) => eventRow(e)) : [el('p', { class: 'empty' }, 'Kein Termin an diesem Tag.')]));
}

function renderIdeaList(box) {
  const ideas = [...state.ev.ideas].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  box.replaceChildren(...(ideas.length ? ideas.map((i) => swipeDelete(
    el('div', { class: 'item' },
      el('button', { class: 'item-main', type: 'button', onclick: () => openIdeaSheet(i) }, el('span', { class: 'circle small', style: { background: 'var(--card-2)' } }, '💡'),
        el('span', { class: 'item-name' }, i.title), i.note && el('span', { class: 'hint' }, i.note))),
    () => removeIdea(i.id))) : [el('p', { class: 'empty' }, 'Noch keine Ideen.')]));
}

function renderIdeas(root, box) {
  const input = el('input', { type: 'text', class: 'search', placeholder: 'Neue Idee …', onkeydown: async (ev) => {
    if (ev.key === 'Enter' && input.value.trim()) { await saveIdea(null, { title: input.value.trim(), note: '' }); input.value = ''; }
  } });
  root.replaceChildren(el('p', { class: 'hint' }, 'Gemeinsame Ideenliste: Idee antippen, um sie in einen Termin umzuwandeln. Nach links wischen löscht.'), input, box);
  renderIdeaList(box);
}

export function mountEvents(root) {
  const view = { sub: 'kommend', past: false, month: new Date(), day: todayIso(), redraw: null };
  const subnav = el('div', { class: 'chips' });
  const content = el('div');
  const ideaList = el('div');
  const fab = el('button', { class: 'fab', 'aria-label': 'Neuer Termin', onclick: () => (view.sub === 'ideen' ? openIdeaSheet() : openEventSheet(null, view.sub === 'kalender' ? { start: view.day } : null)) }, '+');
  const SUBS = [['kommend', 'Kommend'], ['kalender', 'Kalender'], ['ideen', 'Ideen']];
  function draw() {
    subnav.replaceChildren(...SUBS.map(([k, l]) => el('button', { class: 'chip' + (view.sub === k ? ' active' : ''), onclick: () => { view.sub = k; draw(); } }, l)),
      el('button', { class: 'chip gear', onclick: openEvSettings, 'aria-label': 'Kategorien' }, '⚙︎'));
    if (view.sub === 'kommend') renderUpcoming(content, view);
    else if (view.sub === 'kalender') renderCalendar(content, view);
    else renderIdeas(content, ideaList);
  }
  view.redraw = draw;
  root.replaceChildren(subnav, content, fab);
  draw();
  return subscribe(() => (view.sub === 'ideen' ? renderIdeaList(ideaList) : draw()));
}
