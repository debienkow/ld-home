/* Import (Excel-JSON) und Datensicherung */
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';
import { confirmSheet, downloadBlob, toast } from './dom.js';
import { saveFinConfig } from './store.js';

/* Import-Datei einspielen */
export async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    toast('Die Datei konnte nicht gelesen werden.', { bad: true });
    return;
  }
  const okId = (x) => x && typeof x.id === 'string' && /^[\w-]{1,120}$/.test(x.id);
  const all = [...(Array.isArray(data && data.entries) ? data.entries : []), ...(Array.isArray(data && data.recurring) ? data.recurring : [])];
  const entries = (Array.isArray(data && data.entries) ? data.entries : []).filter((e) => okId(e) && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && Number.isInteger(e.cents) && ['expense', 'income', 'settlement'].includes(e.type));
  const recurring = (Array.isArray(data && data.recurring) ? data.recurring : []).filter((r) => okId(r) && typeof r.title === 'string' && Array.isArray(r.versions));
  const bad = all.length - entries.length - recurring.length;
  if (!entries.length && !recurring.length) {
    toast('In der Datei sind keine gültigen Einträge.', { bad: true });
    return;
  }
  const ok = await confirmSheet('Import starten?', `${entries.length} Einträge und ${recurring.length} laufende Posten importieren? Bereits importierte werden überschrieben, nicht doppelt angelegt.${bad ? ` ${bad} fehlerhafte Zeilen werden übersprungen.` : ''}`, 'Importieren', false);
  if (!ok) return;

  const jobs = [
    ...entries.map((e) => [doc(db, 'fin_entries', e.id), { ...e, id: undefined, createdAt: Date.parse(e.date) || Date.now() }]),
    ...recurring.map((r) => [doc(db, 'fin_recurring', r.id), { ...r, id: undefined }])
  ];
  for (let i = 0; i < jobs.length; i += 400) {
    const batch = writeBatch(db);
    for (const [ref, payload] of jobs.slice(i, i + 400)) {
      const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
      batch.set(ref, clean);
    }
    try { await batch.commit(); } catch (e) { toast('Import abgebrochen. Bitte Verbindung prüfen und nochmal starten.', { bad: true }); return; }
  }
  if (data.salaries && typeof data.salaries === 'object') await saveFinConfig({ salaries: { logi: Number(data.salaries.logi) || 0, dudi: Number(data.salaries.dudi) || 0 } });
  toast('Import fertig.');
}

/* Alle Daten als JSON-Datei herunterladen */
export async function exportAll() {
  const out = { exportedAt: new Date().toISOString() };
  try {
    for (const name of ['items', 'catalog', 'fin_entries', 'fin_recurring', 'events', 'event_ideas', 'dms_docs', 'dms_pages', 'config', 'profiles']) {
      const snap = await getDocs(collection(db, name));
      out[name] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    }
  } catch (e) { toast('Sicherung fehlgeschlagen. Bitte Verbindung prüfen.', { bad: true }); return; }
  for (const c of out.config) if (c.id === 'events' && c.gcal) c.gcal = { ...c.gcal, token: '' };
  downloadBlob(new Blob([JSON.stringify(out)], { type: 'application/json' }), `wombicoon-backup-${new Date().toLocaleDateString('sv-SE')}.json`);
  toast('Sicherung heruntergeladen.');
}
