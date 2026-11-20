/* Tab DMS: Dokumente fotografieren, ablegen, durchsuchen */
import { confirmSheet, downloadBlob, el, icon, keepChips, openSheet, uid, longPress } from './dom.js';
import { compress, DEFAULT_DMS_CATEGORIES, guessTitle, imagesToPdf, pdfToImages, recognize } from './dmslogic.js';
import { usageCard } from './usage.js';
import { loadPages, removeDms, saveDms, saveDmsConfig, state, subscribe } from './store.js';
import { todayIso } from './evlogic.js';
import { companies, companyById, companyCard, companyField, deadlineOf, findCompanies, openCompany, openCompanyList } from './companies.js';

const cats = () => state.dms.config.categories || DEFAULT_DMS_CATEGORIES;
export const docCatOf = (id) => catOf(id);
const catOf = (id) => cats().find((c) => c.id === id) || cats()[cats().length - 1];
const dateText = (iso) => new Date(iso + 'T00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dataToFile = (d) => ({ type: 'image/jpeg', name: 'foto.jpg', dataUrl: d });
const tagsOf = (t) => String(t || '').split(',').map((x) => x.trim()).filter(Boolean);

/* Alle Stichworte mit Anzahl, alphabetisch */
export function allTags() {
  const map = new Map();
  for (const d of state.dms.docs) for (const t of d.tags || []) {
    const k = t.toLowerCase();
    const cur = map.get(k) || { tag: t, n: 0 };
    cur.n++;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => a.tag.localeCompare(b.tag, 'de'));
}

/* Stichwort-Eingabe mit Chips und Vorschlägen */
function tagField(initial) {
  let tags = [...(initial || [])];
  const list = el('span', { class: 'tag-list' });
  const input = el('input', { type: 'text', placeholder: 'Stichwort eingeben …', autocomplete: 'off', enterkeyhint: 'done' });
  const box = el('div', { class: 'tag-input' }, list, input);
  const sugg = el('div', { class: 'chips small tag-sugg' });
  const has = (t) => tags.some((x) => x.toLowerCase() === t.toLowerCase());
  const add = (raw) => {
    for (const t of tagsOf(raw)) if (!has(t)) tags.push(t);
  };
  const draw = () => {
    list.replaceChildren(...tags.map((t, i) => el('span', { class: 'tag-chip' }, t,
      el('button', { type: 'button', 'aria-label': `${t} entfernen`, onmousedown: (e) => e.preventDefault(), onclick: () => { tags.splice(i, 1); draw(); } }, '×'))));
    const q = input.value.trim().toLowerCase();
    const known = allTags().filter((x) => !has(x.tag));
    const hits = (q ? known.filter((x) => x.tag.toLowerCase().includes(q)).sort((a, b) => b.tag.toLowerCase().startsWith(q) - a.tag.toLowerCase().startsWith(q) || b.n - a.n) : known.sort((a, b) => b.n - a.n)).slice(0, 8);
    sugg.replaceChildren(...hits.map((x) => el('button', { type: 'button', class: 'chip', onmousedown: (e) => e.preventDefault(), onclick: () => { add(x.tag); input.value = ''; draw(); } }, x.tag)));
  };
  input.addEventListener('input', () => {
    if (input.value.includes(',')) {
      const parts = input.value.split(',');
      input.value = parts.pop().replace(/^\s+/, '');
      add(parts.join(','));
    }
    draw();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (input.value.trim()) { add(input.value); input.value = ''; draw(); } }
    else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); draw(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) { add(input.value); input.value = ''; draw(); } });
  box.addEventListener('click', (e) => { if (e.target === box || e.target === list) input.focus(); });
  draw();
  return { node: el('div', null, box, sugg), values: () => { add(input.value); input.value = ''; return [...tags]; } };
}

export const recentDocs = (n) => [...state.dms.docs].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, n);

function openPageView(imgs, start) {
  let i = start;
  openSheet(`Seite ${i + 1} von ${imgs.length}`, (body) => {
    const sheet = body.closest('.sheet');
    sheet.classList.add('viewer');
    const head = sheet.querySelector('.sheet-head h2');
    const img = el('img', { alt: '' });
    const prev = el('button', { class: 'viewer-nav prev', type: 'button', 'aria-label': 'Vorherige Seite', onclick: () => go(-1) }, '‹');
    const next = el('button', { class: 'viewer-nav next', type: 'button', 'aria-label': 'Nächste Seite', onclick: () => go(1) }, '›');
    const show = () => { img.src = imgs[i]; img.alt = `Seite ${i + 1}`; head.textContent = `Seite ${i + 1} von ${imgs.length}`; prev.disabled = i === 0; next.disabled = i === imgs.length - 1; };
    const go = (d) => { const j = i + d; if (j < 0 || j >= imgs.length) return; i = j; show(); };
    const stage = el('div', { class: 'viewer-stage' }, img, prev, next);
    let x0 = null, y0 = 0;
    stage.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    });
    const key = (e) => { if (!stage.isConnected) return document.removeEventListener('keydown', key); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    document.addEventListener('keydown', key);
    body.append(stage);
    show();
  });
}

/* Live-Kamera: mehrere Seiten hintereinander */
function openCamera(onShot, onDone) {
  openSheet('Seiten aufnehmen', (body, close) => {
    const video = el('video', { class: 'cam', autoplay: true, playsinline: true, muted: true });
    const count = el('p', { class: 'hint' }, 'Halte das Dokument in den Rahmen und tippe auf Aufnehmen.');
    const msg = el('p', { class: 'form-info bad' });
    let n = 0;
    let stream = null;
    let shut = false;
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
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('keine Kamera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
        if (shut) return stream.getTracks().forEach((t) => t.stop());
        video.srcObject = stream;
      } catch (e) { msg.textContent = 'Kein Zugriff auf die Kamera. Bitte Zugriff erlauben oder „Einzelfoto“ nutzen.'; shoot.disabled = true; }
    })();
    camStop = () => { shut = true; if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, () => { camStop(); onDone(); });
}
let camStop = () => {};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') camStop(); });

/* Alle Dokumente mit einem Stichwort, wie eine eigene Seite */
function openTagDocs(tag) {
  openSheet(`# ${tag}`, (body) => {
    const draw = () => {
      const docs = state.dms.docs.filter((d) => (d.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase()))
        .sort((a, b) => b.date.localeCompare(a.date));
      body.replaceChildren(
        el('p', { class: 'hint' }, docs.length === 1 ? '1 Dokument' : `${docs.length} Dokumente`),
        el('div', { class: 'card-list' }, ...docs.map(docRow)));
    };
    draw();
  });
}

/* Dokument ansehen (nur lesen) */
function openDocView(doc) {
  openSheet(doc.title, (body, close) => {
    const c = catOf(doc.categoryId);
    let pages = [];
    const strip = el('div', { class: 'page-strip big' });
    const status = el('p', { class: 'hint' }, 'Seiten werden geladen …');
    const info = (label, value) => (value ? el('div', { class: 'info-row' }, el('span', { class: 'hint' }, label), el('span', null, value)) : null);
    const tags = (doc.tags || []).length ? el('div', { class: 'tags' }, ...doc.tags.map((t) => el('button', { type: 'button', class: 'tag tag-link', onclick: () => openTagDocs(t) }, `# ${t}`))) : null;
    const text = (doc.text || '').trim();
    body.append(
      strip, status,
      el('div', { class: 'info-list' },
        ...(companyById(doc.companyId) ? [el('button', { type: 'button', class: 'info-row link-row', onclick: () => openCompany(companyById(doc.companyId)) }, el('span', { class: 'hint' }, 'Unternehmen'), el('span', null, `🏢 ${companyById(doc.companyId).name}${((companyById(doc.companyId).contracts || []).find((k) => k.id === doc.contractId) || {}).name ? ` · ${companyById(doc.companyId).contracts.find((k) => k.id === doc.contractId).name}` : ''} ›`))] : []),
        doc.owner ? info('Sichtbarkeit', '🔒 Privat (nur für dich)') : null,
        info('Kategorie', `${c.icon} ${c.name}`),
        info('Datum', doc.date ? dateText(doc.date) : ''),
        info('Seiten', String(doc.pageCount || '')),
        info('Notiz', doc.note || '')),
      ...(tags ? [tags] : []),
      ...(text ? [el('details', { class: 'ocr-view' }, el('summary', null, 'Erkannter Text'), el('p', null, text))] : []),
      el('div', { class: 'row between actions' },
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          if (!pages.length) return;
          downloadBlob(await imagesToPdf(pages.map((p) => p.img)), `${(doc.title || 'dokument').replace(/[^\w\-äöüÄÖÜß ]/g, '').trim() || 'dokument'}.pdf`);
        } }, '📥 PDF'),
        el('button', { class: 'btn primary', type: 'button', onclick: () => { close(); setTimeout(() => openDocSheet(doc, true), 0); } }, '✏️ Bearbeiten')));
    loadPages(doc.id).then((p) => {
      pages = p;
      status.textContent = '';
      strip.replaceChildren(...pages.map((x, i) => el('div', { class: 'page-thumb' },
        el('img', { src: x.img, alt: `Seite ${i + 1}`, onclick: () => openPageView(pages.map((y) => y.img), i) }))));
    }).catch(() => (status.textContent = 'Seiten konnten nicht geladen werden (offline?). Bitte später erneut öffnen.'));
  });
}

/* Dokument anlegen oder bearbeiten */
export function openDocSheet(doc, edit = false, preset = null) {
  if (doc && !edit) return openDocView(doc);
  const pre = preset || {};
  const initC = doc ? doc.companyId : pre.companyId || '';
  const initK = doc ? doc.contractId : pre.contractId || '';
  openSheet(doc ? `${doc.title} bearbeiten` : 'Neues Dokument', (body, close) => {
    let pages = []; // { id?, img, isNew }
    const removed = [];
    let ocrText = doc ? doc.text || '' : '';
    let touchedTitle = !!doc || !!pre.title;
    let busy = false;

    const strip = el('div', { class: 'page-strip' });
    const status = el('p', { class: 'hint' });
    const err = el('p', { class: 'form-info bad' });
    const title = el('input', { type: 'text', value: doc ? doc.title : pre.title || '', placeholder: 'z. B. Mietvertrag' });
    title.addEventListener('input', () => (touchedTitle = true));
    const cat = el('select', null, ...cats().map((c) => el('option', { value: c.id, selected: c.id === (doc ? doc.categoryId : pre.categoryId) }, `${c.icon} ${c.name}`)));
    const tags = tagField(doc ? doc.tags : []);
    const contract = el('select');
    const contractBox = el('label', null, 'Vertrag (optional)', contract);
    const fillContracts = (cid) => {
      const co = companyById(cid);
      const ks = co ? co.contracts || [] : [];
      contractBox.classList.toggle('hidden', !ks.length);
      const cur = contract.value || (initC === cid ? initK : '');
      contract.replaceChildren(el('option', { value: '' }, 'Kein bestimmter Vertrag'), ...ks.map((k) => el('option', { value: k.id, selected: k.id === cur }, `${k.name || 'Vertrag'}${(k.start || k.end) && !/\d{4}/.test(k.name || '') ? ` (${[k.start, k.end].filter(Boolean).map((x) => x.slice(0, 4)).join('–')})` : ''}`)));
    };
    const priv = el('input', { type: 'checkbox', checked: doc ? !!doc.owner : !!pre.private });
    const company = companyField(initC, (cid) => { contract.value = ''; fillContracts(cid); const co = companyById(cid); if (co && co.owner && !doc) priv.checked = true; });
    fillContracts(initC);
    const date = el('input', { type: 'date', value: doc ? doc.date : todayIso() });
    const note = el('input', { type: 'text', value: doc ? doc.note || '' : '', placeholder: 'Notiz (optional)' });
    let loading = !!doc;
    const text = el('textarea', { class: 'ocr', rows: '6', placeholder: 'Erkannter Text (für die Suche)' }, ocrText);
    text.addEventListener('input', () => (ocrText = text.value));

    const drawStrip = () => {
      strip.replaceChildren(...pages.map((p, i) => el('div', { class: 'page-thumb' },
        el('img', { src: p.img, alt: `Seite ${i + 1}`, onclick: () => openPageView(pages.map((y) => y.img), i) }),
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
      if (loading) return (err.textContent = 'Bitte kurz warten, die Seiten werden noch geladen.');
      if (!pages.length) return (err.textContent = 'Bitte mindestens eine Seite hinzufügen.');
      if (!title.value.trim()) return (err.textContent = 'Bitte einen Titel eingeben.');
      err.textContent = '';
      status.textContent = 'Wird gespeichert …';
      const keep = pages.filter((p) => !p.isNew);
      let idx = Math.max(-1, ...keep.map((p) => p.idx ?? -1));
      const fresh = pages.filter((p) => p.isNew).map((p) => ({ idx: ++idx, img: p.img }));
      try {
        await saveDms(doc && doc.id, {
          title: title.value.trim(), categoryId: cat.value, tags: tags.values(), ...(await (async () => { const cid = await company.value(priv.checked); const ok = (companyById(cid) || { contracts: [] }).contracts.some((k) => k.id === contract.value); return { companyId: cid, contractId: ok ? contract.value : '' }; })()), date: date.value || todayIso(),
          owner: priv.checked ? state.user.uid : '',
          note: note.value.trim(), text: text.value.slice(0, 400000), pageCount: pages.length, bytes: pages.reduce((a, p) => a + p.img.length, 0), thumb: await compress(pages[0].img, 220, 0.6)
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
      el('label', { class: 'toggle-row' }, el('span', null, '🔒 Privates Dokument (nur für mich sichtbar)'), priv),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Unternehmen'), company.node),
      contractBox,
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Stichworte'), tags.node), el('label', null, 'Datum des Dokuments', date), el('label', null, 'Notiz', note),
      el('label', null, 'Erkannter Text', text),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => runOcr(false) }, 'Text neu erkennen'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { text.value = ''; ocrText = ''; status.textContent = 'Erkannter Text entfernt (wird beim Speichern übernommen).'; } }, 'Erkannten Text entfernen')),
      ...(doc ? [el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        if (!pages.length) return;
        downloadBlob(await imagesToPdf(pages.map((p) => p.img)), `${(title.value || 'dokument').replace(/[^\w\-äöüÄÖÜß ]/g, '').trim() || 'dokument'}.pdf`);
      } }, '📥 Als PDF herunterladen')] : []),
      err,
      el('div', { class: 'row between actions' },
        doc ? el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmSheet('Dokument löschen?', `„${doc.title}“ mit allen Seiten wirklich löschen?`, 'Löschen')) { await removeDms(doc.id); close(); }
        } }, 'Löschen') : el('span'),
        el('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern')));

    if (doc) {
      status.textContent = 'Seiten werden geladen …';
      loadPages(doc.id).then((p) => { pages = [...p.map((x) => ({ ...x, isNew: false })), ...pages]; loading = false; status.textContent = ''; drawStrip(); }).catch(() => (status.textContent = 'Seiten konnten nicht geladen werden (offline?). Bitte später erneut öffnen.'));
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
    body.append(area, el('div', { class: 'row end actions' }, el('button', { class: 'btn primary', type: 'button', onclick: async () => { await saveDmsConfig({ categories: list.filter((c) => c.name.trim()) }); close(); } }, 'Speichern')));
  });
}

export function docRow(d) {
  const cat = catOf(d.categoryId);
  return longPress(el('button', { class: 'item fin-row', type: 'button', onclick: () => openDocSheet(d) },
    d.thumb ? el('img', { class: 'doc-thumb', src: d.thumb, alt: '' }) : el('span', { class: 'circle', style: { background: cat.color } }, cat.icon),
    el('span', { class: 'grow fin-main' },
      el('span', { class: 'item-name' }, `${d.owner ? '🔒 ' : ''}${d.title}`),
      el('span', { class: 'hint' }, `${companyById(d.companyId) ? `🏢 ${companyById(d.companyId).name} · ` : ''}${cat.icon} ${cat.name} · ${dateText(d.date)}${d.pageCount > 1 ? ` · ${d.pageCount} Seiten` : ''}${(d.tags || []).length ? ` · ${d.tags.join(', ')}` : ''}`))), () => openDocSheet(d, true));
}

export function mountDms(root) {
  const view = { q: '', cat: '', tag: '' };
  const search = el('input', { type: 'search', class: 'search', placeholder: 'Titel, Stichwort oder Text suchen …', oninput: (e) => { view.q = e.target.value; drawList(); } });
  const chips = el('div', { class: 'chips' });
  const list = el('div');
  const fab = el('button', { class: 'fab', type: 'button', 'aria-label': 'Neues Dokument', onclick: () => openDocSheet() }, icon('plus'));

  function drawChips() { keepChips(drawChipsNow); }
  function drawChipsNow() {
    chips.replaceChildren(
      el('button', { class: 'chip' + (!view.cat ? ' active' : ''), onclick: () => { view.cat = ''; drawChips(); drawList(); } }, 'Alle'),
      ...cats().map((c) => el('button', { class: 'chip' + (view.cat === c.id ? ' active' : ''), onclick: () => { view.cat = c.id; drawChips(); drawList(); } }, `${c.icon} ${c.name}`)),
      view.tag
        ? el('button', { class: 'chip active', type: 'button', onclick: () => { view.tag = ''; drawChips(); drawList(); } }, `# ${view.tag} ×`)
        : el('button', { class: 'chip', type: 'button', onclick: openTagIndex }, '# Stichworte'),
      el('button', { class: 'chip gear', type: 'button', onclick: openDmsSettings, 'aria-label': 'Kategorien' }, icon('gear')));
  }
  function drawList() {
    const q = view.q.trim().toLowerCase();
    const hitCos = findCompanies(q);
    const coIds = new Set(hitCos.map((x) => x.id));
    const docs = state.dms.docs
      .filter((d) => (!view.cat || d.categoryId === view.cat) && (!view.tag || (d.tags || []).some((t) => t.toLowerCase() === view.tag.toLowerCase())) && (!q || coIds.has(d.companyId) || `${(companyById(d.companyId) || {}).name || ''} ${d.title} ${(d.tags || []).join(' ')} ${d.note || ''} ${d.text || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    usage.replaceChildren(usageCard());
    const rows = hitCos.length ? [el('h3', { class: 'section-title' }, 'Kundendaten'), ...hitCos.map(companyCard)] : [];
    let year = '';
    for (const d of docs) {
      const y = (d.date || '').slice(0, 4);
      if (y !== year) { year = y; rows.push(el('h3', { class: 'section-title month' }, el('span', null, y || 'Ohne Datum'))); }
      rows.push(docRow(d));
    }
    list.replaceChildren(...(docs.length || hitCos.length ? rows : [el('p', { class: 'empty' }, state.dms.docs.length ? 'Nichts gefunden.' : 'Noch keine Dokumente. Tippe unten auf + und fotografiere das erste.')]));
  }
  function openTagIndex() {
    openSheet('Stichworte', (body, close) => {
      const tags = allTags();
      body.append(tags.length
        ? el('div', { class: 'chips wrap' }, ...tags.map((x) => el('button', { type: 'button', class: 'chip', onclick: () => { view.tag = x.tag; close(); drawChips(); drawList(); } }, x.tag, el('span', { class: 'chip-count' }, String(x.n)))))
        : el('p', { class: 'empty' }, 'Noch keine Stichworte vergeben.'));
    });
  }
  const usage = el('div');
  const tile = el('button', { class: 'card tap contract-tile', type: 'button', onclick: openCompanyList });
  function drawTile() {
    const cos = companies();
    const next = cos.flatMap((c) => (c.contracts || []).map((k) => ({ c, d: deadlineOf(k) }))).filter((x) => x.d && !x.d.past).sort((a, b) => a.d.days - b.d.days)[0];
    tile.replaceChildren(
      el('span', { class: 'circle' }, '🏢'),
      el('span', { class: 'grow fin-main' },
        el('span', { class: 'item-name' }, 'Vertragsdaten'),
        el('span', { class: 'hint' }, cos.length
          ? `${cos.length} Unternehmen${next ? ` · nächste Kündigungsfrist: ${next.c.name} bis ${new Date(next.d.deadline + 'T00:00').toLocaleDateString('de-DE')}` : ''}`
          : 'Kundendaten, Verträge und Kündigungsfristen anlegen')),
      el('span', { class: 'more' }, '›'));
  }
  root.replaceChildren(tile, el('div', { class: 'search-wrap' }, search), chips, el('div', { class: 'doc-list' }, list), usage, fab);
  drawTile(); drawChips(); drawList();
  return subscribe(() => { drawTile(); drawChips(); drawList(); });
}
