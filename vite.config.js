import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const demo = (f) => fileURLToPath(new URL(`./src/demo/${f}`, import.meta.url));

export default defineConfig(({ mode }) => ({
  base: '/ld-home/',
  build: { target: 'es2020' },
  resolve: mode === 'demo' ? { alias: { 'firebase/firestore': demo('fs.js'), 'firebase/auth': demo('auth.js'), 'firebase/app': demo('app.js') } } : {}
}));
