// @ts-check
// Listing store. One SQLite file, filled by scan.mjs and read by the matcher.
// Stores only what the page shows: title, employer, location, source and link.
// No descriptions, and never anything from a CV.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS listings (
  id         INTEGER PRIMARY KEY,
  url        TEXT NOT NULL UNIQUE,
  source     TEXT NOT NULL,
  title      TEXT NOT NULL,
  company    TEXT NOT NULL DEFAULT '',
  location   TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  closed_at  INTEGER
);
CREATE INDEX IF NOT EXISTS listings_open ON listings (closed_at, source);
`;

/**
 * @typedef {{ title: string, url: string, company?: string, location?: string }} Job
 * @typedef {{ id: number, url: string, source: string, title: string, company: string,
 *   location: string, first_seen: number, last_seen: number, closed_at: number|null }} Listing
 */

/** @param {string} file  A path, or ':memory:' for tests. */
export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

/**
 * Save what one source returned. After a complete read, also mark as closed
 * that source's open rows the read did not return. After a read with errors
 * pass `close: false`: a partial read would close live offers.
 * @param {DatabaseSync} db
 * @param {string} source
 * @param {Job[]} jobs
 * @param {number} now  epoch ms
 * @param {{ close?: boolean }} [opts]
 * @returns {{ added: number, updated: number, closed: number }}
 */
export function saveSource(db, source, jobs, now, { close: closeMissing = true } = {}) {
  const find = db.prepare('SELECT id FROM listings WHERE url = ?');
  const insert = db.prepare(
    `INSERT INTO listings (url, source, title, company, location, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE listings SET source = ?, title = ?, company = ?, location = ?, last_seen = ?, closed_at = NULL
     WHERE url = ?`,
  );
  const close = db.prepare(
    'UPDATE listings SET closed_at = ? WHERE source = ? AND closed_at IS NULL AND last_seen < ?',
  );

  let added = 0;
  let updated = 0;
  db.exec('BEGIN');
  try {
    for (const job of jobs) {
      const row = [job.title, job.company ?? '', job.location ?? ''];
      if (find.get(job.url)) {
        update.run(source, ...row, now, job.url);
        updated++;
      } else {
        insert.run(job.url, source, ...row, now, now);
        added++;
      }
    }
    const closed = closeMissing ? Number(close.run(now, source, now).changes) : 0;
    db.exec('COMMIT');
    return { added, updated, closed };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * @param {DatabaseSync} db
 * @returns {Listing[]}
 */
export function openListings(db) {
  return /** @type {Listing[]} */ (/** @type {unknown} */ (
    db.prepare('SELECT * FROM listings WHERE closed_at IS NULL ORDER BY first_seen DESC').all()
  ));
}

/**
 * Open rows per source, and when each source was last read.
 * @param {DatabaseSync} db
 */
export function summary(db) {
  return db.prepare(
    `SELECT source, SUM(closed_at IS NULL) AS open, COUNT(*) AS total, MAX(last_seen) AS last_seen
     FROM listings GROUP BY source ORDER BY source`,
  ).all();
}
