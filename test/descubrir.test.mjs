// Offline tests for descubrir.mjs: link finding, classification, robots.txt,
// and the per-employer walk against a scripted fake site.
import assert from 'node:assert';
import {
  parseRobots, robotsAllows, findCareerLinks, findByText, classify, firmaDeSistema,
  explorar, verificar, esGobierno, fold,
} from '../descubrir.mjs';

// ── robots.txt ───────────────────────────────────────────────────────────
const rules = parseRobots(`
User-agent: Googlebot
Disallow: /solo-google/

User-agent: *
Disallow: /privado/
Disallow: /ofertas/*filtro=
Allow: /privado/publico
# comentario
Disallow:
`);
assert.strictEqual(robotsAllows(rules, '/'), true);
assert.strictEqual(robotsAllows(rules, '/privado/x'), false);
assert.strictEqual(robotsAllows(rules, '/privado/publico/x'), true, 'longest rule wins');
assert.strictEqual(robotsAllows(rules, '/ofertas/lista?filtro=1'), false, 'wildcard');
assert.strictEqual(robotsAllows(rules, '/ofertas/lista'), true);
assert.strictEqual(robotsAllows(rules, '/solo-google/x'), true, 'rules of another agent do not bind');
assert.strictEqual(robotsAllows(parseRobots('User-agent: *\nDisallow: /\nAllow: /index.php'), '/ver_ofertas.php'), false);
assert.strictEqual(robotsAllows(parseRobots('User-agent: *\nDisallow: /\nAllow: /index.php'), '/index.php?g=x'), true);
assert.strictEqual(robotsAllows([], '/cualquiera'), true);

// ── career links ─────────────────────────────────────────────────────────
const HOME = 'https://www.ejemplo.com.do/';
const links = findCareerLinks(`
  <a href="/productos">Productos</a>
  <a href="/seguros/desempleo/">Seguro de desempleo</a>
  <a href="/2024/05/12/carrera-5k/">Carrera 5K</a>
  <a href="/nosotros/trabaja-con-nosotros/">Trabaja con Nosotros</a>
  <a href="https://ejemplo.portal-de-empleo.example/#jobs">Empleos</a>
  <a href="https://www.facebook.com/sharer.php?u=https%3A%2F%2Fwww.ejemplo.com.do%2Fvacantes">Compartir vacantes</a>
  <a href="/gente/#jobs"><span>&Uacute;nete</span> a nuestro equipo</a>
`, HOME);
assert.deepStrictEqual(links.map(l => l.url), [
  'https://ejemplo.portal-de-empleo.example/#jobs',
  'https://www.ejemplo.com.do/nosotros/trabaja-con-nosotros/',
  'https://www.ejemplo.com.do/gente/#jobs',
], 'outbound careers link first; unemployment insurance, a race and a share button are not careers links');
assert.deepStrictEqual(findCareerLinks('<a href="/x">Nada</a>', HOME), []);

// Government hint.
assert(esGobierno('sb.gob.do') && esGobierno('www.bancentral.gov.do') && !esGobierno('www.ejemplo.com.do'));
assert.deepStrictEqual(
  findByText('<a href="/transparencia/rrhh/vacantes/">Vacantes</a><a href="/servicios">Servicios</a>', 'https://x.gob.do/', /\b(recursos humanos|vacantes?)\b/).map(l => l.url),
  ['https://x.gob.do/transparencia/rrhh/vacantes/'],
);
assert.strictEqual(fold('Únete Ñandú'), 'unete nandu');

// ── classification ───────────────────────────────────────────────────────
const reclama = url => (new URL(url).hostname.endsWith('.sistema-conocido.example') ? 'proveedor-x' : null);
const ctx = { sitio: 'www.ejemplo.com.do', reclama };
assert.deepStrictEqual(classify('https://acme.sistema-conocido.example/jobs', ctx), { tipo: 'sistema', url: 'https://acme.sistema-conocido.example/jobs', proveedor: 'proveedor-x' });
assert.deepStrictEqual(classify('https://gruposid.evaluar.com/vacantes/', ctx), { tipo: 'evaluar', url: 'https://gruposid.evaluar.com/', tenant: 'gruposid' });
assert.strictEqual(classify('https://www.evaluar.com/', ctx).tipo, 'externo', 'the vendor site itself is not a tenant');
assert.deepStrictEqual(classify('https://acme.na.teamtailor.com/#jobs', ctx), { tipo: 'sistema', url: 'https://acme.na.teamtailor.com/', proveedor: 'teamtailor', explicito: true });
assert.strictEqual(classify('https://career19.sapsf.com/career?company=acme', ctx).tipo, 'plataforma', 'classic SuccessFactors is unreadable (robots.txt)');
assert.strictEqual(classify('https://career4.successfactors.com/career?company=acme', { sitio: 'x', reclama: () => 'successfactors' }).tipo, 'plataforma', 'even when a provider would claim the host');
assert.strictEqual(classify('https://map.gob.do/Concursa/', ctx).tipo, 'cubierta');
assert.strictEqual(classify('https://map.gob.do/2019/noticia', ctx).tipo, 'externo');
assert.strictEqual(classify('https://rdtrabaja.mt.gob.do/#/empleo/buscar-empleo', ctx).tipo, 'cubierta');
assert.strictEqual(classify('https://share.google/abc', ctx).tipo, 'plataforma');
assert.strictEqual(classify('https://do.computrabajo.com/empresas/acme', ctx).tipo, 'plataforma');
assert.strictEqual(classify('https://ejemplo.com.do/empleos', ctx).tipo, 'propia', 'www and apex are the same site');
assert.strictEqual(classify('https://vacantes.ejemplo.com.do/', ctx).tipo, 'externo');

assert.deepStrictEqual(
  firmaDeSistema('<script src="https://rmkcdn.successfactors.com/abc/x.js"></script>', 'https://empleos.ejemplo.com/buscar'),
  { tipo: 'sistema', url: 'https://empleos.ejemplo.com/', proveedor: 'successfactors', explicito: true },
);
assert.strictEqual(firmaDeSistema('<html>nada</html>', 'https://x.example/'), null);

// ── the walk, against a scripted site ────────────────────────────────────
function fakeSession(pages) {
  const calls = [];
  return {
    calls,
    get requests() { return calls.length; },
    get agotado() { return calls.length >= 6; },
    async get(url) {
      calls.push(url);
      const p = pages[url];
      if (!p) return { ok: false, status: 404, url, body: '', bloqueo: false };
      return { ok: true, status: 200, url: p.url || url, body: p.body ?? p, bloqueo: !!p.bloqueo };
    },
  };
}
const E = { nombre: 'Ejemplo', web: 'https://www.ejemplo.com.do/' };

// Own careers page that hands off to a known system.
let s = fakeSession({
  'https://www.ejemplo.com.do/robots.txt': 'User-agent: *\nDisallow: /admin/',
  'https://www.ejemplo.com.do/': '<a href="/trabaja-con-nosotros/">Trabaja con nosotros</a>',
  'https://www.ejemplo.com.do/trabaja-con-nosotros/': '<a href="https://acme.sistema-conocido.example/jobs">Ver vacantes</a>',
});
let r = await explorar(E, { session: s, reclama });
assert.strictEqual(r.estado, 'por-verificar');
assert.strictEqual(r.hallazgos[0].proveedor, 'proveedor-x');
assert.strictEqual(s.calls.length, 3);

// robots.txt forbids the careers path: it is not fetched.
s = fakeSession({
  'https://www.ejemplo.com.do/robots.txt': 'User-agent: *\nDisallow: /trabaja-con-nosotros/',
  'https://www.ejemplo.com.do/': '<a href="/trabaja-con-nosotros/">Trabaja con nosotros</a>',
});
r = await explorar(E, { session: s, reclama });
assert(!s.calls.includes('https://www.ejemplo.com.do/trabaja-con-nosotros/'));
assert(r.notas.some(n => n.includes('robots.txt no permite')));

// robots.txt forbids everything: stop after reading it.
s = fakeSession({ 'https://www.ejemplo.com.do/robots.txt': 'User-agent: *\nDisallow: /' });
r = await explorar(E, { session: s, reclama });
assert.strictEqual(r.estado, 'robots');
assert.strictEqual(s.calls.length, 1);

// Anti-bot wall on the home page: reported as blocked, nothing else requested.
s = fakeSession({ 'https://www.ejemplo.com.do/': { body: '<script src="/_Incapsula_Resource?x"></script>', bloqueo: true } });
r = await explorar(E, { session: s, reclama });
assert.strictEqual(r.estado, 'bloqueada');
assert.strictEqual(s.calls.length, 2);

// No link anywhere, common paths 404: "sin-enlace", within the request cap.
s = fakeSession({ 'https://www.ejemplo.com.do/': '<a href="/productos">Productos</a>' });
r = await explorar(E, { session: s, reclama });
assert.strictEqual(r.estado, 'sin-enlace');
assert(s.calls.length <= 6, `request cap exceeded: ${s.calls.length}`);

// A known careers portal is explored directly, and a page signature resolves it.
s = fakeSession({ 'https://empleos.ejemplo.com/': '<link href="https://rmkcdn.successfactors.com/a/b.css">' });
r = await explorar({ ...E, empleo: 'https://empleos.ejemplo.com/' }, { session: s, reclama });
assert.strictEqual(r.estado, 'por-verificar');
assert.deepStrictEqual([r.hallazgos[0].proveedor, r.hallazgos[0].explicito], ['successfactors', true]);
assert(!s.calls.some(u => u.includes('www.ejemplo.com.do')), 'the main site is not touched when `empleo` is given');

// A known portal on a recognisable host is classified without any request.
s = fakeSession({});
r = await explorar({ ...E, empleo: 'https://career19.sapsf.com/career?company=acme' }, { session: s, reclama });
assert.deepStrictEqual([r.estado, s.calls.length], ['plataforma', 0]);

// A known portal that answers but shows nothing recognisable is a portal without a reader.
s = fakeSession({ 'https://empleos.ejemplo.com/': '<div id="app"></div><script src="/main.js"></script>' });
r = await explorar({ ...E, empleo: 'https://empleos.ejemplo.com/' }, { session: s, reclama });
assert.strictEqual(r.estado, 'portal-externo');
assert.strictEqual(r.hallazgos[0].url, 'https://empleos.ejemplo.com/');

// External portal: its own robots.txt is read before the page.
s = fakeSession({
  'https://www.ejemplo.com.do/': '<a href="https://vacantes.ejemplo.com.do/">Empleos</a>',
  'https://vacantes.ejemplo.com.do/robots.txt': 'User-agent: *\nDisallow: /',
});
r = await explorar(E, { session: s, reclama });
assert.strictEqual(r.estado, 'robots');
assert(!s.calls.includes('https://vacantes.ejemplo.com.do/'));

// Government site: falls back to the transparency section.
s = fakeSession({
  'https://ejemplo.gob.do/': '<a href="/transparencia/">Transparencia</a>',
  'https://ejemplo.gob.do/transparencia/': '<a href="/transparencia/rrhh/nomina/">Nómina de empleados</a><a href="https://map.gob.do/Concursa/">Vacantes</a>',
});
r = await explorar({ nombre: 'Institución', web: 'https://ejemplo.gob.do/' }, { session: s, reclama });
assert.strictEqual(r.estado, 'cubierta');

// ── verification ─────────────────────────────────────────────────────────
const providers = new Map([['proveedor-x', { id: 'proveedor-x', fetch: async entry => (entry.careers_url.includes('vacio') ? [] : [{ title: 'Analista' }, { title: 'Cajero' }]) }]]);
const deps = { providers, httpCtx: {}, tenants: ['gruposid'], getJson: async () => [{ title: { rendered: 'Puesto &amp; Más' } }] };
const base = h => ({ nombre: 'Ejemplo', estado: 'por-verificar', hallazgos: [h], notas: [] });

r = await verificar(base({ tipo: 'sistema', url: 'https://acme.sistema-conocido.example/jobs', proveedor: 'proveedor-x' }), deps);
assert.deepStrictEqual([r.estado, r.vacantes, r.muestra], ['resuelta', 2, ['Analista', 'Cajero']]);
r = await verificar(base({ tipo: 'sistema', url: 'https://vacio.sistema-conocido.example/', proveedor: 'proveedor-x' }), deps);
assert.strictEqual(r.estado, 'tablero-vacio', 'a readable board with no postings is not "resolved"');
r = await verificar(base({ tipo: 'sistema', url: 'https://x/', proveedor: 'no-existe' }), deps);
assert.strictEqual(r.estado, 'tablero-vacio');
assert(r.notas.some(n => n.includes('no se pudo leer')));
r = await verificar(base({ tipo: 'evaluar', url: 'https://gruposid.evaluar.com/', tenant: 'gruposid' }), deps);
assert.deepStrictEqual([r.estado, r.muestra], ['resuelta', ['Puesto & Más']]);
r = await verificar(base({ tipo: 'evaluar', url: 'https://nueva.evaluar.com/', tenant: 'nueva' }), deps);
assert.strictEqual(r.estado, 'evaluar-nuevo', 'an unlisted tenant cannot be read until the plugin allows its host');

// A provider that falls back to an endpoint the portal's robots.txt disallows
// is not "resolved", even though it returned postings.
{
  const sf = { id: 'sf', fetch: async (entry, ctx) => { await ctx.fetchText(entry.careers_url + 'tile-search-results/'); await ctx.fetchJson(entry.careers_url + 'services/recruiting/v1/jobs'); return [{ title: 'Ingeniero' }]; } };
  const d = {
    providers: new Map([['sf', sf]]),
    httpCtx: { fetchText: async () => '', fetchJson: async () => ({}) },
    tenants: [],
    getJson: async () => [],
    getRobots: async () => 'User-agent: *\nDisallow: /services/',
  };
  r = await verificar(base({ tipo: 'sistema', url: 'https://vacantes.ejemplo.com/', proveedor: 'sf', explicito: true }), d);
  assert.strictEqual(r.estado, 'robots');
  assert.strictEqual(r.entrada, undefined, 'no portals.yml entry is proposed');
  assert(r.notas.some(n => n.includes('/services/recruiting/v1/jobs')));
  // Same provider, same robots.txt, but only the allowed endpoint was needed.
  sf.fetch = async (entry, ctx) => { await ctx.fetchText(entry.careers_url + 'tile-search-results/'); return [{ title: 'Ingeniero' }]; };
  r = await verificar(base({ tipo: 'sistema', url: 'https://vacantes.ejemplo.com/', proveedor: 'sf', explicito: true }), d);
  assert.strictEqual(r.estado, 'resuelta');
}

console.log('✓ descubrir ok');
