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
