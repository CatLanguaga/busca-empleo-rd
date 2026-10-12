// @ts-check
// Computrabajo República Dominicana — keyword search board.
//
// robots.txt (User-agent: *, read 2026-10-12) allows /trabajo-de-{keyword} and
// its ?p=N pagination. It disallows /ofertas-de-trabajo/ URLs carrying filter
// parameters (pubdate=, sal=, cont=, dis=, by=, emp=…), /Ajax/, /_services/
// and /go/. This module builds only the allowed search path and never adds a
// filter parameter.

import { text, slugify, boundedInt, stringList } from './_html.mjs';

export const ORIGIN = 'https://do.computrabajo.com';
export const PAGE_SIZE = 20;
const MAX_QUERIES = 8;
const MAX_PAGES = 5;

/**
 * @param {string} query
 * @param {number} page 1-indexed
 */
export function buildUrl(query, page) {
  const base = `${ORIGIN}/trabajo-de-${slugify(query)}`;
  return page > 1 ? `${base}?p=${page}` : base;
}

/**
 * @param {string} html
 * @returns {Array<{ title: string, url: string, company: string, location: string }>}
 */
export function parse(html) {
  const jobs = [];
  const chunks = html.split(/<article\s+class="box_offer/).slice(1);
  for (const chunk of chunks) {
    const link = chunk.match(/<a[^>]*class="[^"]*js-o-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = text(link[2]);
    // The href carries a tracking fragment (#lc=ListOffers-…); the path alone
    // identifies the posting.
    const path = link[1].split('#')[0];
    if (!title || !path.startsWith('/ofertas-de-trabajo/')) continue;

    const companyLink = chunk.match(/offer-grid-article-company-url[^>]*>([\s\S]*?)<\/a>/i);
    // Employers that hide their name render plain text in the same paragraph.
    const companyPara = chunk.match(/<p class="dFlex[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const company = text(companyLink ? companyLink[1] : companyPara?.[1]);

    const loc = chunk.match(/<span class="mr10"[^>]*>([\s\S]*?)<\/span>/i);
    jobs.push({ title, url: ORIGIN + path, company, location: text(loc?.[1]) });
  }
  return jobs;
}

/**
 * @param {Record<string, any>} entry
 * @param {{ get: (url: string) => Promise<string> }} io
 */
export async function fetchBoard(entry, io) {
  const queries = stringList(entry.queries, MAX_QUERIES);
  if (queries.length === 0) {
    throw new Error('computrabajo needs `queries:` — it is a keyword-search board with no browsable listing');
  }
  const maxPages = boundedInt(entry.max_pages, 1, MAX_PAGES);
  const jobs = [];
  for (const query of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const found = parse(await io.get(buildUrl(query, page)));
      jobs.push(...found);
      if (found.length < PAGE_SIZE) break;
    }
  }
  return jobs;
}
