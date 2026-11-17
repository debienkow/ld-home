import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const demo = (f) => fileURLToPath(new URL(`./src/demo/${f}`, import.meta.url));

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self' data: blob: https://*.googleapis.com https://photon.komoot.io https://script.google.com https://script.googleusercontent.com",
  'frame-src https://www.openstreetmap.org',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

/* Sicherheitsrichtlinie nur im fertigen Build */
const csp = () => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`)
});

/* Texterkennung ohne fremde Server: Dateien aus node_modules mit ausliefern */
const TESS = [
  'tesseract.js/dist/worker.min.js',
  'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  '@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz',
  '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'
];
const tess = (mode) => ({
  name: 'tess',
  apply: 'build',
  closeBundle() {
    if (mode === 'demo') return;
    const out = resolve('dist/tess');
    mkdirSync(out, { recursive: true });
    for (const f of TESS) copyFileSync(resolve('node_modules', f), resolve(out, f.split('/').pop()));
  }
});

export default defineConfig(({ mode }) => ({
  base: '/ld-home/',
  build: { target: 'es2020' },
  plugins: [csp(), tess(mode)],
  resolve: mode === 'demo' ? { alias: { 'firebase/firestore': demo('fs.js'), 'firebase/auth': demo('auth.js'), 'firebase/app': demo('app.js') } } : {}
}));
