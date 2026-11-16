/* Events: Standardwerte und Hilfsfunktionen */
export const DEFAULT_EVENT_CATEGORIES = [
  { id: 'treffen', name: 'Treffen', icon: '👥', color: '#4d8dff' },
  { id: 'urlaub', name: 'Urlaub', icon: '🏖️', color: '#4fc3d9' },
  { id: 'kultur', name: 'Konzert, Kino, Theater', icon: '🎭', color: '#b58fe0' },
  { id: 'geburtstag', name: 'Geburtstag, Feier', icon: '🎂', color: '#e58fb1' },
  { id: 'termin', name: 'Termin (Arzt, Amt)', icon: '📋', color: '#f0a04b' },
  { id: 'reise', name: 'Reise, Fahrt', icon: '🚆', color: '#5fd39a' },
  { id: 'sonstiges', name: 'Sonstiges', icon: '📌', color: '#9aa7c2' }
];

export const RSVP = { yes: ['✓', 'Zugesagt'], maybe: ['?', 'Vielleicht'], no: ['✗', 'Abgesagt'], '': ['…', 'Offen'] };

export const isoOf = (d) => d.toLocaleDateString('sv-SE');
export const todayIso = () => isoOf(new Date());
export const parseIso = (s) => new Date(s + 'T00:00');
export const addDays = (s, n) => {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
export const endOf = (e) => e.end || e.start;
export const covers = (e, day) => e.start <= day && day <= endOf(e);

/* Werktage (Mo bis Fr) im Zeitraum, für Urlaubstage */
export function workdays(start, end) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = parseIso(d).getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

const fmtDate = (s, opts) => parseIso(s).toLocaleDateString('de-DE', opts);
export function rangeText(e) {
  const end = endOf(e);
  const short = { weekday: 'short', day: '2-digit', month: '2-digit' };
  const t = (x) => (!e.allDay && x ? ` ${x}` : '');
  if (end === e.start) return `${fmtDate(e.start, short)}${e.allDay ? '' : t(e.startTime) + (e.endTime ? `–${e.endTime}` : '')}`;
  return `${fmtDate(e.start, short)}${t(e.startTime)} – ${fmtDate(end, short)}${t(e.endTime)}`;
}

/* Kalender-Datei (.ics) und Google-Kalender-Link */
const icsDate = (s) => s.replace(/-/g, '');
const icsTime = (s, t) => `${icsDate(s)}T${(t || '00:00').replace(':', '')}00`;
const esc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function icsOf(e) {
  const end = endOf(e);
  const when = e.allDay
    ? [`DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(addDays(end, 1))}`]
    : [`DTSTART:${icsTime(e.start, e.startTime)}`, `DTEND:${icsTime(end, e.endTime || e.startTime || '00:00')}`];
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LD Home//DE', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${e.id || Math.random().toString(36).slice(2)}@ld-home`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    ...when, `SUMMARY:${esc(e.title)}`, e.location ? `LOCATION:${esc(e.location)}` : '', e.note ? `DESCRIPTION:${esc(e.note)}` : '',
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

export function googleLink(e) {
  const end = endOf(e);
  const dates = e.allDay
    ? `${icsDate(e.start)}/${icsDate(addDays(end, 1))}`
    : `${icsTime(e.start, e.startTime)}/${icsTime(end, e.endTime || e.startTime || '00:00')}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates, details: e.note || '', location: e.location || '' });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function downloadIcs(e) {
  const blob = new Blob([icsOf(e)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(e.title || 'termin').replace(/[^\w\-äöüÄÖÜß ]/g, '').trim() || 'termin'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
