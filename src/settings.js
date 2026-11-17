/* Allgemeine Einstellungen: Google Kalender, Daten */
import { confirmSheet, el, openSheet, pwField } from './dom.js';
import { info as gInfo, gcalReady, gcalPing, saveGcalConfig, syncNow, gcalConfig, importOld, validGcalUrl } from './gcal.js';
import { exportAll, importFile } from './dataio.js';
import { usageCard } from './usage.js';

export function openAppSettings() {
  openSheet('Einstellungen', (body, close) => {
    const g = gcalConfig() || {};
    const url = el('input', { type: 'text', value: g.url || '', placeholder: 'https://script.google.com/macros/s/…/exec', autocomplete: 'off' });
    const token = el('input', { type: 'password', value: g.token || '', placeholder: 'Geheimwort aus dem Skript', autocomplete: 'off' });
    const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const lastText = () => gInfo.at ? `Letzter Abgleich ${clock(gInfo.at)} Uhr: ${gInfo.ok ? `ok (${gInfo.changes} Änderungen)` : `fehlgeschlagen (${gInfo.error})`}.` : 'Noch kein Abgleich in dieser Sitzung.';
    const gmsg = el('p', { class: 'hint' }, gcalReady() ? `Verbunden. ${lastText()}` : 'Noch nicht verbunden.');
    const calLine = el('p', { class: 'hint' }, 'Neue Termine landen im Kalender, den das Skript verwaltet (ab Skript v1.4: „WombiCoon App“). Abgleich: sofort beim Speichern/Löschen in der App; Änderungen aus Google beim Öffnen, beim Zurückkehren in die App und alle 5 Minuten.');
    const showCal = () => { if (gInfo.calendar) calLine.firstChild.textContent = `Neue Termine landen im Google-Kalender „${gInfo.calendar}“${gInfo.version >= '1.5' ? ` (Skript v${gInfo.version})` : ` (Skript ${gInfo.version ? 'v' + gInfo.version : 'älter als v1.4'}, bitte v1.5 bereitstellen)`}. Abgleich: sofort beim Speichern/Löschen in der App; Änderungen aus Google beim Öffnen, beim Zurückkehren in die App und alle 5 Minuten.`; };
    if (gcalReady()) gcalPing().then(showCal).catch(() => {});
    const saveG = async () => {
      if (!validGcalUrl(url.value)) { gmsg.textContent = 'Die Adresse muss mit https://script.google.com/macros/s/ beginnen und auf /exec enden.'; throw Object.assign(new Error('url'), { reported: true }); }
      await saveGcalConfig({ url: url.value.trim(), token: token.value.trim() });
    };
    const file = el('input', { type: 'file', accept: 'application/json', class: 'hidden', onchange: async (e) => {
      if (e.target.files[0]) { await importFile(e.target.files[0]); close(); }
    } });
    body.append(
      el('h3', null, 'Google Kalender'),
      calLine,
      el('label', null, 'Web-App-URL', url), el('label', null, 'Geheimwort', pwField(token)), gmsg,
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          await saveG(); gmsg.textContent = 'Teste …';
          try { await new Promise((r) => setTimeout(r, 600)); await gcalPing(); showCal(); gmsg.textContent = 'Verbindung funktioniert.'; } catch (e) { gmsg.textContent = 'Verbindung fehlgeschlagen: URL und Geheimwort prüfen.'; }
        } }, 'Verbindung testen'),
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          await saveG(); gmsg.textContent = 'Gleiche ab …';
          await new Promise((r) => setTimeout(r, 600));
          let r = await syncNow({ manual: true });
          if (r.ok && r.skipped && await confirmSheet('Termine entfernen?', `${r.skipped} Termine gibt es im Google Kalender nicht mehr. Zur Sicherheit wurden sie hier nicht gelöscht. Jetzt auch hier löschen?`, 'Löschen')) r = await syncNow({ force: true, manual: true });
          gmsg.textContent = r.ok ? `Abgleich fertig (${r.changes} Änderungen${r.skipped ? `, ${r.skipped} fehlende Termine behalten` : ''}).` : `Abgleich fehlgeschlagen: ${r.error || 'bitte später nochmal versuchen'}`;
        } }, 'Jetzt abgleichen'),
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          await saveG(); gmsg.textContent = 'Lade alte Termine …';
          await new Promise((r) => setTimeout(r, 600));
          const r = await importOld();
          gmsg.textContent = r.ok ? `${r.count} alte Termine geladen.` : r.error === 'action' ? 'Skript veraltet: neue Version im Apps-Script bereitstellen.' : `Fehlgeschlagen: ${r.error || 'unbekannt'}`;
        } }, 'Alte Termine laden')),
      el('h3', null, 'Daten'),
      usageCard(),
      el('button', { class: 'btn ghost wide', type: 'button', onclick: exportAll }, 'Alle Daten sichern (Download)'),
      el('p', { class: 'hint' }, 'Finanzdaten aus der Excel importieren (JSON-Datei). Mehrfaches Importieren legt nichts doppelt an.'),
      file, el('button', { class: 'btn ghost wide', type: 'button', onclick: () => file.click() }, 'Finanz-Import-Datei wählen'));
  });
}
