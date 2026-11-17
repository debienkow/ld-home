/* DMS: Unternehmen mit Kundendaten, Verträgen und Kündigungsfristen */
import { confirmSheet, el, openSheet, toast, uid } from './dom.js';
import { saveDms, saveDmsConfig, saveEvent, state, subscribe } from './store.js';
import { addDays, todayIso } from './evlogic.js';
import { deleteEvent, pushEvent } from './gcal.js';
import { docRow, docCatOf } from './dms.js';

export const companies = () => (Array.isArray(state.dms.config.companies) ? state.dms.config.companies : []);
export const companyById = (id) => companies().find((c) => c.id === id) || null;
const saveCompanies = (list) => saveDmsConfig({ companies: list });
const dateDe = (iso) => (iso ? new Date(iso + 'T00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const UNITS = { d: ['Tag', 'Tage'], w: ['Woche', 'Wochen'], m: ['Monat', 'Monate'] };
const unitText = (n, u) => `${n} ${UNITS[u || 'm'][n === 1 ? 0 : 1]}`;

/* Suche: Name, weitere Namen, Kunden- und Vertragsnummern */
export function findCompanies(q) {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  return companies().filter((c) => [c.name, ...(c.aliases || []), c.customerNo, ...(c.contracts || []).map((k) => k.number)]
    .some((x) => x && String(x).toLowerCase().includes(t)));
}
export const docsOf = (c) => state.dms.docs.filter((d) => d.companyId === c.id).sort((a, b) => b.date.localeCompare(a.date));

/* Monate addieren, Monatsende beachten */
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const x = new Date(y, m - 1 + n, Math.min(d, last));
  return x.toLocaleDateString('sv-SE');
}
const minus = (iso, n, u) => (u === 'd' ? addDays(iso, -n) : u === 'w' ? addDays(iso, -7 * n) : addMonths(iso, -n));

/* Nächster letzter Kündigungstag, bei automatischer Verlängerung fortgeschrieben */
export function deadlineOf(k, today = todayIso()) {
  if (!k || k.cancelled || !k.end || !k.notice) return null;
  let end = k.end;
  let dl = minus(end, k.notice, k.unit);
  for (let i = 0; i < 200 && dl < today && k.renew > 0; i++) { end = addMonths(end, k.renew); dl = minus(end, k.notice, k.unit); }
  const days = Math.round((new Date(dl + 'T00:00') - new Date(today + 'T00:00')) / 86400000);
  return { end, deadline: dl, days, past: dl < today };
}

/* Läuft der Vertrag noch? */
export function isActive(k, today = todayIso()) {
  if (k.cancelled) return !!k.end && k.end >= today;
  return !k.end || k.renew > 0 || k.end >= today;
}
export const hasActive = (c) => (c.contracts || []).some((k) => isActive(k));
const current = () => companies().filter((c) => !c.archived);

/* Fristen, an die erinnert werden soll */
export function dueSoon() {
  const out = [];
  for (const c of current()) for (const k of c.contracts || []) {
    const d = deadlineOf(k);
    if (d && !d.past && d.days <= (k.remind ?? 30)) out.push({ c, k, ...d });
  }
  return out.sort((a, b) => a.deadline.localeCompare(b.deadline));
}
export const contractTitle = (c, k) => `${c.name}${k.name ? ` – ${k.name}` : ''}`;
const deadlineLine = (d) => (d.past ? `Kündigungsfrist am ${dateDe(d.deadline)} verstrichen` : `Kündigen bis ${dateDe(d.deadline)} (${d.days === 0 ? 'heute' : d.days === 1 ? 'morgen' : `in ${d.days} Tagen`})`);

/* Termine für Kündigungsfristen anlegen, ändern, entfernen */
let syncTimer = null;
export function startDeadlineSync() {
  subscribe(() => { clearTimeout(syncTimer); syncTimer = setTimeout(syncDeadlines, 2500); });
}
async function syncDeadlines() {
  if (!state.user || !state.ev.loaded || !state.dms.cfgLoaded) return;
  const want = new Map();
  for (const c of current()) for (const k of c.contracts || []) {
    const d = deadlineOf(k);
    if (!d || d.past) continue;
    want.set(`kf_${c.id}_${k.id}`, {
      title: `Kündigungsfrist: ${contractTitle(c, k)}`, categoryId: 'termin', start: d.deadline, end: d.deadline, allDay: true, startTime: '', endTime: '',
      location: '', note: `Letzter Tag zum Kündigen (${unitText(k.notice, k.unit)} vor Vertragsende ${dateDe(d.end)}). Automatisch aus DMS › Unternehmen.`,
      important: true, participants: [], vacation: [], rsvp: {}, kind: 'deadline', src: `${c.id}:${k.id}`
    });
  }
  for (const e of state.ev.events) {
    if (e.kind === 'deadline' && !want.has(e.id)) await deleteEvent(e);
  }
  for (const [id, p] of want) {
    const cur = state.ev.events.find((e) => e.id === id);
    if (cur && cur.start === p.start && cur.title === p.title && cur.note === p.note) continue;
    const payload = cur ? p : { ...p, createdBy: state.user.uid, createdAt: Date.now() };
    await saveEvent(id, payload);
    pushEvent(id, { ...(cur || {}), ...payload });
  }
}

/* Auswahlfeld im Dokument: ein Unternehmen, Vorschläge, neu anlegen */
export function companyField(currentId, onChange = () => {}) {
  let sel = companyById(currentId);
  let pendingName = '';
  const wrap = el('div');
  const input = el('input', { type: 'text', placeholder: 'Unternehmen suchen oder neu eingeben …', autocomplete: 'off', enterkeyhint: 'done' });
  const sugg = el('div', { class: 'chips small tag-sugg' });
  const pick = (c) => { sel = c; pendingName = ''; input.value = ''; draw(); onChange(c.id); };
  const draw = () => {
    if (sel || pendingName) {
      const name = sel ? sel.name : pendingName;
      wrap.replaceChildren(el('div', { class: 'tag-input' }, el('span', { class: 'tag-chip' }, `🏢 ${name}${sel ? '' : ' (neu)'}`,
        el('button', { type: 'button', 'aria-label': 'Unternehmen entfernen', onclick: () => { sel = null; pendingName = ''; draw(); onChange(''); input.focus(); } }, '×'))));
      return;
    }
    const q = input.value.trim().toLowerCase();
    const list = current().filter((c) => !q || [c.name, ...(c.aliases || [])].some((x) => x.toLowerCase().includes(q))).slice(0, 8);
    const exact = companies().some((c) => c.name.toLowerCase() === q);
    sugg.replaceChildren(
      ...list.map((c) => el('button', { type: 'button', class: 'chip', onmousedown: (e) => e.preventDefault(), onclick: () => pick(c) }, c.name)),
      ...(q && !exact ? [el('button', { type: 'button', class: 'chip', onmousedown: (e) => e.preventDefault(), onclick: () => { pendingName = input.value.trim(); input.value = ''; draw(); } }, `+ „${input.value.trim()}“ anlegen`)] : []));
    if (!wrap.contains(input)) wrap.replaceChildren(el('div', { class: 'tag-input' }, input), sugg);
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    const q = input.value.trim();
    if (!q) return;
    const hit = companies().find((c) => c.name.toLowerCase() === q.toLowerCase());
    if (hit) pick(hit); else { pendingName = q; input.value = ''; draw(); }
  });
  draw();
  return {
    node: wrap,
    /* Liefert die Id; legt ein neues Unternehmen bei Bedarf an */
    async value() {
      if (sel) return sel.id;
      const name = pendingName || input.value.trim();
      if (!name) return '';
      const hit = companies().find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (hit) return hit.id;
      const c = { id: 'c' + uid(), name, aliases: [], fields: [], contracts: [], note: '' };
      await saveCompanies([...companies(), c]);
      return c.id;
    }
  };
}

/* Karte oben in der Suche */
export function companyCard(c) {
  const due = (c.contracts || []).map((k) => deadlineOf(k)).filter((d) => d && !d.past).sort((a, b) => a.days - b.days)[0];
  const missing = !c.archived && !hasActive(c);
  return el('button', { class: 'item fin-row company-card' + (missing ? ' no-contract' : '') + (c.archived ? ' archived' : ''), type: 'button', onclick: () => openCompany(c) },
    el('span', { class: 'circle' }, '🏢'),
    el('span', { class: 'grow fin-main' },
      el('span', { class: 'item-name' }, c.name),
      el('span', { class: 'hint' }, [c.archived ? 'Archiviert' : 'Kundendaten', c.customerNo ? `Kd.-Nr. ${c.customerNo}` : '', c.phone || '', due ? deadlineLine(due) : ''].filter(Boolean).join(' · ')),
      missing ? el('span', { class: 'warn-text' }, '⚠️ Kein aktiver Vertrag hinterlegt') : null),
    el('span', { class: 'more' }, '›'));
}

const copyBtn = (v) => el('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Kopieren', onclick: async () => {
  try { await navigator.clipboard.writeText(v); toast('Kopiert'); } catch (e) { toast('Kopieren nicht möglich', { bad: true }); }
} }, '⧉');
function line(label, value, href, copy = true) {
  if (!value) return null;
  return el('div', { class: 'info-row' }, el('span', { class: 'hint' }, label),
    el('span', { class: 'info-val' }, href ? el('a', { href, target: href.startsWith('http') ? '_blank' : null, rel: 'noopener' }, value) : value, copy ? copyBtn(value) : null));
}
const webHref = (w) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

/* Neuestes Dokument zeigen, Rest per "Alle anzeigen" */
function docGroup(docs, key, open, redraw) {
  if (!docs.length) return null;
  const all = open.has(key);
  return el('div', { class: 'card-list doc-group' },
    ...(all ? docs : docs.slice(0, 1)).map(docRow),
    docs.length > 1 ? el('button', { class: 'link-btn', type: 'button', onclick: () => { if (all) open.delete(key); else open.add(key); redraw(); } }, all ? 'Weniger anzeigen' : `Alle anzeigen (${docs.length})`) : null);
}

/* Dokument mit einem Vertrag verknüpfen */
function openLinkDoc(c, k) {
  openSheet('Dokument verknüpfen', (body, close) => {
    const q = el('input', { type: 'search', class: 'search', placeholder: 'Dokument suchen …', autocomplete: 'off' });
    const list = el('div', { class: 'card-list' });
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      const docs = state.dms.docs
        .filter((d) => d.contractId !== k.id)
        .filter((d) => !t || `${d.title} ${(d.tags || []).join(' ')} ${d.note || ''}`.toLowerCase().includes(t))
        .sort((a, b) => (b.companyId === c.id) - (a.companyId === c.id) || b.date.localeCompare(a.date))
        .slice(0, 40);
      list.replaceChildren(...(docs.length ? docs.map((d) => {
        const row = docRow(d);
        const btn = el('button', { class: row.className, type: 'button', onclick: async () => {
          await saveDms(d.id, { companyId: c.id, contractId: k.id }, [], []);
          toast(`„${d.title}“ verknüpft`);
          close();
        } }, ...row.childNodes);
        return btn;
      }) : [el('p', { class: 'empty' }, 'Keine passenden Dokumente.')]));
    };
    q.addEventListener('input', draw);
    body.append(el('p', { class: 'hint' }, `Mit „${contractTitle(c, k)}“ verknüpfen. Dokumente von ${c.name} stehen oben.`), q, list);
    draw();
  });
}

/* Ansicht eines Unternehmens */
export function openCompany(c0) {
  const open = new Set();
  openSheet(c0.name, (body, close) => {
    const draw = () => {
      const c = companyById(c0.id) || c0;
      const docs = docsOf(c);
      const kIds = new Set((c.contracts || []).map((k) => k.id));
      const loose = docs.filter((d) => !kIds.has(d.contractId));
      const byCat = new Map();
      for (const d of loose) { const k = d.categoryId || ''; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push(d); }
      body.replaceChildren(
        ...(c.archived ? [el('p', { class: 'hint note-line' }, 'Archiviert: keine Verträge mehr mit diesem Unternehmen.')] : []),
        ...(!c.archived && !hasActive(c) ? [el('p', { class: 'note-line warn-line' }, '⚠️ Kein aktiver Vertrag hinterlegt. Bitte Vertrag nachtragen oder das Unternehmen archivieren.')] : []),
        el('h3', { class: 'section-title' }, 'Kundendaten'),
        el('div', { class: 'info-list' },
          line('Kundennummer', c.customerNo),
          line('Telefon', c.phone, c.phone ? `tel:${c.phone.replace(/[^\d+]/g, '')}` : ''),
          line('E-Mail', c.email, c.email ? `mailto:${c.email}` : ''),
          line('Website / Portal', c.web, c.web ? webHref(c.web) : ''),
          line('Login (Benutzername)', c.login),
          line('Adresse', c.address),
          ...(c.fields || []).map((f) => line(f.label, f.value))),
        ...((c.contracts || []).length ? [el('h3', { class: 'section-title' }, 'Verträge'), ...[...c.contracts].sort((a, b) => isActive(b) - isActive(a) || (b.start || '').localeCompare(a.start || '')).map((k) => {
          const d = deadlineOf(k);
          const active = isActive(k);
          const kd = docs.filter((x) => x.contractId === k.id);
          return el('div', { class: 'card contract' + (d && !d.past && d.days <= (k.remind ?? 30) ? ' warn' : '') + (active ? '' : ' ended') },
            el('div', { class: 'row between' }, el('strong', null, k.name || 'Vertrag'), el('span', { class: 'tag' + (active ? '' : ' muted') }, active ? (k.cancelled ? 'gekündigt' : 'aktiv') : 'beendet')),
            el('div', { class: 'info-list' },
              line('Vertragsnummer', k.number),
              line('Beginn', dateDe(k.start), '', false),
              line('Laufzeit bis', d ? dateDe(d.end) : dateDe(k.end), '', false),
              line('Kündigungsfrist', k.notice && !k.cancelled ? `${unitText(k.notice, k.unit)} zum Laufzeitende` : '', '', false),
              line('Verlängerung', k.cancelled ? '' : k.renew ? `automatisch um ${unitText(k.renew, 'm')}` : k.end ? 'keine' : '', '', false),
              line('Betrag', k.amount, '', false)),
            d && active ? el('p', { class: d.past ? 'hint' : 'deadline' }, deadlineLine(d)) : !active && k.end ? el('p', { class: 'hint' }, `Ausgelaufen am ${dateDe(k.end)}`) : k.cancelled && k.end ? el('p', { class: 'hint' }, `Gekündigt zum ${dateDe(k.end)}`) : null,
            docGroup(kd, 'k:' + k.id, open, draw),
            el('button', { class: 'link-btn', type: 'button', onclick: () => openLinkDoc(c, k) }, '+ Dokument verknüpfen'));
        })] : []),
        ...(c.note ? [el('h3', { class: 'section-title' }, 'Notiz'), el('p', { class: 'pre' }, c.note)] : []),
        ...(loose.length ? [el('h3', { class: 'section-title' }, (c.contracts || []).length ? 'Weitere Dokumente' : 'Dokumente'),
          ...[...byCat.entries()].map(([cat, list]) => {
            const ct = docCatOf(cat);
            return el('div', { class: 'cat-group' }, el('p', { class: 'hint' }, `${ct.icon} ${ct.name}`), docGroup(list, 'c:' + cat, open, draw));
          })] : (!docs.length ? [el('p', { class: 'hint' }, 'Noch keine Dokumente zu diesem Unternehmen.')] : [])),
        el('div', { class: 'row end actions' }, el('button', { class: 'btn primary', type: 'button', onclick: () => openCompanyEdit(c) }, '✏️ Bearbeiten')));
    };
    draw();
    const off = subscribe(draw);
    const obs = new MutationObserver(() => { if (!body.isConnected) { off(); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
  });
}

/* Unternehmen anlegen oder bearbeiten */
export function openCompanyEdit(c0) {
  const c = c0 ? JSON.parse(JSON.stringify(c0)) : { id: 'c' + uid(), name: '', aliases: [], fields: [], contracts: [], note: '' };
  openSheet(c0 ? `${c0.name} bearbeiten` : 'Neues Unternehmen', (body, close) => {
    const inp = (v, ph, type = 'text') => el('input', { type, value: v || '', placeholder: ph || '', autocomplete: 'off' });
    const name = inp(c.name, 'z. B. Willy.Tel');
    const aliases = inp((c.aliases || []).join(', '), 'z. B. Willytel, Internet');
    const customerNo = inp(c.customerNo), phone = inp(c.phone, '', 'tel'), email = inp(c.email, '', 'email'), web = inp(c.web, 'z. B. kundenportal.willytel.de'), login = inp(c.login);
    const address = el('textarea', { rows: '2' }, c.address || '');
    const note = el('textarea', { rows: '3', placeholder: 'z. B. Ansprechpartner, Tarif, Besonderheiten' }, c.note || '');
    const err = el('p', { class: 'form-info bad' });
    const archived = el('input', { type: 'checkbox', checked: !!c.archived });

    const fieldsBox = el('div', { class: 'edit-list' });
    const drawFields = () => fieldsBox.replaceChildren(...c.fields.map((f, i) => el('div', { class: 'row kv' },
      el('input', { type: 'text', value: f.label, placeholder: 'Bezeichnung', oninput: (e) => (f.label = e.target.value) }),
      el('input', { type: 'text', value: f.value, placeholder: 'Wert', oninput: (e) => (f.value = e.target.value) }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Entfernen', onclick: () => { c.fields.splice(i, 1); drawFields(); } }, '🗑'))));

    const kBox = el('div');
    const drawK = () => kBox.replaceChildren(...c.contracts.map((k, i) => {
      const set = (key, num) => (e) => { k[key] = num ? Math.max(0, parseInt(e.target.value, 10) || 0) : e.target.value; };
      const start = el('input', { type: 'date', value: k.start || '' }); start.addEventListener('change', set('start'));
      const end = el('input', { type: 'date', value: k.end || '' }); end.addEventListener('change', set('end'));
      const unit = el('select', { onchange: set('unit') }, ...Object.entries(UNITS).map(([u, l]) => el('option', { value: u, selected: (k.unit || 'm') === u }, l[1])));
      return el('div', { class: 'card contract-edit' },
        el('label', null, 'Bezeichnung', el('input', { type: 'text', value: k.name || '', placeholder: 'z. B. Strom, Internet 250', oninput: set('name') })),
        el('label', null, 'Vertragsnummer', el('input', { type: 'text', value: k.number || '', oninput: set('number') })),
        el('div', { class: 'row' }, el('label', { class: 'grow' }, 'Beginn', start), el('label', { class: 'grow' }, 'Laufzeit bis', end)),
        el('div', { class: 'row' },
          el('label', { class: 'grow' }, 'Kündigungsfrist', el('input', { type: 'number', min: '0', inputmode: 'numeric', value: k.notice || '', placeholder: 'z. B. 1', oninput: set('notice', true) })),
          el('label', { class: 'grow' }, 'Einheit', unit)),
        el('div', { class: 'row' },
          el('label', { class: 'grow' }, 'Verlängert sich um (Monate, 0 = nein)', el('input', { type: 'number', min: '0', inputmode: 'numeric', value: k.renew || '', placeholder: 'z. B. 12', oninput: set('renew', true) })),
          el('label', { class: 'grow' }, 'Erinnern (Tage vorher)', el('input', { type: 'number', min: '0', inputmode: 'numeric', value: k.remind ?? 30, oninput: set('remind', true) }))),
        el('label', null, 'Betrag (optional)', el('input', { type: 'text', value: k.amount || '', placeholder: 'z. B. 39,90 € / Monat', oninput: set('amount') })),
        el('label', { class: 'toggle-row' }, el('span', null, 'Gekündigt (läuft zum Laufzeitende aus)'), el('input', { type: 'checkbox', checked: !!k.cancelled, onchange: (e) => (k.cancelled = e.target.checked) })),
        el('button', { class: 'btn ghost danger-text', type: 'button', onclick: () => { c.contracts.splice(i, 1); drawK(); } }, 'Vertrag entfernen'));
    }));

    const save = async () => {
      c.name = name.value.trim();
      if (!c.name) return (err.textContent = 'Bitte einen Namen eingeben.');
      const others = companies().filter((x) => x.id !== c.id);
      if (others.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) return (err.textContent = 'Ein Unternehmen mit diesem Namen gibt es schon.');
      Object.assign(c, {
        aliases: aliases.value.split(',').map((x) => x.trim()).filter(Boolean),
        customerNo: customerNo.value.trim(), phone: phone.value.trim(), email: email.value.trim(), web: web.value.trim(), login: login.value.trim(),
        address: address.value.trim(), note: note.value.trim(), archived: archived.checked,
        fields: c.fields.map((f) => ({ label: f.label.trim(), value: f.value.trim() })).filter((f) => f.label || f.value),
        contracts: c.contracts.map((k) => ({ ...k, name: (k.name || '').trim(), notice: k.notice || 0, renew: k.renew || 0, remind: k.remind ?? 30 }))
      });
      const bad = c.contracts.find((k) => k.start && k.end && k.end < k.start);
      if (bad) return (err.textContent = 'Bei einem Vertrag liegt das Laufzeitende vor dem Beginn.');
      const list = companies().some((x) => x.id === c.id) ? companies().map((x) => (x.id === c.id ? c : x)) : [...companies(), c];
      await saveCompanies(list);
      close();
    };

    body.append(
      el('label', null, 'Name', name),
      el('label', null, 'Weitere Namen für die Suche (mit Komma)', aliases),
      el('h3', null, 'Kundendaten'),
      el('label', null, 'Kundennummer', customerNo),
      el('label', null, 'Telefon (Hotline)', phone),
      el('label', null, 'E-Mail', email),
      el('label', null, 'Website / Kundenportal', web),
      el('label', null, 'Login (nur Benutzername, kein Passwort)', login),
      el('label', null, 'Adresse', address),
      el('p', { class: 'hint' }, 'Weitere Angaben (z. B. Zählernummer, IBAN-Hinweis, Ansprechpartner)'),
      fieldsBox,
      el('button', { class: 'btn ghost', type: 'button', onclick: () => { c.fields.push({ label: '', value: '' }); drawFields(); } }, '+ Angabe'),
      el('h3', null, 'Verträge'),
      kBox,
      el('button', { class: 'btn ghost', type: 'button', onclick: () => { c.contracts.push({ id: 'k' + uid(), name: '', unit: 'm', remind: 30 }); drawK(); } }, '+ Vertrag'),
      el('label', null, 'Notiz', note),
      el('label', { class: 'toggle-row' }, el('span', null, 'Archiviert (keine Verträge mehr)'), archived),
      err,
      el('div', { class: 'row between actions' },
        c0 ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          const n = docsOf(c0).length;
          if (!(await confirmSheet('Unternehmen löschen?', `„${c0.name}“ mit Kundendaten und Verträgen löschen?${n ? ` Die ${n} Dokumente bleiben erhalten.` : ''}`, 'Löschen'))) return;
          await saveCompanies(companies().filter((x) => x.id !== c0.id));
          close();
        } }, 'Löschen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern')));
    drawFields(); drawK();
  });
}

/* Übersicht aller Unternehmen */
export function openCompanyList() {
  openSheet('Vertragsdaten', (body) => {
    const q = el('input', { type: 'search', class: 'search', placeholder: 'Unternehmen, Kunden- oder Vertragsnummer …', autocomplete: 'off' });
    const list = el('div');
    let showArch = false;
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      const match = (c) => !t || [c.name, ...(c.aliases || []), c.customerNo, ...(c.contracts || []).flatMap((k) => [k.name, k.number])].some((x) => x && String(x).toLowerCase().includes(t));
      const all = [...companies()].filter(match).sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const act = all.filter((c) => !c.archived);
      const arch = all.filter((c) => c.archived);
      list.replaceChildren(
        act.length ? el('div', { class: 'card-list' }, ...act.map(companyCard)) : el('p', { class: 'empty' }, companies().length ? 'Nichts gefunden.' : 'Noch keine Unternehmen.'),
        ...(arch.length ? [
          el('button', { class: 'link-btn', type: 'button', onclick: () => { showArch = !showArch; draw(); } }, showArch ? `Archiv ausblenden` : `Archiv anzeigen (${arch.length})`),
          ...(showArch || t ? [el('div', { class: 'card-list' }, ...arch.map(companyCard))] : [])] : []));
    };
    q.addEventListener('input', draw);
    body.append(q, list, el('div', { class: 'row end actions' }, el('button', { class: 'btn primary', type: 'button', onclick: () => openCompanyEdit(null) }, '+ Unternehmen')));
    draw();
    const off = subscribe(draw);
    const obs = new MutationObserver(() => { if (!body.isConnected) { off(); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
  });
}
