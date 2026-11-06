// @ts-check
// Scheduled scan: read every source with the rd-boards readers and save the
// rows in the listing store. Uploads are matched against the store and never
// start a live read, so the load on each board stays the same however many
// people use the page.
//
//   node web/scan.mjs              read all sources once
//   node web/scan.mjs --only=unika read one source

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARDS } from '../plugins/rd-boards/index.mjs';
import { EMPLOYER_READERS } from './employers.mjs';
import { COMPUTRABAJO_KEYWORDS } from './keywords.mjs';
import { openDb, saveSource, summary } from './db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB = process.env.BUSCA_DB || path.join(here, 'data', 'listings.db');

// Same pacing as the career-ops plugin (plugins/rd-boards/index.mjs).
const PACE_MS = 750;
const REQUEST_TIMEOUT_MS = 15_000;
// Hard cap for one whole scan, across all sources.
const MAX_REQUESTS_PER_SCAN = 120;
// Computrabajo reads at most 8 queries per entry.
const COMPUTRABAJO_QUERIES_PER_ENTRY = 8;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; busca-empleo-rd/0.1; web prototype; scheduled listing read)',
  'Accept-Language': 'es-DO,es;q=0.9,en;q=0.5',
};

/** @param {number} ms */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Sources to read, keyed by the name stored in the database. A source can be
 * several entries (Computrabajo, by keyword batch); its rows are closed only
 * when every one of its entries was read without error.
 * @returns {Record<string, Array<Record<string, any>>>}
 */
export function defaultSources() {
  const computrabajo = [];
  for (let i = 0; i < COMPUTRABAJO_KEYWORDS.length; i += COMPUTRABAJO_QUERIES_PER_ENTRY) {
    computrabajo.push({
      board: 'computrabajo',
      queries: COMPUTRABAJO_KEYWORDS.slice(i, i + COMPUTRABAJO_QUERIES_PER_ENTRY),
      max_pages: 1,
    });
  }
  return {
    'Computrabajo RD': computrabajo,
    'Tecoloco RD': [{ board: 'tecoloco', max_pages: 2 }],
    'DiarioEmpleo': [{ board: 'diarioempleo', max_pages: 6 }],
    'RD Trabaja': [{ board: 'rdtrabaja', max_pages: 2 }],
    'Concursa': [{ board: 'concursa', max_pages: 2 }],
    'Unika': [{ board: 'unika' }],
    'Trabajos Diarios RD': [{ board: 'trabajosdiarios', max_pages: 2 }],
    'TuEmpleoRD': [{ board: 'tuempleord', max_pages: 1 }],
    'Grupo SID': [{ board: 'evaluar', tenant: 'gruposid', name: 'Grupo SID' }],
    'Humano Seguros': [{ board: 'evaluar', tenant: 'humano', name: 'Humano Seguros' }],
    // Employers' own portals: the same list as overlay/empresas.rd.yml.
    'Banco Popular Dominicano': [{ board: 'successfactors', name: 'Banco Popular Dominicano', portal: 'https://empleos.grupopopular.com/' }],
    'Grupo Universal': [{ board: 'oraclecloud', name: 'Grupo Universal', portal: 'https://fa-evze-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/es/sites/CX_1/' }],
    'Cervecería Nacional Dominicana': [{ board: 'teamtailor', name: 'Cervecería Nacional Dominicana', portal: 'https://cerveceria-nacional-dominicana.na.teamtailor.com/' }],
    'Grupo InterEnergy (CEPM)': [{ board: 'teamtailor', name: 'Grupo InterEnergy (CEPM)', portal: 'https://grupointerenergy.na.teamtailor.com/' }],
  };
}

/**
 * Paced, capped HTTP for the board readers. A failed request throws, so a
 * blocked board surfaces as an error and never as an empty listing.
 * @param {typeof fetch} fetchImpl
 * @param {{ count: number }} budget  shared across the whole scan
 * @param {number} [paceMs]  gap before each request; a board whose robots.txt
 *   sets a Crawl-delay exports a larger PACE_MS (trabajosdiarios: 2000)
 */
export function makeIo(fetchImpl, budget, paceMs = PACE_MS) {
  /** @param {string} url @param {string} accept */
  async function request(url, accept) {
    if (budget.count >= MAX_REQUESTS_PER_SCAN) {
      throw new Error(`request cap reached (${MAX_REQUESTS_PER_SCAN} per scan)`);
    }
    if (budget.count > 0) await sleep(paceMs);
    budget.count++;
    const res = await fetchImpl(url, {
      headers: { ...HEADERS, Accept: accept },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  }
  return {
    /** @param {string} url */
    async get(url) {
      return (await request(url, 'text/html,application/xhtml+xml')).text();
    },
    /** @param {string} url */
    async getJson(url) {
      return (await request(url, 'application/json')).json();
    },
  };
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ sources?: ReturnType<typeof defaultSources>, boards?: Record<string, any>,
 *   fetchImpl?: typeof fetch, now?: number, log?: (msg: string) => void }} [opts]
 */
export async function runScan(db, opts = {}) {
  const sources = opts.sources ?? defaultSources();
  const boards = opts.boards ?? { ...BOARDS, ...EMPLOYER_READERS };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const budget = { count: 0 };
  const now = opts.now ?? Date.now();
  const log = opts.log ?? (() => {});
  const report = [];

  for (const [source, entries] of Object.entries(sources)) {
    const byUrl = new Map();
    const errors = [];
    for (const entry of entries) {
      try {
        const board = boards[entry.board];
        const pace = Math.max(PACE_MS, Number(board.PACE_MS) || 0);
        const jobs = await board.fetchBoard(entry, makeIo(fetchImpl, budget, pace));
        for (const job of jobs) if (job?.url && job?.title) byUrl.set(job.url, job);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    // A partial read still adds what it found, but closes nothing.
    const result = errors.length
      ? { ...saveSource(db, source, [...byUrl.values()], now, { close: false }), errors }
      : saveSource(db, source, [...byUrl.values()], now);
    report.push({ source, found: byUrl.size, ...result });
    log(`${source}: ${byUrl.size} leídas, ${result.added} nuevas, ${result.closed} cerradas` +
      (errors.length ? ` — ERRORES: ${errors.join(' | ')}` : ''));
  }
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).toLowerCase();
  let sources = defaultSources();
  if (only) {
    sources = Object.fromEntries(Object.entries(sources).filter(([name]) => name.toLowerCase().includes(only)));
    if (!Object.keys(sources).length) {
      console.error(`Ninguna fuente coincide con "${only}". Fuentes: ${Object.keys(defaultSources()).join(', ')}`);
      process.exit(1);
    }
  }
  const db = openDb(DEFAULT_DB);
  await runScan(db, { sources, log: console.log });
  console.table(summary(db));
}
