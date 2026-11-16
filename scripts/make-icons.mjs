/* Erzeugt PWA-Icons aus public/icon.svg */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg');
const out = 'public/icons/';

const plain = (size, name) => sharp(svg, { density: 384 }).resize(size, size).png().toFile(out + name);

const maskable = async () => {
  const inner = await sharp(svg, { density: 384 }).resize(400, 400).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#12285a' } })
    .composite([{ input: inner, left: 56, top: 56 }])
    .png().toFile(out + 'icon-maskable-512.png');
};

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await maskable();
await sharp(out + 'icon-maskable-512.png').resize(180, 180).png().toFile(out + 'apple-touch-icon.png');
console.log('Icons fertig');
