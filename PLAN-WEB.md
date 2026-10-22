# Plan: a web page for busca-empleo-rd

Written 2026-10-13. Status: idea, nothing built.

## Goal

A page where a person uploads their CV and gets a ranked list of current job offers in the Dominican Republic, each with a link to where it is published.

The page finds offers. It does not apply to anything; the person opens the link and applies themselves.

## What exists today

| Piece | Where | Reusable as is |
|---|---|---|
| Readers for Computrabajo RD, Tecoloco RD, DiarioEmpleo, RD Trabaja, Concursa, Evaluar, Unika | `plugins/rd-boards/_*.mjs` | Yes. Each is a plain fetch-and-parse module with no dependency on career-ops. |
| Employer registry and portal detector | `data/empresas-rd.yml`, `descubrir.mjs` | Yes, for the list of employers. |
| Readers for employer portals (SuccessFactors, Oracle Cloud, Teamtailor) | career-ops, not this repo | No. They belong to career-ops and would need to be called from it or rewritten. |
| Reading a CV and turning it into search terms | Nowhere | No. In the test runs this was done by hand. |
| Ranking offers by fit | Nowhere | No. The scanner only filters by title. |

## What has to be built

### 1. CV reader

- Accept a PDF upload and extract its text.
- One LLM call turns the text into a profile: target roles, level, skills, languages, city, and the keywords to search with.
- Show the profile to the person so they can correct it before searching.

### 2. Listing store

- A scheduled job reads every source every few hours and saves the rows in a database.
- An upload is matched against the saved rows. It never starts a live scan.
- This keeps the load on each board the same as it is now, no matter how many people use the page.
- Rows that disappear from a source are marked closed.

Computrabajo is the exception: it is read by keyword, not as a full listing. The scheduled job needs a fixed list of keywords covering the common professions, and that list decides what the page can find there.

### 3. Matcher

- First step: title filter built from the profile keywords, same logic the scanner uses today.
- Second step: one LLM call ranks the rows that pass and writes a one-line reason for each.
- Output: a short list of offers worth opening, then the rest.

The second step is needed. In the test runs the title filter alone returned about 56 matches per CV, of which about 13 were worth opening.

### 4. The page

- Upload, profile review, results list. Three screens.
- Each result: title, employer (or "not published"), location, source, reason, link.
- Spanish first.

### 5. Server

A static page is not enough: the boards do not accept cross-site requests from a browser, and the LLM key has to stay on the server.

Smallest shape that works:

- One Node server that imports the board modules.
- SQLite for the listings.
- A scheduled task for the scan.
- A per-visitor rate limit on uploads.

## Open questions to settle before launch

These are not coding problems and each can stop the project.

1. **Terms of use of each board.** The `robots.txt` checks in `docs/FUENTES.md` cover reading the listings. Showing them on a public service is a different question, and the terms of each board have not been read for it. To do: read the terms of all seven sources; drop any that forbid it.
2. **How much of a listing to show.** Safest is title, employer, location and a link to the source, with no copied description.
3. **Personal data.** A CV is personal data, and Dominican law 172-13 on personal data protection applies. Simplest design: process the CV in memory, store nothing, and say so on the page. Storing CVs or profiles would need consent and a privacy notice. Worth a check with someone who knows the law.
4. **LinkedIn.** Out. Its terms forbid automated access. The local `linkedin-jobs` plugin stays a personal tool and is not part of this.
5. **Cost.** Two LLM calls per upload plus hosting. Small per use, but open to abuse without a rate limit.
6. **Who answers for it.** A public page needs a contact and a way for a board or employer to ask to be removed.

## Limits that carry over from the scanner

- No salary in most rows.
- RD Trabaja and Unika do not name the employer.
- Unika publishes groups of openings by area, not individual jobs.
- RD Trabaja has no page per job; the link opens the portal.
- Claro, Altice and employers on the classic SuccessFactors portal cannot be read.

## Steps

| Step | What | Done when |
|---|---|---|
| 0 | Read the terms of use of the seven sources | Each source is marked allowed or dropped, with the clause quoted |
| 1 | Listing store: scheduled scan into SQLite, using the existing board modules | A scan fills the database and a second scan updates it without duplicates |
| 2 | CV reader: PDF to profile | The two test CVs (a junior developer and a junior frontend developer) produce profiles close to the ones written by hand |
| 3 | Matcher: filter, then LLM ranking | For both test CVs, the offers judged best by hand appear in the first ten |
| 4 | Page: upload, review, results | Works end to end on a local machine |
| 5 | Rate limit, privacy notice, removal contact | Written and visible on the page |
| 6 | Hosting and public launch | Only after steps 0 and 5 |

Steps 1 to 4 make a local prototype and can be done without settling the open questions. Step 6 cannot.

## Decisions needed from Omar

- Same repo or a new one for the page.
- Which LLM and who pays for it.
- Whether the page stays a free community tool or something else; this changes how the terms of the boards apply.
