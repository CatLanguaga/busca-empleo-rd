// @ts-check
// Small in-memory cache so the same CV or the same search is not paid for
// twice. Keys are SHA-256 hashes; values never touch the disk and are gone
// when the process stops.

import { createHash } from 'node:crypto';

/** @param {string | Uint8Array} data */
export const sha256 = data => createHash('sha256').update(data).digest('hex');

/** @template V */
export class TtlCache {
  /** @param {{ ttlMs: number, max: number, now?: () => number }} opts */
  constructor({ ttlMs, max, now = Date.now }) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.now = now;
    /** @type {Map<string, { value: V, expires: number }>} */
    this.map = new Map();
  }

  /** @param {string} key @returns {V | undefined} */
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  /** @param {string} key @param {V} value */
  set(key, value) {
    this.map.delete(key);
    // Map keeps insertion order: the first key is the oldest.
    while (this.map.size >= this.max) this.map.delete(/** @type {string} */ (this.map.keys().next().value));
    this.map.set(key, { value, expires: this.now() + this.ttlMs });
  }
}
