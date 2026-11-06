// @ts-check
// Measure what one upload costs: read each CV, build its profile, rank the
// matching listings, and print tokens and cost per step. Uses the real API
// key (web/.env) and the listing store, without the server.
//
//   node scripts/medir.mjs ../CV_uno.pdf ../CV_dos.pdf
//   npm run medir -- ../CV_uno.pdf
//
// Every call is also written to data/usage.jsonl like the server's.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(web, '.env'))) process.loadEnvFile(path.join(web, '.env'));

const { pdfToText, profileFromText } = await import('../cv.mjs');
const { match } = await import('../match.mjs');
const { openDb, openListings } = await import('../db.mjs');
const { DEFAULT_DB } = await import('../scan.mjs');
const { onUsage, formatEntry } = await import('../usage.mjs');
const { llmConfigured } = await import('../llm.mjs');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Uso: node scripts/medir.mjs <cv.pdf> [otro.pdf ...]');
  process.exit(1);
}
if (!llmConfigured()) {
  console.error('Falta DEEPSEEK_API_KEY (en el entorno o en web/.env).');
  process.exit(1);
}

/** @type {import('../usage.mjs').UsageEntry[]} */
let calls = [];
onUsage(e => {
  calls.push(e);
  console.log(`  [llm] ${formatEntry(e)}`);
});

const listings = openListings(openDb(DEFAULT_DB));
console.log(`${listings.length} ofertas abiertas en la base\n`);

let total = 0;
for (const file of files) {
  calls = [];
  console.log(`=== ${path.basename(file)}`);
  const text = await pdfToText(readFileSync(file));
  console.log(`  CV: ${text.length} caracteres`);
  const profile = await profileFromText(text);
  console.log(`  palabras clave: ${profile.keywords_incluir.join(', ')}`);
  const r = await match(listings, profile);
  console.log(`  candidatas ${r.candidatas} · destacadas ${r.destacadas.length} · resto ${r.resto.length}`);
  for (const j of r.destacadas) console.log(`    ${j.score} ${j.title} — ${j.razon}`);
  const cost = calls.reduce((s, e) => s + e.costo, 0);
  const tokens = calls.reduce((s, e) => s + e.entrada + e.salida, 0);
  console.log(`  TOTAL este CV: ${tokens} tokens ≈ $${cost.toFixed(4)}\n`);
  total += cost;
}

const per = total / files.length;
console.log(`Promedio por uso: $${per.toFixed(4)} → 100 usos ≈ $${(per * 100).toFixed(2)}, 1000 usos ≈ $${(per * 1000).toFixed(2)}`);
