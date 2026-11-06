// @ts-check
// TuEmpleoRD (tuempleord.do) — Dominican job board built on WordPress with WP
// Job Manager. Postings come from the public WordPress REST API
// /wp-json/wp/v2/job-listings (read by _wpjobs.mjs), newest first, 100 per
// page. With `queries`, each one uses WordPress' own `search=` (title + body).
//
// robots.txt (User-agent: *, read 2026-11-01) is `Allow: /` — nothing is
// disallowed.
//
// Most postings leave the employer field empty (38 of the newest 100 filled it
// on 2026-11-01); when given, the name is usually in the title or the body.
// Those rows get COMPANY_LABEL instead of a guess. Many postings are a bundle
// ("Lista de vacantes activas para Santo Domingo") or ask for the CV by e-mail.

import { boundedInt, stringList } from './_html.mjs';
import * as wp from './_wpjobs.mjs';

export const ORIGIN = 'https://tuempleord.do';
export const PAGE_SIZE = wp.PAGE_SIZE;
export const COMPANY_LABEL = 'TuEmpleoRD (empleador no indicado)';
const MAX_QUERIES = 8;
const MAX_PAGES = 5;

/**
 * @param {number} page 1-indexed
 * @param {string} [query]
 */
export function buildUrl(page, query) {
  return wp.buildUrl(ORIGIN, page, query);
}

/** @param {any} payload */
export function parse(payload) {
  return wp.parse(payload, { origin: ORIGIN, company: COMPANY_LABEL });
}

/**
 * @param {Record<string, any>} entry  `queries` optional; without it, the
 *   newest postings. `max_pages` per query (default 1 = 100 postings).
 * @param {{ getJson: (url: string) => Promise<any> }} io
 */
export async function fetchBoard(entry, io) {
  const queries = stringList(entry.queries, MAX_QUERIES);
  const maxPages = boundedInt(entry.max_pages, 1, MAX_PAGES);
  const targets = queries.length ? queries : [undefined];
  const jobs = [];
  for (const search of targets) {
    jobs.push(...await wp.fetchPages(io, { origin: ORIGIN, company: COMPANY_LABEL, maxPages, search }));
  }
  return jobs;
}
