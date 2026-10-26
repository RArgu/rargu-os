# 012: Insider check on stored Polymarket markets (nightly collection, visitor requests)

**Status:** Approved 2026-10-26 (was Critiqued) 2026-10-26 (Codex: 15 findings, 14 accepted, 1 partly) · **Owner approval:** 2026-10-26 ·
**Gates needed:** G-net (Worker `/api/insider/*`, Gamma lookups for visitor requests; pictures copied, not
hot-linked), G-deploy, Ask-first (D1 database, push token and IP-hash secrets, Python dependencies on the spare PC)
**Related:** 006 (simulated insider demo, replaced here), 010 R9 (same-origin check), 011 (crawler live: owns
`worker/index.ts` and the `Limits` object; R15 event form; R20 shared Mac), 013 (Try/Read tabs, R10 `tool:stage`,
R11 `tool:status`, R18 case studies), OWNER_QUESTIONS 2026-10-22 ("run the Polymarket check on any market by ID"),
[research.md](research.md), [critique](../../review/spec-012-critique-codex.md) (15, 14 accepted, 1 partly),
`content/projects/polymarket-insider-trading.md`.

## Why

The owner wants the insider window to show the real check. The owner chose a stored model (2026-10-26): the spare PC
collects the full history of a fixed set of markets overnight and pushes the results. Visitors browse the stored
markets. A visitor can ask for a new market. It joins a queue and is ready after a later nightly run. The window
names wallets as "insider candidates" with full identity, and says on every list that this is not proof.

## Assumptions

1. The Goldsky subgraph that the original used is deprecated (429 `ENDPOINT_DEPRECATED`). Data API v1 is retired
   from 2026-10-24. **Observed** (research §2, §3). The PC uses Data API v2 and CLOB only.
2. v2 `/v2/trades?condition=` returns the full history of a market, newest first, 1,000 rows per page. For "Maduro
   out by January 31, 2026?" (Gamma `916440`) it returned 9,367 taker trades (26,329 rows with maker rows) from
   2025-12-12 to 2026-01-03, the whole market life, in 27 pages and 38 s. **Observed** 2026-10-26.
3. v2 rows have no maker/taker field and no fill id. With `taker_only=true`, 1,000 rows had 1,000 different
   transaction hashes. With `taker_only=false`, one transaction held two rows with the same wallet, token, side,
   size, price and time. **Observed** 2026-10-26 (research §15). So the role comes from comparing the two streams, and
   rows must not be deduplicated by content.
4. The PC has no subrequest or CPU limit and a home IP of its own, so full history and GDELT (1 call per 5 s) fit
   in a nightly run. **Derived.**
5. The Worker on Cloudflare Free only reads and writes D1, counts in 011's `Limits` object and makes at most 2 Gamma
   calls per visitor request. That fits the Free limits (research §9). **Derived.** Push CPU under 10 ms is
   **Unverified** (T-task benchmark, R11).
6. The original random forest was never saved and learned its own label rule. The score is a transparent points
   rule. **Observed** (research §1, §7); owner answer 2026-10-26.
7. Static assets are free and unlimited and do not use Worker requests. Over the daily limit, `run_worker_first`
   paths answer 429. **Documented** ([docs](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)),
   not tested; 011 assumption 4 treats the same point as inferred. R17 covers every failure either way.

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | Stored markets: the Try tab lists the stored, published markets (question, open or closed, "as of" date, number of candidates, "partial" when partial). The start set is the 6 markets of the original project (research §10), seeded by the owner (not through the queue). The first view shows "Maduro out by January 31, 2026?" (Gamma `916440`). Previous / Next buttons and a menu move through the list. | [Prop] | e2e | G-net |
| R2 | Short view in the window: price chart with the sharp moves marked, the top 3 insider candidates of the selected move, the "as of" date, the disclaimer (R12) and "Open full result". The full result (all moves, all candidates, every score factor, news timeline, coverage notes, method) shows in the 013 expanded view. Tabs are Try and Read (013); Try opens first, on Maduro. The tool mounts in 013's `.try-area` (no iframe) and follows its size with `ResizeObserver`. 013's case studies load when the Origin section scrolls into view (013 R18; no button), not when the window opens. | [Prop] | e2e | — |
| R3 | Request a market: one field takes a Polymarket URL (`/event/<slug>` or `/event/<slug>/<market-slug>`), a Gamma market id or a condition id. The Worker parses the input itself and calls only fixed Gamma endpoints (`/markets/{id}`, `/markets?slug=&closed=true`, `/markets?condition_ids=`, `/events?slug=`); it never fetches a URL the visitor gives. Input that does not parse is refused with no Gamma call. An event with many markets answers its market list and a signed choice token (10 min); the visitor's pick uses that token and makes no new lookup. A stored market answers "Already stored" and opens it. | [Prop] | unit + e2e | G-net |
| R4 | Request limits, all checked before any Gamma call: (a) the attempt counts against the IP (3 per day) and the site lookup budget (300 Gamma lookups per day) in 011's `Limits` object, keyed by HMAC-SHA-256 of the client IP (`CF-Connecting-IP`) with a Worker secret; counters older than 2 days are deleted by an alarm. Every attempt that reaches Gamma counts, also when it is rejected; the event pick does not count again. (b) The market must exist and have volume ≥ $100,000. (c) Admission is one D1 statement that inserts only when queued < 20 and stored + queued < 50; a duplicate adds to `request_count`. A full queue answers "The queue is full. Try again tomorrow."; a full store "The list is full." Requests are accepted automatically within these limits (owner, round 2). | [Prop] | unit | — |
| R5 | Request status: the answer and `GET /api/insider/status?market=<id>` give `queued` (position and "estimated ready after <date>", an estimate), `collecting`, `partial` (published, still collecting), `ready`, `failed` (plain reason) or `rejected` (plain reason). The window keeps the visitor's own request ids in `localStorage` (try/catch; works without it) and checks their status when the Try tab opens, not on a timer. | [Prop] | unit + e2e | — |
| R6 | Nightly run order (PC, from 03:00 owner time, research §11): (1) `GET /api/insider/queue` (token): queue, markets to refresh, removals; (2) markets with `collection = partial`, oldest first; (3) open markets, refresh; (4) closed markets that resolved since their last run, one final run; (5) new requests, at most 5, oldest first. Each step runs only while time remains before 04:50. A closed market stays eligible until `collection = complete`; then it is frozen (only removals change it). A market still partial after 7 nights is published as `partial` with its coverage and leaves the run order. | [Prop] | unit + manual | Ask-first |
| R7 | Collection (PC): Gamma metadata; CLOB `/prices-history` for both tokens in 15-day chunks at fidelity 5; v2 `/v2/trades` twice, `taker_only=true` (taker stream) and `taker_only=false` (all legs), each with the filters repeated on every cursor page. Every row keeps its page and row index; rows are never deduplicated by content. A row of the all-legs stream is a taker row when it matches an unused taker row of the same transaction (all fields equal), else a maker row. A refresh reads pages until it passes the newest stored second, deletes the stored rows of that second, and inserts all rows of that second again. HTTP: 30 s timeout, 3 tries with 2/4/8 s waits, then the market stops as partial. Raw data stays on the PC (DuckDB file, `memory_limit = '600MB'`, `threads = 2`, each page written before the next is read; < 800 MB RSS). No Spark. | [Prop] | unit (captured fixtures) | — |
| R8 | Sharp moves: the math contract in research §13 (port of `detect.ipynb:67-71,466-483,724-727`): taker rows only, UTC 5-min buckets, VWAP in dollars, 20 previous non-empty buckets, sample std, z > 3, volume ≥ $100, both tokens, merge within 1 h, keep 10, fixed ties. | [Prop] | unit (fixture) | — |
| R9 | Candidates: research §13 (port of `trace.ipynb`): per move, per wallet, net buys of the token that moved up in [move − 24 h, move), from all legs (BUY of that token and SELL of the other token count as buying it; the opposite counts as selling). Keep net ≥ $500. Leave out a wallet whose net is < 20 % of its gross in the window (likely market maker). | [Prop] | unit (fixture) | — |
| R10 | Points score 0–100, each factor shown with its points (populations and times in research §13): bet size percentile (≥ 95th 20, ≥ 80th 12, else 5); hours before the move (≤ 1 h 15, ≤ 6 h 10, ≤ 24 h 5); dollar-weighted entry price (≤ 0.20 15, ≤ 0.40 10, ≤ 0.60 5); share of net pre-move buying (≥ 25 % 15, ≥ 10 % 10, ≥ 5 % 5); moves bet on in this market (≥ 3: 15, 2: 10); bet before the news-rise day (10); wallet age, first `TRADE` activity ≤ 7 days before the bet (10) or ≤ 30 days (5). A factor without data (GDELT failed, activity failed) gets 0 points and shows "no data"; the result shows a coverage note. "Insider candidate" at score ≥ 40, at most 10 per move; ties by net $, then address. | [Prop] | unit (fixture) | — |
| R11 | Push (token in a Worker secret and on the PC only): `POST /api/insider/push` takes one market's result, ≤ 600 KB, `schema_version` 1. The Worker checks the token, the size and the full nested schema (research §14: types, lengths, array limits, finite numbers, `0x` + 40 hex addresses, `https:` links only) before any write. It then writes in one D1 batch (one call, ≤ 6 statements, far under the 50 queries per call): the result row, the market's wallet index, the `insider_list` row, and deletes images no market uses. `POST /api/insider/push-image` takes one WebP ≤ 8 KB per request (≤ 1 statement). Wrong token: 401. Bad body: 400 and no write. If the 10 ms CPU limit fails in the T-task benchmark at 600 KB, the result is pushed in 3 parts (summary, moves, candidates), each validated alone, published by a last call that flips `published_version`. | [Prop] | unit + benchmark | Ask-first |
| R12 | Identity and wording (owner answer 2026-10-26): each candidate shows the Polymarket profile picture (R20), the full wallet address, the Polymarket username (if any), a link to `https://polymarket.com/profile/<address>` built from the validated address, the label "Insider candidate", the score and its factors. Next to every candidate list: "Insider candidates are wallets whose public trades match a pattern before a sharp price move. This is not proof. Nobody here is accused of insider trading." Every upstream string (username, question, headline) is set as text, never as HTML. Credit (owner rule 2026-10-26: teammates by GitHub username only, no full names): "With [shwetanshu07](https://github.com/shwetanshu07), CS-GY 6513, Spring 2026", and a link to the original repo. No public text (site, write-up, link previews) names the spare computer's model. | [Prop] | unit + e2e | — |
| R13 | Removal: every full result has "Ask for a removal or correction" (`mailto:` to the site's public email, market id and wallet in the subject). The owner runs `jobs/insider/remove.sh <wallet>` or `<market>`. It calls `POST /api/insider/remove` (token), which, in one D1 batch, adds the wallet to the block list, hides every market in the wallet index that lists it, and deletes the wallet's images. Hidden markets answer 404 and leave `insider_list` at once. The next run (or a manual run for one market) pushes the market without the wallet and unhides it. If the wallet is also in 013's case studies, the owner removes it from `content/projects/insider-case-studies.json` and deploys (013 R19, G-deploy each time). Browsers can keep a copy for up to 5 min (results, case-study JSON) or 1 day (pictures); copies already downloaded, saved or captured cannot be recalled. | [Prop] | unit + manual | — |
| R14 | No indexing: `/api/*` answers `X-Robots-Tag: noindex`. Results are only in API answers, never in the static HTML, the page title or link previews. No wallet search, no wallet page, no ranking across markets. This lowers, but does not stop, the chance that a search engine shows a rendered name. | [Prop] | unit + e2e | — |
| R15 | Read path: `GET /api/insider/markets` reads the one `insider_list` row; `GET /api/insider/result?market=<id>` reads one result row; both return stored text without parsing. `Cache-Control: public, max-age=300` (a browser cache: every new visitor still reaches the Worker). Request budget with 011 in research §9. | [Prop] | unit | — |
| R16 | The page makes only same-origin requests plus the 010 R9 beacon (and Turnstile if 011 adds it). The PC never takes a request from the site. | [Prop] | e2e + live | G-net |
| R17 | Fallback: on any `/api/insider/*` failure (non-2xx, timeout 8 s, network error), the window loads `/insider/fallback.json` (a static file, not imported into JS, ≤ 60 KB; 012 adds its `X-Robots-Tag: noindex` line to `public/_headers`, a file 011 owns) with the Maduro chart, moves and counts but no wallet, and says "Live list not available now. Candidates not shown." The 006 simulated demo is removed; the 001 R22 JS/CSS budget passes. | [Prop] | e2e | — |
| R18 | Events in 013's contract (013 R10, R11; 013 owns it): when a stored result draws its parts in order, the tool sends `tool:stage` on its window node `{ stage, state: "start" \| "done" \| "error", mode: "replay", at: <ms> }` for `stage` in `market`, `prices`, `moves`, `candidates`, `news`, `score`, then `{ stage: null, mode: "replay", at }` at the end of the draw. `tool:status` `{ lastRun, nextRun, waiting, at }` from `GET /api/insider/status` (the PC posts `POST /api/insider/job` with start, end and summary). 013 keeps the latest event on the window, so the tool does not send events again when Read opens. Reduced motion draws all parts at once and sends each stage once, then `null`. | [Prop] | e2e | — |
| R19 | Layout and access: window short view at its sheet size, full view at 390 px and ≥ 760 px. Addresses wrap (`overflow-wrap: anywhere`), monospace. Moves are a keyboard list (arrow keys select, Enter opens). The request field has a label; errors are linked with `aria-describedby`; status changes are announced once (`aria-live="polite"`). Lists scroll inside a bounded area. Keeps 006 R7–R10 (chart summary text, native buttons, Enter and Space do not drag). The 006 tests R2, R3 and R11 are replaced by this spec's tests. | [Prop] | e2e | — |
| R20 | Pictures are copied, never hot-linked. The PC downloads a candidate's `profile_image` only when it is `https:` with host exactly `polymarket-upload.s3.us-east-2.amazonaws.com`, with redirects off, a 10 s limit and a 2 MB streamed limit. It accepts PNG, JPEG, GIF or WebP up to 4,096 × 4,096 px (Pillow `MAX_IMAGE_PIXELS` = 16.8 M, bomb warnings are errors), takes the first frame, resizes to 64 × 64, re-encodes as WebP with no metadata (≤ 8 KB), and pushes it (R11). The Worker serves it at `/api/insider/img/<sha256>.webp` with `Cache-Control: public, max-age=86400`. No picture, a failed check or a blocked wallet: a placeholder (first letter of the username on a palette color). `alt` = "Profile picture of <username>". | [Prop] | unit + e2e | — |
| R21 | Shared Mac (011 R20, adopted; 011 owns the schedule): times are the Mac's local time, and the Worker uses `OWNER_TZ` (011 R20) (the job checks at start that the Mac's zone equals it). At 03:00 the job writes `~/.rargu/llm-busy.lock` with its PID, start time and expiry (05:00), then runs `ollama stop <model>`. It never waits for a crawl. It starts no new work after 04:50, pushes what it has, and deletes the lock (`try/finally`). A separate `launchd` watchdog at 04:55 kills the job's whole process group and clears a stale lock (011 R20). 011's proxy refuses the judge 02:55–05:00 regardless, and outside that window ignores a lock whose PID is dead or whose expiry has passed (011 R20). A memory pause ("critical" `memory_pressure`) lasts at most 10 min, then the market stops as partial. A start outside 03:00–04:50 (late wake) exits at once. < 800 MB RSS. | [Prop] | unit + manual | — |
| R22 | Report-case check (owner answer, round 3 and reconciliation): before the eval, a script resolves each report wallet to one full address in the stored data. Wallets, markets and expected result: the DOJ-charged soldier wallet (prefix `0x31a56e9E61eD21De0`), Maduro `916440`, report §4.1, expected listed; Vivaldi007 (`0x5ed3…b19e`), US strikes Iran `1198423`, §4.2, expected listed; `0x1caa6a7ad0c6916…46a0`, US strikes Iran `1198423`, §4.3, expected listed; the market maker `0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e`, markets `916440`, `1198423`, `1180303`, §4.4, expected not listed. No match or more than one match: `unresolved`, never a guess. The eval runs the rule (24 h look-back, unchanged) on the 5 resolved start markets and writes `report-wallets.json`, `report-cases.md` and `report-cases.json` to `~/.rargu/insider-eval/` on the Mac (private: never in git, never deployed). Each row has the full address, market ids, expected result, actual result (resolved, listed, score, factors) and pass/fail; the file has the rule version, the data date and the verdict. Verdict "flags" = at least 2 of the 3 expected wallets are listed and the market maker is not. With "flags", 013 publishes all rows; otherwise 013 leaves them out. The file always states the entry-time gaps in the report: Vivaldi007 about 115 h and `0x1caa6a…` about 37 h before their spikes, both longer than 24 h. It is a check of selected examples, not an accuracy figure. | [Prop] | manual (eval run) | — |

### Acceptance

- **R3.a** Given `https://polymarket.com/event/maduro-out-in-2025`, then the answer lists the event's markets and a
  choice token; the pick makes no Gamma call. Given `916440`, then "Already stored". Given `javascript:alert(1)` or
  `https://evil.example/x`, then a refusal and no Gamma call (Gamma stubbed and counted).
- **R4.a** Given 4 attempts from one IP in a day, then the 4th answers 429 with a plain message and makes no Gamma
  call; rejected attempts count. Given 30 parallel requests for different markets with 18 queued, then exactly 2 are
  admitted. Given the same market twice, then one row with `request_count` 2. Given volume $50,000, then `rejected`.
- **R5.a** Given 7 queued markets and 5 per night, then market 7 says "estimated ready after" the second night.
- **R6.a** Given a closed market with `collection = partial`, then the next run collects it before new requests;
  after 7 partial nights it is published as partial and leaves the order.
- **R7.a** Given captured v2 pages (fixture) with two identical rows in one transaction, maker rows, both tokens and
  equal timestamps, then both identical rows are kept, roles match the taker stream, and a refresh that meets the
  newest stored second gives the same row multiset as a full read.
- **R8.a** Given the research §13 fixtures (two planted jumps; a down move of Yes; sparse data; no move), then the
  moves, times and z values equal the expected values exactly.
- **R9.a** Given a fixture wallet that buys $10,000 Yes and sells $9,000 Yes before a move, then it is left out.
- **R10.a** Given fixture wallets, then each factor's points and totals equal the expected values; given GDELT 429
  and a failed activity call, then those factors show "no data" with 0 points and the coverage note shows.
- **R11.a** Given a wrong token, then 401; given 700 KB, a nested type error, a `javascript:` link or an unknown
  `schema_version`, then 400; in each case D1 is unchanged. Given a push cut off mid-way (part mode), then the old
  version stays published.
- **R11.b** Given the largest allowed push on the Free plan, then the measured Worker CPU is recorded; if > 10 ms,
  part mode is on.
- **R12.a** Given a username `<img src=x onerror=alert(1)>`, then it shows as text and no script runs.
- **R13.a** Given caches warmed for a market and its pictures and the Mac offline, when `remove.sh <wallet>` runs,
  then `markets` no longer lists the market, `result` answers 404, the wallet's image route answers 404, and the
  wallet is in the block list.
- **R14.a** Given the built HTML, then no wallet address appears in it; `/api/*` answers have `X-Robots-Tag: noindex`.
- **R17.a** Given `/api/insider/markets` answers 429, 500, a timeout or a network error, then the window shows the
  fallback chart without wallets and the "not available" line; the 001 R22 budget passes.
- **R18.a** Given a stored result drawn, then `tool:stage` events arrive in order with `start`/`done`,
  `mode: "replay"` and `at`, and end with `{ stage: null }`; `tool:status` has `lastRun`, `nextRun`, `waiting` and
  `at`.
- **R19.a** At the window size and at 390 px, with zero candidates, 10 candidates, a 42-character address and a long
  username: no text overflows; arrow keys move between moves; Expand/Restore keeps the selection; a hidden tab stops
  drawing; fast switching between markets shows only the last market.
- **R20.a** Given picture URLs on another host, `http:`, a redirect, a 3 MB file, a 10,000 × 10,000 px PNG and a
  broken file, then each gets the placeholder and the job stays under 800 MB RSS. Given a valid picture, then the
  page requests only `/api/insider/img/<sha256>.webp`.
- **R21.a** Given a first-night run of the 6 start markets on the Mac, then peak RSS < 800 MB (`/usr/bin/time -l`),
  the run ends before 04:50, the lock holds the PID during the run and is gone after, and `ollama ps` shows no
  model during the run. Given a hung request, a forced `kill -9`, a stale lock and a late wake, then the 04:55
  process-group kill or the start check leaves no lock after 05:00.
- **R22.a** Given the first-night data, then the three files exist in `~/.rargu/insider-eval/` (not in the repo),
  with one row per report wallet (full address, market ids, expected, actual, pass/fail), also when a wallet is
  `unresolved`; the verdict follows the 2-of-3 rule; the 115 h and 37 h gaps are stated.
- **R11.c (release check)** Before deploy, record measured Worker CPU per route, subrequests per route and D1
  queries per call for the largest push, a removal and a read; each is under the Free limits (10 ms, 50, 50).

## Approach

- **Worker:** 011 owns `worker/index.ts`, the router, the `Limits` Durable Object, `wrangler.jsonc` bindings and
  `public/_headers` (owner, reconciliation round). 012 depends on 011's infra task and adds its own lines: routes,
  bindings, secrets and the fallback's `noindex` header. 012 adds `worker/insider/` (`markets.ts`, `result.ts`, `request.ts`, `status.ts`,
  `queue.ts`, `push.ts`, `remove.ts`, `img.ts`, `schema.ts`), a D1 binding `INSIDER_DB`, and two secrets
  (`INSIDER_PUSH_TOKEN`, `IP_HASH_KEY` if 011 does not already have one). No analysis code in the Worker.
- **D1 (`rargu-insider`, 012 only; 011 stores no results):**
  - `insider_markets(market_id PK, condition_id, slug, question, closed, end_date, as_of, collection, published_version, hidden, featured, result TEXT, schema_version)`
  - `insider_list(id = 1, json TEXT)`: the list for `/markets`, rewritten in the same batch as each push or removal
  - `insider_market_wallets(market_id, wallet, PK(market_id, wallet))`: for removals
  - `insider_requests(market_id PK, condition_id, question, volume, first_at, request_count, state, reason)`
  - `insider_images(sha256 PK, wallet, webp BLOB)` and `insider_blocklist(wallet PK, added_at, note)`
  - `insider_job(id = 1, last_start, last_end, summary)`
- **PC job (Python 3.12, in the repo at `jobs/insider/`, no secrets in git):** 2018 MacBook Pro (Intel, 8 GB, macOS
  Sequoia at most). DuckDB for raw rows and the R8–R10 SQL, Pillow for pictures, `requests` for HTTP.
  Dependencies: `duckdb`, `requests`, `Pillow` (Ask-first). A `launchd` agent starts the job at 03:00 and kills its process
  group at 04:55 (watchdog, 011 R20). `pmset repeat wakeorpoweron MTWRFSU 02:55:00` wakes the Mac. A log and a one-line summary per market.
- **Front end:** `src/sheet/demos/insider.ts` reads `/api/insider/*`; the chart code from 006 draws real data.
  `scripts/` copies the fallback JSON (R17) from a reviewed file; it holds no wallet.
- **Rejected:** cold checks on the Worker (owner chose stored markets; Free has 50 subrequests and 10 ms CPU).
  Browser-only calls to Polymarket (new third-party origins). The PC behind a Tunnel for the insider check (it only
  pushes). Data API v1 (retired). Goldsky subgraph (deprecated). A served ML model (none saved, circular labels).
  Immutable picture caching (a removal could not reach it). A wallet list in the build (a removal would need a
  deploy).

## Task plan notes

- The first task depends on 011's infra task (Worker entry, router, `Limits`, bindings, `public/_headers`).
- 013 content tasks go into 012's `tasks.md`: **C1** (first task) create `challenges.md`; **C2** (each task) add an
  entry when a problem took more than about 30 min or changed the plan; **C3** (after the first full nightly run and
  R22) record results with date, run count and caps in the ledger; **C4** (last task before deploy) write the
  write-up body and the diagram JSON with the R18 stage ids. C6 (the numbers) is 013's task.
- Release checks before deploy: R11.c (measured CPU, subrequests, D1 queries), R21.a on the Mac, the R22 verdict
  passed to 013.

## Risks

The owner chose "Insider candidates" with full address and username (2026-10-26). This spec keeps that choice. The
risks are real and are written here so the owner decides with them in view. This is not legal advice.

1. **Harm to a named person.** A username can be a real name, and "insider" suggests a crime. A person named on the
   site can complain, ask for removal or, in the worst case, claim defamation. The label is a pattern, not a fact,
   but a reader may not read it that way. (inferred)
2. **False positives.** There is no ground truth. Fast news traders, arbitrage bots and market makers can match the
   pattern. The original model only learned its own label rule (research §1). (observed)
3. **Harassment.** A visitor can copy a username and go after that person on Polymarket or elsewhere. (inferred)
4. **Search engines.** A page that puts "insider" next to a username can show up in a search for that username.
   (inferred)
5. **Privacy law.** A username and wallet can be personal data in some places (for example the EU). **Unverified.**
6. **Polymarket terms** for showing API data publicly: **Unverified.** Check polymarket.com/tos before launch.
7. **Stale data.** A result can be days old if the PC is off. (derived)
8. **Profile pictures** (owner chose to show them, round 2). A face next to "Insider candidate" makes a person
   easier to recognize and raises risks 1, 3 and 5. A picture is uploaded by the user and can be offensive; it then
   shows on the owner's site. A copied picture can stay after the user changes it. (inferred)
9. **The MacBook.** A 2018 MacBook Pro left on and plugged in for months can have battery swelling and heat;
   it gets no new macOS after Sequoia (Tahoe 26 does not support it), so security fixes will end. (inferred; Tahoe
   list from [9to5Mac](https://9to5mac.com/2025/06/09/macos-tahoe-26-compatibility-list/))

10. **Copies.** A removal cannot recall a copy that a visitor already saved, a browser cache (≤ 5 min results,
    ≤ 1 day pictures) or a screenshot. (derived)

Mitigations that keep the owner's choice: the disclaimer next to every list (R12); every score factor shown so a
reader sees why (R10); market makers left out (R9); a removal that hides at once (R13); no indexing, no wallet
search and no ranking (R14), a limited protection; the "as of" date and coverage notes on every result (R1, R10);
the method and its limits linked from every result (013 write-up); no wallet in the fallback file (R17). For
pictures: copy, resize to 64 px and strip metadata (R20); pictures of open markets are fetched again at each run, so
a changed or removed picture changes or goes the next night; pictures of frozen closed markets are not fetched
again; a removal deletes a picture at once; pictures show only for listed candidates, never in a grid. For the MacBook: keep the lid open on a stand,
use macOS battery health management, and keep only the Worker (not the PC) in the visitor's path.

## Boundaries

- **Always:** the disclaimer next to every candidate list; every factor shown; "as of" on every result; the push
  token only in a Worker secret and on the PC; upstream strings as text; R4 limits before any Gamma call.
- **Ask first:** D1; the push token; Python dependencies on the PC; a change to 010 R9; a new featured market.
- **Never:** cold checks from the Worker; a fetch of a visitor-given URL; a key or token in the client bundle or in
  git; wallet data in the static HTML or the fallback file; the PC in a visitor's request path.

## Out of scope

- Cold live checks. A trained model on the site. K-means wallet styles. Wallet pages. Alerts. Other venues.

## Owner answers 2026-10-26

| Q | Answer |
|---|---|
| Q1 Where the check runs | One Cloudflare Worker for `/api/*`. The spare PC collects and pushes (no cold checks). Stored markets that visitors browse; visitor requests wait for the nightly run. |
| Q2 Trade source | Data API v2, full history on the PC. Goldsky not used. |
| Q3 Score | Transparent points score, each factor shown. |
| Q4 Wording and identity | "Insider candidates", full address and Polymarket username, with the "candidates, not proof" disclaimer. |
| Q5 Plan | Cloudflare Free for v1. |
| Q6 First view | Precomputed Maduro market. |
| Q7 Full result | Short view in the window, full result in the 013 expanded view (lead default, no reason found to change). |
| N1 Start markets (round 2) | The 6 markets of the original project, Maduro featured. |
| N2 Caps (round 2) | ≤ 50 stored, 5 new per night, ≤ 20 queued. |
| N3 Refresh (round 2) | Open markets refresh every night. |
| N4 Requests (round 2) | Accepted automatically within the caps. |
| N5 Pictures (round 2) | Show Polymarket profile pictures (against the lead's proposal). Copied, not hot-linked (R20, lead decision: keeps 010 R9). |
| Spare PC (round 2) | 2018 MacBook Pro, Intel, CPU only, 8 GB RAM, also runs 011's Ollama judge (~2–3 GB). |
| N6 Project numbers (round 3) | "333K on-chain fills across 6 markets (~$256M volume when collected)". The edits to `content/projects/polymarket-insider-trading.md` and `content/resume.md` are 013 content tasks. |
| N7 Taiwan market (round 3) | Keep it as the open market; refresh nightly. |
| Pictures (round 3) | Copy, resize and serve from the same origin (R20): accepted. |
| Report-case check (round 3) | Publish the results only if the rule flags the report's wallets. 012 R22 produces the check; 013 owns the write-up and the decision. |
| Window tabs (round 3, 013) | Try and Read; Try opens first on Maduro; case studies from a noindex JSON (R2, R14). |
| Shared infra (reconciliation) | 011 owns the Worker entry, router, `Limits`, `wrangler` bindings and `public/_headers`. 012 depends on 011's infra task and adds its own lines and bindings, including the fallback's `noindex` line. |
| Case studies (reconciliation) | Load when the Origin section scrolls into view, no button (013). |
| Report check (reconciliation) | "Flags" = a majority (2 of 3) of the expected report wallets are listed and the market maker is not; then 013 publishes all rows, otherwise none. The 24 h look-back stays. |
| Credit (round 2) | The owner designed the analysis phases; `shwetanshu07` implemented the notebooks and the BigQuery ingestion. Credit him and link his GitHub. No need to ask him before shipping. |

## Open questions

- None. N1–N7 are answered (Owner answers above). The Codex critique raised no new owner decision.

## Approval record

2026-10-26 — **Owner approved this spec** ("Approve all three, go ahead"), together with 011, 012 and 013, including the owner answers recorded above. Two owner rules added with the approval: (1) teammates are named only by their GitHub usernames (no full names) in site text, write-ups, READMEs and zips; (2) the write-ups and site text never mention the owner's 2018 MacBook Pro (say "a home machine" or name nothing; internal docs and runbooks may name it). Assumed, not yet confirmed: `OWNER_TZ` = `America/New_York`. Open content item: the year line. No gate is approved by this (G-net, G-deploy, G-push, new dependencies stay ask-first). R12's credit line was changed to the GitHub username after the approval, to follow rule (1).
