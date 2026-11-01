// @ts-check
// Evaluar — a recruiting platform several Dominican employers host their
// careers site on, one subdomain per employer: https://{tenant}.evaluar.com.
// Each tenant is a WordPress site exposing its postings through the public,
// unauthenticated WordPress REST API, read by the shared _wpjobs.mjs.
//
// robots.txt (User-agent: *, read on humano.evaluar.com 2026-10-12) is an empty
// `Disallow:` — nothing is disallowed.
//
// The engine pins plugin egress to the exact hosts in manifest.json, so a
// tenant only works once its host is listed there. TENANTS is that list, kept
// next to the code that uses it; test/smoke.mjs checks the two stay in sync.

import { boundedInt } from './_html.mjs';
import * as wp from './_wpjobs.mjs';

export const TENANTS = ['gruposid', 'humano'];
export const ORIGIN = 'https://gruposid.evaluar.com'; // representative host, for the manifest check
export const PAGE_SIZE = wp.PAGE_SIZE;
const MAX_PAGES = 5;

/** @param {string} tenant */
export function hostOf(tenant) {
  return `${tenant}.evaluar.com`;
}

/**
 * @param {string} tenant
 * @param {number} page 1-indexed
 */
export function buildUrl(tenant, page) {
  return wp.buildUrl(`https://${hostOf(tenant)}`, page);
}

/**
 * @param {any} payload  Parsed API response: an array of job_listing posts.
 * @param {{ tenant: string, company: string }} opts
 */
export function parse(payload, { tenant, company }) {
  return wp.parse(payload, { origin: `https://${hostOf(tenant)}`, company });
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
  return wp.fetchPages(io, { origin: `https://${hostOf(tenant)}`, company, maxPages });
}
