// @ts-check
// DiarioEmpleo (empleos.do redirects here) — browsable board.
//
// robots.txt (User-agent: *, read 2026-11-06) is `Allow: /` with account and
// search routes disallowed, /buscar among them. This module reads only the
// Dominican listing, /empleos/do/, and its ?pagina=N pages.
//
// Since late October 2026 the board also lists other countries (El Salvador
// on /empleos/sv/), so a card is kept only when its locality link is under
// /empleos/do/. Cards link either to /empleos/{slug} (posted on the board) or
// to /empleos-externos/{slug} (a posting the board carries from elsewhere).

import { text, boundedInt } from './_html.mjs';

export const ORIGIN = 'https://diarioempleo.com';
export const LISTING_URL = `${ORIGIN}/empleos/do/`;
export const PAGE_SIZE = 12;
const MAX_PAGES = 10;

/** @param {number} page 1-indexed */
export function buildUrl(page) {
  return page > 1 ? `${LISTING_URL}?pagina=${page}` : LISTING_URL;
}

/**
 * @param {string} html
 * @returns {Array<{ title: string, url: string, company: string, location: string, postedAt?: number }>}
 */
export function parse(html) {
  const jobs = [];
  const chunks = html.split(/<article\s+class="search-job-card"/).slice(1);
  for (const chunk of chunks) {
    const link = chunk.match(/<h3[^>]*>\s*<a\s+href="(\/empleos(?:-externos)?\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = text(link[2]);
    if (!title) continue;

    // <span class="job-locality">…<a href="/empleos/do/santo-domingo/">Santo Domingo</a></span>
    const locality = chunk.match(/class="job-locality"[\s\S]*?<a\s+href="\/empleos\/([a-z]{2})\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (locality && locality[1] !== 'do') continue;
    let location = text(locality?.[2]);
    if (/por confirmar/i.test(location)) location = '';

    // A company posts with <a class="company-link …"><strong>NAME</strong></a>.
    // A private person posts under their own name; that name is not kept.
    const companyLink = chunk.match(/<a\s+class="[^"]*company-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const company = text(companyLink?.[1].replace(/<span class="avatar"[\s\S]*?<\/span>/i, ''));

    /** @type {{ title: string, url: string, company: string, location: string, postedAt?: number }} */
    const job = { title, url: ORIGIN + link[1], company, location };
    const when = chunk.match(/class="job-published-time"[^>]*datetime="([^"]+)"/i);
    const ts = when ? Date.parse(when[1]) : NaN;
    if (Number.isFinite(ts)) job.postedAt = ts;
    jobs.push(job);
  }
  return jobs;
}

/**
 * @param {Record<string, any>} entry
 * @param {{ get: (url: string) => Promise<string> }} io
 */
export async function fetchBoard(entry, io) {
  const maxPages = boundedInt(entry.max_pages, 3, MAX_PAGES);
  const jobs = [];
  for (let page = 1; page <= maxPages; page++) {
    const html = await io.get(buildUrl(page));
    const cards = (html.match(/<article\s+class="search-job-card"/g) || []).length;
    jobs.push(...parse(html));
    if (cards < PAGE_SIZE) break;
  }
  return jobs;
}
