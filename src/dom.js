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
  gear: '<path d="M14.8 5.2a4.5 4.5 0 0 0-5.9 5.6L3.8 15.9a1.9 1.9 0 0 0 2.7 2.7l5.1-5.1a4.5 4.5 0 0 0 5.6-5.9l-2.7 2.7-2.3-.4-.4-2.3z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
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
if (window.visualViewport) {
  const vv = window.visualViewport;
  const setKb = () => document.documentElement.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
  vv.addEventListener('resize', setKb);
  vv.addEventListener('scroll', setKb);
}

/* Handy: Eingabefeld beim Tippen nach oben holen, damit Vorschläge darunter sichtbar bleiben */
const touchUi = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const typable = (t) => t && ((t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|range)$/.test(t.type)) || t.tagName === 'TEXTAREA');
if (touchUi) {
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!typable(t)) return;
    const sheet = t.closest('.sheet');
    if (!sheet) return;
    document.documentElement.classList.add('typing');
    const anchor = t.closest('.tag-input, .place-field, label, .field') || t;
    setTimeout(() => {
      if (document.activeElement !== t) return;
      const head = sheet.querySelector('.sheet-head');
      const top = anchor.getBoundingClientRect().top - sheet.getBoundingClientRect().top - (head ? head.offsetHeight : 0) - 10;
      sheet.scrollBy({ top, behavior: 'smooth' });
    }, 320);
  });
  document.addEventListener('focusout', () => setTimeout(() => { if (!typable(document.activeElement)) document.documentElement.classList.remove('typing'); }, 150));
}

export function openSheet(title, buildContent, onClose) {
  let closed = false;
  const before = document.activeElement;
  const close = (viaBack) => {
    if (closed) return;
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
  buildContent(body, () => close());
  try { sheet.focus({ preventScroll: true }); } catch (x) { /* ignorieren */ }
  return () => close();
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
