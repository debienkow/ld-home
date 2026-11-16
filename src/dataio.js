/* Import (Excel-JSON) und Datensicherung */
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';
import { confirmSheet } from './dom.js';
import { saveFinConfig } from './store.js';

/* Import-Datei einspielen */
export async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    alert('Die Datei konnte nicht gelesen werden.');
    return;
  }
  const entries = data.entries || [];
  const recurring = data.recurring || [];
  if (!entries.length && !recurring.length) {
    alert('In der Datei sind keine Einträge.');
    return;
  }
  const ok = await confirmSheet('Import starten?', `${entries.length} Einträge und ${recurring.length} laufende Posten importieren? Bereits importierte werden überschrieben, nicht doppelt angelegt.`, 'Importieren');
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
    await batch.commit();
  }
  if (data.salaries) await saveFinConfig({ salaries: data.salaries });
  alert('Import fertig.');
}

/* Alle Daten als JSON-Datei herunterladen */
export async function exportAll() {
  const out = { exportedAt: new Date().toISOString() };
  for (const name of ['items', 'catalog', 'fin_entries', 'fin_recurring', 'events', 'event_ideas', 'dms_docs', 'dms_pages', 'config', 'profiles']) {
    const snap = await getDocs(collection(db, name));
    out[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ld-home-backup-${new Date().toLocaleDateString('sv-SE')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
