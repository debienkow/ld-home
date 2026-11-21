/* Adressfeld mit Vorschlägen (Photon/OpenStreetMap), Karte und Navigation */
import { el } from './dom.js';

const labelOf = (p) => {
  const x = p.properties || {};
  const street = [x.street, x.housenumber].filter(Boolean).join(' ');
  const city = [x.postcode, x.city || x.town || x.village || x.county].filter(Boolean).join(' ');
  return [x.name && x.name !== x.street ? x.name : '', street, city, x.country].filter(Boolean).join(', ');
};

export const navLink = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

const mapParts = (lat, lon) => {
  const d = 0.004;
  const bbox = [lon - d, lat - d, lon + d, lat + d].join(',');
  return [
    el('iframe', { referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin', src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`, loading: 'lazy', title: 'Karte', tabindex: '-1' }),
    el('a', { class: 'map-link', href: navLink(lat, lon), target: '_blank', rel: 'noopener' }, '🧭 Navigation starten')];
};

/* Karte mit Navigation (nur Ansicht); ohne Koordinaten nur der Navigationsknopf */
export function mapView(text, lat, lon) {
  const ok = lat != null && lon != null && lat !== '' && lon !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));
  if (ok) return el('div', { class: 'map-box' }, ...mapParts(Number(lat), Number(lon)));
  if (!text) return null;
  return el('div', { class: 'map-box' }, el('a', { class: 'map-link', href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener' }, '🧭 Navigation starten'));
}

export function placeField(value, geo, onChange) {
  let cur = { text: value || '', lat: geo && geo.lat != null ? Number(geo.lat) : null, lon: geo && geo.lon != null ? Number(geo.lon) : null };
  const input = el('input', { type: 'text', value: cur.text, placeholder: 'Ort oder Adresse (optional)', autocomplete: 'off' });
  const list = el('div', { class: 'suggest hidden' });
  const map = el('div', { class: 'map-box hidden' });
  let timer = 0;
  let seq = 0;

  const drawMap = () => {
    if (!Number.isFinite(cur.lat) || !Number.isFinite(cur.lon)) return map.classList.add('hidden');
    map.replaceChildren(...mapParts(cur.lat, cur.lon));
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
        const r = await fetch(`https://photon.komoot.io/api/?lang=de&limit=5&q=${encodeURIComponent(q)}`, { referrerPolicy: 'no-referrer' });
        const data = await r.json();
        if (my !== seq) return;
        const hits = (data.features || []).filter((f) => f.geometry && f.geometry.coordinates);
        list.replaceChildren(...hits.map((f) => el('button', { type: 'button', class: 'suggest-row', onclick: () => {
          const [lon, lat] = f.geometry.coordinates.map(Number);
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
