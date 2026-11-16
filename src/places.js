/* Adressfeld mit Vorschlägen (Photon/OpenStreetMap), Karte und Navigation */
import { el } from './dom.js';

const labelOf = (p) => {
  const x = p.properties || {};
  const street = [x.street, x.housenumber].filter(Boolean).join(' ');
  const city = [x.postcode, x.city || x.town || x.village || x.county].filter(Boolean).join(' ');
  return [x.name && x.name !== x.street ? x.name : '', street, city, x.country].filter(Boolean).join(', ');
};

export const navLink = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

export function placeField(value, geo, onChange) {
  let cur = { text: value || '', lat: geo && geo.lat, lon: geo && geo.lon };
  const input = el('input', { type: 'text', value: cur.text, placeholder: 'Ort oder Adresse (optional)', autocomplete: 'off' });
  const list = el('div', { class: 'suggest hidden' });
  const map = el('div', { class: 'map-box hidden' });
  let timer = 0;
  let seq = 0;

  const drawMap = () => {
    if (cur.lat == null) return map.classList.add('hidden');
    const d = 0.004;
    const bbox = [cur.lon - d, cur.lat - d, cur.lon + d, cur.lat + d].join(',');
    map.replaceChildren(
      el('iframe', { src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${cur.lat},${cur.lon}`, loading: 'lazy', title: 'Karte', tabindex: '-1' }),
      el('a', { class: 'map-link', href: navLink(cur.lat, cur.lon), target: '_blank', rel: 'noopener' }, '🧭 Navigation starten'));
    map.classList.remove('hidden');
  };
  const emit = () => onChange({ text: cur.text, lat: cur.lat ?? null, lon: cur.lon ?? null });

  input.addEventListener('input', () => {
    cur = { text: input.value, lat: null, lon: null };
    emit(); drawMap();
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) return list.classList.add('hidden');
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        const r = await fetch(`https://photon.komoot.io/api/?lang=de&limit=5&q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (my !== seq) return;
        const hits = (data.features || []).filter((f) => f.geometry && f.geometry.coordinates);
        list.replaceChildren(...hits.map((f) => el('button', { type: 'button', class: 'suggest-row', onclick: () => {
          const [lon, lat] = f.geometry.coordinates;
          cur = { text: labelOf(f), lat, lon };
          input.value = cur.text;
          list.classList.add('hidden');
          emit(); drawMap();
        } }, el('span', { class: 'grow' }, '📍 ' + labelOf(f)))));
        list.classList.toggle('hidden', !hits.length);
      } catch (e) { list.classList.add('hidden'); }
    }, 350);
  });
  drawMap();
  return el('div', { class: 'place-field' }, el('label', null, 'Ort', input), list, map);
}
