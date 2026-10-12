// @ts-check
// Small HTML text helpers shared by the board parsers. The listing markup of
// these boards is shallow, so regex over card chunks is enough and keeps the
// plugin dependency-free.

/** @param {number} cp */
function numericEntity(cp) {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
}

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  iexcl: '¡', iquest: '¿',
};

/** @param {string} text */
export function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in NAMED ? NAMED[/** @type {keyof typeof NAMED} */ (name)] : m));
}

/**
 * Strip tags, decode entities, collapse whitespace.
 * @param {string|undefined|null} html
 */
export function text(html) {
  if (!html) return '';
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Lowercase, accent-free, hyphenated slug for a search path segment.
 * @param {string} s
 */
export function slugify(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Clamp a user-supplied positive integer.
 * @param {unknown} v
 * @param {number} fallback
 * @param {number} max
 */
export function boundedInt(v, fallback, max) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

/**
 * Non-empty trimmed strings from a config value that should be a list.
 * @param {unknown} v
 * @param {number} max
 * @returns {string[]}
 */
export function stringList(v, max) {
  const raw = Array.isArray(v) ? v : v == null ? [] : [v];
  return raw.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, max);
}
