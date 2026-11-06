// Employer portal readers, on synthetic fixtures in each system's real shape:
// invented companies and postings, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTeamtailor, parseOracle, parseSuccessFactorsTiles, cityFromPath, oracleApiUrl, EMPLOYER_READERS } from '../employers.mjs';

test('Teamtailor: RSS items, Dominican postings only', () => {
  const item = (title, slug, city, country) => `<item>
    <title>${title}</title><description>&lt;p&gt;texto&lt;/p&gt;</description>
    <pubDate>Thu, 22 Oct 2026 14:13:34 -0400</pubDate>
    <link>https://ejemplo.na.teamtailor.com/jobs/${slug}</link>
    <tt:locations><tt:location><tt:city>${city}</tt:city><tt:country>${country}</tt:country></tt:location></tt:locations>
  </item>`;
  const xml = `<rss><channel>${item('Técnico de Redes &amp; Datos', '1-tecnico', 'Bayahíbe', 'Dominican Republic')}${item('Operador', '2-operador', 'Ciudad de Panamá', 'Panama')}</channel></rss>`;
  assert.deepEqual(parseTeamtailor(xml, 'Empresa Ejemplo'), [{
    title: 'Técnico de Redes & Datos', url: 'https://ejemplo.na.teamtailor.com/jobs/1-tecnico',
    company: 'Empresa Ejemplo', location: 'Bayahíbe', postedAt: Date.parse('2026-10-22T18:13:34Z'),
  }]);
});

test('Oracle: requisition list, links to the candidate site, foreign rows dropped', () => {
  const portal = { origin: 'https://ejemplo.fa.ocs.oraclecloud.com', lang: 'es', site: 'CX_1' };
  const json = { items: [{ requisitionList: [
    { Id: '259', Title: 'Analista de Riesgo', PostedDate: '2026-10-30', PrimaryLocation: 'República Dominicana', workLocation: [{ TownOrCity: 'Santo Domingo', Country: 'DO' }] },
    { Id: '260', Title: 'Analista PR', workLocation: [{ TownOrCity: 'San Juan', Country: 'PR' }] },
    { Id: '261', Title: '' },
  ] }] };
  assert.deepEqual(parseOracle(json, portal, 'Aseguradora Ejemplo'), [{
    title: 'Analista de Riesgo', url: 'https://ejemplo.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/es/sites/CX_1/job/259',
    company: 'Aseguradora Ejemplo', location: 'Santo Domingo', postedAt: Date.parse('2026-10-30'),
  }]);
  assert.deepEqual(parseOracle({}, portal, 'x'), []);
  assert.match(oracleApiUrl(portal.origin, 'CX_1', 200), /siteNumber=CX_1,.*offset=200&limit=200&offset=200$/);
});

test('SuccessFactors: tiles, city from the field or from the path', () => {
  const tile = (id, path, title, city = '') => `<li class="job-tile job-id-${id} job-row-index-1" data-url="${path}">
    <a class="jobTitle-link fontcolor1" href="${path}"> ${title} </a>
    <a class="jobTitle-link fontcolor1" href="${path}"> ${title} </a>
    ${city ? `<div id="job-${id}-desktop-section-city-value">${city}</div>` : ''}</li>`;
  const html = tile(1, '/job/SANTO-DOMINGO-ANALISTA-DE-CREDITO/1/', 'ANALISTA DE CRÉDITO')
    + tile(2, '/job/x/2/', 'Cajero', 'Santiago')
    + tile(3, 'https://otro-sitio.example/job/3/', 'Externo');
  assert.deepEqual(parseSuccessFactorsTiles(html, 'https://empleos.ejemplo.do', 'Banco Ejemplo'), [
    { title: 'ANALISTA DE CRÉDITO', url: 'https://empleos.ejemplo.do/job/SANTO-DOMINGO-ANALISTA-DE-CREDITO/1/', company: 'Banco Ejemplo', location: 'Santo Domingo' },
    { title: 'Cajero', url: 'https://empleos.ejemplo.do/job/x/2/', company: 'Banco Ejemplo', location: 'Santiago' },
  ]);
  assert.equal(cityFromPath('/job/ANALISTA-DE-CREDITO/1/', 'Analista de crédito'), '', 'no city prefix');
});

test('SuccessFactors pages by startrow and stops when a page adds nothing new', async () => {
  const urls = [];
  const page = n => `<li class="job-tile job-id-${n}" data-url="/job/X-PUESTO-${n}/${n}/"><a class="jobTitle-link" href="#">Puesto ${n}</a></li>`;
  const io = {
    get: async url => {
      urls.push(url);
      const row = Number(new URL(url).searchParams.get('startrow'));
      return row < 4 ? page(row) + page(row + 1) : page(0); // past the end: repeats page 1
    },
  };
  const jobs = await EMPLOYER_READERS.successfactors.fetchBoard({ name: 'B', portal: 'https://empleos.ejemplo.do/' }, io);
  assert.equal(jobs.length, 4);
  assert.deepEqual(urls.map(u => new URL(u).searchParams.get('startrow')), ['0', '2', '4']);
  assert.ok(urls.every(u => u.includes('/tile-search-results/')), 'robots.txt disallows /services/');
});

test('portals must be HTTPS', async () => {
  const io = { get: async () => '', getJson: async () => ({}) };
  await assert.rejects(EMPLOYER_READERS.teamtailor.fetchBoard({ name: 'x', portal: 'http://x.teamtailor.com/' }, io), /HTTPS/);
});
