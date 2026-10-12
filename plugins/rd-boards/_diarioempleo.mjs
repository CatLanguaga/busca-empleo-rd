// @ts-check
// DiarioEmpleo (empleos.do redirects here) — small browsable board.
//
// robots.txt (User-agent: *, read 2026-10-12) is `Allow: /` with account and
// search routes disallowed, /buscar among them. This module reads /empleos
// only. The whole inventory fits on that page (10 postings on 2026-10-12,
// matching sitemaps/empleos.xml), so there is no pagination to walk.

import { text } from './_html.mjs';

export const ORIGIN = 'https://diarioempleo.com';
export const LISTING_URL = `${ORIGIN}/empleos`;

/**
 * @param {string} html
 * @returns {Array<{ title: string, url: string, company: string, location: string, postedAt?: number }>}
 */
export function parse(html) {
  const jobs = [];
  const chunks = html.split(/<article\s+class="search-job-card"/).slice(1);
  for (const chunk of chunks) {
    const link = chunk.match(/<h3>\s*<a\s+href="(\/empleos\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = text(link[2]);
    if (!title) continue;

    // <a class="identity company-link"><span class="avatar">O</span><span>NAME</span></a>
    const companyLink = chunk.match(/class="[^"]*company-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const company = text(companyLink?.[1].replace(/<span class="avatar"[\s\S]*?<\/span>/i, ''));

    const loc = chunk.match(/<span>\s*⌖([\s\S]*?)<\/span>/);
    let location = text(loc?.[1]);
    if (/por confirmar/i.test(location)) location = '';

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
 * @param {Record<string, any>} _entry
 * @param {{ get: (url: string) => Promise<string> }} io
 */
export async function fetchBoard(_entry, io) {
  return parse(await io.get(LISTING_URL));
}
