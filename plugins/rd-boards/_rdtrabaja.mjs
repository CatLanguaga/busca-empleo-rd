// @ts-check
// RD Trabaja — the Ministry of Labour's public employment portal
// (empleateya.mt.gob.do). Its web app reads a public, unauthenticated JSON API;
// this module reads the same listing endpoint. The site publishes no
// robots.txt (404 on 2026-10-12).
//
// Two things a reader of these postings must know, and that the Job rows say:
//
//  - The employer is NOT published. The Ministry intermediates: a posting
//    carries an internal company id, never a name. `company` is therefore a
//    fixed label, not an employer.
//  - There is no per-posting page. The URL is the portal home plus a
//    `?puesto={id}` marker that only makes each row unique; the candidate
//    finds the posting through the portal's own search and applies there with
//    a (free) account.

import { boundedInt } from './_html.mjs';

export const ORIGIN = 'https://empleateya.mt.gob.do';
export const PAGE_SIZE = 50;
export const COMPANY_LABEL = 'RD Trabaja (empleador no publicado)';
const MAX_PAGES = 10;

/** @param {number} page 1-indexed */
export function buildUrl(page) {
  return `${ORIGIN}/api/puestos?pageIndex=${page}&pageSize=${PAGE_SIZE}`;
}

/**
 * @param {any} payload  Parsed API response: { data: [{ puesto: {...} }], pageCount, ... }
 * @param {number} [now]
 */
export function parse(payload, now = Date.now()) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const jobs = [];
  for (const row of rows) {
    const p = row?.puesto;
    if (!p || !Number.isInteger(p.id)) continue;
    const title = typeof p.titulo === 'string' ? p.titulo.replace(/\s+/g, ' ').trim() : '';
    if (!title) continue;
    const expires = Date.parse(p.fechaVencimiento);
    if (Number.isFinite(expires) && expires < now) continue;

    /** @type {{ title: string, url: string, company: string, location: string, description?: string, postedAt?: number, externalId: string }} */
    const job = {
      title,
      url: `${ORIGIN}/?puesto=${p.id}`,
      company: COMPANY_LABEL,
      location: 'República Dominicana',
      externalId: String(p.id),
    };
    if (typeof p.descripcion === 'string' && p.descripcion.trim()) job.description = p.descripcion.trim();
    const posted = Date.parse(p.fechaPublicacion);
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
  const maxPages = boundedInt(entry.max_pages, 2, MAX_PAGES);
  const jobs = [];
  for (let page = 1; page <= maxPages; page++) {
    const payload = await io.getJson(buildUrl(page));
    jobs.push(...parse(payload));
    const pageCount = Number(payload?.pageCount);
    if (!Number.isFinite(pageCount) || page >= pageCount) break;
  }
  return jobs;
}
