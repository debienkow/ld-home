/* Gemeinsame Daten (Echtzeit aus Firestore) */
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { db } from './firebase.js';
import { USERS } from './config.js';
import { toast } from './dom.js';
import { BUILTIN_CATALOG, DEFAULT_CATEGORIES, DEFAULT_STORES } from './catalog.js';
import * as FL from './finlogic.js';
import { DEFAULT_EVENT_CATEGORIES } from './evlogic.js';
import { DEFAULT_DMS_CATEGORIES } from './dmslogic.js';

const blank = () => ({
  user: null,
  items: [],
  learned: new Map(),
  settings: { categories: DEFAULT_CATEGORIES, stores: DEFAULT_STORES },
  profiles: {},
  fin: {
    entries: [],
    recurring: [],
    config: {
      categories: FL.DEFAULT_CATEGORIES,
      incomeCategories: FL.DEFAULT_INCOME_CATEGORIES,
      rules: FL.DEFAULT_RULES,
      salaries: { logi: 0, dudi: 0 }
    }
  },
  ev: {
    events: [],
    ideas: [],
    config: { categories: DEFAULT_EVENT_CATEGORIES }
  },
  dms: { docs: [], config: { categories: DEFAULT_DMS_CATEGORIES } },
  online: navigator.onLine
});
export const state = blank();

const listeners = new Set();
let unsubs = [];

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
let emitQueued = false;
const emit = () => {
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => {
    emitQueued = false;
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  });
};

/* Fehler melden (einmal je Fehler) */
function report(e) {
  if (!e || e.reported) return;
  e.reported = true;
  console.error(e);
  toast(e.code === 'permission-denied' ? 'Keine Berechtigung für diese Aktion.' : 'Speichern hat nicht geklappt. Bitte nochmal versuchen.', { bad: true });
}
window.addEventListener('unhandledrejection', (ev) => { if (ev.reason && ev.reason.reported) ev.preventDefault(); });

/* Schreibvorgang: offline nicht auf den Server warten, Fehler melden */
function settle(p, ms = 4000) {
  const guarded = Promise.resolve(p).catch((e) => { report(e); throw e; });
  guarded.catch(() => {});
  return Promise.race([guarded, new Promise((r) => setTimeout(r, state.online ? ms : 0))]);
}

let snapWarned = false;
const snapError = (e) => {
  console.error(e);
  if (snapWarned) return;
  snapWarned = true;
  toast(e && e.code === 'permission-denied' ? 'Dieses Konto darf die Daten nicht lesen.' : 'Daten konnten nicht geladen werden. Bitte Verbindung prüfen.', { bad: true, ms: 7000 });
};

/* Nur vollständige Datensätze übernehmen */
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const rows = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id }));
const cleanEntries = (list) => list.filter((x) => isDate(x.date) && Number.isFinite(x.cents)).map((x) => ({ ...x, title: String(x.title ?? '') }));
const cleanEvents = (list) => list.filter((x) => isDate(x.start)).map((x) => ({ ...x, title: String(x.title ?? '') || '(ohne Titel)', end: isDate(x.end) && x.end >= x.start ? x.end : x.start }));
const cleanDocs = (list) => list.map((x) => ({ ...x, title: String(x.title ?? '') || '(ohne Titel)', date: isDate(x.date) ? x.date : new Date(x.createdAt || Date.now()).toLocaleDateString('sv-SE') }));
const cleanItems = (list) => list.filter((x) => typeof x.name === 'string' && x.name);
/* Private Einträge nur für den Besitzer */
export const mine = (x) => !x.owner || (state.user && x.owner === state.user.uid);
const listOr = (v, fallback) => (Array.isArray(v) && v.length ? v : fallback);

export const norm = (s) => s.trim().toLowerCase();
export const userName = (uid) => {
  const custom = state.profiles[uid] && state.profiles[uid].displayName;
  return custom || (USERS[uid] ? USERS[uid].name : 'Unbekannt');
};

export const showCatHeaders = () => {
  const p = state.user && state.profiles[state.user.uid];
  return !(p && p.showCatHeaders === false);
};

/* Alle bekannten Artikel: Start-Katalog + Gelerntes */
export function catalogEntries() {
  const map = new Map();
  for (const e of BUILTIN_CATALOG) map.set(norm(e.name), e);
  for (const [k, v] of state.learned) map.set(k, v);
  return [...map.values()];
}

export function startStore(user) {
  if (unsubs.length) stopStore();
  state.user = user;
  const first = { items: true };

  unsubs.push(
    onSnapshot(doc(db, 'config', 'shopping'), async (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        state.settings = {
          categories: listOr(d.categories, DEFAULT_CATEGORIES),
          stores: Array.isArray(d.stores) ? d.stores : DEFAULT_STORES
        };
      } else if (!snap.metadata.fromCache) {
        setDoc(doc(db, 'config', 'shopping'), state.settings).catch(() => {});
      }
      emit();
    }, snapError)
  );

  unsubs.push(
    onSnapshot(collection(db, 'items'), (snap) => {
      state.items = cleanItems(rows(snap));
      if (first.items && !snap.metadata.fromCache) {
        first.items = false;
        cleanupDone();
      }
      emit();
    }, snapError)
  );

  unsubs.push(
    onSnapshot(collection(db, 'catalog'), (snap) => {
      state.learned = new Map(snap.docs.map((d) => [d.id, d.data()]));
      emit();
    }, snapError)
  );

  unsubs.push(
    onSnapshot(collection(db, 'profiles'), (snap) => {
      state.profiles = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
      emit();
    }, snapError)
  );

  unsubs.push(
    onSnapshot(collection(db, 'fin_entries'), (snap) => {
      state.fin.entries = cleanEntries(rows(snap));
      emit();
    }, snapError)
  );

  unsubs.push(
    onSnapshot(collection(db, 'fin_recurring'), (snap) => {
      state.fin.recurring = rows(snap).filter((r) => typeof r.title === 'string');
      emit();
    }, snapError)
  );

  unsubs.push(
    onSnapshot(doc(db, 'config', 'finance'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        const base = blank().fin.config;
        state.fin.config = { ...base, ...d, categories: listOr(d.categories, base.categories), incomeCategories: listOr(d.incomeCategories, base.incomeCategories), rules: Array.isArray(d.rules) ? d.rules : base.rules, salaries: { ...base.salaries, ...(d.salaries || {}) } };
      }
      emit();
    }, snapError)
  );

  unsubs.push(
    onSnapshot(collection(db, 'events'), (snap) => {
      state.ev.events = cleanEvents(rows(snap)).filter(mine);
      state.ev.loaded = true;
      emit();
    }, snapError)
  );
  unsubs.push(
    onSnapshot(collection(db, 'event_ideas'), (snap) => {
      state.ev.ideas = rows(snap).filter((r) => typeof r.title === 'string');
      emit();
    }, snapError)
  );
  unsubs.push(
    onSnapshot(doc(db, 'config', 'events'), (snap) => {
      if (snap.exists()) { const d = snap.data(); state.ev.config = { ...d, categories: listOr(d.categories, DEFAULT_EVENT_CATEGORIES) }; }
      emit();
    }, snapError)
  );

  unsubs.push(
    onSnapshot(collection(db, 'dms_docs'), (snap) => {
      state.dms.docs = cleanDocs(rows(snap)).filter(mine);
      emit();
    }, snapError)
  );
  unsubs.push(
    onSnapshot(doc(db, 'config', 'dms'), (snap) => {
      if (snap.exists()) { const d = snap.data(); state.dms.config = { ...d, categories: listOr(d.categories, DEFAULT_DMS_CATEGORIES) }; }
      state.dms.cfgLoaded = true;
      emit();
    }, snapError)
  );

}

const net = () => {
  state.online = navigator.onLine;
  emit();
};
window.addEventListener('online', net);
window.addEventListener('offline', net);

export function stopStore() {
  unsubs.forEach((u) => u());
  unsubs = [];
  snapWarned = false;
  Object.assign(state, blank());
}

/* Abgehakte Artikel nach 14 Tagen aufräumen */
function cleanupDone() {
  const limit = Date.now() - 14 * 24 * 3600 * 1000;
  state.items
    .filter((i) => i.done && (i.doneAt || 0) < limit)
    .forEach((i) => deleteDoc(doc(db, 'items', i.id)).catch(() => {}));
}

const stamp = () => ({ createdBy: state.user.uid, createdAt: Date.now() });
const strip = (o) => { const { id, ...rest } = o; return rest; };
/* Neu anlegen mit sofort bekannter Id */
function create(col, data) {
  const ref = doc(collection(db, col));
  return settle(setDoc(ref, { ...data, ...stamp() })).then(() => ref.id);
}

export const addItem = (item) =>
  create('items', {
    name: item.name,
    qty: item.qty || '',
    categoryId: item.categoryId || 'sonstiges',
    store: item.store || null,
    done: false,
    doneAt: 0
  });

export const setDone = (id, done) =>
  settle(updateDoc(doc(db, 'items', id), { done, doneAt: done ? Date.now() : 0 }));

export const updateItem = (id, patch) => settle(updateDoc(doc(db, 'items', id), patch));
export const removeItem = (id) => settle(deleteDoc(doc(db, 'items', id)));
export const restoreItem = (item) => settle(setDoc(doc(db, 'items', item.id), strip(item)));

const catalogId = (name) => {
  const id = norm(name).replace(/\//g, '-').slice(0, 200);
  return /^\.+$|^__.*__$/.test(id) || !id ? `x-${id}` : id;
};
export const learn = (name, categoryId) =>
  settle(setDoc(doc(db, 'catalog', catalogId(name)), { name: name.trim(), categoryId }));

export const myKey = () => (state.user && USERS[state.user.uid] ? USERS[state.user.uid].key : 'dudi');
export const uidOfKey = (key) => Object.keys(USERS).find((u) => USERS[u].key === key);
export const nameOfKey = (key) => userName(uidOfKey(key));

export const saveEntry = (id, data) =>
  id ? settle(setDoc(doc(db, 'fin_entries', id), data, { merge: true })) : create('fin_entries', data);
export const removeEntry = (id) => settle(deleteDoc(doc(db, 'fin_entries', id)));
export const saveRecurring = (id, data) =>
  id ? settle(setDoc(doc(db, 'fin_recurring', id), data)) : create('fin_recurring', data);
export const removeRecurring = (id) => settle(deleteDoc(doc(db, 'fin_recurring', id)));
export const saveFinConfig = (patch) => settle(setDoc(doc(db, 'config', 'finance'), patch, { merge: true }));

export const saveSettings = (settings) => settle(setDoc(doc(db, 'config', 'shopping'), settings));
export const saveProfile = (patch) => settle(setDoc(doc(db, 'profiles', state.user.uid), patch, { merge: true }));
export const saveProfilePhoto = (dataUrl) => saveProfile({ photo: dataUrl });

export { getDoc };

export const saveEvent = async (id, data) => {
  if (id) { await settle(setDoc(doc(db, 'events', id), data, { merge: true })); return id; }
  return create('events', data);
};
export const removeEvent = (id) => settle(deleteDoc(doc(db, 'events', id)));
export const saveIdea = (id, data) =>
  id ? settle(setDoc(doc(db, 'event_ideas', id), data, { merge: true })) : create('event_ideas', data);
export const removeIdea = (id) => settle(deleteDoc(doc(db, 'event_ideas', id)));
export const restoreIdea = (idea) => settle(setDoc(doc(db, 'event_ideas', idea.id), strip(idea)));
export const saveEvConfig = (patch) => settle(setDoc(doc(db, 'config', 'events'), patch, { merge: true }));
export const replaceEvConfigField = (patch) => settle(updateDoc(doc(db, 'config', 'events'), patch));

export const saveDmsConfig = (patch) => settle(setDoc(doc(db, 'config', 'dms'), patch, { merge: true }));
export async function loadPages(docId) {
  const snap = await getDocs(query(collection(db, 'dms_pages'), where('docId', '==', docId)));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => a.idx - b.idx);
}

/* Dokument speichern: erst neue Seiten (in Paketen unter dem 10-MiB-Limit), zuletzt Metadaten und entfernte Seiten */
const LONG = 90000;
export async function saveDms(id, meta, newPages, removedIds) {
  const ref = id ? doc(db, 'dms_docs', id) : doc(collection(db, 'dms_docs'));
  let batch = writeBatch(db), size = 0, n = 0;
  for (const p of newPages) {
    if (n && (size + p.img.length > 6000000 || n >= 200)) { await settle(batch.commit(), LONG); batch = writeBatch(db); size = 0; n = 0; }
    batch.set(doc(collection(db, 'dms_pages')), { docId: ref.id, idx: p.idx, img: p.img });
    size += p.img.length; n++;
  }
  if (n) await settle(batch.commit(), LONG);
  const last = writeBatch(db);
  (removedIds || []).forEach((pid) => last.delete(doc(db, 'dms_pages', pid)));
  if (id) last.set(ref, meta, { merge: true }); else last.set(ref, { ...meta, ...stamp() });
  await settle(last.commit(), LONG);
  return ref.id;
}
export async function removeDms(id) {
  const pages = await loadPages(id);
  for (let i = 0; i < pages.length; i += 400) {
    const batch = writeBatch(db);
    pages.slice(i, i + 400).forEach((p) => batch.delete(doc(db, 'dms_pages', p.id)));
    await settle(batch.commit(), LONG);
  }
  await settle(deleteDoc(doc(db, 'dms_docs', id)));
}
