/* Tab Events */
import { confirmSheet, el, icon, openSheet, keepChips, swipeDelete, toast, uid } from './dom.js';
import {
  addDays, covers, DEFAULT_EVENT_CATEGORIES, endOf, isoOf, parseIso, rangeText, RSVP, todayIso
} from './evlogic.js';
import { myKey, nameOfKey, removeEvent, removeIdea, restoreIdea, saveEvConfig, saveEvent, saveIdea, state, subscribe } from './store.js';
import { PEOPLE } from './finlogic.js';
import { keyAvatar } from './profile.js';
import { placeField } from './places.js';
import { gcalReady, gcalPing, pushDelete, pushEvent, saveGcalConfig, syncNow, gcalConfig, importOld, validGcalUrl } from './gcal.js';

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
  return el('span', { class: 'rsvp rsvp-' + (v || 'open'), title: `${nameOfKey(k)}: ${RSVP[v][1]}` }, keyAvatar(k, 'mini'), el('b', null, RSVP[v][0]));
}));

export function eventRow(e, onclick, plain) {
  return el('button', { class: 'item fin-row ev-row' + (e.important && !plain ? ' important' : ''), type: 'button', onclick: onclick || (() => openEventSheet(e)) },
    circle(catOf(e.categoryId)),
    el('span', { class: 'grow fin-main' },
      el('span', { class: 'item-name' }, `${e.important ? '⭐ ' : ''}${e.title}`),
      el('span', { class: 'hint' }, `${rangeText(e)}${e.location ? ` · ${e.location.split(',')[0]}` : ''}`)),
    badges(e));
}

/* Termin anlegen, ansehen, bearbeiten */
export function openEventSheet(event, preset) {
  const me = myKey();
  const e = event || { title: '', categoryId: 'treffen', start: todayIso(), end: '', allDay: false, startTime: '', endTime: '', location: '', note: '', important: false, participants: [...PEOPLE], vacation: [], ...(preset || {}) };
  openSheet(event ? e.title : 'Neuer Termin', (body, close) => {
    const title = el('input', { type: 'text', value: e.title, placeholder: 'z. B. Konzert' });
    const cat = el('select', null, ...cats().map((c) => el('option', { value: c.id, selected: c.id === e.categoryId }, `${c.icon} ${c.name}`)));
    const allDay = el('input', { type: 'checkbox', checked: !!e.allDay });
    const start = el('input', { type: 'date', value: e.start });
    const end = el('input', { type: 'date', value: endOf(e), min: e.start });
    const startTime = el('input', { type: 'time', value: e.startTime || '' });
    const endTime = el('input', { type: 'time', value: e.endTime || '' });
    let place = { text: e.location || '', lat: e.lat ?? null, lon: e.lon ?? null };
    const locField = placeField(place.text, place, (p) => (place = p));
    const note = el('textarea', { rows: '2', placeholder: 'Notiz (optional)' }, e.note || '');
    const important = el('input', { type: 'checkbox', checked: !!e.important });
    const who = Object.fromEntries(PEOPLE.map((k) => [k, el('input', { type: 'checkbox', checked: parts(e).includes(k) })]));
    const timesRow = el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Beginn (Uhrzeit)', startTime), el('label', { class: 'grow' }, 'Ende (Uhrzeit)', endTime));
    const err = el('p', { class: 'form-info bad' });

    const timeHint = el('p', { class: 'hint' }, 'Ohne Beginn-Uhrzeit wird der Termin als ganztägig gespeichert.');
    const refresh = () => {
      timesRow.classList.toggle('hidden', allDay.checked);
      timeHint.classList.toggle('hidden', allDay.checked || !!startTime.value);
    };
    const addHour = (t) => { const [h, m] = t.split(':').map(Number); return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
    const sameDay = () => !end.value || end.value === start.value;
    const fixTimes = () => {
      endTime.min = sameDay() && startTime.value ? startTime.value : '';
      if (sameDay() && startTime.value && endTime.value && endTime.value < startTime.value) endTime.value = addHour(startTime.value);
    };
    [allDay, start, end, startTime].forEach((i) => i.addEventListener('change', refresh));
    start.addEventListener('change', () => { end.min = start.value; if (!end.value || end.value < start.value) end.value = start.value; fixTimes(); });
    end.addEventListener('change', () => { if (end.value < start.value) end.value = start.value; fixTimes(); });
    startTime.addEventListener('change', fixTimes);
    fixTimes();
    refresh();

    const rsvpRow = event && parts(e).includes(me)
      ? el('div', { class: 'seg' }, ...[['yes', 'Zusagen'], ['maybe', 'Vielleicht'], ['no', 'Absagen']].map(([k, l]) =>
        el('button', { type: 'button', class: 'seg-btn' + (myRsvp(e) === k ? ' active' : ''), onclick: async () => {
          await saveEvent(event.id, { rsvp: { [me]: myRsvp(e) === k ? '' : k } });
          close();
        } }, l)))
      : null;

    const save = async () => {
      if (!title.value.trim()) return (err.textContent = 'Bitte einen Titel eingeben.');
      if (!start.value) return (err.textContent = 'Bitte ein Startdatum wählen.');
      if (end.value && end.value < start.value) return (err.textContent = 'Das Ende darf nicht vor dem Beginn liegen.');
      const endDate = end.value || start.value;
      if (!allDay.checked && endDate === start.value && startTime.value && endTime.value && endTime.value < startTime.value) {
        return (err.textContent = 'Die Endzeit darf nicht vor der Startzeit liegen.');
      }
      const participants = PEOPLE.filter((k) => who[k].checked);
      const rsvp = { ...(e.rsvp || {}) };
      for (const k of PEOPLE) if (!participants.includes(k)) delete rsvp[k];
      const whole = allDay.checked || !startTime.value;
      const payload = {
        title: title.value.trim(), categoryId: cat.value, start: start.value, end: endDate, allDay: whole,
        startTime: whole ? '' : startTime.value, endTime: whole ? '' : endTime.value,
        location: place.text.trim(), lat: place.lat, lon: place.lon, note: note.value.trim(), important: important.checked,
        participants, vacation: (e.vacation || []).filter((k) => participants.includes(k)), rsvp
      };
      const savedId = await saveEvent(event && event.id, payload);
      pushEvent(savedId, { ...payload, gid: event && event.gid, gser: event && event.gser });
      if (preset && preset.fromIdea) await removeIdea(preset.fromIdea);
      close();
    };

    body.append(
      ...(rsvpRow ? [el('p', { class: 'hint' }, 'Meine Antwort (nochmal tippen zum Zurücksetzen)'), rsvpRow] : []),
      ...(e.gser ? [el('p', { class: 'hint note-line' }, 'Serientermin aus dem Google Kalender: Titel, Zeit und Ort bitte dort ändern. Kategorie, Antwort und „Wichtig“ gelten nur hier.')] : []),
      el('label', null, 'Titel', title),
      el('label', null, 'Kategorie', cat),
      el('label', { class: 'toggle-row' }, el('span', null, 'Ganztägig'), allDay),
      el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Von', start), el('label', { class: 'grow' }, 'Bis', end)),
      timesRow, timeHint, locField, el('label', null, 'Notiz', note),
      el('label', { class: 'toggle-row' }, el('span', null, '⭐ Wichtig'), important),
      el('h3', null, 'Wer ist eingeladen?'),
      ...PEOPLE.map((k) => el('label', { class: 'toggle-row' }, el('span', { class: 'who' }, keyAvatar(k, 'mini'), nameOfKey(k)), who[k])),
      err,
      el('div', { class: 'row between actions' },
        event && !e.gser ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Termin löschen?', `„${e.title}“ wirklich löschen?${event.gid ? ' Er wird auch im Google Kalender gelöscht.' : ''}`, 'Löschen')) { await removeEvent(event.id); pushDelete(event.gid); close(); }
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
      el('div', { class: 'row between actions' },
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
    const g = gcalConfig() || {};
    const url = el('input', { type: 'text', value: g.url || '', placeholder: 'https://script.google.com/macros/s/…/exec', autocomplete: 'off' });
    const token = el('input', { type: 'password', value: g.token || '', placeholder: 'Geheimwort aus dem Skript', autocomplete: 'off' });
    const gmsg = el('p', { class: 'hint' }, gcalReady() ? 'Verbunden. Der Abgleich läuft beim Öffnen und alle 5 Minuten.' : 'Noch nicht verbunden.');
    const saveG = async () => {
      if (!validGcalUrl(url.value)) { gmsg.textContent = 'Die Adresse muss mit https://script.google.com/macros/s/ beginnen und auf /exec enden.'; throw Object.assign(new Error('url'), { reported: true }); }
      await saveGcalConfig({ url: url.value.trim(), token: token.value.trim() });
    };
    body.append(area, el('div', { class: 'row end' }, el('button', { class: 'btn primary', type: 'button', onclick: async () => { await saveEvConfig({ categories: list.filter((c) => c.name.trim()) }); close(); } }, 'Kategorien speichern')),
      el('h3', null, 'Google Kalender'),
      el('p', { class: 'hint' }, 'Verbindet eure Termine mit dem Google-Kalender „LD Home“. Einrichtung: siehe Anleitung im Projektordner.'),
      el('label', null, 'Web-App-URL', url), el('label', null, 'Geheimwort', token), gmsg,
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          await saveG(); gmsg.textContent = 'Teste …';
          try { await new Promise((r) => setTimeout(r, 600)); await gcalPing(); gmsg.textContent = 'Verbindung funktioniert.'; } catch (e) { gmsg.textContent = 'Verbindung fehlgeschlagen: URL und Geheimwort prüfen.'; }
        } }, 'Verbindung testen'),
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          await saveG(); gmsg.textContent = 'Gleiche ab …';
          await new Promise((r) => setTimeout(r, 600));
          let r = await syncNow();
          if (r.ok && r.skipped && await confirmSheet('Termine entfernen?', `${r.skipped} Termine gibt es im Google Kalender nicht mehr. Zur Sicherheit wurden sie hier nicht gelöscht. Jetzt auch hier löschen?`, 'Löschen')) r = await syncNow({ force: true });
          gmsg.textContent = r.ok ? `Abgleich fertig (${r.changes} Änderungen${r.skipped ? `, ${r.skipped} fehlende Termine behalten` : ''}).` : `Abgleich fehlgeschlagen: ${r.error || 'bitte später nochmal versuchen'}`;
        } }, 'Jetzt abgleichen'),
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          await saveG(); gmsg.textContent = 'Lade alte Termine …';
          await new Promise((r) => setTimeout(r, 600));
          const r = await importOld();
          gmsg.textContent = r.ok ? `${r.count} alte Termine geladen.` : r.error === 'action' ? 'Skript veraltet: neue Version im Apps-Script bereitstellen.' : `Fehlgeschlagen: ${r.error || 'unbekannt'}`;
        } }, 'Alte Termine laden')));
  });
}

const monthName = (d) => d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

function renderUpcoming(root, view) {
  const list = view.past
    ? state.ev.events.filter((e) => endOf(e) < todayIso()).sort((a, b) => b.start.localeCompare(a.start))
    : upcoming();
  const open = upcoming().filter(needsAnswer);
  const blocks = [];
  if (!view.past && open.length) {
    blocks.push(el('section', { class: 'card note-card' }, el('h2', null, `Wartet auf deine Antwort (${open.length})`), ...open.map((e) => eventRow(e))));
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
    cells.push(el('button', { class: 'cal-cell' + (iso === todayIso() ? ' today' : '') + (evs.length ? ' has-ev' : '') + (iso === view.day ? ' sel' : ''), onclick: () => { view.day = iso; view.redraw(); } },
      el('span', null, String(d)),
      el('span', { class: 'cal-dots' }, ...evs.slice(0, 3).map((e) => el('i', { style: { background: catOf(e.categoryId).color } })))));
  }
  const dayEvents = state.ev.events.filter((e) => covers(e, view.day)).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  root.replaceChildren(el('div', { class: 'cal-layout' }, el('div', { class: 'cal-box card' },
    el('div', { class: 'cal-head' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Vorheriger Monat', onclick: () => { view.month = new Date(first.getFullYear(), first.getMonth() - 1, 1); view.redraw(); } }, '‹'),
      el('strong', null, monthName(first)),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nächster Monat', onclick: () => { view.month = new Date(first.getFullYear(), first.getMonth() + 1, 1); view.redraw(); } }, '›')),
    el('div', { class: 'cal-grid' }, ...['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => el('span', { class: 'cal-wd' }, w)), ...cells)),
    el('div', { class: 'cal-day' },
      el('h3', { class: 'section-title month' }, el('span', null, parseIso(view.day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }))),
      ...(dayEvents.length ? dayEvents.map((e) => eventRow(e)) : [el('p', { class: 'empty' }, 'Kein Termin an diesem Tag.')]))));
}

function renderIdeaList(box) {
  const ideas = [...state.ev.ideas].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  box.replaceChildren(...(ideas.length ? ideas.map((i) => swipeDelete(
    el('div', { class: 'item idea' },
      el('button', { class: 'item-main', type: 'button', onclick: () => openIdeaSheet(i) }, el('span', { class: 'circle small', style: { background: 'var(--card-2)' } }, '💡'),
        el('span', { class: 'grow fin-main' }, el('span', { class: 'item-name' }, i.title), i.note ? el('span', { class: 'hint' }, i.note) : null))),
    () => { removeIdea(i.id); toast(`„${i.title}“ gelöscht`, { action: 'Rückgängig', onAction: () => restoreIdea(i) }); })) : [el('p', { class: 'empty' }, 'Noch keine Ideen.')]));
}

function renderIdeas(root, box) {
  const add = async () => { if (input.value.trim()) { await saveIdea(null, { title: input.value.trim(), note: '' }); input.value = ''; } };
  const input = el('input', { type: 'text', class: 'grow', placeholder: 'Neue Idee …', enterkeyhint: 'done', onkeydown: (ev) => { if (ev.key === 'Enter') add(); } });
  root.replaceChildren(
    el('div', { class: 'idea-add' }, input, el('button', { class: 'btn primary', type: 'button', onclick: add }, 'Hinzufügen')),
    el('p', { class: 'hint idea-hint' }, 'Idee antippen, um sie in einen Termin umzuwandeln. Nach links wischen löscht.'),
    box);
  renderIdeaList(box);
}

export function mountEvents(root) {
  const view = { sub: 'kommend', past: false, month: new Date(), day: todayIso(), redraw: null };
  const subnav = el('div', { class: 'chips' });
  const content = el('div');
  const ideaList = el('div');
  const fab = el('button', { class: 'fab', type: 'button', 'aria-label': 'Neuer Termin oder neue Idee', onclick: () => (view.sub === 'ideen' ? openIdeaSheet() : openEventSheet(null, view.sub === 'kalender' ? { start: view.day } : null)) }, icon('plus'));
  const SUBS = [['kommend', 'Übersicht'], ['kalender', 'Kalender'], ['ideen', 'Ideen']];
  function draw() { keepChips(drawNow); }
  function drawNow() {
    subnav.replaceChildren(...SUBS.map(([k, l]) => el('button', { class: 'chip' + (view.sub === k ? ' active' : ''), onclick: () => { view.sub = k; draw(); } }, l)),
      el('button', { class: 'chip gear', type: 'button', onclick: openEvSettings, 'aria-label': 'Kategorien und Google Kalender' }, icon('gear')));
    root.classList.toggle('wide', view.sub === 'kalender');
    if (view.sub === 'kommend') renderUpcoming(content, view);
    else if (view.sub === 'kalender') renderCalendar(content, view);
    else renderIdeas(content, ideaList);
  }
  view.redraw = draw;
  root.replaceChildren(subnav, content, fab);
  draw();
  return subscribe(() => (view.sub === 'ideen' ? renderIdeaList(ideaList) : draw()));
}
