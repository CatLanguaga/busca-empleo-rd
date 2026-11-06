// @ts-check
// Token use and cost of every model call, and the daily spending cap.
//
// One JSON line per call in web/data/usage.jsonl: date, call type, tokens and
// estimated cost. Never any text from a CV or a profile.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Read per call, so tests can point it at a temporary file. */
export const usageFile = () => process.env.BUSCA_USAGE || path.join(here, 'data', 'usage.jsonl');

/**
 * USD per million tokens. Defaults: DeepSeek V4.1 Flash at peak hours, read
 * 2026-11-06; off-peak is half. Override with env when prices change.
 */
export function prices() {
  const num = (/** @type {string|undefined} */ v, /** @type {number} */ d) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    in: num(process.env.DEEPSEEK_PRICE_IN, 0.30),
    inCached: num(process.env.DEEPSEEK_PRICE_IN_CACHED, 0.006),
    out: num(process.env.DEEPSEEK_PRICE_OUT, 1.20),
  };
}

/**
 * @typedef {{ prompt_tokens?: number, completion_tokens?: number, prompt_cache_hit_tokens?: number,
 *   completion_tokens_details?: { reasoning_tokens?: number } }} ApiUsage
 * @typedef {{ fecha: string, dia: string, tipo: string, entrada: number, cache: number, salida: number,
 *   razonamiento: number, costo: number }} UsageEntry
 */

/** @param {ApiUsage} u */
export function costOf(u) {
  const p = prices();
  const input = Number(u.prompt_tokens) || 0;
  const cached = Math.min(Number(u.prompt_cache_hit_tokens) || 0, input);
  const output = Number(u.completion_tokens) || 0;
  return ((input - cached) * p.in + cached * p.inCached + output * p.out) / 1e6;
}

/** Local calendar day, YYYY-MM-DD. @param {Date} [d] */
export const dayOf = (d = new Date()) => d.toLocaleDateString('en-CA');

/** Today's total per usage file. @type {Map<string, { day: string, total: number }>} */
const today = new Map();
/** @type {Array<(e: UsageEntry) => void>} */
const listeners = [];

/** @param {(e: UsageEntry) => void} fn */
export function onUsage(fn) {
  listeners.push(fn);
}

/** @param {string} [file] @returns {UsageEntry[]} */
export function readUsage(file = usageFile()) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip a torn line */ }
  }
  return out;
}

/** Spent today, in USD. Loaded from the file once, then kept in memory. @param {string} [file] */
export function spentToday(file = usageFile()) {
  const day = dayOf();
  let t = today.get(file);
  if (!t || t.day !== day) {
    t = { day, total: readUsage(file).filter(e => e.dia === day).reduce((s, e) => s + e.costo, 0) };
    today.set(file, t);
  }
  return t.total;
}

/** Daily cap in USD, from DAILY_BUDGET_USD (default 1). 0 or less = no cap. */
export function dailyBudget() {
  const raw = process.env.DAILY_BUDGET_USD;
  const v = raw ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : 1;
}

/** @param {string} [file] */
export function overBudget(file = usageFile()) {
  const cap = dailyBudget();
  return cap > 0 && spentToday(file) >= cap;
}

/**
 * @param {string} tipo  'cv' | 'ranking'
 * @param {ApiUsage} usage
 * @param {string} [file]
 * @returns {UsageEntry}
 */
export function recordUsage(tipo, usage, file = usageFile()) {
  const now = new Date();
  const entry = {
    fecha: now.toISOString(),
    dia: dayOf(now),
    tipo,
    entrada: Number(usage.prompt_tokens) || 0,
    cache: Number(usage.prompt_cache_hit_tokens) || 0,
    salida: Number(usage.completion_tokens) || 0,
    razonamiento: Number(usage.completion_tokens_details?.reasoning_tokens) || 0,
    costo: Number(costOf(usage).toFixed(6)),
  };
  spentToday(file); // load today's total before this line joins the file
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(entry) + '\n');
  const t = today.get(file);
  if (t && t.day === entry.dia) t.total += entry.costo;
  for (const fn of listeners) fn(entry);
  return entry;
}

/** @param {number} n */
const k = n => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

/** @param {UsageEntry} e */
export function formatEntry(e) {
  const thought = e.razonamiento ? `, ${k(e.razonamiento)} razonando` : '';
  return `${e.tipo} ${k(e.entrada)} in (${k(e.cache)} cache) / ${k(e.salida)} out${thought} ≈ $${e.costo.toFixed(4)}`;
}
