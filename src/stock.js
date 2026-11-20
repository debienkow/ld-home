/* Vorrat ↔ Einkaufsliste abgleichen */
import { markStockListed, norm, putStockItem, removeItem, state, stockEntries, subscribe, updateItem } from './store.js';

const AUTO = /^Vorrat\b/;
let timer = 0;
let busy = false;
export const stockNeed = (s) => Math.max(1, (s.target || 0) - (s.count || 0));
export const stockLow = (s) => s && Number.isFinite(s.count) && s.count <= (s.min || 0);

export function startStockSync() {
  subscribe(() => { clearTimeout(timer); timer = setTimeout(runStockSync, 1500); });
}

async function runStockSync() {
  const l = state.shopLoaded;
  if (!state.user || !l.items || !l.catalog || !l.settings) return;
  if (busy) { clearTimeout(timer); timer = setTimeout(runStockSync, 1500); return; }
  busy = true;
  try {
    const stock = stockEntries();
    const names = new Set(stock.map((x) => norm(x.name)));
    const jobs = [];
    for (const x of stock) {
      const s = x.stock;
      if (!Number.isFinite(s.count)) continue;
      const open = state.items.find((i) => !i.done && norm(i.name) === norm(x.name));
      const qty = `Vorrat ${stockNeed(s)}`;
      if (stockLow(s)) {
        if (open) {
          if (AUTO.test(open.qty || '') && open.qty !== qty) jobs.push(updateItem(open.id, { qty }));
        } else if ((s.listedFor || 0) !== (s.countAt || 0) || s.listedFor === undefined) {
          jobs.push(putStockItem(x.key, { name: x.name, qty, categoryId: x.categoryId || 'sonstiges', store: s.store || null }));
          jobs.push(markStockListed(x.key, s.countAt || 0));
        }
      } else if (open && AUTO.test(open.qty || '')) {
        jobs.push(removeItem(open.id));
      }
    }
    for (const i of state.items) {
      if (!i.done && AUTO.test(i.qty || '') && !names.has(norm(i.name))) jobs.push(removeItem(i.id));
    }
    await Promise.all(jobs);
  } catch (e) { console.error(e); } finally { busy = false; }
}
