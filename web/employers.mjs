// @ts-check
// Readers for the job portals of Dominican employers, for the web scan.
//
// career-ops reads these same portals with its own providers (teamtailor,
// oraclecloud, successfactors); the add-on only configures them, in
// overlay/empresas.rd.yml. The web prototype runs without career-ops, so
// these are small rewrites of what those providers request, with the same
// fetchBoard(entry, io) shape as the board readers so scan.mjs paces and caps
// them the same way. Endpoints follow career-ops' providers (MIT, Santiago
// Fernández de Valderrama and contributors).
//
// robots.txt, read 2026-11-06:
//   *.teamtailor.com          disallows /app/ and /messages/; /jobs.rss allowed
//   empleos.grupopopular.com  disallows /services/, /applybutton/ and account
//                             routes; /tile-search-results/ allowed
//   *.oraclecloud.com (CX)    no robots.txt (404)

import { text, boundedInt } from '../plugins/rd-boards/_html.mjs';

/** @typedef {{ title: string, url: string, company: string, location: string, postedAt?: number }} Job */
/** @typedef {{ get: (url: string) => Promise<string>, getJson: (url: string) => Promise<any> }} Io */

/** @param {string} s */
function httpsOrigin(s) {
  const u = new URL(s);
  if (u.protocol !== 'https:') throw new Error(`portal must use HTTPS: ${s}`);
  return u.origin;
}

/** @param {string|undefined} s */
function epoch(s) {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : undefined;
}

// ── Teamtailor: public RSS feed ─────────────────────────────────────────────

/** @param {string} block @param {string} tag */
function tag(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? text(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')) : '';
}

/**
 * @param {string} xml
 * @param {string} company
 * @returns {Job[]}
 */
export function parseTeamtailor(xml, company) {
  const jobs = [];
  for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) || []) {
    const title = tag(item, 'title');
    const url = tag(item, 'link');
    if (!title || !/^https:\/\//.test(url)) continue;
    // InterEnergy's portal can carry openings outside the Dominican Republic.
    const country = tag(item, 'tt:country');
    if (country && !/dominican|dominicana/i.test(country)) continue;
    /** @type {Job} */
    const job = { title, url, company, location: tag(item, 'tt:city') };
    const postedAt = epoch(tag(item, 'pubDate'));
    if (postedAt !== undefined) job.postedAt = postedAt;
    jobs.push(job);
  }
  return jobs;
}

/** @param {Record<string, any>} entry @param {Io} io */
async function fetchTeamtailor(entry, io) {
  return parseTeamtailor(await io.get(`${httpsOrigin(entry.portal)}/jobs.rss`), entry.name);
}

// ── Oracle Recruiting Cloud: public requisitions API ────────────────────────

const ORACLE_PAGE = 200;
const ORACLE_FACETS = 'LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS';

/**
 * @param {string} origin
 * @param {string} site  e.g. CX_1
 * @param {number} offset
 */
export function oracleApiUrl(origin, site, offset) {
  const finder = `findReqs;siteNumber=${site},facetsList=${ORACLE_FACETS},limit=${ORACLE_PAGE},sortBy=POSTING_DATES_DESC,offset=${offset}`;
  return `${origin}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true`
    + `&expand=${encodeURIComponent('requisitionList.workLocation,requisitionList.secondaryLocations')}`
    + `&finder=${finder}&limit=${ORACLE_PAGE}&offset=${offset}`;
}

/**
 * @param {any} json
 * @param {{ origin: string, lang: string, site: string }} portal
 * @param {string} company
 * @returns {Job[]}
 */
export function parseOracle(json, portal, company) {
  const list = json?.items?.[0]?.requisitionList;
  if (!Array.isArray(list)) return [];
  const jobs = [];
  for (const req of list) {
    const title = typeof req?.Title === 'string' ? req.Title.trim() : '';
    const id = req?.Id != null ? String(req.Id) : '';
    if (!title || !id) continue;
    const where = Array.isArray(req.workLocation) ? req.workLocation[0] : null;
    if (where?.Country && where.Country !== 'DO') continue;
    const location = where?.TownOrCity || (typeof req.PrimaryLocation === 'string' ? req.PrimaryLocation : '');
    /** @type {Job} */
    const job = { title, url: `${portal.origin}/hcmUI/CandidateExperience/${portal.lang}/sites/${portal.site}/job/${id}`, company, location };
    const postedAt = epoch(req.PostedDate);
    if (postedAt !== undefined) job.postedAt = postedAt;
    jobs.push(job);
  }
  return jobs;
}

/** @param {Record<string, any>} entry @param {Io} io */
async function fetchOracle(entry, io) {
  // careers_url: https://<host>/hcmUI/CandidateExperience/<lang>/sites/<site>/
  const u = new URL(entry.portal);
  const m = u.pathname.match(/\/CandidateExperience\/([a-z]{2})\/sites\/([A-Za-z0-9_]+)/);
  if (!m) throw new Error(`oracle portal URL has no /CandidateExperience/<lang>/sites/<site>: ${entry.portal}`);
  const portal = { origin: httpsOrigin(entry.portal), lang: m[1], site: m[2] };
  const maxPages = boundedInt(entry.max_pages, 1, 5);
  const jobs = [];
  for (let page = 0; page < maxPages; page++) {
    const json = await io.getJson(oracleApiUrl(portal.origin, portal.site, page * ORACLE_PAGE));
    const found = parseOracle(json, portal, entry.name);
    jobs.push(...found);
    if (!json?.hasMore && (json?.items?.[0]?.requisitionList?.length ?? 0) < ORACLE_PAGE) break;
  }
  return jobs;
}

// ── SAP SuccessFactors (Recruiting Marketing): tile fragment ────────────────

/**
 * RMK paths start with the city: /job/{CITY}-{TITLE…}/{id}/. Recover it by
 * cutting the slug where the title's first two words begin.
 * @param {string} path
 * @param {string} title
 */
export function cityFromPath(path, title) {
  const slug = path.match(/\/job\/([^/]+)\//)?.[1]?.toLowerCase();
  const words = title.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!slug || !words) return '';
  const esc = (/** @type {string} */ w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = slug.match(new RegExp(words.slice(0, 2).map(esc).join('[^\\p{L}\\p{N}]+'), 'u'));
  if (!hit || !hit.index) return '';
  return slug.slice(0, hit.index).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * @param {string} html
 * @param {string} origin
 * @param {string} company
 * @returns {Job[]}
 */
export function parseSuccessFactorsTiles(html, origin, company) {
  const jobs = [];
  for (const m of html.matchAll(/<li class="job-tile job-id-(\d+)\b[\s\S]*?<\/li>/g)) {
    const block = m[0];
    const path = text(block.match(/data-url="([^"]+)"/)?.[1]);
    const title = text(block.match(/class="jobTitle-link[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1]);
    if (!path.startsWith('/job/') || !title) continue;
    const city = text(block.match(/id="[^"]*-section-city-value">([\s\S]*?)<\/div>/)?.[1]);
    jobs.push({ title, url: origin + path, company, location: city || cityFromPath(path, title) });
  }
  return jobs;
}

/** @param {Record<string, any>} entry @param {Io} io */
async function fetchSuccessFactors(entry, io) {
  const origin = httpsOrigin(entry.portal);
  const maxPages = boundedInt(entry.max_pages, 10, 20);
  const byUrl = new Map();
  let startrow = 0;
  for (let page = 0; page < maxPages; page++) {
    const found = parseSuccessFactorsTiles(await io.get(`${origin}/tile-search-results/?startrow=${startrow}`), origin, entry.name);
    const before = byUrl.size;
    for (const j of found) byUrl.set(j.url, j);
    // Page size is set by each tenant; stop on an empty page or one with
    // nothing new (a server that ignores startrow).
    if (!found.length || byUrl.size === before) break;
    startrow += found.length;
  }
  return [...byUrl.values()];
}

export const EMPLOYER_READERS = {
  teamtailor: { fetchBoard: fetchTeamtailor },
  oraclecloud: { fetchBoard: fetchOracle },
  successfactors: { fetchBoard: fetchSuccessFactors },
};
