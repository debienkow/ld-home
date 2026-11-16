/* DMS: Standardwerte und Bildhelfer */
export const DEFAULT_DMS_CATEGORIES = [
  { id: 'vertrag', name: 'Verträge', icon: '📑', color: '#4d8dff' },
  { id: 'rechnung', name: 'Rechnungen, Belege', icon: '🧾', color: '#f0a04b' },
  { id: 'versicherung', name: 'Versicherung', icon: '🛡️', color: '#5fd39a' },
  { id: 'gesundheit', name: 'Gesundheit', icon: '🩺', color: '#e58fb1' },
  { id: 'wohnung', name: 'Wohnung', icon: '🏠', color: '#d98c5f' },
  { id: 'steuern', name: 'Steuern, Ämter', icon: '🏛️', color: '#b58fe0' },
  { id: 'fahrzeug', name: 'Fahrzeug', icon: '🚗', color: '#4fc3d9' },
  { id: 'sonstiges', name: 'Sonstiges', icon: '📄', color: '#9aa7c2' }
];

/* Bild (Datei oder Data-URL) auf maximale Kantenlänge verkleinern, Ergebnis unter ~900 KB */
export function compress(src, maxSize, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    img.onload = () => {
      let size = maxSize;
      let q = quality;
      let out = '';
      for (let i = 0; i < 6; i++) {
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', q);
        if (out.length < 900000) break;
        size = Math.round(size * 0.82);
        q = Math.max(0.5, q - 0.05);
      }
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* Texterkennung im Browser (Tesseract.js, wird erst bei Bedarf geladen) */
export async function recognize(dataUrls, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('deu+eng');
  try {
    let text = '';
    for (let i = 0; i < dataUrls.length; i++) {
      onProgress && onProgress(i + 1, dataUrls.length);
      const r = await worker.recognize(dataUrls[i]);
      text += (text ? '\n\n' : '') + r.data.text.trim();
    }
    return text;
  } finally {
    await worker.terminate();
  }
}

export const guessTitle = (text) => (text.split('\n').map((l) => l.trim()).find((l) => l.length > 3) || '').slice(0, 60);

/* PDF -> Seitenbilder (und eingebetteter Text, falls vorhanden) */
export async function pdfToImages(file, maxPages = 25, onProgress) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const images = [];
  let text = '';
  const n = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    onProgress && onProgress(i, n);
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, 1700 / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    images.push(await compress(canvas.toDataURL('image/jpeg', 0.85), 1700));
    const tc = await page.getTextContent();
    text += (text ? '\n\n' : '') + tc.items.map((x) => x.str).join(' ').replace(/\s+/g, ' ').trim();
  }
  return { images, text: text.trim(), cut: pdf.numPages > n };
}

/* Einfaches PDF aus JPEG-Seiten */
export async function imagesToPdf(dataUrls) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };
  const dims = await Promise.all(dataUrls.map((u) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.width, i.height]); i.src = u; })));
  push('%PDF-1.4\n');
  const kids = dataUrls.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${dataUrls.length} >>`);
  dataUrls.forEach((u, i) => {
    const [w, h] = dims[i];
    const jpg = Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));
    const page = 3 + i * 3;
    const pw = Math.round(w * 0.5), ph = Math.round(h * 0.5);
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents ${page + 1} 0 R /Resources << /XObject << /Im ${page + 2} 0 R >> >> >>`);
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im Do Q`;
    obj(page + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[page + 2] = len;
    push(`${page + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
    push(jpg);
    push('\nendstream\nendobj\n');
  });
  const count = 3 + dataUrls.length * 3;
  const xref = len;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}
