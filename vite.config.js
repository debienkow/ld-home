import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/* Version und Stand der letzten Änderung */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let stamp = new Date();
try { stamp = new Date(execSync('git log -1 --format=%cI', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch (e) { /* ohne Git: Bauzeit */ }
if (Number.isNaN(stamp.getTime())) stamp = new Date();
const fmt = (o) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...o }).format(stamp);
const BUILD = `Version ${pkg.version}, Stand: ${fmt({ day: '2-digit', month: '2-digit', year: 'numeric' })}, ${fmt({ hour: '2-digit', minute: '2-digit' })} Uhr`;

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

/* Liste der Programmdateien für den Service Worker */
const assetList = (mode) => ({
  name: 'asset-list',
  apply: 'build',
  generateBundle(_, bundle) {
    if (mode === 'demo') return;
    this.emitFile({ type: 'asset', fileName: 'assets.json', source: JSON.stringify(Object.keys(bundle).filter((f) => f.startsWith('assets/'))) });
  }
});

export default defineConfig(({ mode }) => ({
  base: '/ld-home/',
  build: { target: 'es2020' },
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [csp(), tess(mode), assetList(mode)],
  resolve: mode === 'demo' ? { alias: { 'firebase/firestore': demo('fs.js'), 'firebase/auth': demo('auth.js'), 'firebase/app': demo('app.js') } } : {}
}));
