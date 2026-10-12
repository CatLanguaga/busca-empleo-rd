// Zero-network smoke test: the entry imports cleanly, exposes only hooks that
// match the manifest, every board parser reads its markup, and no board builds
// a URL its robots.txt disallows. Fixtures are synthetic — invented companies
// and postings in the boards' real markup shape.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = f => import(pathToFileURL(path.join(here, '..', f)).href);
const KINDS = ['provider', 'ingest', 'search', 'notify', 'export'];

const manifest = JSON.parse(readFileSync(path.join(here, '..', 'manifest.json'), 'utf8'));
const mod = await load(manifest.entry || 'index.mjs');
const hooks = mod.default;

assert(hooks && typeof hooks === 'object', 'default export must be an object of hooks');
const keys = Object.keys(hooks);
assert(keys.length > 0, 'declare at least one hook');
for (const k of keys) assert(KINDS.includes(k), `unknown hook "${k}"`);
for (const h of manifest.hooks) assert(keys.includes(h), `manifest declares hook "${h}" but index.mjs does not export it`);
assert.strictEqual(hooks.provider.id, manifest.id, 'provider id must equal the manifest id');
assert.strictEqual(typeof hooks.provider.fetch, 'function');

// ── helpers ──────────────────────────────────────────────────────────────
const { text, slugify, decodeEntities } = await load('_html.mjs');
assert.strictEqual(text('<b>Hig&#xFC;ey,</b>\n  La&nbsp;Altagracia'), 'Higüey, La Altagracia');
assert.strictEqual(decodeEntities('Dise&ntilde;o &amp; QA &desconocida;'), 'Diseño & QA &desconocida;');
assert.strictEqual(slugify('  Analista de Crédito / Cobros '), 'analista-de-credito-cobros');

// ── Computrabajo ─────────────────────────────────────────────────────────
const ct = await load('_computrabajo.mjs');
const ctCard = (id, title, company, loc) => `
<article class="box_offer  " data-id='${id}' id="${id}">
  <h2 class="fs18 fwB prB">
    <a class="js-o-link fc_base" href="/ofertas-de-trabajo/oferta-de-trabajo-de-x-en-y-${id}#lc=ListOffers-Score4-1">
      ${title}
    </a>
  </h2>
  <p class="dFlex vm_fx fs16 fc_base mt5">
    ${company.startsWith('@') ? company.slice(1) : `<a class="fc_base t_ellipsis" href="https://do.computrabajo.com/empresas/x" target='_blank' offer-grid-article-company-url>\n${company}\n</a>`}
  </p>
  <p class="fs16 fc_base mt5"><span class="mr10">\n ${loc}\n </span></p>
</article>`;
const ctJobs = ct.parse(ctCard('AAA111', 'Analista de cr&#xE9;dito', 'Ferreter&#xED;a Ejemplo SRL', 'Hig&#xFC;ey, La Altagracia') + ctCard('BBB222', 'Cajero', '@Importante empresa del sector', 'Santiago'));
assert.deepStrictEqual(ctJobs, [
  { title: 'Analista de crédito', url: 'https://do.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-x-en-y-AAA111', company: 'Ferretería Ejemplo SRL', location: 'Higüey, La Altagracia' },
  { title: 'Cajero', url: 'https://do.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-x-en-y-BBB222', company: 'Importante empresa del sector', location: 'Santiago' },
]);
assert.deepStrictEqual(ct.parse('<html>sin resultados</html>'), []);
assert.strictEqual(ct.buildUrl('Analista de Crédito', 1), 'https://do.computrabajo.com/trabajo-de-analista-de-credito');
assert.strictEqual(ct.buildUrl('contabilidad', 3), 'https://do.computrabajo.com/trabajo-de-contabilidad?p=3');
// robots.txt: filter parameters and service routes are disallowed.
for (const u of [ct.buildUrl('a b', 1), ct.buildUrl('ventas', 4)]) {
  assert(!/[?&](pubdate|sal|cont|dis|by|emp|emq)=/.test(u) && !/\/(Ajax|_services|go)\//.test(u), `disallowed URL built: ${u}`);
}
await assert.rejects(() => ct.fetchBoard({}, { get: async () => '' }), /needs `queries:`/);

// ── Tecoloco ─────────────────────────────────────────────────────────────
const tc = await load('_tecoloco.mjs');
const tcCard = (id, title, company) => `
<div class="job-card">
  <div class="job-card__content-info">
    <h2 class="title" itemprop="title">
      <a jobId="${id}" href='/${id}/puesto-ejemplo.aspx'  onclick="clickHandler(&#39;/${id}/puesto-ejemplo.aspx&#39;); return false;">${title}</a>
    </h2>
    <span class="subtitle">${company}</span>
  </div>
  <div class="job-card__footer">
    <span class="sub-subtitle"><i class="map-point"></i><span>Rep&uacute;blica Dominicana</span></span>
    <a href="/${id}/puesto-ejemplo.aspx" class="btn-see-offer">Ver Oferta</a>
  </div>
</div>
<!-- Mobile -->
<div class="job-card-mobile">
  <a jobId="${id}" href="/${id}/puesto-ejemplo.aspx">${title}</a>
  <span class="subtitle">MOVIL ${company}</span>
</div>`;
const tcJobs = tc.parse(tcCard('1000001', 'Contador general', 'Empresa Ejemplo') + tcCard('1000002', 'Gerente de ventas', 'Hotel Ejemplo'));
assert.deepStrictEqual(tcJobs, [
  { title: 'Contador general', url: 'https://www.tecoloco.com.do/1000001/puesto-ejemplo.aspx', company: 'Empresa Ejemplo', location: 'República Dominicana' },
  { title: 'Gerente de ventas', url: 'https://www.tecoloco.com.do/1000002/puesto-ejemplo.aspx', company: 'Hotel Ejemplo', location: 'República Dominicana' },
], 'desktop card only — the mobile twin must not double the row');
assert.strictEqual(tc.buildUrl(null, 1), 'https://www.tecoloco.com.do/empleos?PerPage=100');
assert.strictEqual(tc.buildUrl('Call Center', 2), 'https://www.tecoloco.com.do/empleo-call-center?PerPage=100&Page=2');

// ── DiarioEmpleo ─────────────────────────────────────────────────────────
const de = await load('_diarioempleo.mjs');
const deCard = (slug, title, company, loc) => `
<article class="search-job-card" id="empleo-x"> <div class="job-card-top"><div><p class="eyebrow">Híbrido</p>
<h3>
<a href="/empleos/${slug}">${title}</a>
</h3></div></div>
<div class="job-meta"> <a class="identity company-link" href="/empresas/x">
<span class="avatar" aria-hidden="true">O</span>
<span>${company}</span>
</a> <span>⌖ ${loc}</span> </div>
<div class="job-card-footer">
<time class="job-published-time" datetime="2026-10-09T21:28:21+00:00">Hace 2 días</time></div></article>`;
const deJobs = de.parse(deCard('auxiliar-contable-0000000000000001', 'AUXILIAR CONTABLE', 'OFICINA EJEMPLO', 'Localidad por confirmar') + deCard('chofer-0000000000000002', 'Chofer', 'Logística Ejemplo', 'Santo Domingo'));
assert.deepStrictEqual(deJobs, [
  { title: 'AUXILIAR CONTABLE', url: 'https://diarioempleo.com/empleos/auxiliar-contable-0000000000000001', company: 'OFICINA EJEMPLO', location: '', postedAt: Date.parse('2026-10-09T21:28:21+00:00') },
  { title: 'Chofer', url: 'https://diarioempleo.com/empleos/chofer-0000000000000002', company: 'Logística Ejemplo', location: 'Santo Domingo', postedAt: Date.parse('2026-10-09T21:28:21+00:00') },
]);
assert(!de.LISTING_URL.includes('/buscar'), 'robots.txt disallows /buscar');

// ── RD Trabaja ───────────────────────────────────────────────────────────
const rd = await load('_rdtrabaja.mjs');
const NOW = Date.parse('2026-10-12T00:00:00Z');
const rdJobs = rd.parse({
  pageCount: 3,
  data: [
    { puesto: { id: 9001, titulo: '  FACTURADOR ', descripcion: 'Emite facturas.', fechaPublicacion: '2026-10-10T10:00:00', fechaVencimiento: '2026-11-10T10:00:00' } },
    { puesto: { id: 9002, titulo: 'VENCIDO', fechaVencimiento: '2026-01-01T00:00:00' } },
    { puesto: { id: 9003, titulo: '' } },
    { otro: true },
  ],
}, NOW);
assert.strictEqual(rdJobs.length, 1, 'expired, untitled and malformed rows are dropped');
assert.strictEqual(rdJobs[0].title, 'FACTURADOR');
assert.strictEqual(rdJobs[0].url, 'https://empleateya.mt.gob.do/?puesto=9001');
assert.strictEqual(rdJobs[0].company, rd.COMPANY_LABEL, 'employer is never invented — a fixed label says it is not published');
assert.strictEqual(rdJobs[0].description, 'Emite facturas.');
assert.deepStrictEqual(rd.parse({}), []);

// ── Evaluar ──────────────────────────────────────────────────────────────
const ev = await load('_evaluar.mjs');
const evRow = (id, title, extra = {}) => ({
  id,
  date_gmt: '2026-10-09T19:43:00',
  link: `https://gruposid.evaluar.com/trabajo/puesto-${id}/`,
  title: { rendered: title },
  meta: { _job_location: 'La Vega', _company_name: 'GRUPO EJEMPLO', _application: 'persona@example.com', _filled: 0, ...extra },
});
const evJobs = ev.parse([
  evRow(1, 'Analista de &#8220;Proyectos&#8221;'),
  evRow(2, 'Cubierta', { _filled: 1 }),
  { ...evRow(3, 'Enlace ajeno'), link: 'https://otro-sitio.example/trabajo/3/' },
  { id: 4 },
], { tenant: 'gruposid', company: 'Grupo Ejemplo' });
assert.strictEqual(evJobs.length, 1, 'filled, off-host and malformed rows are dropped');
assert.deepStrictEqual(evJobs[0], {
  title: 'Analista de “Proyectos”',
  url: 'https://gruposid.evaluar.com/trabajo/puesto-1/',
  company: 'GRUPO EJEMPLO',
  location: 'La Vega',
  externalId: '1',
  postedAt: Date.parse('2026-10-09T19:43:00Z'),
});
assert(!JSON.stringify(evJobs).includes('example.com'), "the recruiter's contact address never reaches a Job");
for (const t of ev.TENANTS) assert(manifest.allowedHosts.includes(ev.hostOf(t)), `tenant ${t} missing from manifest allowedHosts`);
await assert.rejects(() => ev.fetchBoard({ name: 'X', tenant: 'desconocida' }, { getJson: async () => [] }), /needs `tenant:`.*gruposid/);

// ── Concursa ─────────────────────────────────────────────────────────────
const cc = await load('_concursa.mjs');
const ccCard = (id, state, title, inst) => `
<article class="concurso row ${state}" aria-labelledby="concurso-${id}-titulo">
 <div class="datos col-sm-12 col-md-10"> <div class="row"> <div class="col-sm-12">
   <h3 id="concurso-${id}-titulo">${title}</h3> </div>
   <div class="col-sm-12 institucion"> ${inst} </div>
   <div class="col-6"> <b> Municipio:</b> SANTO DOMINGO DE GUZM&#xC1;N <br /> <b> Plazas:</b> 2 <br /> <b> Tipo:</b> Externo </div>
   <div class="col-6"> <b> Fecha límite:</b> <br /> 26/10/2026 03:00 PM <br /> <b> Tipo de carrera:</b> Administrativa General </div>
 </div> </div>
 <div class="salario"> <b> RD$45,000 </b> </div>
 <a href="/Concursa/Concurso/ObtenerArchivoDePublicacion?archivo=abc.pdf"> Ver aviso </a>
 <a href="/Concursa/Portal/AplicarVacante?cargo=${id}"> Aplicar </a>
</article>`;
const ccHtml = ccCard(501, 'abierto', 'Analista de Datos Estad&#xED;sticas', 'Instituci&#xF3;n de Ejemplo') + ccCard(500, 'cerrado', 'Contador', 'Ministerio de Ejemplo');
const ccOpen = cc.parse(ccHtml);
assert.strictEqual(ccOpen.length, 1, 'closed contests are skipped by default');
assert.deepStrictEqual(ccOpen[0], {
  title: 'Analista de Datos Estadísticas',
  url: 'https://map.gob.do/Concursa/Portal/AplicarVacante?cargo=501',
  company: 'Institución de Ejemplo',
  location: 'SANTO DOMINGO DE GUZMÁN, República Dominicana',
  description: 'Institución: Institución de Ejemplo\nPlazas: 2\nTipo de concurso: Externo\nTipo de carrera: Administrativa General\nSalario publicado: RD$45,000\nFecha límite: 26/10/2026 03:00 PM',
  externalId: '501',
});
assert.strictEqual(cc.parse(ccHtml, { includeClosed: true }).length, 2);
assert.strictEqual(cc.buildUrl(1), 'https://map.gob.do/Concursa/');
assert.strictEqual(cc.buildUrl(3), 'https://map.gob.do/Concursa?discapacidad=False&pagina=2');
// Institution filter is accent- and case-insensitive; a short page ends the walk.
{
  const calls = [];
  const io = { get: async u => { calls.push(u); return ccHtml; } };
  assert.strictEqual((await cc.fetchBoard({ instituciones: ['institucion de ejemplo'], max_pages: 4 }, io)).length, 1);
  assert.strictEqual((await cc.fetchBoard({ instituciones: ['otra cosa'] }, io)).length, 0);
  assert.strictEqual(calls.length, 2);
}

// ── provider hook against a fake ctx ─────────────────────────────────────
function fakeCtx(respond) {
  const calls = [];
  return {
    calls,
    normalizePostingUrl: x => x,
    fetchText: async url => { calls.push(url); return respond(url, calls.length); },
    fetchJson: async url => { calls.push(url); return respond(url, calls.length); },
  };
}

// Dispatch by board; the same posting found under two queries is returned once.
let ctx = fakeCtx(() => ctCard('AAA111', 'Analista', 'Empresa Ejemplo', 'Santiago'));
let jobs = await hooks.provider.fetch({ name: 'CT', board: 'Computrabajo', queries: ['analista', 'finanzas'] }, ctx);
assert.strictEqual(ctx.calls.length, 2);
assert.strictEqual(jobs.length, 1);
for (const u of ctx.calls) assert(manifest.allowedHosts.includes(new URL(u).hostname), `host not in allowedHosts: ${u}`);

// RD Trabaja stops at the API's own page count.
ctx = fakeCtx((_u, n) => ({ pageCount: 2, data: [{ puesto: { id: 9000 + n, titulo: `Puesto ${n}` } }] }));
jobs = await hooks.provider.fetch({ name: 'RDT', board: 'rdtrabaja', max_pages: 9 }, ctx);
assert.strictEqual(ctx.calls.length, 2);
assert.strictEqual(jobs.length, 2);

// A failing board is an error, never an empty board.
ctx = fakeCtx(() => { throw new Error('HTTP 403'); });
await assert.rejects(() => hooks.provider.fetch({ name: 'DE', board: 'diarioempleo' }, ctx), /HTTP 403/);

// Unknown or missing board is a configuration error that names the options.
await assert.rejects(() => hooks.provider.fetch({ name: 'X', board: 'aldaba' }, fakeCtx(() => '')), /needs `board:`.*computrabajo/);
await assert.rejects(() => hooks.provider.fetch({ name: 'X' }, fakeCtx(() => '')), /needs `board:`/);

// Every board host is declared in the manifest.
for (const b of Object.values(mod.BOARDS)) assert(manifest.allowedHosts.includes(new URL(b.ORIGIN).hostname));

console.log('✓ smoke ok:', keys.join(', '), '—', Object.keys(mod.BOARDS).join(', '));
