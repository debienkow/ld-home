/* Demo-Modus: Firestore-Ersatz im Arbeitsspeicher (nur für Tests, keine echten Daten) */
import { seed } from './seed.js';

const data = seed();
const listeners = [];
const colOf = (name) => (data[name] = data[name] || {});
let counter = 0;
export const initializeFirestore = () => ({ demo: true });
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const collection = (_db, name) => ({ kind: 'col', name });
export const doc = (a, name, id) => (a.kind === 'col' ? { kind: 'doc', col: a.name, id: 'd' + Date.now().toString(36) + counter++ } : { kind: 'doc', col: name, id });
export const where = (field, op, value) => ({ field, op, value });
export const query = (col, ...conds) => ({ ...col, conds });

const colSnap = (name, conds) => {
  let docs = Object.entries(colOf(name)).map(([id, d]) => ({ id, data: () => structuredClone(d), exists: () => true }));
  for (const c of conds || []) docs = docs.filter((d) => d.data()[c.field] === c.value);
  return { docs, metadata: { fromCache: false } };
};
const docSnap = (ref) => {
  const d = colOf(ref.col)[ref.id];
  return { id: ref.id, exists: () => d !== undefined, data: () => (d === undefined ? undefined : structuredClone(d)), metadata: { fromCache: false } };
};
const notify = (name) => listeners.filter((l) => l.name === name).forEach((l) => l.run());

export function onSnapshot(ref, cb) {
  const l = { name: ref.kind === 'col' ? ref.name : ref.col, run: () => cb(ref.kind === 'col' ? colSnap(ref.name, ref.conds) : docSnap(ref)) };
  listeners.push(l);
  setTimeout(l.run, 0);
  return () => listeners.splice(listeners.indexOf(l), 1);
}
const put = (ref, value, merge) => {
  const c = colOf(ref.col);
  const clean = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
  c[ref.id] = merge && c[ref.id] ? deepMerge(c[ref.id], clean) : clean;
};
const deepMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v;
  return out;
};
export async function setDoc(ref, value, opts) { put(ref, value, opts && opts.merge); notify(ref.col); }
export async function addDoc(col, value) { const ref = doc(col); put(ref, value, false); notify(col.name); return ref; }
export async function updateDoc(ref, patch) { put(ref, patch, true); notify(ref.col); }
export async function deleteDoc(ref) { delete colOf(ref.col)[ref.id]; notify(ref.col); }
export async function getDoc(ref) { return docSnap(ref); }
export async function getDocs(q) { return colSnap(q.name, q.conds); }
export function writeBatch() {
  const ops = [];
  return {
    set: (ref, v, o) => ops.push(() => put(ref, v, o && o.merge)),
    delete: (ref) => ops.push(() => delete colOf(ref.col)[ref.id]),
    commit: async () => { ops.forEach((o) => o()); [...new Set(listeners.map((l) => l.name))].forEach(notify); }
  };
}
