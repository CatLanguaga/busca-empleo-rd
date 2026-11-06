// @ts-check
// Shared reader for WordPress sites running WP Job Manager, which exposes its
// postings (post type `job_listing`) through the public, unauthenticated
// WordPress REST API at /wp-json/wp/v2/job-listings. Used by the Evaluar
// tenants and by TuEmpleoRD.

import { text } from './_html.mjs';

export const PAGE_SIZE = 100;
// Only the fields read below. `meta` also carries the recruiter's contact
// address (`_application`); it is never copied into a Job.
const FIELDS = 'id,date_gmt,link,title,meta';

/**
 * @param {string} origin   e.g. "https://tuempleord.do"
 * @param {number} page     1-indexed
 * @param {string} [search] WordPress full-text search (title and body)
 */
export function buildUrl(origin, page, search) {
  let url = `${origin}/wp-json/wp/v2/job-listings?per_page=${PAGE_SIZE}&page=${page}&_fields=${FIELDS}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  return url;
}

/**
 * @param {any} payload  Parsed API response: an array of job_listing posts.
 * @param {{ origin: string, company: string }} opts
 *   origin: posting links must stay on this site.
 *   company: label used when the posting leaves `_company_name` empty.
 * @returns {Array<{ title: string, url: string, company: string, location: string, postedAt?: number, externalId?: string }>}
 */
export function parse(payload, { origin, company }) {
  const rows = Array.isArray(payload) ? payload : [];
  const prefix = `${origin}/`;
  const jobs = [];
  for (const row of rows) {
    const title = text(row?.title?.rendered);
    const url = typeof row?.link === 'string' ? row.link : '';
    // A posting link must stay on the site's own host.
    if (!title || !url.startsWith(prefix)) continue;
    const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
    if (Number(meta._filled) === 1) continue;

    /** @type {{ title: string, url: string, company: string, location: string, postedAt?: number, externalId?: string }} */
    const job = {
      title,
      url,
      company: text(meta._company_name) || company,
      location: text(meta._job_location),
    };
    if (Number.isInteger(row.id)) job.externalId = String(row.id);
    const posted = Date.parse(`${row.date_gmt}Z`);
    if (Number.isFinite(posted)) job.postedAt = posted;
    jobs.push(job);
  }
  return jobs;
}

/**
 * Walk pages until a short page or maxPages. WordPress answers a page past the
 * end with HTTP 400, so a short page is the stop signal.
 * @param {{ getJson: (url: string) => Promise<any> }} io
 * @param {{ origin: string, company: string, maxPages: number, search?: string }} opts
 */
export async function fetchPages(io, { origin, company, maxPages, search }) {
  const jobs = [];
  for (let page = 1; page <= maxPages; page++) {
    const payload = await io.getJson(buildUrl(origin, page, search));
    const rows = Array.isArray(payload) ? payload : [];
    jobs.push(...parse(rows, { origin, company }));
    if (rows.length < PAGE_SIZE) break;
  }
  return jobs;
}
