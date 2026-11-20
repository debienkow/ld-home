/* Vorrat ↔ Einkaufsliste abgleichen (nur auf Anstoß) */
import { markStockListed, norm, putStockItem, removeItem, state, stockEntries, updateItem } from './store.js';

const AUTO = /^Vorrat\b/;
export const stockNeed = (s) => Math.max(1, (s.target || 0) - (s.count || 0));
export const stockLow = (s) => !!s && !s.ok && Number.isFinite(s.count) && s.count <= (s.min || 0);
const openOf = (name) => state.items.find((i) => !i.done && norm(i.name) === norm(name));

/* Ein Artikel; liefert 'added' | 'updated' | 'removed' | 'listed' | null */
export async function syncStockOne(x) {
  const s = x.stock || {};
  const open = openOf(x.name);
  if (stockLow(s)) {
    const qty = `Vorrat ${stockNeed(s)}`;
    if (open) {
      if (!AUTO.test(open.qty || '')) return 'listed';
      if (open.qty === qty) return 'listed';
      await updateItem(open.id, { qty });
      return 'updated';
    }
    if (s.listedFor !== undefined && (s.listedFor || 0) === (s.countAt || 0)) return null;
    await Promise.all([
      putStockItem(x.key, { name: x.name, qty, categoryId: x.categoryId || 'sonstiges', store: s.store || null }),
      markStockListed(x.key, s.countAt || 0)
    ]);
    return 'added';
  }
  if (open && AUTO.test(open.qty || '')) { await removeItem(open.id); return 'removed'; }
  return null;
}

/* Automatischen Eintrag eines nicht mehr geführten Artikels entfernen */
export async function syncStockGone(name) {
  const open = openOf(name);
  if (open && AUTO.test(open.qty || '')) await removeItem(open.id);
}

/* Alle Artikel */
export async function syncStockAll() {
  const res = { added: 0, updated: 0, removed: 0 };
  const stock = stockEntries();
  for (const x of stock) {
    const r = await syncStockOne(x);
    if (r && res[r] !== undefined) res[r]++;
  }
  const names = new Set(stock.map((x) => norm(x.name)));
  for (const i of [...state.items]) {
    if (!i.done && AUTO.test(i.qty || '') && !names.has(norm(i.name))) { await removeItem(i.id); res.removed++; }
  }
  return res;
}
