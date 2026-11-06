// @ts-check
// Summary of model spending from data/usage.jsonl: per day and per call type,
// cost per upload, and what 100 or 1000 uploads would cost at that rate.
//
//   node scripts/consumo.mjs          all days
//   node scripts/consumo.mjs --dias=7 last 7 days

import { readUsage, dailyBudget, usageFile } from '../usage.mjs';

const dias = Number(process.argv.find(a => a.startsWith('--dias='))?.slice(7)) || 0;
let entries = readUsage();
if (dias > 0) {
  const since = new Date(Date.now() - dias * 86_400_000).toLocaleDateString('en-CA');
  entries = entries.filter(e => e.dia >= since);
}
if (!entries.length) {
  console.log(`Sin llamadas registradas en ${usageFile()}.`);
  process.exit(0);
}

/** @param {typeof entries} list */
function sum(list) {
  const r = { llamadas: list.length, entrada: 0, cache: 0, salida: 0, costo: 0 };
  for (const e of list) {
    r.entrada += e.entrada; r.cache += e.cache; r.salida += e.salida; r.costo += e.costo;
  }
  return r;
}
/** @param {ReturnType<typeof sum>} r */
const row = r => ({ ...r, costo: `$${r.costo.toFixed(4)}`, 'cache %': r.entrada ? `${Math.round((100 * r.cache) / r.entrada)}%` : '-' });

/** @param {(e: typeof entries[number]) => string} key */
function groupBy(key) {
  /** @type {Record<string, typeof entries>} */
  const g = {};
  for (const e of entries) (g[key(e)] ??= []).push(e);
  return Object.fromEntries(Object.entries(g).sort().map(([k, v]) => [k, row(sum(v))]));
}

console.log('Por día');
console.table(groupBy(e => e.dia));
console.log('Por tipo de llamada');
console.table(groupBy(e => e.tipo));

const all = sum(entries);
// One upload = one CV read. Searches beyond the first are extra rankings.
const uploads = entries.filter(e => e.tipo === 'cv').length || 1;
const per = all.costo / uploads;
console.log(`Total: ${all.llamadas} llamadas, ${all.entrada + all.salida} tokens, $${all.costo.toFixed(4)}`);
console.log(`Por CV subido (lectura + sus búsquedas): $${per.toFixed(4)} → 100 ≈ $${(per * 100).toFixed(2)}, 1000 ≈ $${(per * 1000).toFixed(2)}`);
console.log(`Tope diario (DAILY_BUDGET_USD): $${dailyBudget()} ≈ ${Math.floor(dailyBudget() / per)} CV al día a este ritmo`);
