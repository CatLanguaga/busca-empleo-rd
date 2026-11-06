// @ts-check
// Trabajos Diarios República Dominicana (do.trabajosdiarios.com) — browsable
// HTML listing, 12 postings per page, optionally narrowed by keyword.
//
// robots.txt (User-agent: *, read 2026-11-01) disallows only /auth/google/ and
// /auth/facebook/, and sets `Crawl-delay: 2`. This module reads
// /ofertas-trabajo and /ofertas-trabajo/de-{palabra} with ?page=N. PACE_MS is
// honoured by index.mjs so requests respect that delay.
//
// Two site behaviours the parser guards against:
//  - A keyword with no matches still answers 200 and shows unrelated
//    "suggested" postings under "No se encontraron resultados". Those are not
//    results: parse() returns nothing for such a page.
//  - The site may redirect a keyword slug to its canonical one
//    (de-contador -> de-contable). Same host; the engine follows it.

import { text, slugify, boundedInt, stringList } from './_html.mjs';

export const ORIGIN = 'https://do.trabajosdiarios.com';
export const PAGE_SIZE = 12;
// robots.txt Crawl-delay: 2 (seconds).
export const PACE_MS = 2000;
const MAX_QUERIES = 8;
const MAX_PAGES = 10;

/**
 * @param {string|null|undefined} query  e.g. "analista de crédito"; empty for the full listing
 * @param {number} page 1-indexed
 */
export function buildUrl(query, page) {
  const slug = query ? slugify(query) : '';
  const path = slug ? `/ofertas-trabajo/de-${slug}` : '/ofertas-trabajo';
  return page > 1 ? `${ORIGIN}${path}?page=${page}` : `${ORIGIN}${path}`;
}

/** @param {string} html */
export function hasNextPage(html) {
  return /<link\s+rel="next"/i.test(html);
}

/**
 * @param {string} html
 * @returns {Array<{ title: string, url: string, company: string, location: string, postedAt?: number, externalId?: string }>}
 */
export function parse(html) {
  if (/No se encontraron resultados/i.test(html)) return [];
  // Results start after the count header, whose wording varies:
  // "Ofertas de Empleo: 1 - 12 de 3,003 resultados",
  // "Ofertas de Empleo (Página 2): 13 - 24 de …", "Ofertas de Empleo de Contable: 1 - 12 de 407 …".
  const start = html.search(/\d+ - \d+ de [\d.,]+ resultados/);
  if (start < 0) return [];

  const jobs = [];
  const chunks = html.slice(start).split(/<div class="card shadow-sm border-0 mb-3">/).slice(1);
  for (const chunk of chunks) {
    const link = chunk.match(/<a\s+href="(\/trabajo\/(\d+)\/[a-z0-9-]+)"/i);
    if (!link) continue;
    const title = text(chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    if (!title) continue;
    const company = text(chunk.match(/<p class="text-secondary[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1]);
    const location = text(chunk.match(/bi-geo-alt[\s\S]*?<\/svg>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]);

    /** @type {{ title: string, url: string, company: string, location: string, postedAt?: number, externalId?: string }} */
    const job = { title, url: ORIGIN + link[1], company, location, externalId: link[2] };
    // dd/mm/yyyy, local date in the Dominican Republic (UTC-4, no DST).
    const d = chunk.match(/bi-calendar[\s\S]*?<\/svg>\s*<span[^>]*>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/span>/i);
    if (d) {
      const ts = Date.parse(`${d[3]}-${d[2]}-${d[1]}T00:00:00-04:00`);
      if (Number.isFinite(ts)) job.postedAt = ts;
    }
    jobs.push(job);
  }
  return jobs;
}

/**
 * @param {Record<string, any>} entry  `queries` optional; without it, the
 *   newest postings of the whole listing. `max_pages` per query (default 2).
 * @param {{ get: (url: string) => Promise<string> }} io
 */
export async function fetchBoard(entry, io) {
  const queries = stringList(entry.queries, MAX_QUERIES);
  const targets = queries.length ? queries : [null];
  const maxPages = boundedInt(entry.max_pages, 2, MAX_PAGES);
  const jobs = [];
  for (const query of targets) {
    for (let page = 1; page <= maxPages; page++) {
      const html = await io.get(buildUrl(query, page));
      jobs.push(...parse(html));
      if (!hasNextPage(html)) break;
    }
  }
  return jobs;
}
