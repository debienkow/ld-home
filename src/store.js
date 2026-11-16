/* Gemeinsame Daten (Echtzeit aus Firestore) */
import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc
} from 'firebase/firestore';
import { db } from './firebase.js';
import { USERS } from './config.js';
import { BUILTIN_CATALOG, DEFAULT_CATEGORIES, DEFAULT_STORES } from './catalog.js';

export const state = {
  user: null,
  items: [],
  learned: new Map(),
  settings: { categories: DEFAULT_CATEGORIES, stores: DEFAULT_STORES },
  profiles: {},
  online: navigator.onLine
};

const listeners = new Set();
let unsubs = [];

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

export const norm = (s) => s.trim().toLowerCase();
export const userName = (uid) => (USERS[uid] ? USERS[uid].name : 'Unbekannt');

/* Alle bekannten Artikel: Start-Katalog + Gelerntes */
export function catalogEntries() {
  const map = new Map();
  for (const e of BUILTIN_CATALOG) map.set(norm(e.name), e);
  for (const [k, v] of state.learned) map.set(k, v);
  return [...map.values()];
}

export function startStore(user) {
  state.user = user;
  const first = { items: true };

  unsubs.push(
    onSnapshot(doc(db, 'config', 'shopping'), async (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        state.settings = {
          categories: d.categories || DEFAULT_CATEGORIES,
          stores: d.stores || DEFAULT_STORES
        };
      } else if (!snap.metadata.fromCache) {
        await setDoc(doc(db, 'config', 'shopping'), state.settings);
      }
      emit();
    })
  );

  unsubs.push(
    onSnapshot(collection(db, 'items'), (snap) => {
      state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (first.items && !snap.metadata.fromCache) {
        first.items = false;
        cleanupDone();
      }
      emit();
    })
  );

  unsubs.push(
    onSnapshot(collection(db, 'catalog'), (snap) => {
      state.learned = new Map(snap.docs.map((d) => [d.id, d.data()]));
      emit();
    })
  );

  unsubs.push(
    onSnapshot(collection(db, 'profiles'), (snap) => {
      state.profiles = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
      emit();
    })
  );

  const net = () => {
    state.online = navigator.onLine;
    emit();
  };
  window.addEventListener('online', net);
  window.addEventListener('offline', net);
}

export function stopStore() {
  unsubs.forEach((u) => u());
  unsubs = [];
  state.items = [];
  state.user = null;
}

/* Abgehakte Artikel nach 14 Tagen aufräumen */
function cleanupDone() {
  const limit = Date.now() - 14 * 24 * 3600 * 1000;
  state.items
    .filter((i) => i.done && (i.doneAt || 0) < limit)
    .forEach((i) => deleteDoc(doc(db, 'items', i.id)));
}

export const addItem = (item) =>
  addDoc(collection(db, 'items'), {
    name: item.name,
    qty: item.qty || '',
    categoryId: item.categoryId || 'sonstiges',
    store: item.store || null,
    done: false,
    doneAt: 0,
    createdBy: state.user.uid,
    createdAt: Date.now()
  });

export const setDone = (id, done) =>
  updateDoc(doc(db, 'items', id), { done, doneAt: done ? Date.now() : 0 });

export const updateItem = (id, patch) => updateDoc(doc(db, 'items', id), patch);
export const removeItem = (id) => deleteDoc(doc(db, 'items', id));

export const learn = (name, categoryId) =>
  setDoc(doc(db, 'catalog', norm(name).replace(/\//g, '-')), { name: name.trim(), categoryId });

export const saveSettings = (settings) => setDoc(doc(db, 'config', 'shopping'), settings);

export async function saveProfilePhoto(dataUrl) {
  await setDoc(doc(db, 'profiles', state.user.uid), { photo: dataUrl }, { merge: true });
}

export { getDoc };
