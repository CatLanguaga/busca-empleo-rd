// @ts-check
// rd-boards — a career-ops plugin that reads Dominican Republic job boards.
//
// One provider, several boards: a portals.yml entry picks the board with
// `board:`. Runs inside `node scan.mjs`, so career-ops' own title filter,
// de-duplication and scan history apply to everything returned here.
//
//   - name: Computrabajo RD
//     provider: rd-boards
//     board: computrabajo
//     queries: ["contabilidad", "analista"]
//
// Every board module documents the robots.txt rules it was checked against and
// builds only allowed paths. docs/FUENTES.md in the busca-empleo-rd repo is the
// record of what was checked and of the boards that were evaluated and left
// out.

import * as computrabajo from './_computrabajo.mjs';
import * as tecoloco from './_tecoloco.mjs';
import * as diarioempleo from './_diarioempleo.mjs';
import * as rdtrabaja from './_rdtrabaja.mjs';
import * as evaluar from './_evaluar.mjs';
import * as concursa from './_concursa.mjs';
import * as unika from './_unika.mjs';

export const BOARDS = { computrabajo, tecoloco, diarioempleo, rdtrabaja, evaluar, concursa, unika };

const PACE_MS = 750;
const REQUEST_TIMEOUT_MS = 15_000;
// Hard cap per portals.yml entry, whatever its queries/max_pages multiply to.
const MAX_REQUESTS_PER_ENTRY = 20;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; busca-empleo-rd/0.1; career-ops rd-boards plugin; personal job search)',
  'Accept-Language': 'es-DO,es;q=0.9,en;q=0.5',
};

/** @param {number} ms */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Paced, capped access to the engine's guarded fetch. All egress goes through
 * ctx so the manifest's allowedHosts is enforced.
 * @param {any} ctx
 */
function makeIo(ctx) {
  let requests = 0;
  async function paced() {
    if (requests >= MAX_REQUESTS_PER_ENTRY) {
      throw new Error(`request cap reached (${MAX_REQUESTS_PER_ENTRY} per entry) — lower queries/categories/max_pages`);
    }
    if (requests > 0) await sleep(PACE_MS);
    requests++;
  }
  return {
    /** @param {string} url */
    async get(url) {
      await paced();
      return ctx.fetchText(url, { headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml' }, timeoutMs: REQUEST_TIMEOUT_MS });
    },
    /** @param {string} url */
    async getJson(url) {
      await paced();
      return ctx.fetchJson(url, { headers: { ...HEADERS, Accept: 'application/json' }, timeoutMs: REQUEST_TIMEOUT_MS });
    },
  };
}

export default {
  provider: {
    id: 'rd-boards',

    /**
     * Written as a property, not method shorthand: career-ops' plugin audit
     * reads the shorthand form as a direct call to the global fetch.
     * @param {Record<string, any>} entry  The portals.yml entry.
     * @param {any} ctx
     */
    fetch: async (entry, ctx) => {
      const key = typeof entry?.board === 'string' ? entry.board.trim().toLowerCase() : '';
      const board = BOARDS[/** @type {keyof typeof BOARDS} */ (key)];
      if (!board) {
        throw new Error(`rd-boards: entry "${entry?.name ?? '?'}" needs \`board:\` set to one of ${Object.keys(BOARDS).join(', ')}`);
      }

      // A failed request throws: a blocked or rate-limited board must surface
      // as an error, never as a board that happens to list nothing. No retry —
      // a 429 means slow down.
      const found = await board.fetchBoard(entry, makeIo(ctx));

      const seen = new Set();
      const jobs = [];
      for (const job of found) {
        const dedupKey = ctx.normalizePostingUrl?.(job.url) || job.url;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        jobs.push(job);
      }
      return jobs;
    },
  },
};
