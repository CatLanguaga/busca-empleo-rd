// Usage log, cost, daily cap and the in-memory cache: no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { costOf, recordUsage, spentToday, overBudget, readUsage, dayOf } from '../usage.mjs';
import { TtlCache, sha256 } from '../cache.mjs';
import { chatJson } from '../llm.mjs';

const tmpFile = () => path.join(mkdtempSync(path.join(tmpdir(), 'busca-usage-')), 'usage.jsonl');

test('cost uses input, cached input and output prices', () => {
  // 1M miss in at $0.30 + 1M out at $1.20; cached input at $0.006.
  assert.equal(costOf({ prompt_tokens: 1e6, completion_tokens: 1e6 }).toFixed(2), '1.50');
  assert.equal(costOf({ prompt_tokens: 1e6, prompt_cache_hit_tokens: 1e6 }).toFixed(3), '0.006');
});

test('recordUsage appends one line per call, counted once in today\'s total', () => {
  const file = tmpFile();
  writeFileSync(file, JSON.stringify({ dia: dayOf(), tipo: 'cv', costo: 0.5 }) + '\n' + JSON.stringify({ dia: '2000-01-01', tipo: 'cv', costo: 9 }) + '\n');
  recordUsage('ranking', { prompt_tokens: 1000, completion_tokens: 500, completion_tokens_details: { reasoning_tokens: 0 } }, file);
  const lines = readUsage(file);
  assert.equal(lines.length, 3);
  assert.deepEqual(Object.keys(lines[2]).sort(), ['cache', 'costo', 'dia', 'entrada', 'fecha', 'razonamiento', 'salida', 'tipo']);
  assert.equal(spentToday(file).toFixed(4), (0.5 + lines[2].costo).toFixed(4));
});

test('daily cap blocks once today\'s spending reaches it', () => {
  const file = tmpFile();
  const before = process.env.DAILY_BUDGET_USD;
  process.env.DAILY_BUDGET_USD = '0.001';
  try {
    assert.equal(overBudget(file), false);
    recordUsage('cv', { prompt_tokens: 1000, completion_tokens: 1000 }, file); // $0.0015
    assert.equal(overBudget(file), true);
    process.env.DAILY_BUDGET_USD = '0';
    assert.equal(overBudget(file), false, '0 means no cap');
  } finally {
    if (before === undefined) delete process.env.DAILY_BUDGET_USD; else process.env.DAILY_BUDGET_USD = before;
  }
});

test('chatJson turns reasoning off and logs usage, never the prompt text', async () => {
  const file = tmpFile();
  const saved = { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, BUSCA_USAGE: process.env.BUSCA_USAGE };
  Object.assign(process.env, { DEEPSEEK_API_KEY: 'test', BUSCA_USAGE: file });
  let body;
  const fakeFetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  };
  try {
    assert.deepEqual(await chatJson({ system: 's', user: 'DATO-PRIVADO-DEL-CV', tipo: 'cv' }, fakeFetch), { ok: true });
    assert.deepEqual(body.thinking, { type: 'disabled' });
    const log = readFileSync(file, 'utf8');
    assert.match(log, /"tipo":"cv"/);
    assert.doesNotMatch(log, /DATO-PRIVADO/);
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test('TtlCache expires entries and evicts the oldest past max', () => {
  let now = 0;
  const c = new TtlCache({ ttlMs: 100, max: 2, now: () => now });
  c.set('a', 1); c.set('b', 2); c.set('c', 3);
  assert.equal(c.get('a'), undefined, 'oldest evicted');
  assert.equal(c.get('b'), 2);
  now = 100;
  assert.equal(c.get('c'), undefined, 'expired');
  assert.equal(sha256('x').length, 64);
});
