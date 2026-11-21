/* Tab Events */
import { chipInput, confirmSheet, el, icon, longPress, openSheet, keepChips, swipeDelete, toast, uid } from './dom.js';
import {
  addDays, covers, DEFAULT_EVENT_CATEGORIES, endOf, holidayOn, holidays, isoOf, isVac, parseIso, rangeText, RSVP, todayIso, VACATION
} from './evlogic.js';
import { myKey, nameOfKey, userName, removeEvent, removeIdea, restoreIdea, saveEvConfig, saveEvent, saveIdea, state, subscribe } from './store.js';
import { PEOPLE } from './finlogic.js';
import { avatar, keyAvatar } from './profile.js';
import { mapView, placeField } from './places.js';
import { deleteEvent, pushEvent } from './gcal.js';
import { companyById, openCompany } from './companies.js';

const cats = () => { const l = state.ev.config.categories || DEFAULT_EVENT_CATEGORIES; return l.some((c) => c.id === VACATION.id) ? l : [...l, VACATION]; };
export { isVac };
const catOf = (id) => cats().find((c) => c.id === id) || cats().find((c) => c.id === 'sonstiges') || cats().filter((c) => c.id !== VACATION.id).slice(-1)[0];
const circle = (cat, small) => el('span', { class: 'circle' + (small ? ' small' : ''), style: { background: cat.color } }, cat.icon);
const parts = (e) => e.participants || PEOPLE;
const myRsvp = (e) => (e.rsvp && e.rsvp[myKey()]) || '';
export const needsAnswer = (e) => e.kind !== 'deadline' && !isVac(e) && endOf(e) >= todayIso() && parts(e).includes(myKey()) && !myRsvp(e);

export function upcoming(limit) {
  const t = todayIso();
  const list = state.ev.events.filter((e) => endOf(e) >= t).sort((a, b) => a.start.localeCompare(b.start) || (a.startTime || '').localeCompare(b.startTime || ''));
  return limit ? list.slice(0, limit) : list;
}

const badges = (e) => el('span', { class: 'rsvp-badges' }, ...(isVac(e) ? [] : parts(e)).map((k) => {
  const v = (e.rsvp && e.rsvp[k]) || '';
  return el('span', { class: 'rsvp rsvp-' + (v || 'open'), title: `${nameOfKey(k)}: ${RSVP[v][1]}` }, keyAvatar(k, 'mini'), el('b', null, RSVP[v][0]));
}), ...((e.guests || []).length ? [el('span', { class: 'rsvp rsvp-guests', title: e.guests.map((g) => `${g}: ${RSVP[(e.grsvp || {})[g] || ''][1]}`).join(', ') }, `+${e.guests.length}`)] : []));
const knownGuests = () => {
  const set = new Map();
  for (const g of [...(state.ev.config.guests || []), ...state.ev.events.flatMap((e) => e.guests || [])]) if (!set.has(g.toLowerCase())) set.set(g.toLowerCase(), g);
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'de'));
};

export function eventRow(e, onclick, plain) {
  const row = el('button', { class: 'item fin-row ev-row' + '', type: 'button', onclick: onclick || (() => openEventSheet(e)) },
    circle(catOf(e.categoryId)),
    el('span', { class: 'grow fin-main' },
      el('span', { class: 'item-name' }, `${e.important ? '⭐ ' : ''}${e.title}`),
      el('span', { class: 'hint' }, `${rangeText(e)}${e.location ? ` · ${e.location.split(',')[0]}` : ''}`)),
    badges(e));
  return onclick || e.kind === 'deadline' ? row : longPress(row, () => openEventEdit(e));
}

/* Automatischer Termin einer Kündigungsfrist: nur ansehen, gepflegt wird er über den Vertrag */
function openDeadlineSheet(e) {
  openSheet(e.title, (body, close) => {
    const co = companyById(String(e.src || '').split(':')[0]);
    body.append(
      el('div', { class: 'info-list' },
        el('div', { class: 'info-row' }, el('span', { class: 'hint' }, 'Letzter Tag zum Kündigen'), el('span', null, parseIso(e.start).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })))),
      e.note ? el('p', { class: 'pre' }, e.note) : null,
      el('p', { class: 'hint note-line' }, `Dieser Termin kommt automatisch aus den Vertragsdaten${e.owner ? ' (privat, nur für dich sichtbar)' : ''}. Datum ändern oder entfernen: im Vertrag die Laufzeit anpassen, „Gekündigt“ wählen oder „An Kündigungsfrist erinnern“ ausschalten.`),
      el('div', { class: 'row end actions' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Schließen'),
        co ? el('button', { class: 'btn primary', type: 'button', onclick: () => { close(); setTimeout(() => openCompany(co), 0); } }, '🏢 Zum Vertrag') : null));
  });
}

/* Termin ansehen (schlank); neu = gleich bearbeiten */
export function openEventSheet(event, preset) {
  if (event && event.kind === 'deadline') return openDeadlineSheet(event);
  if (!event) return openEventEdit(null, preset);
  const e = event;
  const me = myKey();
  const cat = catOf(e.categoryId);
  openSheet(`${e.important ? '⭐ ' : ''}${e.title}`, (body, close) => {
    const info = (label, ...val) => el('div', { class: 'info-row' }, el('span', { class: 'hint' }, label), el('span', null, ...val));
    const ans = (v) => el('span', { class: 'rsvp rsvp-' + (v || 'open') }, el('b', null, RSVP[v || ''][0]), ' ', RSVP[v || ''][1]);
    const people = isVac(e) ? [] : parts(e).map((k) => el('div', { class: 'row between ev-person' },
      el('span', { class: 'who' }, keyAvatar(k, 'mini'), nameOfKey(k)), ans(e.rsvp && e.rsvp[k])));
    const guests = isVac(e) ? [] : (e.guests || []).map((g) => el('div', { class: 'row between ev-person' },
      el('span', { class: 'who' }, el('span', { class: 'avatar mini guest-av' }, g.slice(0, 1).toUpperCase()), g), ans((e.grsvp || {})[g])));
    const rsvpRow = !isVac(e) && parts(e).includes(me)
      ? el('div', { class: 'seg' }, ...[['yes', 'Zusagen'], ['maybe', 'Vielleicht'], ['no', 'Absagen']].map(([k, l]) =>
        el('button', { type: 'button', class: 'seg-btn' + (myRsvp(e) === k ? ' active' : ''), onclick: async () => {
          await saveEvent(e.id, { rsvp: { [me]: myRsvp(e) === k ? '' : k } });
          close();
        } }, l)))
      : null;
    body.append(
      el('div', { class: 'ev-view-cat' }, circle(cat, true), el('span', null, isVac(e) ? `${cat.name} ${nameOfKey(e.who || me)}` : cat.name)),
      el('div', { class: 'info-list' },
        info('Wann', rangeText(e)),
        e.location ? info('Wo', e.location) : null),
      e.location ? mapView(e.location, e.lat, e.lon) : null,
      e.note ? el('p', { class: 'pre ev-note' }, e.note) : null,
      rsvpRow ? el('p', { class: 'hint' }, 'Meine Antwort') : null,
      rsvpRow,
      people.length || guests.length ? el('h3', null, 'Eingeladen') : null,
      ...people, ...guests,
      el('p', { class: 'hint note-line' }, 'Tipp: Termin in der Liste lange drücken öffnet direkt „Bearbeiten“.'),
      el('div', { class: 'row end actions' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Schließen'),
        el('button', { class: 'btn primary', type: 'button', onclick: () => { close(); setTimeout(() => openEventEdit(e), 0); } }, '✏️ Bearbeiten')));
  });
}

/* Termin anlegen oder bearbeiten */
export function openEventEdit(event, preset) {
  if (event && event.kind === 'deadline') return openDeadlineSheet(event);
  const me = myKey();
  const e = event || { title: '', categoryId: 'treffen', start: todayIso(), end: '', allDay: false, startTime: '', endTime: '', location: '', note: '', important: false, participants: [...PEOPLE], vacation: [], guests: [], grsvp: {}, ...(preset || {}) };
  openSheet(event ? e.title : 'Neuer Termin', (body, close) => {
    const vacWho = e.who || me;
    let grsvp = { ...(e.grsvp || {}) };
    const guestRsvp = el('div', { class: 'guest-rsvp' });
    const drawGuests = (list) => guestRsvp.replaceChildren(...list.map((g) => el('div', { class: 'row between guest-row' },
      el('span', { class: 'who' }, el('span', { class: 'avatar mini guest-av' }, g.slice(0, 1).toUpperCase()), g),
      el('span', { class: 'seg small' }, ...[['yes', '✓'], ['maybe', '?'], ['no', '✗']].map(([k, l]) => el('button', { type: 'button', class: 'seg-btn' + (grsvp[g] === k ? ' active' : ''), title: RSVP[k][1], onclick: () => { grsvp[g] = grsvp[g] === k ? '' : k; drawGuests(guests.values()); } }, l))))));
    const guests = chipInput({ values: e.guests || [], suggest: () => knownGuests(), placeholder: 'Weitere Personen (Komma trennt) …', onChange: drawGuests });
    drawGuests(e.guests || []);
    const title = el('input', { type: 'text', value: e.title, placeholder: 'z. B. Konzert' });
    const cat = el('select', null, ...cats().map((c) => el('option', { value: c.id, selected: c.id === e.categoryId }, `${c.icon} ${c.name}`)));
    const full = el('div', { class: 'ev-full' });
    const vacHint = el('p', { class: 'hint note-line' }, `Arbeitsurlaub für ${nameOfKey(vacWho)}: nur Zeitraum angeben. Wird als Information angezeigt, nicht als Termin.`);
    const vacMode = () => cat.value === VACATION.id;
    cat.addEventListener('change', () => { full.classList.toggle('hidden', vacMode()); vacHint.classList.toggle('hidden', !vacMode()); });
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
      if (vacMode()) {
        if (!start.value) return (err.textContent = 'Bitte ein Startdatum wählen.');
        const vEnd = end.value && end.value >= start.value ? end.value : start.value;
        const vp = { title: `${VACATION.name} ${nameOfKey(vacWho)}`, categoryId: VACATION.id, who: vacWho, start: start.value, end: vEnd, allDay: true, startTime: '', endTime: '', location: '', lat: null, lon: null, note: '', important: false, participants: [], vacation: [], rsvp: {}, guests: [], grsvp: {} };
        const vid = await saveEvent(event && event.id, vp);
        pushEvent(vid, { ...vp, gid: event && event.gid });
        close();
        return;
      }
      if (!title.value.trim()) return (err.textContent = 'Bitte einen Titel eingeben.');
      if (!start.value) return (err.textContent = 'Bitte ein Startdatum wählen.');
      if (end.value && end.value < start.value) return (err.textContent = 'Das Ende darf nicht vor dem Beginn liegen.');
      const endDate = end.value || start.value;
      if (!allDay.checked && endDate === start.value && startTime.value && endTime.value && endTime.value < startTime.value) {
        return (err.textContent = 'Die Endzeit darf nicht vor der Startzeit liegen.');
      }
      const participants = PEOPLE.filter((k) => who[k].checked);
      const rsvp = { ...(e.rsvp || {}) };
      for (const k of PEOPLE) if (!participants.includes(k)) rsvp[k] = '';
      const whole = allDay.checked || !startTime.value;
      const payload = {
        title: title.value.trim(), categoryId: cat.value, start: start.value, end: endDate, allDay: whole,
        startTime: whole ? '' : startTime.value, endTime: whole ? '' : endTime.value,
        location: place.text.trim(), lat: place.lat, lon: place.lon, note: note.value.trim(), important: important.checked,
        participants, vacation: (e.vacation || []).filter((k) => participants.includes(k)), rsvp,
        guests: guests.values(), grsvp: Object.fromEntries(guests.values().map((g) => [g, grsvp[g] || '']))
      };
      const known = knownGuests();
      const fresh = payload.guests.filter((g) => !known.some((k) => k.toLowerCase() === g.toLowerCase()));
      if (fresh.length) saveEvConfig({ guests: [...(state.ev.config.guests || []), ...fresh] });
      const savedId = await saveEvent(event && event.id, payload);
      pushEvent(savedId, { ...payload, gid: event && event.gid, gser: event && event.gser });
      if (preset && preset.fromIdea) await removeIdea(preset.fromIdea);
      close();
    };

    const top = el('div', { class: 'ev-full' },
      ...(rsvpRow && !isVac(e) ? [el('p', { class: 'hint' }, 'Meine Antwort (nochmal tippen zum Zurücksetzen)'), rsvpRow] : []),
      ...(e.gser ? [el('p', { class: 'hint note-line' }, 'Serientermin aus dem Google Kalender: Titel, Zeit und Ort bitte dort ändern. Kategorie, Antwort und „Wichtig“ gelten nur hier.')] : []));
    full.append(
      el('label', null, 'Titel', title),
      el('label', { class: 'toggle-row' }, el('span', null, 'Ganztägig'), allDay));
    const rest = el('div', { class: 'ev-full' },
      timesRow, timeHint, locField, el('label', null, 'Notiz', note),
      el('label', { class: 'toggle-row' }, el('span', null, '⭐ Wichtig'), important),
      el('h3', null, 'Wer ist eingeladen?'),
      ...PEOPLE.map((k) => el('label', { class: 'toggle-row' }, el('span', { class: 'who' }, keyAvatar(k, 'mini'), nameOfKey(k)), who[k])),
      guests.node, guestRsvp);
    const sync = () => { const v = vacMode(); [top, full, rest].forEach((x) => x.classList.toggle('hidden', v)); vacHint.classList.toggle('hidden', !v); };
    cat.addEventListener('change', sync);
    sync();
    body.append(
      top,
      el('label', null, 'Kategorie', cat),
      vacHint, full,
      el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Von', start), el('label', { class: 'grow' }, 'Bis', end)),
      rest,
      err,
      el('div', { class: 'row between actions' },
        event && !e.gser ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Termin löschen?', `„${e.title}“ wirklich löschen?${event.gid ? ' Er wird auch im Google Kalender gelöscht.' : ''}`, 'Löschen')) { await deleteEvent(event); close(); }
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
    body.append(area, el('div', { class: 'row end actions' }, el('button', { class: 'btn primary', type: 'button', onclick: async () => { await saveEvConfig({ categories: list.filter((c) => c.name.trim()) }); close(); } }, 'Speichern')));
  });
}

const monthName = (d) => d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

const PAST_STEP = 10;
const withMonths = (list) => {
  let lastMonth = '';
  return list.flatMap((e) => {
    const m = e.start.slice(0, 7);
    const head = m !== lastMonth ? [el('h3', { class: 'section-title month' }, el('span', null, monthName(parseIso(e.start))))] : [];
    lastMonth = m;
    return [...head, eventRow(e)];
  });
};

function renderUpcoming(root, view) {
  const list = upcoming();
  const open = list.filter(needsAnswer);
  const blocks = [];
  if (open.length) {
    blocks.push(el('section', { class: 'card note-card' }, el('h2', null, `Wartet auf deine Antwort (${open.length})`), ...open.map((e) => eventRow(e))));
  }
  blocks.push(...withMonths(list));
  if (!list.length) blocks.push(el('p', { class: 'empty' }, 'Keine anstehenden Termine. Tippe unten auf +.'));
  blocks.push(el('button', { class: 'btn ghost wide past-toggle', type: 'button', onclick: () => { view.past = !view.past; view.pastShown = PAST_STEP; view.redraw(); } }, view.past ? 'Vergangene Termine ausblenden' : 'Vergangene Termine anzeigen'));
  if (view.past) {
    const t = todayIso();
    const past = state.ev.events.filter((e) => endOf(e) < t)
      .sort((a, b) => b.start.localeCompare(a.start) || (b.startTime || '').localeCompare(a.startTime || ''));
    const shown = past.slice(0, view.pastShown || PAST_STEP);
    blocks.push(el('h2', { class: 'past-title' }, 'Vergangene Termine'));
    blocks.push(past.length ? el('div', { class: 'past-list' }, ...withMonths(shown)) : el('p', { class: 'empty' }, 'Keine vergangenen Termine.'));
    if (past.length > shown.length) {
      blocks.push(el('button', { class: 'btn ghost wide', type: 'button', onclick: () => { view.pastShown = shown.length + PAST_STEP; view.redraw(); } }, `Weitere anzeigen (noch ${past.length - shown.length})`));
    }
  }
  root.replaceChildren(...blocks);
}

function renderCalendar(root, view) {
  const first = new Date(view.month.getFullYear(), view.month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const multi = (e) => isVac(e) || endOf(e) > e.start;
  const LANES = 3;
  const weeks = [];
  for (let w = 0; w * 7 < lead + daysIn; w++) {
    const days = Array.from({ length: 7 }, (_, i) => { const d = w * 7 + i - lead + 1; return d >= 1 && d <= daysIn ? isoOf(new Date(first.getFullYear(), first.getMonth(), d)) : null; });
    const real = days.filter(Boolean);
    const wStart = real[0], wEnd = real[real.length - 1];
    const bars = state.ev.events.filter((e) => multi(e) && e.start <= wEnd && endOf(e) >= wStart)
      .sort((x, y) => x.start.localeCompare(y.start) || endOf(y).localeCompare(endOf(x)));
    const lanes = [];
    const placed = [];
    for (const e of bars) {
      const s0 = e.start < wStart ? wStart : e.start, e0 = endOf(e) > wEnd ? wEnd : endOf(e);
      const c0 = days.indexOf(s0), c1 = days.indexOf(e0);
      let lane = lanes.findIndex((end) => end < c0);
      if (lane < 0) { lane = lanes.length; lanes.push(-1); }
      if (lane >= LANES) continue;
      lanes[lane] = c1;
      placed.push({ e, c0, c1, lane, open0: e.start < wStart, open1: endOf(e) > wEnd });
    }
    const n = Math.min(LANES, lanes.length);
    const cells = days.map((iso, i) => {
      if (!iso) return el('span', { class: 'cal-cell empty', style: { gridColumn: `${i + 1}`, gridRow: `1 / span ${n + 2}` } });
      const singles = state.ev.events.filter((e) => !multi(e) && covers(e, iso));
      const hol = holidayOn(iso);
      const any = singles.length || bars.some((e) => covers(e, iso));
      return el('button', {
        class: 'cal-cell' + (iso === todayIso() ? ' today' : '') + (any ? ' has-ev' : '') + (hol ? ' holiday' : '') + (iso === view.day ? ' sel' : ''),
        style: { gridColumn: `${i + 1}`, gridRow: `1 / span ${n + 2}` }, title: hol ? `${hol.name} (${hol.region})` : null,
        onclick: () => { view.day = view.day === iso ? null : iso; view.redraw(); }
      },
        el('span', { class: 'cal-num' }, String(+iso.slice(8))),
        el('span', { class: 'cal-dots' }, ...singles.slice(0, 3).map((e) => el('i', { style: { background: catOf(e.categoryId).color } }))));
    });
    const barEls = placed.map((p) => el('button', {
      type: 'button', class: 'cal-bar' + (p.open0 ? ' open-l' : '') + (p.open1 ? ' open-r' : ''),
      style: { gridColumn: `${p.c0 + 1} / ${p.c1 + 2}`, gridRow: `${p.lane + 2}`, background: catOf(p.e.categoryId).color },
      title: p.e.title, onclick: (ev) => { ev.stopPropagation(); openEventSheet(p.e); }
    }, p.open0 && p.c0 === 0 ? `… ${p.e.title}` : p.e.title));
    weeks.push(el('div', { class: 'cal-week', style: { gridTemplateRows: `30px ${n ? `repeat(${n}, 17px) ` : ''}12px` } }, ...cells, ...barEls));
  }
  const cellsHead = el('div', { class: 'cal-grid' }, ...['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => el('span', { class: 'cal-wd' }, w)));
  const mStart = isoOf(first), mEnd = isoOf(new Date(first.getFullYear(), first.getMonth(), daysIn));
  const byTime = (a, b) => a.start.localeCompare(b.start) || (a.startTime || '').localeCompare(b.startTime || '');
  const hols = holidays(first.getFullYear()).filter((h) => (view.day ? h.date === view.day : h.date >= mStart && h.date <= mEnd));
  const holRow = (h) => el('div', { class: 'item fin-row holiday-row' }, el('span', { class: 'circle', style: { background: 'var(--card-2)' } }, '🇩🇪'),
    el('span', { class: 'grow fin-main' }, el('span', { class: 'item-name' }, h.name), el('span', { class: 'hint' }, `${parseIso(h.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} · Feiertag ${h.region}`)));
  const shown = view.day
    ? state.ev.events.filter((e) => covers(e, view.day)).sort(byTime)
    : state.ev.events.filter((e) => e.start <= mEnd && endOf(e) >= mStart).sort(byTime);
  const go = (n) => { view.month = new Date(first.getFullYear(), first.getMonth() + n, 1); view.day = null; view.redraw(); };
  const box = el('div', { class: 'cal-box card' },
    el('div', { class: 'cal-head' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Vorheriger Monat', onclick: () => go(-1) }, '‹'),
      el('button', { class: 'cal-title' + (view.day ? '' : ' sel'), type: 'button', onclick: () => { view.day = null; view.redraw(); } }, monthName(first)),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nächster Monat', onclick: () => go(1) }, '›')),
    cellsHead, ...weeks);
  let x0 = null, y0 = 0;
  box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  });
  root.replaceChildren(el('div', { class: 'cal-layout' }, box,
    el('div', { class: 'cal-day' },
      el('h3', { class: 'section-title month' }, el('span', null, view.day ? parseIso(view.day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) : `Alle Termine im ${monthName(first)}`)),
      ...hols.map(holRow),
      ...(shown.length ? shown.map((e) => eventRow(e)) : hols.length ? [] : [el('p', { class: 'empty' }, view.day ? 'Kein Termin an diesem Tag.' : 'Keine Termine in diesem Monat.')]))));
}

function renderIdeaList(box) {
  const ideas = [...state.ev.ideas].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  box.replaceChildren(...(ideas.length ? ideas.map((i) => swipeDelete(
    el('div', { class: 'item idea' },
      el('button', { class: 'item-main', type: 'button', onclick: () => openIdeaSheet(i) }, el('span', { class: 'circle small', style: { background: 'var(--card-2)' } }, '💡'),
        el('span', { class: 'grow fin-main' }, el('span', { class: 'item-name' }, i.title), i.note ? el('span', { class: 'hint' }, i.note) : null),
        i.createdBy ? el('span', { class: 'who idea-who', title: `Eingetragen von ${userName(i.createdBy)}` }, avatar(i.createdBy, 'mini'), el('span', { class: 'hint' }, userName(i.createdBy))) : null)),
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
  const view = { sub: 'kommend', past: false, pastShown: 10, month: new Date(), day: null, redraw: null };
  const subnav = el('div', { class: 'chips' });
  const content = el('div');
  const ideaList = el('div');
  const fab = el('button', { class: 'fab', type: 'button', 'aria-label': 'Neuer Termin oder neue Idee', onclick: () => (view.sub === 'ideen' ? openIdeaSheet() : openEventSheet(null, view.sub === 'kalender' ? { start: view.day || (isoOf(view.month).slice(0, 7) === todayIso().slice(0, 7) ? todayIso() : isoOf(new Date(view.month.getFullYear(), view.month.getMonth(), 1))) } : null)) }, icon('plus'));
  const SUBS = [['kommend', 'Übersicht'], ['kalender', 'Kalender'], ['ideen', 'Ideen']];
  function draw() { keepChips(drawNow); }
  function drawNow() {
    subnav.replaceChildren(...SUBS.map(([k, l]) => el('button', { class: 'chip' + (view.sub === k ? ' active' : ''), onclick: () => { view.sub = k; draw(); } }, l)),
      el('button', { class: 'chip gear', type: 'button', onclick: openEvSettings, 'aria-label': 'Termin-Kategorien' }, icon('gear')));
    root.classList.add('wide');
    if (view.sub === 'kommend') renderUpcoming(content, view);
    else if (view.sub === 'kalender') renderCalendar(content, view);
    else renderIdeas(content, ideaList);
  }
  view.redraw = draw;
  root.replaceChildren(subnav, content, fab);
  draw();
  return subscribe(() => (view.sub === 'ideen' ? renderIdeaList(ideaList) : draw()));
}
