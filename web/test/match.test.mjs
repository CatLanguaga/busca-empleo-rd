// CV profile and matcher, with a fake model: no network, no API key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByTitle, mergeRanking, match, fold, compactRows, compactProfile } from '../match.mjs';
import { normalizeProfile, profileFromText, looksLikePdf } from '../cv.mjs';
import { parseJsonReply } from '../llm.mjs';

let nextId = 1;
const row = (title, first_seen = 0) => ({ id: nextId++, title, company: 'Empresa', location: 'Santo Domingo', source: 'Tecoloco RD', url: `https://example.do/${nextId}`, first_seen });

const profile = normalizeProfile({
  roles: ['Desarrollador Frontend'],
  nivel: 'junior',
  keywords_incluir: ['desarrollador', 'programador', 'frontend', 'react'],
  keywords_excluir: ['senior', 'gerente'],
});

test('fold drops accents and punctuation', () => {
  assert.equal(fold('Técnico/a de Diseño, C#'), ' tecnico a de diseno c# ');
});

test('title filter: word-start matching, exclusions, best matches first', () => {
  const rows = [
    row('Desarrollador Frontend React', 1),
    row('Programador Junior', 2),
    row('Desarrollador Senior Java', 3),
    row('Cocinera típica', 4),
    row('Gerente de Programación', 5),
    row('Analista de Reactivos', 6), // "react" starts "reactivos": a known loose match
  ];
  const out = filterByTitle(rows, profile).map(r => r.title);
  assert.equal(out[0], 'Desarrollador Frontend React');
  assert.ok(out.includes('Programador Junior'));
  assert.ok(!out.includes('Desarrollador Senior Java'));
  assert.ok(!out.includes('Cocinera típica'));
  assert.ok(!out.includes('Gerente de Programación'));
});

test('multi-word keywords need every word', () => {
  const p = normalizeProfile({ keywords_incluir: ['analista datos'] });
  const out = filterByTitle([row('Analista de Datos'), row('Analista de Crédito')], p).map(r => r.title);
  assert.deepEqual(out, ['Analista de Datos']);
});

test('role head nouns catch titles that miss every multi-word keyword', () => {
  const p = normalizeProfile({
    roles: ['Desarrollador Frontend Junior', 'Técnico de Soporte', 'Asistente Contable'],
    keywords_incluir: ['desarrollador frontend', 'desarrollador web'],
    keywords_excluir: ['senior'],
  });
  const rows = [row('Desarrollador Frontend', 1), row('Desarrollador de software', 2), row('Técnico de mantenimiento', 3), row('Asistente de ventas', 4), row('Desarrollador Senior', 5)];
  assert.deepEqual(filterByTitle(rows, p).map(r => r.title), ['Desarrollador Frontend', 'Desarrollador de software']);
});

test('mergeRanking reads 1-based rows, ignores unknown and repeated ones, clamps scores, keeps unranked rows', () => {
  const c = [row('A'), row('B'), row('C')];
  const out = mergeRanking(c, { r: [
    [2, 140, 'encaja'],
    [99, 90, 'inventada'],
    [0, 90, 'fuera de rango'],
    [2, 10, 'repetida'],
    { n: 1, score: 'x' },
  ] });
  assert.deepEqual(out.map(r => [r.title, r.score]), [['B', 100], ['A', 0], ['C', null]]);
  assert.equal(out[0].razon, 'encaja');
});

test('compact rows and profile carry only what the ranking needs', () => {
  const rows = compactRows([{ title: 'Dev | React\nJr', company: 'Empresa', location: 'Santo Domingo' }]);
  assert.equal(rows, '1|Dev React Jr|Empresa|Santo Domingo');
  const p = compactProfile(normalizeProfile({ roles: ['Dev'], skills: Array.from({ length: 10 }, (_, i) => `s${i}`), keywords_incluir: ['dev'] }));
  assert.match(p, /Habilidades: s0, s1, s2, s3, s4, s5, s6, s7$/m);
  assert.doesNotMatch(p, /keywords|dev,/i);
});

test('match splits top results from the rest, with rows the model left out last', async () => {
  const rows = [row('Desarrollador Frontend'), row('Programador PHP'), row('Desarrollador React'), row('Programador Java')];
  let sent;
  // The filter reorders candidates, so find each title's number in the prompt.
  const scores = { 'Desarrollador Frontend': 92, 'Programador PHP': 55, 'Desarrollador React': 75 };
  const fakeChat = async req => {
    sent = req;
    const r = [];
    for (const line of req.user.split('\n')) {
      const [n, title] = line.split('|');
      if (title in scores) r.push([Number(n), scores[title], 'razón']);
    }
    return { r };
  };
  const r = await match(rows, profile, fakeChat);
  assert.equal(r.candidatas, 4);
  assert.deepEqual(r.destacadas.map(x => x.score), [92, 75]);
  assert.deepEqual(r.resto.map(x => [x.title, x.score]), [['Programador PHP', 55], ['Programador Java', null]]);
  assert.ok(sent.maxTokens <= 1200);
  assert.doesNotMatch(sent.user, /"titulo"|\{/);
});

test('match skips the model for three candidates or fewer', async () => {
  const rows = [row('Desarrollador Frontend'), row('Programador PHP')];
  const r = await match(rows, profile, async () => { throw new Error('should not be called'); });
  assert.deepEqual(r.destacadas.map(x => x.title), ['Desarrollador Frontend', 'Programador PHP']);
});

test('match makes no model call when nothing passes the filter', async () => {
  const r = await match([row('Cocinero')], profile, async () => { throw new Error('should not be called'); });
  assert.deepEqual(r, { destacadas: [], resto: [], candidatas: 0 });
});

test('normalizeProfile bounds and cleans whatever it gets', () => {
  const p = normalizeProfile({ roles: ['a', 'A', 5, '', ...Array(10).fill('x').map((x, i) => x + i)], nivel: 'jefe', extra: 'drop me' });
  assert.equal(p.roles.length, 5);
  assert.equal(p.roles[0], 'a');
  assert.equal(p.nivel, 'junior');
  assert.ok(!('extra' in p));
  assert.deepEqual(normalizeProfile(null).keywords_incluir, []);
});

test('profileFromText rejects an empty profile and frames the CV as data', async () => {
  let sent;
  const chat = async req => { sent = req; return { roles: [] }; };
  await assert.rejects(profileFromText('texto del cv', chat), /no se pudo/);
  assert.match(sent.user, /^<cv>\ntexto del cv\n<\/cv>$/);
});

test('parseJsonReply accepts a fenced object and rejects arrays', () => {
  assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonReply('[1]'));
});

test('looksLikePdf checks the magic bytes', () => {
  assert.ok(looksLikePdf(new TextEncoder().encode('%PDF-1.7 ...')));
  assert.ok(!looksLikePdf(new TextEncoder().encode('<html>')));
});
