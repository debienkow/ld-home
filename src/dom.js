/* Kleine DOM-Helfer */
export function el(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
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

/* Unten einfahrendes Fenster */
export function openSheet(title, buildContent) {
  const close = () => {
    backdrop.remove();
    document.body.classList.remove('no-scroll');
  };
  const body = el('div', { class: 'sheet-body' });
  const sheet = el(
    'div',
    { class: 'sheet', role: 'dialog' },
    el('div', { class: 'sheet-head' }, el('h2', null, title), el('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Schließen' }, '✕')),
    body
  );
  const backdrop = el('div', { class: 'backdrop', onclick: (e) => e.target === backdrop && close() }, sheet);
  document.body.append(backdrop);
  document.body.classList.add('no-scroll');
  buildContent(body, close);
  return close;
}

/* Ja/Nein-Rückfrage */
export function confirmSheet(title, text, okLabel) {
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
          { class: 'row end' },
          el('button', { class: 'btn ghost', onclick: () => finish(false, close) }, 'Abbrechen'),
          el('button', { class: 'btn danger', onclick: () => finish(true, close) }, okLabel)
        )
      );
    });
  });
}

/* Wischen: links = Löschen, rechts = eigene Aktion */
export function swipeActions(node, { onLeft, onRight, rightLabel = '✓ Erledigt' }) {
  const wrap = el('div', { class: 'swipe' },
    onRight && el('span', { class: 'swipe-bg right' }, rightLabel),
    onLeft && el('span', { class: 'swipe-bg left' }, '🗑 Löschen'), node);
  let sx = 0, sy = 0, dx = 0, lock = null, moved = false;
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sx = e.clientX; sy = e.clientY; dx = 0; lock = null; moved = false;
  });
  node.addEventListener('pointermove', (e) => {
    if (!sx) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!lock && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (lock === 'x') { try { node.setPointerCapture(e.pointerId); } catch (x) { /* ignorieren */ } }
    }
    if (lock !== 'x') return;
    dx = mx < 0 ? (onLeft ? mx : 0) : (onRight ? mx : 0);
    moved = true;
    wrap.classList.toggle('to-right', dx > 0);
    node.style.transition = 'none';
    node.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if (!sx) return;
    sx = 0;
    node.style.transition = 'transform .15s';
    const limit = Math.max(90, wrap.offsetWidth * 0.3);
    const act = dx < -limit ? onLeft : dx > limit ? onRight : null;
    if (act) {
      node.style.transform = `translateX(${dx < 0 ? '-105%' : '105%'})`;
      setTimeout(act, 150);
    } else node.style.transform = '';
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  node.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  return wrap;
}
export const swipeDelete = (node, onDelete) => swipeActions(node, { onLeft: onDelete });

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* Foto verkleinern, gibt Data-URL zurück */
export function shrinkImage(file, maxSize, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
