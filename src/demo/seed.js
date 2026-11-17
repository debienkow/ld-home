/* Beispieldaten für den Demo-Modus */
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
export function seed() {
  const items = Object.fromEntries([['Milch', 'milch'], ['Brot', 'brot'], ['Äpfel', 'obst'], ['Spülmittel', 'haushalt']].map(([name, categoryId], i) => ['i' + i, { name, qty: '', categoryId, store: null, done: i === 3, doneAt: i === 3 ? Date.now() : 0, createdAt: Date.now() + i }]));
  const e = (id, type, date, title, cents, payer, categoryId, extra = {}) => [id, { type, date, time: '', title, cents, payer, categoryId, noSplit: false, note: '', createdAt: Date.now(), ...extra }];
  const fin = Object.fromEntries([
    e('f1', 'expense', iso(-20), 'Lidl', 4520, 'dudi', 'supermarkt'), e('f2', 'expense', iso(-12), 'REWE', 2310, 'logi', 'supermarkt'),
    e('f3', 'expense', iso(-5), 'Kino', 2400, 'dudi', 'event'), e('f4', 'expense', iso(-3), 'Weihnachtsgeschenk', 3000, 'logi', 'sonstiges', { noSplit: true }),
    e('f5', 'income', iso(-10), 'Gehalt', 250000, 'dudi', 'gehalt', { noSplit: true }), e('f9', 'income', iso(-4), 'Guthaben Stromanbieter', 5000, 'dudi', 'erstattung'), e('f6', 'settlement', iso(-2), 'Haushaltsausgleich', 500, 'dudi', 'ausgleich'),
    e('f7', 'expense', iso(30), 'Hotel Köln', 36540, '', 'urlaub', { planned: true }), e('f8', 'expense', iso(-1), 'Zahnbürsten', 1299, 'dudi', 'drogerie', { planned: true })
  ]);
  const rec = { r1: { title: 'Miete', payer: 'logi', intervalMonths: 1, weight: { mode: 'salary', logiOffsetPercent: -1.8125 }, versions: [{ from: '2024-01', cents: 120000 }], sort: 0 }, r2: { title: 'Strom', payer: 'dudi', intervalMonths: 1, weight: { mode: 'equal' }, versions: [{ from: '2024-01', cents: 8500 }], sort: 1 } };
  const events = {
    v1: { title: 'Konzert', categoryId: 'kultur', start: iso(7), end: iso(7), allDay: false, startTime: '19:30', endTime: '22:00', location: 'Barclays Arena, Hamburg', lat: 53.5875, lon: 9.9, participants: ['dudi', 'logi'], rsvp: { dudi: 'yes' }, vacation: [], important: true, createdAt: Date.now() },
    v2: { title: 'Urlaub Ostsee', categoryId: 'urlaub', start: iso(40), end: iso(46), allDay: true, participants: ['dudi', 'logi'], rsvp: { dudi: 'yes', logi: 'maybe' }, vacation: ['dudi', 'logi'], important: false, createdAt: Date.now() },
    v3: { title: 'Hochzeit Anna & Tim', categoryId: 'feier', start: iso(220), end: iso(220), allDay: true, participants: ['dudi', 'logi'], rsvp: { logi: 'yes' }, vacation: [], important: false, createdAt: Date.now() }
  };
  return {
    items, catalog: {}, profiles: {}, fin_entries: fin, fin_recurring: rec, config: { finance: { salaries: { logi: 219373, dudi: 237298 } } },
    events, event_ideas: { a1: { title: 'Wochenende an der Ostsee', note: '', createdAt: Date.now() } },
    dms_docs: { m1: { title: 'Mietvertrag', categoryId: 'vertrag', tags: ['miete'], date: iso(-100), note: '', text: 'Mietvertrag Beispiel', pageCount: 1, bytes: 180000, createdAt: Date.now() }, m2: { title: 'Hausratversicherung Police', categoryId: 'versicherung', tags: ['miete', 'versicherung', 'wohnung hamburg altona', 'jährliche zahlung'], date: '2024-03-12', note: '', text: '', pageCount: 2, bytes: 240000, createdAt: Date.now() - 1000 } }, dms_pages: {}
  };
}
