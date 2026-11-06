// Listing store and scheduled scan, with fake boards: no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, saveSource, openListings } from '../db.mjs';
import { runScan, defaultSources } from '../scan.mjs';
import { COMPUTRABAJO_KEYWORDS } from '../keywords.mjs';

const job = (n, extra = {}) => ({ title: `Puesto ${n}`, url: `https://example.do/oferta/${n}`, company: 'Empresa X', location: 'Santo Domingo', ...extra });

test('a second save updates rows instead of duplicating them', () => {
  const db = openDb(':memory:');
  saveSource(db, 'A', [job(1), job(2)], 1000);
  const r = saveSource(db, 'A', [job(1), job(2, { title: 'Puesto 2 editado' })], 2000);
  assert.deepEqual(r, { added: 0, updated: 2, closed: 0 });
  const rows = openListings(db);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(x => x.url.endsWith('/2')).title, 'Puesto 2 editado');
  assert.equal(rows[0].first_seen, 1000);
});

test('rows missing from a complete read are closed, and reopen if they come back', () => {
  const db = openDb(':memory:');
  saveSource(db, 'A', [job(1), job(2)], 1000);
  saveSource(db, 'B', [job(9)], 1000);
  assert.equal(saveSource(db, 'A', [job(1)], 2000).closed, 1);
  assert.deepEqual(openListings(db).map(r => r.url).sort(), [job(1).url, job(9).url]);
  saveSource(db, 'A', [job(1), job(2)], 3000);
  assert.equal(openListings(db).length, 3);
});

test('a partial read closes nothing', () => {
  const db = openDb(':memory:');
  saveSource(db, 'A', [job(1), job(2)], 1000);
  assert.equal(saveSource(db, 'A', [job(3)], 2000, { close: false }).closed, 0);
  assert.equal(openListings(db).length, 3);
});

test('runScan keeps rows of a source whose read failed', async () => {
  const db = openDb(':memory:');
  let fail = false;
  const boards = {
    ok: { fetchBoard: async () => [job(1)] },
    flaky: { fetchBoard: async () => { if (fail) throw new Error('HTTP 429'); return [job(5), job(6)]; } },
  };
  const sources = { Ok: [{ board: 'ok' }], Flaky: [{ board: 'flaky' }, { board: 'ok' }] };
  await runScan(db, { sources, boards, now: 1000 });
  fail = true;
  const report = await runScan(db, { sources, boards, now: 2000 });
  const flaky = report.find(r => r.source === 'Flaky');
  assert.equal(flaky.closed, 0);
  assert.match(flaky.errors[0], /429/);
  assert.equal(openListings(db).length, 3);
});

test('makeIo-backed scan throws on HTTP errors rather than listing nothing', async () => {
  const db = openDb(':memory:');
  const fetchImpl = async () => new Response('no', { status: 403 });
  const boards = { b: { fetchBoard: async (_e, io) => [await io.get('https://example.do/')].map(() => job(1)) } };
  const [r] = await runScan(db, { sources: { B: [{ board: 'b' }] }, boards, fetchImpl });
  assert.match(r.errors[0], /HTTP 403/);
});

test('default sources split Computrabajo keywords into entries of at most 8', () => {
  const ct = defaultSources()['Computrabajo RD'];
  assert.ok(ct.every(e => e.queries.length <= 8));
  assert.deepEqual(ct.flatMap(e => e.queries), COMPUTRABAJO_KEYWORDS);
});
