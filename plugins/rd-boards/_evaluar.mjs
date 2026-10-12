// @ts-check
// Evaluar — a recruiting platform several Dominican employers host their
// careers site on, one subdomain per employer: https://{tenant}.evaluar.com.
// Each tenant is a WordPress site exposing its postings through the public,
// unauthenticated WordPress REST API.
//
// robots.txt (User-agent: *, read on humano.evaluar.com 2026-10-12) is an empty
// `Disallow:` — nothing is disallowed.
//
// The engine pins plugin egress to the exact hosts in manifest.json, so a
// tenant only works once its host is listed there. TENANTS is that list, kept
// next to the code that uses it; test/smoke.mjs checks the two stay in sync.

import { text, boundedInt } from './_html.mjs';

export const TENANTS = ['gruposid', 'humano'];
export const ORIGIN = 'https://gruposid.evaluar.com'; // representative host, for the manifest check
export const PAGE_SIZE = 100;
const MAX_PAGES = 5;
// Only the fields read below. `meta` also carries the recruiter's contact
// address (`_application`); it is never copied into a Job.
const FIELDS = 'id,date_gmt,link,title,meta';

/** @param {string} tenant */
export function hostOf(tenant) {
  return `${tenant}.evaluar.com`;
}

/**
 * @param {string} tenant
 * @param {number} page 1-indexed
 */
export function buildUrl(tenant, page) {
  return `https://${hostOf(tenant)}/wp-json/wp/v2/job-listings?per_page=${PAGE_SIZE}&page=${page}&_fields=${FIELDS}`;
}

/**
 * @param {any} payload  Parsed API response: an array of job_listing posts.
 * @param {{ tenant: string, company: string }} opts
 */
export function parse(payload, { tenant, company }) {
  const rows = Array.isArray(payload) ? payload : [];
  const prefix = `https://${hostOf(tenant)}/`;
  const jobs = [];
  for (const row of rows) {
    const title = text(row?.title?.rendered);
    const url = typeof row?.link === 'string' ? row.link : '';
    // A posting link must stay on the tenant's own host.
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
 * @param {Record<string, any>} entry
 * @param {{ getJson: (url: string) => Promise<any> }} io
 */
export async function fetchBoard(entry, io) {
  const tenant = typeof entry.tenant === 'string' ? entry.tenant.trim().toLowerCase() : '';
  if (!TENANTS.includes(tenant)) {
    throw new Error(
      `evaluar needs \`tenant:\` set to one of ${TENANTS.join(', ')} ` +
      `(got "${entry.tenant ?? ''}"). A new {empresa}.evaluar.com site must first be added to TENANTS and to manifest.json allowedHosts`,
    );
  }
  const maxPages = boundedInt(entry.max_pages, 2, MAX_PAGES);
  const company = typeof entry.name === 'string' ? entry.name : tenant;
  const jobs = [];
  for (let page = 1; page <= maxPages; page++) {
    const payload = await io.getJson(buildUrl(tenant, page));
    const rows = Array.isArray(payload) ? payload : [];
    jobs.push(...parse(rows, { tenant, company }));
    // WordPress answers a page past the end with HTTP 400, so stop on a short page.
    if (rows.length < PAGE_SIZE) break;
  }
  return jobs;
}
