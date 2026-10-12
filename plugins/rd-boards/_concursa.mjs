// @ts-check
// Concursa — the Ministry of Public Administration's portal for public-sector
// competitive hiring (https://map.gob.do/Concursa/). One listing covers the
// institutions of the Dominican State that publish their vacancies through it,
// and every posting names the institution that is hiring.
//
// robots.txt of map.gob.do (User-agent: *, read 2026-10-12) disallows only
// /wp-admin/. This module reads the public listing and its ?pagina=N pages.
// It does not download the PDF notices and does not touch the account or
// application routes.

import { text, boundedInt, stringList } from './_html.mjs';

export const ORIGIN = 'https://map.gob.do';
export const PAGE_SIZE = 20;
const MAX_PAGES = 5;

/** @param {number} page 1-indexed (the site's own parameter is 0-indexed) */
export function buildUrl(page) {
  return page > 1 ? `${ORIGIN}/Concursa?discapacidad=False&pagina=${page - 1}` : `${ORIGIN}/Concursa/`;
}

/** Accent- and case-insensitive key for matching institution names. */
function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * @param {string} html
 * @param {{ includeClosed?: boolean }} [opts]
 * @returns {Array<{ title: string, url: string, company: string, location: string, description: string, externalId: string }>}
 */
export function parse(html, { includeClosed = false } = {}) {
  const jobs = [];
  const chunks = html.split(/<article\s+class="concurso\s+/).slice(1);
  for (const raw of chunks) {
    const chunk = raw.split('</article>')[0];
    const state = chunk.slice(0, chunk.indexOf('"'));
    if (!includeClosed && /\bcerrado\b/.test(state)) continue;

    const head = chunk.match(/<h3\s+id="concurso-(\d+)-titulo"[^>]*>([\s\S]*?)<\/h3>\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/i);
    if (!head) continue;
    const id = head[1];
    const title = text(head[2]);
    const company = text(head[3]);
    if (!title || !company) continue;

    /** @param {string} label */
    const field = label => text(chunk.match(new RegExp(`<b>\\s*${label}:?\\s*</b>\\s*(?:<br\\s*/?>)?\\s*([^<]*)`, 'i'))?.[1]);
    const municipio = field('Municipio');
    const deadline = field('Fecha l[ií]mite');
    const salary = text(chunk.match(/<b>\s*(RD\$[^<]*)<\/b>/i)?.[1]);

    const details = [
      ['Institución', company],
      ['Plazas', field('Plazas')],
      ['Tipo de concurso', field('Tipo')],
      ['Tipo de carrera', field('Tipo de carrera')],
      ['Salario publicado', salary],
      ['Fecha límite', deadline],
    ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);

    jobs.push({
      title,
      url: `${ORIGIN}/Concursa/Portal/AplicarVacante?cargo=${id}`,
      company,
      location: municipio ? `${municipio}, República Dominicana` : 'República Dominicana',
      description: details.join('\n'),
      externalId: id,
    });
  }
  return jobs;
}

/**
 * @param {Record<string, any>} entry
 * @param {{ get: (url: string) => Promise<string> }} io
 */
export async function fetchBoard(entry, io) {
  const maxPages = boundedInt(entry.max_pages, 2, MAX_PAGES);
  const wanted = stringList(entry.instituciones, 30).map(fold);
  const includeClosed = entry.incluir_cerrados === true;
  const jobs = [];
  for (let page = 1; page <= maxPages; page++) {
    const html = await io.get(buildUrl(page));
    const cards = (html.match(/<article\s+class="concurso\s+/g) || []).length;
    const found = parse(html, { includeClosed });
    jobs.push(...found);
    // The listing is newest-first, so a page with no open contest means the
    // rest are closed too.
    if (cards < PAGE_SIZE || found.length === 0) break;
  }
  if (wanted.length === 0) return jobs;
  return jobs.filter(j => wanted.some(w => fold(j.company).includes(w)));
}
