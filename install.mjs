#!/usr/bin/env node
// busca-empleo-rd installer — adds the Dominican Republic layer to an existing
// career-ops folder.
//
//   node install.mjs <ruta-a-career-ops> [--dry-run]
//
// What it writes, all in career-ops' user layer (never auto-updated upstream):
//   plugins.local/rd-boards/   copied from plugins/rd-boards/ (replaced whole)
//   modes/_custom.md           a marked block with the RD house rules
//   portals.yml                two marked blocks: sources inside `job_boards:`,
//                              employers inside `tracked_companies:`
//
// It never touches cv.md, config/profile.yml, or anything outside its own
// marked blocks. Re-running replaces those blocks in place.

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ID = 'rd-boards';

const MD_START = '<!-- busca-empleo-rd:inicio (bloque gestionado por install.mjs; edita fuera de las marcas) -->';
const MD_END = '<!-- busca-empleo-rd:fin -->';
const YML_START = '# busca-empleo-rd:inicio (bloque gestionado por install.mjs; edita fuera de las marcas)';
const YML_END = '# busca-empleo-rd:fin';
// Second block, for employers read by a system career-ops supports natively.
const EMPRESAS = {
  key: 'tracked_companies',
  start: '# busca-empleo-rd:empresas:inicio (bloque gestionado por install.mjs; edita fuera de las marcas)',
  end: '# busca-empleo-rd:empresas:fin',
};

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/** Line ending used by a file, so a block is written in the file's own style. */
function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Replace the marked block if present, otherwise append it.
 * @returns {string}
 */
export function upsertMarkdownBlock(content, body) {
  const eol = eolOf(content);
  const block = [MD_START, '', body.trim(), '', MD_END].join('\n').replace(/\r?\n/g, eol);
  const start = content.indexOf(MD_START);
  const end = content.indexOf(MD_END);
  if (start !== -1 && end > start) {
    return content.slice(0, start) + block + content.slice(end + MD_END.length);
  }
  if (start !== -1 || end !== -1) throw new Error('modes/_custom.md tiene una marca busca-empleo-rd sin su pareja; arréglalo a mano');
  return content.replace(/\s*$/, '') + eol + eol + block + eol;
}

/**
 * Insert (or replace) the marked list items under a top-level list key
 * (`job_boards:` by default), matching the indentation the file already uses
 * for that list. Each block has its own pair of marks, so two blocks can live
 * in one file.
 * @param {string} content
 * @param {string} itemsYaml
 * @param {{ key?: string, start?: string, end?: string }} [opts]
 * @returns {string}
 */
export function upsertYamlBlock(content, itemsYaml, { key: keyName = 'job_boards', start = YML_START, end = YML_END } = {}) {
  const eol = eolOf(content);
  let lines = content.split(/\r?\n/);

  const s = lines.findIndex(l => l.trim() === start);
  const e = lines.findIndex(l => l.trim() === end);
  if ((s === -1) !== (e === -1) || (s !== -1 && e < s)) {
    throw new Error('portals.yml tiene una marca busca-empleo-rd sin su pareja; arréglalo a mano');
  }
  if (s !== -1) lines.splice(s, e - s + 1);

  let key = lines.findIndex(l => l.startsWith(`${keyName}:`) && /^(#.*)?$/.test(l.slice(keyName.length + 1).trim()));
  if (key === -1) {
    if (lines.some(l => l.startsWith(`${keyName}:`))) {
      throw new Error(`portals.yml tiene \`${keyName}:\` en una forma que no sé editar (¿lista en una línea?); añade las entradas a mano desde la carpeta overlay/`);
    }
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', `${keyName}:`);
    key = lines.length - 1;
  }

  // Indentation of the list's existing items; two spaces when the list is empty.
  let indent = '  ';
  for (let i = key + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i]) && !lines[i].startsWith('#') && !lines[i].startsWith('-')) break; // next top-level key
    const m = lines[i].match(/^(\s*)- /);
    if (m) { indent = m[1]; break; }
  }

  const items = itemsYaml.split(/\r?\n/)
    .filter((l, i, all) => !(l.trim() === '' && (i === 0 || i === all.length - 1)))
    .map(l => (l.trim() === '' ? '' : indent + l));
  const block = [indent + start, ...items, indent + end];
  lines.splice(key + 1, 0, ...block);
  return lines.join(eol);
}

/** Entries only: drop the overlay file's leading comment header. */
function overlayItems(text) {
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex(l => l.startsWith('- '));
  return lines.slice(first === -1 ? 0 : first).join('\n');
}

async function validateYaml(target, text, expectedCompanies = []) {
  let yaml;
  try {
    yaml = await import(pathToFileURL(join(target, 'node_modules', 'js-yaml', 'dist', 'js-yaml.mjs')).href);
  } catch {
    return { checked: false };
  }
  const load = yaml.load || yaml.default?.load;
  const doc = load(text);
  const boards = Array.isArray(doc?.job_boards) ? doc.job_boards : [];
  const ours = boards.filter(b => b?.provider === PLUGIN_ID).length;
  if (ours === 0) throw new Error('tras editar, portals.yml no contiene entradas rd-boards dentro de job_boards');
  const tracked = Array.isArray(doc?.tracked_companies) ? doc.tracked_companies : [];
  for (const name of expectedCompanies) {
    if (!tracked.some(c => c?.name === name)) throw new Error(`tras editar, portals.yml no contiene "${name}" dentro de tracked_companies`);
  }
  return { checked: true, ours, empresas: expectedCompanies.length };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const targetArg = args.find(a => !a.startsWith('--'));
  if (!targetArg || args.includes('--help') || args.includes('-h')) {
    console.log('Uso: node install.mjs <ruta-a-career-ops> [--dry-run]');
    process.exit(targetArg ? 0 : 1);
  }
  const target = resolve(targetArg);

  for (const f of ['AGENTS.md', 'plugins.mjs', 'scan.mjs', 'modes/_custom.template.md', 'templates/portals.example.yml']) {
    if (!existsSync(join(target, f))) {
      die(`"${target}" no parece una carpeta de career-ops (falta ${f}).\n  Créala primero:  npx @santifer/career-ops init career-ops`);
    }
  }

  const plan = [];

  // 1. Plugin
  const pluginSrc = join(HERE, 'plugins', PLUGIN_ID);
  const pluginDst = join(target, 'plugins.local', PLUGIN_ID);
  plan.push(`${existsSync(pluginDst) ? 'reemplazar' : 'crear'}  plugins.local/${PLUGIN_ID}/`);

  // 2. modes/_custom.md
  const customPath = join(target, 'modes', '_custom.md');
  const customExisted = existsSync(customPath);
  const customBase = readFileSync(customExisted ? customPath : join(target, 'modes', '_custom.template.md'), 'utf8');
  const customNext = upsertMarkdownBlock(customBase, readFileSync(join(HERE, 'overlay', 'custom.rd.md'), 'utf8'));
  plan.push(`${customExisted ? (customBase.includes(MD_START) ? 'actualizar bloque en' : 'añadir bloque a') : 'crear desde plantilla'}  modes/_custom.md`);

  // 3. portals.yml
  const portalsPath = join(target, 'portals.yml');
  const portalsExisted = existsSync(portalsPath);
  const portalsBase = readFileSync(portalsExisted ? portalsPath : join(target, 'templates', 'portals.example.yml'), 'utf8');
  const empresasItems = overlayItems(readFileSync(join(HERE, 'overlay', 'empresas.rd.yml'), 'utf8'));
  const empresasNames = [...empresasItems.matchAll(/^- name: "?([^"\n]+?)"?\s*$/gm)].map(m => m[1]);
  const portalsNext = upsertYamlBlock(
    upsertYamlBlock(portalsBase, overlayItems(readFileSync(join(HERE, 'overlay', 'portals.rd.yml'), 'utf8'))),
    empresasItems,
    EMPRESAS,
  );
  const check = await validateYaml(target, portalsNext, empresasNames);
  plan.push(`${portalsExisted ? (portalsBase.includes(YML_START) ? 'actualizar bloques en' : 'añadir bloques a') : 'crear desde plantilla'}  portals.yml` +
    (check.checked ? `  (YAML válido: ${check.ours} fuentes rd-boards, ${check.empresas} empresas)` : '  (YAML sin validar: falta npm install en career-ops)'));

  console.log(`\nbusca-empleo-rd → ${target}${dryRun ? '   [--dry-run: no se escribe nada]' : ''}\n`);
  for (const p of plan) console.log(`  • ${p}`);

  if (dryRun) { console.log(''); return; }

  if (existsSync(pluginDst)) rmSync(pluginDst, { recursive: true, force: true });
  cpSync(pluginSrc, pluginDst, { recursive: true });
  if (customExisted && customNext !== customBase) copyFileSync(customPath, customPath + '.bak');
  writeFileSync(customPath, customNext);
  if (portalsExisted && portalsNext !== portalsBase) copyFileSync(portalsPath, portalsPath + '.bak');
  writeFileSync(portalsPath, portalsNext);

  console.log(`
✓ Instalado.

Siguientes pasos, dentro de ${target}:
  1. node plugins.mjs enable ${PLUGIN_ID}             (lee qué permisos pide)
     node plugins.mjs enable ${PLUGIN_ID} --confirm   (actívalo)
  2. Abre portals.yml, busca "Computrabajo RD", escribe tus roles en \`queries\` y pon enabled: true
${portalsExisted ? '' : '     portals.yml se creó desde la plantilla de career-ops: trae empresas y filtros de ejemplo\n     de su autor. Pídele al agente que los ajuste a tus roles antes de escanear.\n'}  3. node doctor.mjs
  4. node scan.mjs --dry-run                         (vista previa de ofertas)

Si ya tenías el plugin activado y esta es una actualización:
     node plugins.mjs trust ${PLUGIN_ID}
`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => die(err?.message || String(err)));
}
