// Pure-function tests for install.mjs: the two block editors must be additive,
// idempotent, and leave everything outside their marks byte-identical.
import assert from 'node:assert';
import { upsertMarkdownBlock, upsertYamlBlock } from '../install.mjs';

// ── Markdown block ───────────────────────────────────────────────────────
const md = '# Custom\n\n## House Rules\n\nmi regla\n';
const md1 = upsertMarkdownBlock(md, 'REGLAS v1');
assert(md1.startsWith(md.trimEnd()), 'existing content is kept ahead of the block');
assert(md1.includes('REGLAS v1'));
assert.strictEqual(upsertMarkdownBlock(md1, 'REGLAS v1'), md1, 'idempotent');

const md2 = upsertMarkdownBlock(md1 + '\n## Después\n\notra regla\n', 'REGLAS v2');
assert(!md2.includes('REGLAS v1') && md2.includes('REGLAS v2'), 'block is replaced in place');
assert(md2.includes('mi regla') && md2.includes('otra regla'), 'content on both sides survives');
assert(md2.indexOf('REGLAS v2') < md2.indexOf('## Después'), 'block keeps its position');
assert.strictEqual((md2.match(/busca-empleo-rd:inicio/g) || []).length, 1);

assert.throws(() => upsertMarkdownBlock('x\n<!-- busca-empleo-rd:fin -->\n', 'y'), /sin su pareja/);

const crlf = upsertMarkdownBlock('a\r\nb\r\n', 'uno\ndos');
assert(!/[^\r]\n/.test(crlf), 'a CRLF file stays CRLF');

// ── YAML block ───────────────────────────────────────────────────────────
const ITEMS = '- name: Bolsa A\n  provider: rd-boards\n  board: tecoloco\n\n- name: Bolsa B\n  provider: rd-boards\n  board: diarioempleo\n';

// Two-space list, job_boards last.
const y1src = 'title_filter:\n  positive: ["x"]\n\njob_boards:\n  - name: Otra\n    provider: remoteok\n';
const y1 = upsertYamlBlock(y1src, ITEMS);
assert(y1.includes('job_boards:\n  # busca-empleo-rd:inicio'), 'block goes right under the key, at the list indent');
assert(y1.includes('\n  - name: Bolsa A\n    provider: rd-boards\n'));
assert(y1.includes('  - name: Otra\n    provider: remoteok'), 'existing entries survive');
assert.strictEqual(upsertYamlBlock(y1, ITEMS), y1, 'idempotent');

// Zero-indent list, with another top-level key after it.
const y2 = upsertYamlBlock('job_boards:\n- name: Otra\n  provider: remoteok\ntracked_companies:\n- name: Acme\n', ITEMS);
assert(y2.includes('job_boards:\n# busca-empleo-rd:inicio'));
assert(y2.includes('\n- name: Bolsa A\n  provider: rd-boards\n'), 'matches a zero-indent list');
assert(y2.indexOf('# busca-empleo-rd:fin') < y2.indexOf('tracked_companies:'), 'stays inside job_boards');

// No job_boards key at all.
const y3 = upsertYamlBlock('title_filter:\n  positive: []\n', ITEMS);
assert(/\njob_boards:\n  # busca-empleo-rd:inicio/.test(y3));
assert(y3.startsWith('title_filter:\n  positive: []\n'));

// Replacing a block removes the old entries.
const y4 = upsertYamlBlock(y1, '- name: Solo Una\n  provider: rd-boards\n  board: rdtrabaja\n');
assert(!y4.includes('Bolsa A') && y4.includes('Solo Una') && y4.includes('name: Otra'));

assert.throws(() => upsertYamlBlock('job_boards:\n  # busca-empleo-rd:inicio (bloque gestionado por install.mjs; edita fuera de las marcas)\n', ITEMS), /sin su pareja/);
assert.throws(() => upsertYamlBlock('job_boards: []\n', ITEMS), /no sé editar/);

// A second block under another key, with its own marks, coexists with the first.
const EMP = { key: 'tracked_companies', start: '# busca-empleo-rd:empresas:inicio (x)', end: '# busca-empleo-rd:empresas:fin' };
const y5src = 'tracked_companies:\n  - name: Acme\n    careers_url: https://acme.example/jobs\n\njob_boards:\n  - name: Otra\n    provider: remoteok\n';
const y5 = upsertYamlBlock(upsertYamlBlock(y5src, ITEMS), '- name: Banco Ejemplo\n  careers_url: https://empleos.ejemplo.com/\n', EMP);
assert(y5.includes('tracked_companies:\n  # busca-empleo-rd:empresas:inicio (x)\n  - name: Banco Ejemplo\n'));
assert(y5.indexOf('# busca-empleo-rd:empresas:fin') < y5.indexOf('job_boards:'), 'employers stay inside tracked_companies');
assert(y5.includes('job_boards:\n  # busca-empleo-rd:inicio') && y5.includes('- name: Acme') && y5.includes('- name: Otra'));
assert.strictEqual(upsertYamlBlock(upsertYamlBlock(y5, ITEMS), '- name: Banco Ejemplo\n  careers_url: https://empleos.ejemplo.com/\n', EMP), y5, 'both blocks idempotent');

console.log('✓ install ok');
