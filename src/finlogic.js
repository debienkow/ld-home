/* Finanzen: Standardwerte und Rechenlogik */
export const PEOPLE = ['dudi', 'logi'];
export const otherOf = (k) => (k === 'dudi' ? 'logi' : 'dudi');

export const DEFAULT_CATEGORIES = [
  { id: 'supermarkt', name: 'Supermarkt', icon: '🛒', color: '#4caf7d' },
  { id: 'drogerie', name: 'Drogerie', icon: '🧴', color: '#e58fb1' },
  { id: 'essen', name: 'Essen (extern)', icon: '🍔', color: '#f0a04b' },
  { id: 'event', name: 'Event', icon: '🎟️', color: '#b58fe0' },
  { id: 'urlaub', name: 'Urlaub', icon: '🏖️', color: '#4fc3d9' },
  { id: 'reisen', name: 'Reisen', icon: '🚆', color: '#5a8dee' },
  { id: 'wohnung', name: 'Wohnung', icon: '🏠', color: '#d98c5f' },
  { id: 'kleidung', name: 'Kleidung', icon: '👕', color: '#d96aa0' },
  { id: 'gaming', name: 'Gaming', icon: '🎮', color: '#7a7ae0' },
  { id: 'umzug', name: 'Umzug', icon: '📦', color: '#a08a6a' },
  { id: 'sonstiges', name: 'Sonstiges', icon: '🧾', color: '#9aa7c2' }
];

export const DEFAULT_INCOME_CATEGORIES = [
  { id: 'gehalt', name: 'Gehalt', icon: '💼', color: '#4caf7d' },
  { id: 'erstattung', name: 'Erstattung', icon: '↩️', color: '#4fc3d9' },
  { id: 'sonstige-einnahme', name: 'Sonstiges', icon: '💰', color: '#9aa7c2' }
];

export const DEFAULT_RULES = [
  ['lidl', 'supermarkt'], ['rewe', 'supermarkt'], ['penny', 'supermarkt'], ['edeka', 'supermarkt'], ['aldi', 'supermarkt'],
  ['einkauf', 'supermarkt'], ['budni', 'drogerie'], ['rossmann', 'drogerie'], ['apotheke', 'drogerie'],
  ['h&m', 'kleidung'], ['zalando', 'kleidung'], ['adidas', 'kleidung'], ['deutsche bahn', 'reisen'], ['db ', 'reisen'],
  ['flixtrain', 'reisen'], ['flixbus', 'reisen'], ['hotel', 'urlaub'], ['premier inn', 'urlaub'], ['döner', 'essen'],
  ['hardal', 'essen'], ['restaurant', 'essen'], ['mcdonald', 'essen'], ['bauhaus', 'wohnung'], ['ikea', 'wohnung'],
  ['steam', 'gaming'], ['playstation', 'gaming'], ['kino', 'event']
].map(([match, categoryId]) => ({ match, categoryId }));

/* Schnellauswahl beim Eintragen (bis zur eigenen Anpassung) */
export const DEFAULT_PRESETS = ['Lidl', 'REWE', 'Penny', 'Budni', 'Rossmann'].map((title) => ({ title, categoryId: title === 'Budni' || title === 'Rossmann' ? 'drogerie' : 'supermarkt' }));

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const fmt = (cents) => eur.format((cents || 0) / 100);

/* "12,50" oder "-3.2" -> Cent, sonst null */
export function parseMoney(text) {
  let t = String(text).trim().replace(/\s/g, '').replace('€', '');
  t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

export const monthOf = (date) => date.slice(0, 7);
export const todayStr = () => new Date().toLocaleDateString('sv-SE');
export const nowTime = () => new Date().toTimeString().slice(0, 5);
/* Geplanter Eintrag: Zeitpunkt erreicht? */
export const isDue = (x) => x.date < todayStr() || (x.date === todayStr() && (!x.time || x.time <= nowTime()));
export const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
};

/* Positiv = Logi schuldet Dudi, negativ = Dudi schuldet Logi (in Cent) */
export function balance(entries) {
  let twice = 0;
  for (const e of entries) {
    if (e.planned) continue;
    if (e.type === 'income') {
      if (!e.noSplit) twice += (e.payer === 'dudi' ? -1 : 1) * e.cents;
      continue;
    }
    const full = e.noSplit || e.type === 'settlement';
    twice += (e.payer === 'dudi' ? 1 : -1) * (full ? 2 * e.cents : e.cents);
  }
  return Math.round(twice / 2);
}

export function suggestCategory(title, rules) {
  const t = title.toLowerCase();
  const hit = (rules || []).find((r) => r.match && t.includes(r.match.toLowerCase()));
  return hit ? hit.categoryId : null;
}

/* Gültiger Preis eines laufenden Postens im Monat ym */
export function currentCents(rec, ym) {
  const v = [...(rec.versions || [])].sort((a, b) => a.from.localeCompare(b.from)).filter((x) => x.from <= ym);
  return v.length ? v[v.length - 1].cents : 0;
}

/* Anteil von Logi (Cent pro Monat) */
export function logiShare(monthly, weight, salaries) {
  const w = weight || { mode: 'equal' };
  if (w.mode === 'percent') return Math.round((monthly * (w.logiPercent || 50)) / 100);
  if (w.mode === 'fixed') return Math.min(w.logiFixedCents || 0, monthly);
  if (w.mode === 'salary') {
    const l = (salaries && salaries.logi) || 0;
    const d = (salaries && salaries.dudi) || 0;
    const base = l + d ? l / (l + d) : 0.5;
    const frac = Math.min(1, Math.max(0, base + (w.logiOffsetPercent || 0) / 100));
    return Math.round(monthly * frac);
  }
  return Math.round(monthly / 2);
}

export function recurringRows(recs, salaries, ym) {
  return [...recs].sort((a, b) => (a.sort || 0) - (b.sort || 0)).map((r) => {
    const monthly = Math.round(currentCents(r, ym) / (r.intervalMonths || 1));
    const logi = logiShare(monthly, r.weight, salaries);
    return { rec: r, monthly, share: { logi, dudi: monthly - logi } };
  });
}

/* Summen und monatliche Überweisung */
export function recurringSummary(recs, salaries, ym) {
  const rows = recurringRows(recs, salaries, ym);
  const sum = { total: 0, share: { logi: 0, dudi: 0 }, paid: { logi: 0, dudi: 0 } };
  for (const r of rows) {
    sum.total += r.monthly;
    sum.share.logi += r.share.logi;
    sum.share.dudi += r.share.dudi;
    sum.paid[r.rec.payer] += r.monthly;
  }
  const dudiOwes = sum.share.dudi - sum.paid.dudi;
  const transfer = dudiOwes >= 0 ? { from: 'dudi', to: 'logi', cents: dudiOwes } : { from: 'logi', to: 'dudi', cents: -dudiOwes };
  return { rows, ...sum, transfer };
}
