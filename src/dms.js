/* Tab DMS: Dokumente fotografieren, ablegen, durchsuchen */
import { confirmSheet, el, openSheet, uid } from './dom.js';
import { compress, DEFAULT_DMS_CATEGORIES, guessTitle, imagesToPdf, pdfToImages, recognize } from './dmslogic.js';
import { usageCard } from './usage.js';
import { loadPages, removeDms, saveDms, saveDmsConfig, state, subscribe } from './store.js';
import { todayIso } from './evlogic.js';

const cats = () => state.dms.config.categories || DEFAULT_DMS_CATEGORIES;
const catOf = (id) => cats().find((c) => c.id === id) || cats()[cats().length - 1];
const dateText = (iso) => new Date(iso + 'T00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dataToFile = (d) => ({ type: 'image/jpeg', name: 'foto.jpg', dataUrl: d });
const tagsOf = (t) => String(t || '').split(',').map((x) => x.trim()).filter(Boolean);

export const recentDocs = (n) => [...state.dms.docs].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, n);

function openPageView(img, n) {
  openSheet(`Seite ${n}`, (body) => body.append(el('img', { src: img, class: 'page-full', alt: `Seite ${n}` })));
}

/* Live-Kamera: mehrere Seiten hintereinander */
function openCamera(onShot, onDone) {
  openSheet('Seiten aufnehmen', (body, close) => {
    const video = el('video', { class: 'cam', autoplay: true, playsinline: true, muted: true });
    const count = el('p', { class: 'hint' }, 'Halte das Dokument in den Rahmen und tippe auf Aufnehmen.');
    const msg = el('p', { class: 'form-info bad' });
    let n = 0;
    let stream = null;
    const shoot = el('button', { class: 'btn primary', type: 'button', onclick: () => {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      n++;
      count.textContent = `${n} ${n === 1 ? 'Seite' : 'Seiten'} aufgenommen. Weitere aufnehmen oder „Fertig“ tippen.`;
      video.classList.add('flash'); setTimeout(() => video.classList.remove('flash'), 120);
      onShot(c.toDataURL('image/jpeg', 0.9));
    } }, '📸 Aufnehmen');
    body.append(video, count, msg, el('div', { class: 'row' }, shoot, el('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Fertig')));
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
        video.srcObject = stream;
      } catch (e) { msg.textContent = 'Kein Zugriff auf die Kamera. Bitte Zugriff erlauben oder „Einzelfoto“ nutzen.'; shoot.disabled = true; }
    })();
    camStop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, () => { camStop(); onDone(); });
}
let camStop = () => {};

/* Dokument anlegen oder bearbeiten */
export function openDocSheet(doc) {
  openSheet(doc ? doc.title : 'Neues Dokument', (body, close) => {
    let pages = []; // { id?, img, isNew }
    const removed = [];
    let ocrText = doc ? doc.text || '' : '';
    let touchedTitle = !!doc;
    let busy = false;

    const strip = el('div', { class: 'page-strip' });
    const status = el('p', { class: 'hint' });
    const err = el('p', { class: 'form-info bad' });
    const title = el('input', { type: 'text', value: doc ? doc.title : '', placeholder: 'z. B. Mietvertrag' });
    title.addEventListener('input', () => (touchedTitle = true));
    const cat = el('select', null, ...cats().map((c) => el('option', { value: c.id, selected: doc && c.id === doc.categoryId }, `${c.icon} ${c.name}`)));
    const tags = el('input', { type: 'text', value: doc ? (doc.tags || []).join(', ') : '', placeholder: 'Stichworte, durch Komma getrennt' });
    const date = el('input', { type: 'date', value: doc ? doc.date : todayIso() });
    const note = el('input', { type: 'text', value: doc ? doc.note || '' : '', placeholder: 'Notiz (optional)' });
    const text = el('textarea', { class: 'ocr', rows: '6', placeholder: 'Erkannter Text (für die Suche)' }, ocrText);
    text.addEventListener('input', () => (ocrText = text.value));

    const drawStrip = () => {
      strip.replaceChildren(...pages.map((p, i) => el('div', { class: 'page-thumb' },
        el('img', { src: p.img, alt: `Seite ${i + 1}`, onclick: () => openPageView(p.img, i + 1) }),
        el('button', { class: 'page-del', type: 'button', 'aria-label': 'Seite entfernen', onclick: () => {
          if (p.id) removed.push(p.id);
          pages.splice(i, 1); drawStrip();
        } }, '✕'))));
    };

    const addFiles = async (files, ocr = true) => {
      for (const f of files) {
        status.textContent = 'Bild wird verarbeitet …';
        try {
          if (f.type === 'application/pdf' || (f.name || '').toLowerCase().endsWith('.pdf')) {
            const r = await pdfToImages(f, 25, (i, n) => (status.textContent = `PDF wird gelesen: Seite ${i} von ${n} …`));
            r.images.forEach((img) => pages.push({ img, isNew: true }));
            if (r.text.length > 20) { text.value = text.value.trim() ? `${text.value}\n\n${r.text}` : r.text; ocrText = text.value; if (!touchedTitle && !title.value.trim()) title.value = guessTitle(r.text); pdfText = true; }
            if (r.cut) err.textContent = 'Das PDF hat mehr als 25 Seiten, es wurden die ersten 25 übernommen.';
          } else pages.push({ img: await compress(f.dataUrl || f, 1700), isNew: true });
        } catch (e) { err.textContent = 'Eine Datei konnte nicht gelesen werden.'; }
        drawStrip();
      }
      status.textContent = '';
      if (ocr && pages.some((p) => p.isNew) && !text.value.trim() && !pdfText) runOcr(true);
    };
    let pdfText = false;
    const runOcr = async (auto) => {
      if (busy || !pages.length) return;
      busy = true;
      const list = auto ? pages.filter((p) => p.isNew) : pages;
      try {
        status.textContent = 'Text wird erkannt … (beim ersten Mal wird das Sprachpaket geladen)';
        const r = await recognize(list.map((p) => p.img), (i, n) => (status.textContent = `Text wird erkannt: Seite ${i} von ${n} …`));
        ocrText = auto && text.value.trim() ? `${text.value}\n\n${r}` : r;
        text.value = ocrText;
        if (!touchedTitle && !title.value.trim()) title.value = guessTitle(r);
        status.textContent = r.trim() ? 'Text erkannt. Du kannst ihn korrigieren.' : 'Kein Text erkannt.';
      } catch (e) {
        status.textContent = 'Texterkennung nicht möglich (Internet nötig). Du kannst trotzdem speichern.';
      }
      busy = false;
    };

    const camera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden', onchange: (e) => { addFiles([...e.target.files]); e.target.value = ''; } });
    const gallery = el('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, class: 'hidden', onchange: (e) => { addFiles([...e.target.files]); e.target.value = ''; } });

    const save = async () => {
      if (busy) return (err.textContent = 'Bitte kurz warten, die Texterkennung läuft noch.');
      if (!pages.length) return (err.textContent = 'Bitte mindestens eine Seite hinzufügen.');
      if (!title.value.trim()) return (err.textContent = 'Bitte einen Titel eingeben.');
      err.textContent = '';
      status.textContent = 'Wird gespeichert …';
      const keep = pages.filter((p) => !p.isNew);
      let idx = Math.max(-1, ...keep.map((p) => p.idx ?? -1));
      const fresh = pages.filter((p) => p.isNew).map((p) => ({ idx: ++idx, img: p.img }));
      try {
        await saveDms(doc && doc.id, {
          title: title.value.trim(), categoryId: cat.value, tags: tagsOf(tags.value), date: date.value || todayIso(),
          note: note.value.trim(), text: text.value, pageCount: pages.length, bytes: pages.reduce((a, p) => a + p.img.length, 0), thumb: await compress(pages[0].img, 220, 0.6)
        }, fresh, removed);
        close();
      } catch (e) { status.textContent = ''; err.textContent = 'Speichern hat nicht geklappt. Internet prüfen und nochmal versuchen.'; }
    };

    body.append(
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => {
          const shots = [];
          openCamera((d) => shots.push(d), async () => { if (shots.length) { await addFiles(shots.map((d) => dataToFile(d)), false); if (!text.value.trim()) runOcr(true); } });
        } }, '📷 Seiten aufnehmen'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => gallery.click() }, '🖼 Galerie / PDF')),
      el('button', { class: 'link-btn', type: 'button', onclick: () => camera.click() }, 'Einzelfoto mit Kamera-App'),
      camera, gallery, strip, status,
      el('label', null, 'Titel', title), el('label', null, 'Kategorie', cat),
      el('label', null, 'Stichworte', tags), el('label', null, 'Datum des Dokuments', date), el('label', null, 'Notiz', note),
      el('label', null, 'Erkannter Text', text),
      el('button', { class: 'btn ghost', type: 'button', onclick: () => runOcr(false) }, 'Text neu erkennen'),
      ...(doc ? [el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        if (!pages.length) return;
        const blob = await imagesToPdf(pages.map((p) => p.img));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${(title.value || 'dokument').replace(/[^\w\-äöüÄÖÜß ]/g, '').trim() || 'dokument'}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      } }, '📥 Als PDF herunterladen')] : []),
      err,
      el('div', { class: 'row between' },
        doc ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Dokument löschen?', `„${doc.title}“ mit allen Seiten wirklich löschen?`, 'Löschen')) { await removeDms(doc.id); close(); }
        } }, 'Löschen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern')));

    if (doc) {
      status.textContent = 'Seiten werden geladen …';
      loadPages(doc.id).then((p) => { pages = p.map((x) => ({ ...x, isNew: false })); status.textContent = ''; drawStrip(); }).catch(() => (status.textContent = 'Seiten konnten nicht geladen werden.'));
    }
  });
}

function openDmsSettings() {
  openSheet('Dokument-Kategorien', (body, close) => {
    const list = cats().map((c) => ({ ...c }));
    const area = el('div');
    const draw = () => area.replaceChildren(
      ...list.map((c, i) => el('div', { class: 'edit-row' },
        el('input', { class: 'emoji', value: c.icon, maxlength: '4', oninput: (x) => (c.icon = x.target.value) }),
        el('input', { class: 'grow', value: c.name, oninput: (x) => (c.name = x.target.value) }),
        el('input', { type: 'color', value: c.color, oninput: (x) => (c.color = x.target.value) }),
        el('button', { class: 'icon-btn', type: 'button', onclick: () => { if (list.length > 1) { list.splice(i, 1); draw(); } } }, '🗑'))),
      el('button', { class: 'btn ghost', type: 'button', onclick: () => { list.push({ id: 'k' + uid(), name: 'Neu', icon: '📄', color: '#9aa7c2' }); draw(); } }, '+ Kategorie'));
    draw();
    body.append(area, el('div', { class: 'row end' }, el('button', { class: 'btn primary', onclick: async () => { await saveDmsConfig({ categories: list }); close(); } }, 'Speichern')));
  });
}

export function docRow(d) {
  const cat = catOf(d.categoryId);
  return el('button', { class: 'item fin-row', type: 'button', onclick: () => openDocSheet(d) },
    d.thumb ? el('img', { class: 'doc-thumb', src: d.thumb, alt: '' }) : el('span', { class: 'circle', style: { background: cat.color } }, cat.icon),
    el('span', { class: 'grow fin-main' },
      el('span', { class: 'item-name' }, d.title),
      el('span', { class: 'hint' }, `${cat.icon} ${cat.name} · ${dateText(d.date)}${d.pageCount > 1 ? ` · ${d.pageCount} Seiten` : ''}${(d.tags || []).length ? ` · ${d.tags.join(', ')}` : ''}`)));
}

export function mountDms(root) {
  const view = { q: '', cat: '' };
  const search = el('input', { type: 'search', class: 'search', placeholder: 'Titel, Stichwort oder Text suchen …', oninput: (e) => { view.q = e.target.value; drawList(); } });
  const chips = el('div', { class: 'chips' });
  const list = el('div');
  const fab = el('button', { class: 'fab', 'aria-label': 'Neues Dokument', onclick: () => openDocSheet() }, '+');

  function drawChips() {
    chips.replaceChildren(
      el('button', { class: 'chip' + (!view.cat ? ' active' : ''), onclick: () => { view.cat = ''; drawChips(); drawList(); } }, 'Alle'),
      ...cats().map((c) => el('button', { class: 'chip' + (view.cat === c.id ? ' active' : ''), onclick: () => { view.cat = c.id; drawChips(); drawList(); } }, `${c.icon} ${c.name}`)),
      el('button', { class: 'chip gear', onclick: openDmsSettings, 'aria-label': 'Kategorien' }, '⚙︎'));
  }
  function drawList() {
    const q = view.q.trim().toLowerCase();
    const docs = state.dms.docs
      .filter((d) => (!view.cat || d.categoryId === view.cat) && (!q || `${d.title} ${(d.tags || []).join(' ')} ${d.note || ''} ${d.text || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    usage.replaceChildren(usageCard());
    list.replaceChildren(...(docs.length ? docs.map(docRow) : [el('p', { class: 'empty' }, state.dms.docs.length ? 'Nichts gefunden.' : 'Noch keine Dokumente. Tippe unten auf + und fotografiere das erste.')]));
  }
  const usage = el('div');
  root.replaceChildren(el('div', { class: 'search-wrap' }, search), chips, list, usage, fab);
  drawChips(); drawList();
  return subscribe(() => { drawChips(); drawList(); });
}
