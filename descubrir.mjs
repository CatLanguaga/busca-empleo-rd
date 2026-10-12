#!/usr/bin/env node
// descubrir.mjs — encuentra dónde publica sus vacantes un empleador dominicano.
//
// career-ops ships discover-ats.mjs, which guesses a board identifier from the
// company NAME across a dozen ATS vendors. Dominican employers rarely resolve
// that way. This tool starts from the employer's own WEBSITE instead: it reads
// the home page, follows the "Trabaja con nosotros / Empleos / Vacantes" link,
// and classifies where it lands.
//
//   node descubrir.mjs <ruta-career-ops> --in data/empresas-rd.yml
//   node descubrir.mjs <ruta-career-ops> "EGE Haina=https://www.egehaina.com"
//   node descubrir.mjs <ruta-career-ops> --in mis-empresas.yml --write
//   node descubrir.mjs <ruta-career-ops> --in data/empresas-rd.yml --json
//
// Preview by default: nothing is written. --write appends the employers that
// resolved to a system career-ops already reads to that folder's portals.yml
// (`tracked_companies`), through career-ops' own splice + de-dup functions.
//
// It reuses, imported from the target career-ops folder (never copied):
//   providers/_registry.mjs  loadProviders, resolveProvider
//   providers/_http.mjs      makeHttpCtx
//   discover-ats.mjs         renderPortalEntry, insertIntoTrackedCompanies, dedupeAgainstPortals
//
// Limits, on purpose: robots.txt is honoured per path, at most 6 requests per
// employer, one second between requests, no retries, and a blocked site is
// reported as blocked — never worked around.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const UA = 'Mozilla/5.0 (compatible; busca-empleo-rd/0.2; descubrir; personal job search)';
const MAX_REQUESTS = 6;
const PACE_MS = 1000;
const TIMEOUT_MS = 15_000;
const MAX_BODY = 2_000_000;
const COMMON_PATHS = ['/empleos', '/vacantes', '/carreras', '/trabaja-con-nosotros'];

export const ESTADOS = {
  resuelta: 'Resuelta: el escáner la puede leer y hoy lista vacantes',
  'tablero-vacio': 'Sistema legible, pero hoy lista 0 vacantes',
  'evaluar-nuevo': 'Usa Evaluar; falta añadir su sitio al plugin rd-boards',
  cubierta: 'Publica en una fuente que busca-empleo-rd ya lee',
  'portal-externo': 'Tiene portal de empleo en otro dominio; sin lector, revisar a mano',
  'pagina-propia': 'Publica en una página de su propia web; revisar a mano',
  plataforma: 'Remite a una plataforma que no se puede leer',
  'sin-enlace': 'No se encontró enlace de empleo en su web',
  bloqueada: 'El sitio bloquea accesos automáticos; no se evade',
  robots: 'Su robots.txt no permite leer esa ruta',
  'sin-respuesta': 'El sitio no respondió',
};

// Hosts that are a known destination but have no reader. Suffix match.
const PLATAFORMAS = [
  ['forms.gle', 'Formulario de Google'],
  ['docs.google.com', 'Formulario de Google'],
  ['share.google', 'Enlace acortado de Google'],
  ['goo.gl', 'Enlace acortado de Google'],
  ['bit.ly', 'Enlace acortado'],
  ['linkedin.com', 'LinkedIn'],
  ['instagram.com', 'Instagram'],
  ['facebook.com', 'Facebook'],
  ['wa.me', 'WhatsApp'],
  ['api.whatsapp.com', 'WhatsApp'],
  ['computrabajo.com', 'Perfil de empresa en Computrabajo (ya cubierto por la bolsa)'],
  ['aldaba.com', 'Aldaba (no soportada: robots.txt)'],
];

// Sources the rd-boards plugin already reads: an employer pointing here needs
// no entry of its own.
const CUBIERTAS = [
  [u => u.hostname === 'map.gob.do' && u.pathname.toLowerCase().startsWith('/concursa'), 'Concursa (board: concursa)'],
  [u => /^(empleateya|rdtrabaja)\.mt\.gob\.do$/.test(u.hostname), 'RD Trabaja (board: rdtrabaja)'],
];

// SAP SuccessFactors' classic candidate portal (career?company=X). Its
// robots.txt is `Disallow: /` (read 2026-10-12 on career19.sapsf.com and
// career4.successfactors.com), and career-ops' successfactors provider reads a
// different product (RMK / Career Site Builder sites), so it cannot read these.
const RE_SF_CLASICO = /^career\d*\.(successfactors|sapsf)\.(com|eu)$/;

// Vendors career-ops reads but whose detect() is pinned to a narrower host
// shape than tenants actually use. Tried with an explicit `provider:` and only
// kept when the live fetch returns postings.
const PISTAS_PROVEEDOR = [['.teamtailor.com', 'teamtailor']];

// ── text helpers ─────────────────────────────────────────────────────────

/** Lowercase, accent-free. */
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&([aeiouAEIOU])acute;/g, '$1').replace(/&ntilde;/g, 'n');
}

function plain(html) {
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// ── robots.txt ───────────────────────────────────────────────────────────

/**
 * Rules of the `User-agent: *` group.
 * @param {string} txt
 * @returns {Array<{ allow: boolean, path: string }>}
 */
export function parseRobots(txt) {
  const rules = [];
  let agents = [];
  let lastWasAgent = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) agents = [];
      agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if ((key === 'allow' || key === 'disallow') && agents.includes('*') && val) {
      rules.push({ allow: key === 'allow', path: val });
    }
  }
  return rules;
}

/** Longest matching rule wins; Allow wins a tie. `*` and a trailing `$` are supported. */
export function robotsAllows(rules, pathAndQuery) {
  let best = null;
  for (const r of rules) {
    const re = new RegExp('^' + r.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\?\$$/, '$'));
    if (!re.test(pathAndQuery)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

// ── finding career links ─────────────────────────────────────────────────

const RE_TEXTO = /\b(trabaja con nosotros|trabaja con|trabaja en|unete a|unete|bolsa de empleo|empleos?|vacantes?|carreras?|careers?|jobs?|oportunidades laborales|oportunidades de empleo)\b/;
const RE_RUTA = /(^|[\/\-_.#?=])(trabaja-con-nosotros|trabaja|empleos?|vacantes?|carreras?|careers?|jobs?|unete)([\/\-_.#?=]|$)/;
const RE_TRANSPARENCIA = /\btransparencia\b/;
const RE_RRHH = /\b(recursos humanos|vacantes?)\b/;
// News posts and documents mention "carrera"/"empleo" without being a careers page.
// "Share this page" buttons carry the page's own words into a social URL.
const RE_RUIDO = /\/20\d\d\/\d\d\/|\.(pdf|docx?|xlsx?|jpe?g|png)(\?|$)|noticias?|prensa|blog|seguros?\/desempleo|sharer|\/share\b|intent\/tweet|[?&](u|url|text)=http/;

/**
 * @param {string} html
 * @param {string} baseUrl
 * @returns {Array<{ url: string, texto: string, href: string }>}
 */
export function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = decode(m[1].trim());
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let url;
    try { url = new URL(href, baseUrl); } catch { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    const aria = m[0].match(/aria-label\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
    out.push({ url: url.href, texto: plain(m[2]) || plain(aria), href });
  }
  for (const f of html.matchAll(/<iframe\b[^>]*?src\s*=\s*["']([^"']+)["']/gi)) {
    try { out.push({ url: new URL(decode(f[1]), baseUrl).href, texto: '', href: f[1] }); } catch { /* skip */ }
  }
  return out;
}

/**
 * Career-looking links, best first.
 * @param {string} html
 * @param {string} baseUrl
 */
export function findCareerLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const seen = new Map();
  for (const l of extractLinks(html, baseUrl)) {
    const u = new URL(l.url);
    const texto = fold(l.texto);
    const ruta = fold(u.pathname + u.search + u.hash);
    let score = 0;
    if (RE_TEXTO.test(texto)) score += 3;
    if (RE_RUTA.test(ruta)) score += 2;
    if (score === 0) continue;
    if (RE_RUIDO.test(ruta) || RE_RUIDO.test(texto)) continue;
    if (u.hostname !== base.hostname) score += 1; // an outbound careers link usually IS the job portal
    const key = u.href.replace(/#.*$/, '');
    const prev = seen.get(key);
    if (!prev || score > prev.score) seen.set(key, { url: u.href, texto: l.texto, score });
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}

/** For .gob.do / .gov.do sites: the transparency portal, then its HR/vacancies section. */
export function findByText(html, baseUrl, re) {
  const seen = new Set();
  const out = [];
  for (const l of extractLinks(html, baseUrl)) {
    const u = new URL(l.url);
    if (!re.test(fold(l.texto)) && !re.test(fold(u.pathname).replace(/[-_]/g, ' '))) continue;
    if (RE_RUIDO.test(fold(u.pathname))) continue;
    const key = u.href.replace(/#.*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: u.href, texto: l.texto });
  }
  return out;
}

export function esGobierno(hostname) {
  return /\.(gob|gov)\.do$/.test(hostname);
}

// ── classifying a destination ────────────────────────────────────────────

const sameSite = (a, b) => a.replace(/^www\./, '') === b.replace(/^www\./, '');

/**
 * @param {string} url
 * @param {{ sitio: string, reclama: (url: string) => string|null }} ctx
 *   `reclama` returns the id of the career-ops provider whose detect() claims the URL.
 * @returns {{ tipo: 'sistema'|'evaluar'|'cubierta'|'plataforma'|'propia'|'externo', url: string, proveedor?: string, explicito?: boolean, tenant?: string, plataforma?: string }}
 */
export function classify(url, { sitio, reclama }) {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();

  const ev = host.match(/^([a-z0-9-]+)\.evaluar\.com$/);
  if (ev && ev[1] !== 'www') return { tipo: 'evaluar', url: `https://${host}/`, tenant: ev[1] };

  for (const [test, nombre] of CUBIERTAS) {
    if (test(u)) return { tipo: 'cubierta', url, plataforma: nombre };
  }
  if (RE_SF_CLASICO.test(host)) {
    return { tipo: 'plataforma', url, plataforma: 'SAP SuccessFactors clásico (su robots.txt prohíbe leerlo)' };
  }

  const proveedor = reclama(url);
  if (proveedor) return { tipo: 'sistema', url, proveedor };

  for (const [suffix, id] of PISTAS_PROVEEDOR) {
    if (host.endsWith(suffix)) return { tipo: 'sistema', url: `${u.origin}/`, proveedor: id, explicito: true };
  }
  for (const [suffix, nombre] of PLATAFORMAS) {
    if (host === suffix || host.endsWith('.' + suffix)) return { tipo: 'plataforma', url, plataforma: nombre };
  }
  if (sameSite(host, sitio)) return { tipo: 'propia', url };
  return { tipo: 'externo', url };
}

/**
 * Some systems hide behind the employer's own domain, so the URL says nothing;
 * the page does. SuccessFactors Recruiting Marketing sites (empleos.empresa.com)
 * load their assets from rmkcdn.successfactors.com — the product career-ops'
 * `successfactors` provider reads when the entry names it explicitly.
 * @param {string} body
 * @param {string} pageUrl
 */
export function firmaDeSistema(body, pageUrl) {
  if (/rmkcdn\.successfactors\.com|\/\/[a-z0-9.-]*jobs2web\.com/i.test(body)) {
    return { tipo: 'sistema', url: new URL(pageUrl).origin + '/', proveedor: 'successfactors', explicito: true };
  }
  return null;
}

// A named destination says more than "has a page": when an employer's own
// careers page hands off to a platform, the platform is the finding.
const PRIORIDAD = { sistema: 0, evaluar: 1, cubierta: 2, plataforma: 3, externo: 4, propia: 5 };

// ── network ──────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pareceBloqueo(status, body) {
  if ([401, 403, 429, 503].includes(status)) return true;
  return /_Incapsula_Resource|Just a moment\.\.\.|cf-challenge|Attention Required|Access Denied|captcha-delivery/i.test(body.slice(0, 6000));
}

/** Budgeted, paced GET. One instance per employer. */
export function makeSession(fetchImpl = globalThis.fetch, pace = PACE_MS) {
  let n = 0;
  return {
    get requests() { return n; },
    get agotado() { return n >= MAX_REQUESTS; },
    /** @returns {Promise<{ ok: boolean, status: number, url: string, body: string, bloqueo: boolean, error?: string }>} */
    async get(url) {
      if (n >= MAX_REQUESTS) return { ok: false, status: 0, url, body: '', bloqueo: false, error: 'tope de peticiones' };
      if (n > 0 && pace) await sleep(pace);
      n++;
      try {
        const res = await fetchImpl(url, {
          headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'es-DO,es;q=0.9,en;q=0.5' },
          redirect: 'follow',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const body = (await res.text()).slice(0, MAX_BODY);
        return { ok: res.ok, status: res.status, url: res.url || url, body, bloqueo: pareceBloqueo(res.status, body) };
      } catch (err) {
        return { ok: false, status: 0, url, body: '', bloqueo: false, error: err?.cause?.code || err?.name || String(err) };
      }
    },
  };
}

// ── one employer ─────────────────────────────────────────────────────────

/**
 * Walk one employer's site and return what was found. Pure with respect to
 * `session` and `reclama`, so it runs offline in tests.
 * @param {{ nombre: string, web: string, empleo?: string, sector?: string }} empresa
 *   `empleo`, when given, is the employer's known careers portal and is explored instead of `web`.
 * @param {{ session: ReturnType<typeof makeSession>, reclama: (url: string) => string|null }} deps
 */
export async function explorar(empresa, { session, reclama }) {
  const out = { nombre: empresa.nombre, sector: empresa.sector ?? '', web: empresa.web, estado: 'sin-enlace', hallazgos: [], notas: [] };
  let home;
  try { home = new URL(empresa.empleo || empresa.web); } catch { out.estado = 'sin-respuesta'; out.notas.push('URL del sitio no válida'); return out; }

  // A known careers portal on a recognisable host needs no crawling at all.
  if (empresa.empleo) {
    const directo = classify(home.href, { sitio: '', reclama });
    if (directo.tipo !== 'propia' && directo.tipo !== 'externo') {
      out.hallazgos = [{ ...directo, via: 'portal conocido' }];
      out.estado = directo.tipo === 'cubierta' ? 'cubierta' : directo.tipo === 'plataforma' ? 'plataforma' : 'por-verificar';
      return out;
    }
  }

  const robotsRes = await session.get(`${home.origin}/robots.txt`);
  let rules = robotsRes.ok && !/<html/i.test(robotsRes.body.slice(0, 300)) ? parseRobots(robotsRes.body) : [];
  let sitioRobots = home.hostname;
  const permitido = u => {
    const x = new URL(u);
    // robots.txt was read for the employer's own host only; another host is
    // never crawled here, just classified.
    return !sameSite(x.hostname, sitioRobots) ? false : robotsAllows(rules, x.pathname + x.search);
  };

  if (!robotsAllows(rules, home.pathname || '/')) { out.estado = 'robots'; out.notas.push('robots.txt prohíbe la portada'); return out; }

  const portada = await session.get(home.href);
  if (portada.bloqueo) { out.estado = 'bloqueada'; out.notas.push(`portada: HTTP ${portada.status || '—'} con protección anti-bot`); return out; }
  if (!portada.ok) { out.estado = 'sin-respuesta'; out.notas.push(`portada: ${portada.error || 'HTTP ' + portada.status}`); return out; }

  // A redirect to another host of the same organisation (www → apex) keeps the
  // rules only if it is the same site; otherwise we stop crawling there.
  const sitio = new URL(portada.url).hostname;
  if (!sameSite(sitio, home.hostname)) { rules = []; sitioRobots = '∅'; out.notas.push(`la portada redirige a ${sitio}; no se sigue navegando`); }
  const ctx = { sitio, reclama };

  /** @type {Map<string, any>} */
  const hallados = new Map();
  const anotar = (c, via) => { if (c && !hallados.has(c.url)) hallados.set(c.url, { ...c, via }); };
  anotar(firmaDeSistema(portada.body, portada.url), 'la propia página');

  let candidatos = findCareerLinks(portada.body, portada.url).slice(0, 4);

  if (candidatos.length === 0 && hallados.size === 0 && esGobierno(sitio)) {
    const transp = findByText(portada.body, portada.url, RE_TRANSPARENCIA).find(l => permitido(l.url));
    if (transp && !session.agotado) {
      const t = await session.get(transp.url);
      if (t.ok && !t.bloqueo) {
        // The HR section also lists payroll, pensions and statistics; those are not vacancies.
        const rrhh = findByText(t.body, t.url, RE_RRHH).filter(l => !/nomina|jubilac|pension|estadistic/.test(fold(l.texto + ' ' + l.url)));
        const esVacante = l => /vacante/.test(fold(l.texto + ' ' + l.url));
        candidatos = [...rrhh.filter(esVacante), ...rrhh.filter(l => !esVacante(l))].slice(0, 3).map(l => ({ ...l, score: 1 }));
        if (candidatos.length) out.notas.push('enlace hallado en la sección de transparencia');
      }
    }
  }

  // Guessing paths only makes sense on the main site; a known portal is already the careers page.
  if (candidatos.length === 0 && hallados.size === 0 && !empresa.empleo) {
    for (const p of COMMON_PATHS) {
      if (session.requests >= MAX_REQUESTS - 1) break;
      const u = new URL(p, portada.url).href;
      if (!permitido(u)) continue;
      const r = await session.get(u);
      const fin = new URL(r.url);
      const titulo = fold(r.body.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '');
      const noExiste = fin.pathname.split('/').includes('404') || /\b(404|no encontrad[ao]|not found)\b/.test(titulo);
      if (r.ok && !r.bloqueo && !noExiste && sameSite(fin.hostname, sitio) && fin.pathname.length > 1) {
        candidatos = [{ url: r.url, texto: `(ruta común ${p})`, score: 1 }];
        out.notas.push(`sin enlace en portada; existe ${p}`);
        break;
      }
    }
  }
  if (candidatos.length === 0 && hallados.size === 0) {
    // The portal is known and answered, but nothing on it is recognisable:
    // that is a careers portal without a reader, not a missing link.
    if (empresa.empleo) { out.estado = 'portal-externo'; out.hallazgos = [{ tipo: 'externo', url: portada.url, via: 'portal conocido' }]; }
    return out;
  }

  for (const c of candidatos) {
    const cls = classify(c.url, ctx);
    anotar(cls, c.texto || 'portada');
    if (cls.tipo !== 'propia') continue;
    // Own page: open it once and look for where it hands off.
    if (session.agotado || !permitido(c.url)) { if (!permitido(c.url)) out.notas.push(`robots.txt no permite ${new URL(c.url).pathname}`); continue; }
    const page = await session.get(c.url);
    if (page.bloqueo) { out.notas.push(`página de empleo con protección anti-bot: ${c.url}`); hallados.get(cls.url).bloqueada = true; continue; }
    if (!page.ok) continue;
    hallados.get(cls.url).jsonld = (page.body.match(/"@type"\s*:\s*"JobPosting"/g) || []).length;
    anotar(firmaDeSistema(page.body, page.url), `desde ${new URL(c.url).pathname}`);
    for (const l of extractLinks(page.body, page.url)) {
      const inner = classify(l.url, ctx);
      if (inner.tipo === 'sistema' || inner.tipo === 'evaluar') anotar(inner, `desde ${new URL(c.url).pathname}`);
    }
    // One level deeper only when the page itself points at a more specific careers page.
    const mas = findCareerLinks(page.body, page.url).find(x => classify(x.url, ctx).tipo !== 'propia' && !hallados.has(x.url));
    if (mas) anotar(classify(mas.url, ctx), mas.texto);
  }

  const orden = () => [...hallados.values()].sort((a, b) => PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo]);

  // A careers portal on another domain (vacantes.empresa.com, jobs.grupo.com)
  // is often a branded front for a system the scanner reads. Look once: its
  // own robots.txt, then the page, and see where it really lands.
  const ext = orden()[0];
  if (ext?.tipo === 'externo' && session.requests <= MAX_REQUESTS - 2) {
    const eu = new URL(ext.url);
    const rr = await session.get(`${eu.origin}/robots.txt`);
    const extRules = rr.ok && !/<html/i.test(rr.body.slice(0, 300)) ? parseRobots(rr.body) : [];
    if (!robotsAllows(extRules, eu.pathname + eu.search)) {
      ext.robots = true;
      out.notas.push(`robots.txt de ${eu.hostname} no permite leer su portal`);
    } else {
      const page = await session.get(ext.url);
      if (page.bloqueo) { ext.bloqueada = true; out.notas.push(`portal de empleo con protección anti-bot: ${eu.hostname}`); }
      else if (page.ok) {
        ext.jsonld = (page.body.match(/"@type"\s*:\s*"JobPosting"/g) || []).length;
        anotar(firmaDeSistema(page.body, page.url), `portal ${eu.hostname}`);
        const fin = classify(page.url, { sitio: eu.hostname, reclama });
        if (fin.tipo === 'sistema' || fin.tipo === 'evaluar' || fin.tipo === 'plataforma') anotar(fin, `redirige desde ${eu.hostname}`);
        for (const l of extractLinks(page.body, page.url)) {
          const inner = classify(l.url, { sitio: eu.hostname, reclama });
          if (inner.tipo === 'sistema' || inner.tipo === 'evaluar') anotar(inner, `desde ${eu.hostname}`);
        }
      }
    }
  }

  out.hallazgos = orden();
  const mejor = out.hallazgos[0];
  if (!mejor) return out;
  out.estado = mejor.tipo === 'sistema' || mejor.tipo === 'evaluar' ? 'por-verificar'
    : mejor.tipo === 'cubierta' ? 'cubierta'
    : mejor.tipo === 'plataforma' ? 'plataforma'
    : mejor.bloqueada ? 'bloqueada'
    : mejor.robots ? 'robots'
    : mejor.tipo === 'externo' ? 'portal-externo'
    : 'pagina-propia';
  return out;
}

// ── verification against the live source ─────────────────────────────────

/**
 * @param {any} r  Result of explorar() with estado 'por-verificar'.
 * @param {{ providers: Map<string, any>, httpCtx: any, tenants: string[], getJson: (url: string) => Promise<any>, getRobots?: (origin: string) => Promise<string> }} deps
 *   `getRobots` returns a site's robots.txt text ('' when it has none).
 */
export async function verificar(r, { providers, httpCtx, tenants, getJson, getRobots }) {
  const h = r.hallazgos[0];
  try {
    if (h.tipo === 'evaluar') {
      const rows = await getJson(`https://${h.tenant}.evaluar.com/wp-json/wp/v2/job-listings?per_page=100&_fields=id,title`);
      const n = Array.isArray(rows) ? rows.length : 0;
      r.vacantes = n;
      r.muestra = (Array.isArray(rows) ? rows : []).slice(0, 3).map(x => plain(x?.title?.rendered ?? ''));
      r.entrada = { provider: 'rd-boards', board: 'evaluar', tenant: h.tenant };
      if (!tenants.includes(h.tenant)) { r.estado = 'evaluar-nuevo'; r.notas.push(`añadir "${h.tenant}" a TENANTS y a allowedHosts del plugin`); }
      else r.estado = n > 0 ? 'resuelta' : 'tablero-vacio';
      return r;
    }
    const provider = providers.get(h.proveedor);
    if (!provider) throw new Error(`career-ops no tiene el proveedor ${h.proveedor}`);
    const entry = { name: r.nombre, careers_url: h.url, ...(h.explicito ? { provider: h.proveedor } : {}) };

    // Record every URL the provider requests. A provider can fall back to a
    // second endpoint when the first is empty (successfactors: tiles, then
    // /services/…), and a portal's robots.txt may allow one and not the other.
    const pedidas = new Set();
    const espia = { ...httpCtx };
    for (const k of ['fetchText', 'fetchJson', 'fetchResponse']) {
      if (typeof httpCtx[k] === 'function') espia[k] = (url, opts) => { pedidas.add(String(url)); return httpCtx[k](url, opts); };
    }

    const jobs = await provider.fetch(entry, espia);
    const n = Array.isArray(jobs) ? jobs.length : 0;
    r.vacantes = n;
    r.muestra = (jobs || []).slice(0, 3).map(j => j.title);

    const vetadas = [];
    if (getRobots) {
      const reglas = new Map();
      for (const url of pedidas) {
        const u = new URL(url);
        if (!reglas.has(u.origin)) reglas.set(u.origin, parseRobots(await getRobots(u.origin)));
        if (!robotsAllows(reglas.get(u.origin), u.pathname + u.search)) vetadas.push(u.pathname);
      }
    }
    if (vetadas.length) {
      r.estado = 'robots';
      r.notas.push(`el lector ${h.proveedor} necesitó ${[...new Set(vetadas)].join(', ')}, que el robots.txt del portal prohíbe; no se incluye`);
      return r;
    }

    r.entrada = { careers_url: h.url, provider: h.proveedor };
    r.estado = n > 0 ? 'resuelta' : 'tablero-vacio';
  } catch (err) {
    r.estado = 'tablero-vacio';
    r.vacantes = 0;
    r.notas.push(`no se pudo leer (${h.proveedor || 'evaluar'}): ${String(err?.message || err).slice(0, 160)}`);
  }
  return r;
}

// ── CLI ──────────────────────────────────────────────────────────────────

function die(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }

async function loadCareerOps(target) {
  for (const f of ['providers/_registry.mjs', 'providers/_http.mjs', 'discover-ats.mjs', 'node_modules/js-yaml/dist/js-yaml.mjs']) {
    if (!existsSync(join(target, f))) die(`"${target}" no parece una carpeta de career-ops con dependencias instaladas (falta ${f}).`);
  }
  const imp = f => import(pathToFileURL(join(target, f)).href);
  const [registry, http, disc, yaml] = await Promise.all([
    imp('providers/_registry.mjs'), imp('providers/_http.mjs'), imp('discover-ats.mjs'), imp('node_modules/js-yaml/dist/js-yaml.mjs'),
  ]);
  return { registry, http, disc, yaml };
}

function readEmpresas(yaml, file, pairs) {
  const list = [];
  if (file) {
    const doc = yaml.load(readFileSync(file, 'utf8'));
    for (const e of Array.isArray(doc?.empresas) ? doc.empresas : []) {
      if (e?.nombre && e?.web) list.push({ nombre: String(e.nombre), web: String(e.web), sector: e.sector ? String(e.sector) : '', ...(e.empleo ? { empleo: String(e.empleo) } : {}) });
    }
  }
  for (const p of pairs) {
    const i = p.indexOf('=');
    if (i < 1) die(`Empresa mal escrita: "${p}". Formato: "Nombre=https://sitio"`);
    list.push({ nombre: p.slice(0, i).trim(), web: p.slice(i + 1).trim(), sector: '' });
  }
  return list;
}

function snippet(r, disc) {
  if (!r.entrada) return '';
  if (r.entrada.board === 'evaluar') {
    return `\n  - name: ${disc.yamlScalar(r.nombre)}\n    provider: rd-boards\n    board: evaluar\n    tenant: ${r.entrada.tenant}\n    enabled: true\n`;
  }
  return disc.renderPortalEntry({ name: r.nombre, careers_url: r.entrada.careers_url, provider: r.entrada.provider });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Uso: node descubrir.mjs <ruta-career-ops> [--in empresas.yml] ["Nombre=https://sitio" ...] [--write] [--json]');
    process.exit(args.length ? 0 : 1);
  }
  const flag = name => args.includes(name);
  const inIdx = args.indexOf('--in');
  const inFile = inIdx !== -1 ? args[inIdx + 1] : null;
  const positional = args.filter((a, i) => !a.startsWith('--') && !(inIdx !== -1 && i === inIdx + 1));
  const target = resolve(positional[0] ?? '');
  const pairs = positional.slice(1);

  const { registry, http, disc, yaml } = await loadCareerOps(target);
  const empresas = readEmpresas(yaml, inFile, pairs);
  if (empresas.length === 0) die('No hay empresas. Usa --in archivo.yml (clave `empresas:` con `nombre` y `web`) o "Nombre=https://sitio".');

  const providers = await registry.loadProviders(join(target, 'providers'));
  const reclama = url => {
    const hit = registry.resolveProvider({ name: 'descubrir', careers_url: url }, providers, { skipIds: ['local-parser'] });
    return hit && 'provider' in hit ? hit.provider.id : null;
  };
  const httpCtx = http.makeHttpCtx();
  const here = dirname(fileURLToPath(import.meta.url));
  const { TENANTS } = await import(pathToFileURL(join(here, 'plugins', 'rd-boards', '_evaluar.mjs')).href);
  const getJson = async url => {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const getRobots = async origin => {
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const txt = res.ok ? await res.text() : '';
      return /<html/i.test(txt.slice(0, 300)) ? '' : txt;
    } catch { return ''; }
  };

  const quiet = flag('--json');
  const results = [];
  for (const e of empresas) {
    if (!quiet) process.stderr.write(`· ${e.nombre} … `);
    const r = await explorar(e, { session: makeSession(), reclama });
    if (r.estado === 'por-verificar') await verificar(r, { providers, httpCtx, tenants: TENANTS, getJson, getRobots });
    if (!quiet) process.stderr.write(`${r.estado}\n`);
    results.push(r);
  }

  if (quiet) { console.log(JSON.stringify(results, null, 2)); return; }

  const by = estado => results.filter(r => r.estado === estado);
  console.log(`\n${'='.repeat(78)}\n  Detector de empleo RD — ${results.length} empleadores\n${'='.repeat(78)}`);
  for (const estado of Object.keys(ESTADOS)) {
    const rs = by(estado);
    if (!rs.length) continue;
    console.log(`\n${ESTADOS[estado]}  (${rs.length})`);
    for (const r of rs) {
      const h = r.hallazgos[0];
      const donde = h ? (h.proveedor || h.plataforma || (h.tipo === 'evaluar' ? 'evaluar' : '')) : '';
      console.log(`  - ${r.nombre}${donde ? `  [${donde}]` : ''}${r.vacantes != null ? `  ${r.vacantes} vacantes` : ''}`);
      if (h) console.log(`      ${h.url}`);
      if (r.muestra?.length) console.log(`      p. ej.: ${r.muestra.join(' · ')}`);
      for (const n of r.notas) console.log(`      nota: ${n}`);
    }
  }

  const resueltas = by('resuelta');
  if (resueltas.length) {
    console.log(`\n${'-'.repeat(78)}\nEntradas para portals.yml:`);
    for (const r of resueltas) console.log(snippet(r, disc).trimEnd());
    console.log('\n  (las de `provider: rd-boards` van bajo `job_boards:`; las demás bajo `tracked_companies:`)');
  }

  if (flag('--write')) {
    const portalsPath = join(target, 'portals.yml');
    if (!existsSync(portalsPath)) die('No existe portals.yml en esa carpeta. Corre primero install.mjs o la configuración inicial de career-ops.');
    const texto = readFileSync(portalsPath, 'utf8');
    const existentes = yaml.load(texto)?.tracked_companies ?? [];
    const matches = resueltas.filter(r => r.entrada.careers_url).map(r => ({ name: r.nombre, careers_url: r.entrada.careers_url, provider: r.entrada.provider }));
    const { fresh, duplicates } = disc.dedupeAgainstPortals(matches, Array.isArray(existentes) ? existentes : []);
    if (fresh.length) {
      const siguiente = disc.insertIntoTrackedCompanies(texto, fresh.map(m => disc.renderPortalEntry(m)));
      yaml.load(siguiente); // must still parse before it is written
      writeFileSync(portalsPath + '.bak', texto);
      writeFileSync(portalsPath, siguiente);
    }
    console.log(`\n✓ portals.yml: ${fresh.length} añadidas a tracked_companies, ${duplicates.length} ya estaban.`);
    const ev = resueltas.filter(r => r.entrada.board === 'evaluar');
    if (ev.length) console.log(`  Evaluar (${ev.map(r => r.nombre).join(', ')}): ya vienen en el bloque de busca-empleo-rd; corre install.mjs para tenerlas.`);
  } else if (resueltas.length) {
    console.log('\n(vista previa: no se escribió nada. Añade --write para guardar las de tracked_companies)');
  }
  console.log('');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => die(err?.stack || String(err)));
}
