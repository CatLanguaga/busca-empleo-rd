// @ts-check
// Unika — a Dominican labour-intermediation platform (unika.com.do). Its home
// page fills "Vacantes disponibles" from one public, unauthenticated JSON feed
// on its applicant-tracking host; this module reads that same feed, one request.
//
// robots.txt: neither unika.com.do (403 from its file host, no file) nor
// thekeytalent.aplygo.com / unika.aplygo.com (404 page) publishes one, read on
// 2026-10-13.
//
// Two things a reader of these postings must know, and that the Job rows say:
//
//  - The employer is NOT published. Unika intermediates for "varias empresas
//    del país": `company` is a fixed label, not an employer.
//  - A posting is usually a BUNDLE, not one job. "Vacantes Tecnológicas" is a
//    landing page that lists the individual openings of that area inside it.
//    The feed carries only the bundle's name and area, so the area is added to
//    the title — otherwise a title filter for "tecnología" never sees
//    "Vacantes Tecnológicas".

export const ORIGIN = 'https://thekeytalent.aplygo.com';
// The group id unika.com.do's own page requests.
export const FEED_URL = `${ORIGIN}/api/v1/groups/460a63d6-5886-46e3-bf73-6501916a49a0/jobs_by_profession/`;
export const POSTING_HOST = 'unika.aplygo.com';
export const COMPANY_LABEL = 'Unika (empleador no publicado)';

/**
 * @param {any} job
 * @param {string} kind  LOC | PRO | FUN | ORG
 */
function categoryValues(job, kind) {
  const cats = Array.isArray(job?.categories) ? job.categories : [];
  return cats
    .filter(c => c?.category === kind && typeof c.value === 'string' && c.value.trim())
    .map(c => c.value.replace(/\s+/g, ' ').trim());
}

/**
 * @param {any} payload  Parsed feed: [{ name, jobs: [{ name, landing_url, domain, categories, ... }] }]
 * @param {number} [now]
 */
export function parse(payload, now = Date.now()) {
  const groups = Array.isArray(payload) ? payload : [];
  const jobs = [];
  for (const group of groups) {
    for (const row of Array.isArray(group?.jobs) ? group.jobs : []) {
      const name = typeof row?.name === 'string' ? row.name.replace(/\s+/g, ' ').trim() : '';
      const path = typeof row?.landing_url === 'string' ? row.landing_url : '';
      // A posting link must stay on Unika's own applicant host.
      if (!name || row.domain !== POSTING_HOST || !/^\/job\/[\w-]+\/$/.test(path)) continue;
      const expires = Date.parse(row.expiration_time);
      if (Number.isFinite(expires) && expires < now) continue;

      const areas = categoryValues(row, 'PRO');
      const extra = areas.filter(a => !name.toLowerCase().includes(a.toLowerCase()));

      /** @type {{ title: string, url: string, company: string, location: string, description?: string, postedAt?: number, externalId?: string }} */
      const job = {
        title: extra.length ? `${name} (${extra.join(', ')})` : name,
        url: `https://${POSTING_HOST}${path}`,
        company: COMPANY_LABEL,
        location: categoryValues(row, 'LOC').join(', ') || 'República Dominicana',
      };
      const id = path.match(/-(\d+)\/$/);
      if (id) job.externalId = id[1];
      if (typeof row.description === 'string' && row.description.trim()) job.description = row.description.trim();
      const posted = Date.parse(row.created);
      if (Number.isFinite(posted)) job.postedAt = posted;
      jobs.push(job);
    }
  }
  return jobs;
}

/**
 * @param {Record<string, any>} _entry
 * @param {{ getJson: (url: string) => Promise<any> }} io
 */
export async function fetchBoard(_entry, io) {
  return parse(await io.getJson(FEED_URL));
}
