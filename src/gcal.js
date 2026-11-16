/* Google-Kalender-Sync über ein Apps-Script (Web-App im Google-Konto) */
import { endOf, addDays, todayIso } from './evlogic.js';
import { removeEvent, saveEvent, state, subscribe } from './store.js';
import { setDoc, doc } from 'firebase/firestore';
import { db } from './firebase.js';

export const gcalConfig = () => state.ev.config.gcal || null;
export const gcalReady = () => { const g = gcalConfig(); return !!(g && g.url && g.token); };

async function call(action, payload = {}) {
  const g = gcalConfig();
  const r = await fetch(g.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: g.token, action, ...payload }) });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data;
}
export const gcalPing = () => call('ping');

const toG = (e) => ({ gid: e.gid || '', title: e.title, allDay: e.allDay !== false, start: e.start, end: endOf(e), startTime: e.startTime || '', endTime: e.endTime || '', location: e.location || '', note: e.note || '' });
const sameFields = (e, g) => e.title === g.title && e.start === g.start && endOf(e) === g.end && (e.allDay !== false) === g.allDay && (e.startTime || '') === g.startTime && (e.endTime || '') === g.endTime && (e.location || '') === g.location && (e.note || '') === g.note;
const idFor = (gid) => 'g_' + gid.replace(/[^A-Za-z0-9]/g, '').slice(0, 60);

/* Nach dem Speichern eines Termins nach Google schreiben */
export async function pushEvent(id, event) {
  if (!gcalReady()) return;
  try {
    const r = await call('upsert', { event: toG(event) });
    await saveEvent(id, { gid: r.gid, gsyncedAt: r.updated });
  } catch (e) { /* wird beim nächsten Abgleich nachgeholt */ }
}
export async function pushDelete(gid) {
  if (!gcalReady() || !gid) return;
  try { await call('delete', { gid }); } catch (e) { /* ignorieren */ }
}

let running = false;
/* Google -> App und fehlende Termine hochladen */
export async function syncNow() {
  if (!gcalReady() || running || !state.user) return { ok: false };
  running = true;
  try {
    const from = addDays(todayIso(), -30), to = addDays(todayIso(), 400);
    const { events: gevs } = await call('list', { from, to });
    const byGid = new Map(gevs.map((g) => [g.gid, g]));
    const local = state.ev.events;
    const localByGid = new Map(local.filter((e) => e.gid).map((e) => [e.gid, e]));
    let changes = 0;
    for (const g of gevs) {
      const e = localByGid.get(g.gid);
      if (!e) {
        await saveEvent(idFor(g.gid), { title: g.title, categoryId: 'sonstiges', start: g.start, end: g.end, allDay: g.allDay, startTime: g.startTime, endTime: g.endTime, location: g.location, note: g.note, important: false, participants: ['dudi', 'logi'], vacation: [], rsvp: {}, gid: g.gid, gsyncedAt: g.updated, createdBy: state.user.uid, createdAt: Date.now() });
        changes++;
      } else if (g.updated > (e.gsyncedAt || 0) + 1500 && !sameFields(e, g)) {
        await saveEvent(e.id, { title: g.title, start: g.start, end: g.end, allDay: g.allDay, startTime: g.startTime, endTime: g.endTime, location: g.location, note: g.note, gsyncedAt: g.updated });
        changes++;
      }
    }
    for (const e of local) {
      const inRange = endOf(e) >= from && e.start <= to;
      if (e.gid && !byGid.has(e.gid) && inRange) { await removeEvent(e.id); changes++; }
      else if (!e.gid && inRange && e.createdBy === state.user.uid) { await pushEvent(e.id, e); changes++; }
    }
    return { ok: true, changes };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  } finally { running = false; }
}

/* Einmalig: alte Termine (vor dem Abgleichfenster) aus allen eigenen Kalendern des Kontos holen */
export async function importOld() {
  if (!gcalReady() || !state.user) return { ok: false, error: 'nicht verbunden' };
  try {
    const { events: gevs } = await call('listAll', { from: '2000-01-01', to: addDays(todayIso(), -31) });
    const have = new Set(state.ev.events.filter((e) => e.gid).map((e) => e.gid));
    let n = 0;
    for (const g of gevs) {
      if (have.has(g.gid)) continue;
      await saveEvent(idFor(g.gid), { title: g.title, categoryId: 'sonstiges', start: g.start, end: g.end, allDay: g.allDay, startTime: g.startTime, endTime: g.endTime, location: g.location, note: g.note, important: false, participants: ['dudi', 'logi'], vacation: [], rsvp: {}, gid: g.gid, gsyncedAt: g.updated, createdBy: state.user.uid, createdAt: Date.now() });
      n++;
    }
    return { ok: true, count: n };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

export const saveGcalConfig = (cfg) => setDoc(doc(db, 'config', 'events'), { gcal: cfg }, { merge: true });

let started = false;
export function startGcalSync() {
  if (started) return;
  started = true;
  setTimeout(syncNow, 4000);
  setInterval(syncNow, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
}
