// @ts-check
// Local prototype server. No framework: node:http, node:sqlite and the board
// readers already in this repo.
//
//   node web/server.mjs                 serve on 127.0.0.1:3000
//   node web/server.mjs --scan-every=6  also rescan every 6 hours
//
// Needs DEEPSEEK_API_KEY, in the environment or in web/.env.
//
// Routes:
//   GET  /            the page
//   POST /api/cv      body: the PDF bytes → { profile }
//   POST /api/match   body: { profile } as JSON → { destacadas, resto, candidatas }
//   GET  /api/status  rows per source and last read

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, openListings, summary } from './db.mjs';
import { runScan, DEFAULT_DB } from './scan.mjs';
import { MAX_PDF_BYTES, looksLikePdf, pdfToText, profileFromText, normalizeProfile } from './cv.mjs';
import { match } from './match.mjs';
import { llmConfigured } from './llm.mjs';
import { onUsage, formatEntry, overBudget, dailyBudget } from './usage.mjs';
import { TtlCache, sha256 } from './cache.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// Local secrets (DEEPSEEK_API_KEY) live in web/.env, which git ignores.
// Variables already set in the environment win.
if (existsSync(path.join(here, '.env'))) process.loadEnvFile(path.join(here, '.env'));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_JSON_BYTES = 20_000;
const HOUR = 60 * 60 * 1000;
// Per visitor (IP), per hour. Each call costs one model request.
const LIMITS = { cv: 5, match: 20 };

const db = openDb(DEFAULT_DB);
const page = readFileSync(path.join(here, 'public', 'index.html'));

// The same PDF, or the same profile against the same scan, is answered from
// memory for an hour instead of paying the model again. Keys are hashes; the
// PDF itself is never kept.
/** @type {TtlCache<import('./cv.mjs').Profile>} */
const profileCache = new TtlCache({ ttlMs: HOUR, max: 200 });
/** @type {TtlCache<any>} */
const matchCache = new TtlCache({ ttlMs: HOUR, max: 200 });
const lastScan = () => Number(/** @type {any} */ (db.prepare('SELECT MAX(last_seen) AS v FROM listings').get())?.v) || 0;

onUsage(e => console.log(`[llm] ${formatEntry(e)}`));
const BUDGET_MSG = 'Se alcanzó el límite de uso de hoy. Vuelve mañana.';

/** @type {Map<string, number[]>} */
const hitsByKey = new Map();

/** @param {string} key @param {number} max */
function allow(key, max) {
  const now = Date.now();
  const recent = (hitsByKey.get(key) ?? []).filter(t => now - t < HOUR);
  if (recent.length >= max) {
    hitsByKey.set(key, recent);
    return false;
  }
  recent.push(now);
  hitsByKey.set(key, recent);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hitsByKey) if (v.every(t => now - t >= HOUR)) hitsByKey.delete(k);
}, HOUR).unref();

/**
 * @param {http.IncomingMessage} req
 * @param {number} limit
 * @returns {Promise<Buffer>}
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('archivo demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** @param {http.ServerResponse} res @param {number} status @param {unknown} body */
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** Only fields the page shows; never anything else from the row. @param {any} r */
const publicRow = r => ({
  title: r.title, company: r.company, location: r.location, source: r.source, url: r.url,
  score: r.score, razon: r.razon,
});

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? '?';
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      });
      return res.end(page);
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      return json(res, 200, { llm: llmConfigured(), sources: summary(db) });
    }

    if (req.method === 'POST' && url.pathname === '/api/cv') {
      if (!llmConfigured()) return json(res, 503, { error: 'El servidor no tiene configurada la clave del modelo.' });
      if (!allow(`cv:${ip}`, LIMITS.cv)) return json(res, 429, { error: 'Demasiados CV en la última hora. Intenta más tarde.' });
      const bytes = await readBody(req, MAX_PDF_BYTES);
      if (!looksLikePdf(bytes)) return json(res, 400, { error: 'El archivo no es un PDF.' });
      const key = sha256(bytes);
      const cached = profileCache.get(key);
      if (cached) return json(res, 200, { profile: cached });
      if (overBudget()) return json(res, 503, { error: BUDGET_MSG });
      const text = await pdfToText(bytes);
      if (text.length < 200) {
        return json(res, 422, { error: 'No se pudo leer texto en este PDF. Si es una imagen escaneada, exporta el CV como PDF con texto.' });
      }
      const profile = await profileFromText(text);
      profileCache.set(key, profile);
      return json(res, 200, { profile });
    }

    if (req.method === 'POST' && url.pathname === '/api/match') {
      if (!llmConfigured()) return json(res, 503, { error: 'El servidor no tiene configurada la clave del modelo.' });
      if (!allow(`match:${ip}`, LIMITS.match)) return json(res, 429, { error: 'Demasiadas búsquedas en la última hora. Intenta más tarde.' });
      const body = JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8') || '{}');
      const profile = normalizeProfile(body.profile);
      if (!profile.keywords_incluir.length && !profile.roles.length) {
        return json(res, 400, { error: 'Pon al menos un puesto o una palabra clave.' });
      }
      const key = sha256(JSON.stringify(profile) + lastScan());
      const cached = matchCache.get(key);
      if (cached) return json(res, 200, cached);
      if (overBudget()) return json(res, 503, { error: BUDGET_MSG });
      const result = await match(openListings(db), profile);
      const out = {
        candidatas: result.candidatas,
        destacadas: result.destacadas.map(publicRow),
        resto: result.resto.map(publicRow),
      };
      matchCache.set(key, out);
      return json(res, 200, out);
    }

    json(res, 404, { error: 'No encontrado' });
  } catch (err) {
    const status = /** @type {any} */ (err)?.status ?? (err instanceof SyntaxError ? 400 : 500);
    // Log the error, never the request body: it may be a CV.
    console.error(`${req.method} ${url.pathname} → ${status}: ${err instanceof Error ? err.message : err}`);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'Algo falló en el servidor. Intenta de nuevo.' : String(/** @type {any} */ (err).message) });
  }
});

const scanHours = Number(process.argv.find(a => a.startsWith('--scan-every='))?.slice(13));
if (scanHours > 0) {
  let running = false;
  const scan = async () => {
    if (running) return;
    running = true;
    try {
      await runScan(db, { log: m => console.log(`[scan] ${m}`) });
    } catch (err) {
      console.error('[scan] falló:', err);
    } finally {
      running = false;
    }
  };
  setInterval(scan, scanHours * HOUR);
  if (!openListings(db).length) scan();
}

server.listen(PORT, HOST, () => {
  const open = openListings(db).length;
  console.log(`busca-empleo-rd web en http://${HOST}:${PORT} — ${open} ofertas abiertas en la base`);
  if (!open) console.log('La base está vacía: corre `node web/scan.mjs` o arranca con --scan-every=6.');
  if (!llmConfigured()) console.log('Falta DEEPSEEK_API_KEY: subir CV no funcionará.');
  console.log(dailyBudget() > 0 ? `Tope de gasto diario: $${dailyBudget()} (DAILY_BUDGET_USD)` : 'Sin tope de gasto diario (DAILY_BUDGET_USD=0)');
});
