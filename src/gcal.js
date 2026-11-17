/* Google-Kalender-Sync über ein Apps-Script (Web-App im Google-Konto) */
import { endOf, addDays, todayIso } from './evlogic.js';
import { removeEvent, saveEvConfig, saveEvent, state } from './store.js';

export const gcalConfig = () => state.ev.config.gcal || null;
export const validGcalUrl = (u) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(u || '').trim());
export const gcalReady = () => { const g = gcalConfig(); return !!(g && g.token && validGcalUrl(g.url)); };

async function call(action, payload = {}) {
  const g = gcalConfig();
  if (!g || !validGcalUrl(g.url)) throw new Error('url');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(g.url.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: g.token, action, ...payload }), signal: ctl.signal, referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`http ${r.status}`);
    const data = await r.json();
    if (!data || data.error) throw new Error((data && data.error) || 'antwort');
    return data;
  } finally { clearTimeout(timer); }
}
export const gcalPing = () => call('ping');

const toG = (e) => ({ gid: e.gid || '', title: e.title, allDay: e.allDay !== false, start: e.start, end: endOf(e), startTime: e.startTime || '', endTime: e.endTime || '', location: e.location || '', note: e.note || '' });
const sameFields = (e, g) => e.title === g.title && e.start === g.start && endOf(e) === g.end && (e.allDay !== false) === g.allDay && (e.startTime || '') === g.startTime && (e.endTime || '') === g.endTime && (e.location || '') === g.location && (e.note || '') === g.note;
const idFor = (key) => 'g_' + key.replace(/[^A-Za-z0-9]/g, '').slice(0, 80);
const fromG = (g) => ({ title: String(g.title || '(ohne Titel)'), start: g.start, end: g.end, allDay: !!g.allDay, startTime: g.startTime || '', endTime: g.endTime || '', location: g.location || '', note: g.note || '' });
const okG = (g) => g && typeof g.gid === 'string' && g.gid && /^\d{4}-\d{2}-\d{2}$/.test(g.start || '');
const keyOfLocal = (e) => e.gkey || e.gid;

/* Serientermine haben je Vorkommen dieselbe Google-Id: Schlüssel um das Datum ergänzen */
function withKeys(gevs) {
  const list = gevs.filter(okG);
  const count = new Map();
  for (const g of list) count.set(g.gid, (count.get(g.gid) || 0) + 1);
  return list.map((g) => {
    const series = !!g.recurring || count.get(g.gid) > 1;
    return { ...g, series, key: series ? `${g.gid}#${g.start}` : g.gid };
  });
}
const newLocal = (g) => ({ ...fromG(g), categoryId: 'sonstiges', important: false, participants: ['dudi', 'logi'], vacation: [], rsvp: {}, gid: g.gid, ...(g.series ? { gkey: g.key, gser: true } : {}), gsyncedAt: g.updated || Date.now(), createdBy: state.user.uid, createdAt: Date.now() });

/* Nach dem Speichern eines Termins nach Google schreiben */
export async function pushEvent(id, event) {
  if (!gcalReady() || event.gser) return;
  try {
    const r = await call('upsert', { event: toG(event) });
    await saveEvent(id, { gid: r.gid, gsyncedAt: r.updated || Date.now() });
  } catch (e) { /* wird beim nächsten Abgleich nachgeholt */ }
}
export async function pushDelete(gid) {
  if (!gcalReady() || !gid) return;
  try { await call('delete', { gid }); } catch (e) { /* ignorieren */ }
}

const FRESH = 10 * 60 * 1000;
let running = false;
/* Google -> App und fehlende Termine hochladen */
export async function syncNow(opts = {}) {
  if (!gcalReady() || running || !state.user || !navigator.onLine) return { ok: false };
  running = true;
  try {
    const from = addDays(todayIso(), -30), to = addDays(todayIso(), 400);
    const res = await call('list', { from, to });
    if (!Array.isArray(res.events)) throw new Error('antwort');
    if (!state.user) return { ok: false };
    const gevs = withKeys(res.events);
    const byKey = new Map(gevs.map((g) => [g.key, g]));
    const local = state.ev.events;
    const localByKey = new Map(local.filter((e) => e.gid).map((e) => [keyOfLocal(e), e]));
    let changes = 0;
    for (const g of byKey.values()) {
      const e = localByKey.get(g.key);
      if (!e) {
        await saveEvent(idFor(g.key), newLocal(g));
        changes++;
      } else if (g.updated > (e.gsyncedAt || 0) + 1500 && !sameFields(e, g)) {
        await saveEvent(e.id, { ...fromG(g), gsyncedAt: g.updated });
        changes++;
      }
    }
    const inRange = (e) => endOf(e) >= from && e.start <= to;
    const synced = local.filter((e) => e.gid && inRange(e));
    const gone = synced.filter((e) => !byKey.has(keyOfLocal(e)) && Date.now() - (e.gsyncedAt || 0) > FRESH);
    let skipped = 0;
    const risky = (!gevs.length && gone.length >= 2) || (gone.length > 5 && gone.length > synced.length / 2);
    if (risky && !opts.force) skipped = gone.length;
    else for (const e of gone) { await removeEvent(e.id); changes++; }
    for (const e of local) {
      if (!e.gid && inRange(e) && e.createdBy === state.user.uid) { await pushEvent(e.id, e); changes++; }
    }
    return { ok: true, changes, skipped };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  } finally { running = false; }
}

/* Einmalig: alte Termine (vor dem Abgleichfenster) aus allen eigenen Kalendern des Kontos holen */
export async function importOld() {
  if (!gcalReady() || !state.user) return { ok: false, error: 'nicht verbunden' };
  try {
    const res = await call('listAll', { from: '2000-01-01', to: addDays(todayIso(), -31) });
    const have = new Set(state.ev.events.filter((e) => e.gid).map(keyOfLocal));
    let n = 0;
    for (const g of withKeys(res.events || [])) {
      if (have.has(g.key)) continue;
      have.add(g.key);
      await saveEvent(idFor(g.key), newLocal(g));
      n++;
    }
    return { ok: true, count: n };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

export const saveGcalConfig = (cfg) => saveEvConfig({ gcal: cfg });

let started = false;
export function startGcalSync() {
  if (started) return;
  started = true;
  setTimeout(syncNow, 4000);
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => syncNow());
}
