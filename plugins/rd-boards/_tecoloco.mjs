// @ts-check
// Tecoloco República Dominicana — browsable listing, optionally by category.
//
// robots.txt (User-agent: *, read 2026-10-12) disallows only service routes
// (/SelectNewsReader.aspx, /AddRssLink.aspx, /partners/ads-data,
// /company-questionnaire, /WebService/AjaxWS.asmx/). The listing paths read
// here — /empleos and /empleo-{categoria} — are not covered.

import { text, slugify, boundedInt, stringList } from './_html.mjs';

export const ORIGIN = 'https://www.tecoloco.com.do';
export const PAGE_SIZE = 100;
const MAX_CATEGORIES = 10;
const MAX_PAGES = 5;

/**
 * @param {string|null} category  e.g. "contabilidad"; null for the full listing
 * @param {number} page 1-indexed
 */
export function buildUrl(category, page) {
  const path = category ? `/empleo-${slugify(category)}` : '/empleos';
  const params = new URLSearchParams({ PerPage: String(PAGE_SIZE) });
  if (page > 1) params.set('Page', String(page));
  return `${ORIGIN}${path}?${params.toString()}`;
}

/**
 * @param {string} html
 * @returns {Array<{ title: string, url: string, company: string, location: string }>}
 */
export function parse(html) {
  const jobs = [];
  // Each posting renders twice: a desktop `job-card` followed by a
  // `job-card-mobile` twin. Splitting on the exact desktop class and reading
  // the first match of each field takes the desktop copy only.
  const chunks = html.split(/<div class="job-card">/).slice(1);
  for (const chunk of chunks) {
    const link = chunk.match(/<a\s+jobId="(\d+)"\s+href=['"](\/\d+\/[^'"]+\.aspx)['"][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = text(link[3]);
    if (!title) continue;
    const company = chunk.match(/<span class="subtitle"[^>]*>([\s\S]*?)<\/span>/i);
    const loc = chunk.match(/class="map-point"><\/i>\s*<span>([\s\S]*?)<\/span>/i);
    jobs.push({ title, url: ORIGIN + link[2], company: text(company?.[1]), location: text(loc?.[1]) });
  }
  return jobs;
}

/**
 * @param {Record<string, any>} entry
 * @param {{ get: (url: string) => Promise<string> }} io
 */
export async function fetchBoard(entry, io) {
  const categories = stringList(entry.categories, MAX_CATEGORIES);
  const targets = categories.length ? categories : [null];
  const maxPages = boundedInt(entry.max_pages, 2, MAX_PAGES);
  const jobs = [];
  for (const category of targets) {
    for (let page = 1; page <= maxPages; page++) {
      const found = parse(await io.get(buildUrl(category, page)));
      jobs.push(...found);
      if (found.length < PAGE_SIZE) break;
    }
  }
  return jobs;
}
