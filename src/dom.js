/* Kleine DOM-Helfer */
export function el(tag, attrs, ...kids) {
  const pick = tag === 'input' && attrs && (attrs.type === 'date' || attrs.type === 'time') && customElements.get('wc-pick');
  const node = document.createElement(pick ? 'wc-pick' : tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'onclick' && tag === 'button') node.addEventListener('click', guardClick(node, v));
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/* Doppeltes Auslösen verhindern, solange eine Aktion läuft */
function guardClick(node, fn) {
  return (e) => {
    if (node.dataset.busy) return;
    const r = fn(e);
    if (r && typeof r.then === 'function') {
      node.dataset.busy = '1';
      node.setAttribute('aria-busy', 'true');
      const done = () => { delete node.dataset.busy; node.removeAttribute('aria-busy'); };
      r.then(done, done);
    }
  };
}

/* Symbole der Navigation */
const ICONS = {
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4h-4"/>',
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h4.5v-5h3v5H18v-9"/>',
  finanzen: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><path d="M15.5 14.5h2"/>',
  events: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
  dms: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2.5h5.5A2.5 2.5 0 0 1 20 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/>',
  einkauf: '<path d="M3 4h2.2l2.3 10.5h9.6L19.5 8H6.4"/><circle cx="9" cy="18.5" r="1.4"/><circle cx="16" cy="18.5" r="1.4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.2 3.9M6.2 7.6A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  wrench: '<path d="M14.8 5.2a4.5 4.5 0 0 0-5.9 5.6L3.8 15.9a1.9 1.9 0 0 0 2.7 2.7l5.1-5.1a4.5 4.5 0 0 0 5.6-5.9l-2.7 2.7-2.3-.4-.4-2.3z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
export function icon(name) {
  const s = el('span', { class: 'ico', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return s;
}

/* Kurze Meldung am unteren Rand, optional mit Aktion */
let toastBox = null;
export function toast(text, opts = {}) {
  if (!toastBox) { toastBox = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const node = el('div', { class: 'toast' + (opts.bad ? ' bad' : '') }, el('span', { class: 'grow' }, text));
  const drop = () => { node.classList.add('out'); setTimeout(() => node.remove(), 200); };
  if (opts.action) node.append(el('button', { class: 'toast-btn', type: 'button', onclick: () => { drop(); opts.onAction && opts.onAction(); } }, opts.action));
  [...toastBox.children].slice(0, -2).forEach((n) => n.remove());
  toastBox.append(node);
  setTimeout(drop, opts.ms || (opts.action ? 6000 : 3500));
}

/* Unten einfahrendes Fenster; Zurück-Geste und Esc schließen das oberste Fenster */
const sheetStack = [];
let ignorePops = 0;
window.addEventListener('popstate', () => {
  if (ignorePops > 0) {
    ignorePops--;
    if (sheetStack.length && !(history.state && history.state.ldSheet)) history.pushState({ ldSheet: true }, '');
    return;
  }
  const top = sheetStack[sheetStack.length - 1];
  if (top) top(true);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName !== 'BUTTON' && e.target.getAttribute && e.target.getAttribute('role') === 'button') { e.preventDefault(); e.target.click(); return; }
  const top = sheetStack[sheetStack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') { e.preventDefault(); top(); return; }
  if (e.key !== 'Enter' || e.isComposing || e.target.tagName !== 'INPUT' || ['checkbox', 'file', 'color', 'search'].includes(e.target.type)) return;
  const sheets = document.querySelectorAll('.sheet');
  const sheet = sheets[sheets.length - 1];
  const main = sheet && sheet.contains(e.target) && sheet.querySelector('.actions .btn.primary');
  if (main) { e.preventDefault(); main.click(); }
});

/* Platz für die Bildschirmtastatur */
export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS) document.documentElement.classList.add('ios');
if (window.visualViewport) {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  /* iOS verschiebt bei offener Tastatur den sichtbaren Bereich: Fenster an diesen Bereich heften */
  const setKb = isIOS
    ? () => { root.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`); root.setProperty('--vvh', `${Math.round(vv.height)}px`); document.documentElement.classList.toggle('kb-open', window.innerHeight - vv.height > 120); }
    : () => root.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
  vv.addEventListener('resize', setKb);
  vv.addEventListener('scroll', setKb);
  setKb();
}

/* Feld im Fenster sichtbar halten: zwischen Fensterkopf und Aktionsleiste/Tastatur */
function keepVisible(t, sheet) {
  if (document.activeElement !== t || !sheet.isConnected) return;
  const head = sheet.querySelector('.sheet-head');
  const bar = sheet.querySelector('.sheet-body > .actions');
  const vv = window.visualViewport;
  const sr = sheet.getBoundingClientRect();
  const topLimit = (head ? head.getBoundingClientRect().bottom : sr.top) + 8;
  const screenBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
  const bottomLimit = Math.min(sr.bottom, screenBottom) - (bar ? bar.offsetHeight : 0) - 8;
  const r = (t.closest('label') || t).getBoundingClientRect();
  if (r.bottom > bottomLimit) sheet.scrollBy({ top: Math.min(r.bottom - bottomLimit, r.top - topLimit), behavior: 'smooth' });
  else if (r.top < topLimit) sheet.scrollBy({ top: r.top - topLimit, behavior: 'smooth' });
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => {
  const t = document.activeElement;
  const sheet = t && t.closest && t.closest('.sheet');
  if (sheet && isIOS) setTimeout(() => keepVisible(t, sheet), 60);
});

/* Handy: Eingabefeld beim Tippen nach oben holen, damit Vorschläge darunter sichtbar bleiben */
const touchUi = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const typable = (t) => t && ((t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|range)$/.test(t.type)) || t.tagName === 'TEXTAREA');
if (touchUi) {
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!typable(t) || t.dataset.nokb === '1') return;
    const sheet = t.closest('.sheet');
    if (!sheet) return;
    const anchor = t.closest('.tag-input, .place-field, label, .field') || t;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const sugg = !!t.closest('.tag-input, .place-field, .field') || t.dataset.sugg === '1';
    if (!sugg && isIOS) { [400, 800].forEach((ms) => setTimeout(() => keepVisible(t, sheet), ms)); return; }
    if (!sugg && t.getBoundingClientRect().top <= vh * 0.4) return;
    document.documentElement.classList.add('typing');
    setTimeout(() => {
      if (document.activeElement !== t) return;
      const head = sheet.querySelector('.sheet-head');
      const top = anchor.getBoundingClientRect().top - sheet.getBoundingClientRect().top - (head ? head.offsetHeight : 0) - 10;
      sheet.scrollBy({ top, behavior: 'smooth' });
    }, isIOS ? 500 : 320);
  });
  document.addEventListener('focusout', () => setTimeout(() => { if (!typable(document.activeElement)) document.documentElement.classList.remove('typing'); }, 150));
}

/* Passwortfeld mit Auge zum Ein-/Ausblenden */
export function pwField(input) {
  const btn = el('button', { type: 'button', class: 'pw-eye', 'aria-label': 'Passwort anzeigen', onclick: () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
    btn.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
  } }, icon('eye'));
  return el('div', { class: 'pw-wrap' }, input, btn);
}

export function openSheet(title, buildContent, onClose) {
  let closed = false;
  const before = document.activeElement;
  let asking = false;
  const close = (viaBack, force) => {
    if (closed) return;
    if (!force && body.guard && body.guard()) {
      if (viaBack === true) history.pushState({ ldSheet: true }, '');
      if (asking) return;
      asking = true;
      confirmSheet('Wirklich verwerfen?', 'Deine Eingaben werden nicht gespeichert.', 'Verwerfen').then((ok) => { asking = false; if (ok) setTimeout(() => close(false, true), 60); else snapBack(); });
      return;
    }
    closed = true;
    const i = sheetStack.indexOf(close);
    if (i >= 0) sheetStack.splice(i, 1);
    backdrop.remove();
    if (onClose) onClose();
    if (!sheetStack.length) document.body.classList.remove('no-scroll');
    if (viaBack !== true) { ignorePops++; history.back(); }
    if (before && before.isConnected && before.focus) { try { before.focus({ preventScroll: true }); } catch (x) { /* ignorieren */ } }
  };
  const body = el('div', { class: 'sheet-body' });
  const clean = (k) => k.filter((x) => x !== null && x !== undefined && x !== false);
  const app = body.append.bind(body), rep = body.replaceChildren.bind(body);
  body.append = (...k) => app(...clean(k));
  body.replaceChildren = (...k) => rep(...clean(k));
  const sheet = el(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    el('div', { class: 'sheet-head' }, el('h2', null, title), el('button', { class: 'icon-btn', type: 'button', onclick: () => close(), 'aria-label': 'Schließen' }, icon('close'))),
    body
  );
  let downOnBackdrop = false;
  const backdrop = el('div', {
    class: 'backdrop',
    onpointerdown: (e) => { downOnBackdrop = e.target === backdrop; },
    onclick: (e) => { if (e.target === backdrop && downOnBackdrop) close(); }
  }, sheet);
  document.body.append(backdrop);
  document.body.classList.add('no-scroll');
  history.pushState({ ldSheet: true }, '');
  sheetStack.push(close);
  /* Nach unten ziehen schließt (Handy) */
  const head = sheet.querySelector('.sheet-head');
  let y0 = null, dy = 0, t0 = 0;
  const snapBack = () => { sheet.style.transition = 'transform .24s cubic-bezier(.2, .8, .2, 1)'; sheet.style.transform = ''; };
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || window.innerWidth >= 700 || sheet.classList.contains('viewer')) return;
    e.preventDefault();
    y0 = e.clientY; dy = 0; t0 = Date.now();
    sheet.style.transition = 'none';
    try { head.setPointerCapture(e.pointerId); } catch (x) { /* ignorieren */ }
  });
  head.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = dy ? `translateY(${dy}px)` : '';
  });
  const release = () => {
    if (y0 === null) return;
    y0 = null;
    const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.6;
    if (dy > 110 || fast) {
      sheet.style.transition = 'transform .18s ease-in';
      sheet.style.transform = 'translateY(110%)';
      setTimeout(() => close(), 170);
    } else snapBack();
  };
  head.addEventListener('pointerup', release);
  const NOSWIPE = 'input, select, textarea, button, a, .swipe, .chips, .suggest, .cal, [contenteditable]';
  let ty = null, tdrag = false;
  sheet.addEventListener('touchstart', (e) => {
    ty = null; tdrag = false;
    if (e.touches.length !== 1 || window.innerWidth >= 700 || sheet.classList.contains('viewer') || head.contains(e.target) || e.target.closest(NOSWIPE)) return;
    if (sheet.scrollTop > 0) return;
    ty = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (ty === null) return;
    const d = e.touches[0].clientY - ty;
    if (!tdrag) {
      if (d < 0 || sheet.scrollTop > 0) { ty = null; return; }
      if (d < 14) return;
      tdrag = true; sheet.style.transition = 'none';
    }
    e.preventDefault();
    dy = Math.max(0, d - 14);
    sheet.style.transform = dy ? `translateY(${dy}px)` : '';
  }, { passive: false });
  const tend = () => { if (ty === null) return; ty = null; if (!tdrag) return; tdrag = false; y0 = 0; release(); };
  sheet.addEventListener('touchend', tend);
  sheet.addEventListener('touchcancel', tend);
  head.addEventListener('pointercancel', release);
  buildContent(body, () => close(false, true));
  try { sheet.focus({ preventScroll: true }); } catch (x) { /* ignorieren */ }
  return () => close();
}

/* Langes Drücken (statt Tippen) */
export function longPress(node, fn, ms = 480) {
  let t = 0, x = 0, y = 0, fired = false;
  const stop = () => clearTimeout(t);
  node.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    fired = false; x = e.clientX; y = e.clientY; stop();
    t = setTimeout(() => { fired = true; if (navigator.vibrate) { try { navigator.vibrate(12); } catch (z) { /* ignorieren */ } } fn(); }, ms);
  });
  node.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - x) > 8 || Math.abs(e.clientY - y) > 8) stop(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => node.addEventListener(n, stop));
  node.addEventListener('click', (e) => { if (fired) { fired = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  node.addEventListener('contextmenu', (e) => e.preventDefault());
  node.classList.add('lp');
  return node;
}

/* Ja/Nein-Rückfrage */
export function confirmSheet(title, text, okLabel, danger = true) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v, close) => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    openSheet(title, (body, close) => {
      body.append(
        el('p', null, text),
        el(
          'div',
          { class: 'row end actions' },
          el('button', { class: 'btn ghost', type: 'button', onclick: () => finish(false, close) }, 'Abbrechen'),
          el('button', { class: 'btn ' + (danger ? 'danger solid' : 'primary'), type: 'button', onclick: () => finish(true, close) }, okLabel)
        )
      );
    }, () => { if (!done) { done = true; resolve(false); } });
  });
}

/* Wischen: links = Löschen, rechts = eigene Aktion */
export function swipeActions(node, { onLeft, onRight, rightLabel = '✓ Erledigt' }) {
  const wrap = el('div', { class: 'swipe' },
    onRight && el('span', { class: 'swipe-bg right' }, rightLabel),
    onLeft && el('span', { class: 'swipe-bg left' }, '🗑 Löschen'), node);
  let on = false, sx = 0, sy = 0, dx = 0, lock = null, moved = false;
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    on = true; sx = e.clientX; sy = e.clientY; dx = 0; lock = null; moved = false;
  });
  node.addEventListener('pointermove', (e) => {
    if (!on) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!lock && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (lock === 'x') { try { node.setPointerCapture(e.pointerId); } catch (x) { /* ignorieren */ } }
    }
    if (lock !== 'x') return;
    dx = mx < 0 ? (onLeft ? mx : 0) : (onRight ? mx : 0);
    moved = true;
    wrap.classList.toggle('to-right', dx > 0);
    wrap.classList.toggle('to-left', dx < 0);
    node.style.transition = 'none';
    node.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if (!on) return;
    on = false;
    node.style.transition = 'transform .15s';
    const limit = Math.max(90, wrap.offsetWidth * 0.3);
    const act = dx < -limit ? onLeft : dx > limit ? onRight : null;
    if (act) {
      node.style.transform = `translateX(${dx < 0 ? '-105%' : '105%'})`;
      setTimeout(act, 150);
    } else {
      node.style.transform = '';
      setTimeout(() => wrap.classList.remove('to-right', 'to-left'), 160);
    }
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  node.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  return wrap;
}
export const swipeDelete = (node, onDelete) => swipeActions(node, { onLeft: onDelete });

export function uid() {
  if (window.crypto && crypto.getRandomValues) return [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  return Math.random().toString(36).slice(2, 10);
}

/* Datei zum Download anbieten */
export function downloadBlob(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 4000);
}

/* Foto verkleinern, gibt Data-URL zurück */
export function shrinkImage(file, maxSize, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
}

/* Chip-Reihen behalten beim Neuzeichnen ihre Scrollposition */
export function keepChips(fn) {
  const pos = [...document.querySelectorAll('.chips')].map((c) => c.scrollLeft);
  fn();
  const apply = () => document.querySelectorAll('.chips').forEach((c, i) => { if (pos[i]) c.scrollLeft = pos[i]; });
  apply();
  requestAnimationFrame(apply);
}

/* Maus: Chip-Reihen per Ziehen und Mausrad seitlich scrollen */
let drag = null;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  const row = e.target.closest('.chips');
  if (!row || row.scrollWidth <= row.clientWidth) return;
  drag = { row, x: e.clientX, left: row.scrollLeft, moved: false };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 5) drag.moved = true;
  if (drag.moved) { drag.row.scrollLeft = drag.left - dx; drag.row.classList.add('dragging'); }
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.row.classList.remove('dragging');
  if (d.moved) document.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
});
document.addEventListener('wheel', (e) => {
  const row = e.target.closest && e.target.closest('.chips');
  if (!row || row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  row.scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });

/* Chip-Eingabe: Komma/Enter macht Chips, Vorschläge aus suggest(q) */
export function chipInput({ values = [], suggest = () => [], placeholder = '', onChange = () => {} }) {
  let list = [...values];
  const box = el('span', { class: 'tag-list' });
  const input = el('input', { type: 'text', placeholder, autocomplete: 'off', enterkeyhint: 'done' });
  const wrap = el('div', { class: 'tag-input' }, box, input);
  const sugg = el('div', { class: 'chips small tag-sugg' });
  const has = (t) => list.some((x) => x.toLowerCase() === t.toLowerCase());
  const add = (raw) => { for (const t of String(raw).split(',').map((x) => x.trim()).filter(Boolean)) if (!has(t)) list.push(t); };
  const draw = (changed) => {
    box.replaceChildren(...list.map((t, i) => el('span', { class: 'tag-chip' }, t,
      el('button', { type: 'button', 'aria-label': `${t} entfernen`, onmousedown: (e) => e.preventDefault(), onclick: () => { list.splice(i, 1); draw(true); } }, '×'))));
    const q = input.value.trim().toLowerCase();
    const hits = suggest(q).filter((t) => !has(t) && (!q || t.toLowerCase().includes(q))).slice(0, 8);
    sugg.replaceChildren(...hits.map((t) => el('button', { type: 'button', class: 'chip', onmousedown: (e) => e.preventDefault(), onclick: () => { add(t); input.value = ''; draw(true); } }, t)));
    if (changed) onChange([...list]);
  };
  input.addEventListener('input', () => {
    if (input.value.includes(',')) { const parts = input.value.split(','); input.value = parts.pop().replace(/^\s+/, ''); add(parts.join(',')); draw(true); } else draw(false);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (input.value.trim()) { add(input.value); input.value = ''; draw(true); } }
    else if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); draw(true); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) { add(input.value); input.value = ''; draw(true); } });
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target === box) input.focus(); });
  draw(false);
  return { node: el('div', { class: 'field' }, wrap, sugg), values: () => { if (input.value.trim()) { add(input.value); input.value = ''; } return [...list]; } };
}
