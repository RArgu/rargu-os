# 012 tasks

Ordered by dependency. Check a box only after its verification has run. Spec: [spec.md](spec.md) (approved
2026-10-26). Shared infrastructure comes from **011 S0** (011 R24): `worker/index.ts`, the `/api/*` router, common
headers, `Limits`, `wrangler.jsonc` bindings, `public/_headers`.

**Tags:** [local] = build and test on the dev machine now (calls from the Python job to the public Polymarket,
CLOB and GDELT APIs are research, not a site network call) · [new-dep] = a new package, ask first · [secret] = a
token or key (Worker secret or `.dev.vars`, never in git) · [G-net] = a new network call from the site or Worker in
production · [G-deploy] = deploy · [owner-at-Mac] = needs the owner at the spare computer.

**Owner rules (approval 2026-10-26):** teammates by GitHub username only in public text; no public text names the
spare computer's model. Every task: `npm run lint`, `npm test` and the relevant `npm run e2e` before it is done.
Python tasks: `python -m pytest jobs/insider` as well.

## Part A: the PC job (Python, built on the dev machine)

- [ ] **T1** C1: create the challenges log in the 013 format (013 C1). [local]
  - Acceptance: the file exists with the format of 013's content-task section; the first entry is the v2 role and
    duplicate finding (research §15).
  - Verify: read the file; 013's R17 build check finds it when `writeup: true` is set later.
  - Files: `docs/specs/012-insider-live/challenges.md`

- [ ] **T2** Job skeleton, config and local store (R1 start set, R7 storage). [local] [new-dep: `duckdb`, `requests`,
  `Pillow`, dev `pytest`]
  - Acceptance: `jobs/insider/` has a pinned requirements file, the 6 start markets (Gamma ids from research §10),
    and a DuckDB schema (rows keep page and row index; no content key). Python 3.12. No secret in the repo.
  - Verify: `python -I -m pytest jobs/insider -k schema`; `git check-ignore` shows the DuckDB file is ignored.
  - Files: `jobs/insider/requirements.txt`, `jobs/insider/markets.json`, `jobs/insider/store.py`,
    `jobs/insider/tests/test_store.py`, `.gitignore`

- [ ] **T3** Collectors: Gamma, CLOB in 15-day chunks, v2 trades as two streams with role matching, refresh at the
  boundary second, HTTP timeouts and retries (R7). Capture real pages as fixtures. [local]
  - Acceptance: R7.a passes on captured fixtures (two identical rows in one transaction kept, roles from the taker
    stream, refresh gives the same row multiset as a full read). A full collect of Maduro (`916440`) gives 9,367
    taker rows (research §2, may grow by 0).
  - Verify: `python -I -m pytest jobs/insider -k collect`; `python -I -m jobs.insider.collect 916440` on the dev
    machine.
  - Files: `jobs/insider/collect.py`, `jobs/insider/http.py`, `jobs/insider/tests/test_collect.py`,
    `jobs/insider/tests/fixtures/` (captured pages)

- [ ] **T4** Analysis: moves, candidates and the points score in DuckDB SQL (R8, R9, R10; research §13). [local]
  - Acceptance: R8.a, R9.a, R10.a pass on the five §13 fixtures with exact expected values; ties as specified.
  - Verify: `python -I -m pytest jobs/insider -k "moves or candidates or score"`
  - Files: `jobs/insider/analyze.py`, `jobs/insider/sql/moves.sql`, `jobs/insider/sql/candidates.sql`,
    `jobs/insider/tests/test_analyze.py`

- [ ] **T5** News and wallet age: GDELT keyword rule, daily timeline, headlines for the 5 largest moves, 6 s spacing;
  `/v2/activity?type=TRADE` first trade; "no data" factors (R7, R10). [local]
  - Acceptance: R10.a "no data" case passes with a stubbed 429; keywords for the 6 start markets match the expected
    list in the test.
  - Verify: `python -I -m pytest jobs/insider -k "news or age"`; one live run for Maduro on the dev machine.
  - Files: `jobs/insider/news.py`, `jobs/insider/wallets.py`, `jobs/insider/tests/test_news.py`

- [ ] **T6** Pictures on the PC: host, redirect, size, pixel and time limits; 64 px WebP, no metadata (R20). [local]
  - Acceptance: R20.a PC part: another host, `http:`, a redirect, a 3 MB file, a 10,000 × 10,000 px PNG and a broken
    file each give "no picture"; a valid picture gives a WebP ≤ 8 KB.
  - Verify: `python -I -m pytest jobs/insider -k picture`
  - Files: `jobs/insider/pictures.py`, `jobs/insider/tests/test_pictures.py`, `jobs/insider/tests/fixtures/img/`

- [ ] **T7** Result schema v1, one source for both sides: a JSON Schema file, the Python builder, and the TypeScript
  validator the Worker will use (R11, R12 data rules; research §14). [local]
  - Acceptance: the builder output for Maduro validates; the R11.a bad bodies (unknown keys, `javascript:` link,
    non-finite number, bad address, unknown `schema_version`, > 600 KB) fail in both Python and TypeScript tests.
  - Verify: `python -I -m pytest jobs/insider -k schema`; `npm test -- insider-schema`
  - Files: `jobs/insider/schema/result.v1.json`, `jobs/insider/build_result.py`, `worker/insider/schema.ts`,
    `tests/unit/insider-schema.test.ts`

- [ ] **T8** Dry run of the whole job on the dev machine for the 6 start markets, and the R22 eval script (R6 order
  without push, R22). [local]
  - Acceptance: six result files validate; the eval writes the three R22 files to `~/.rargu/insider-eval/` (not in
    the repo) with full addresses, market ids, expected and actual results, the 2-of-3 verdict and the 115 h / 37 h
    gaps. A dry run only: the real R22 verdict comes from T19.
  - Verify: `python -I -m jobs.insider.run --dry-run`; `python -I -m jobs.insider.eval`; `git status` shows no
    eval file.
  - Files: `jobs/insider/run.py`, `jobs/insider/eval.py`, `jobs/insider/report_wallets.json` (prefixes and report
    pages only, from the public report), `jobs/insider/tests/test_eval.py`

## Part B: the Worker (after 011 S0; `wrangler dev` with local D1)

- [ ] **T9** D1 database `rargu-insider`: migration with the Approach tables, binding `INSIDER_DB` added to 011's
  `wrangler.jsonc`, local `.dev.vars` for `INSIDER_PUSH_TOKEN` (R11, R13, R15). Depends on 011 S0. [local] [secret]
  - Acceptance: `wrangler d1 migrations apply rargu-insider --local` creates all tables; `.dev.vars` is git-ignored.
  - Verify: `npx wrangler d1 execute rargu-insider --local --command "select name from sqlite_master"`
  - Files: `worker/insider/migrations/0001_init.sql`, `wrangler.jsonc` (one binding), `.gitignore`

- [ ] **T10** Read routes: `markets` (one `insider_list` row), `result`, `img/<sha256>.webp`, `status`; stored text
  returned without parsing; per-route `Cache-Control` (R5 status, R14, R15). [local]
  - Acceptance: R13.a read side (hidden market 404), R14.a header part; reads use one D1 query each.
  - Verify: `npm test -- insider-read` (Miniflare/`wrangler dev` local D1)
  - Files: `worker/insider/markets.ts`, `worker/insider/result.ts`, `worker/insider/img.ts`,
    `worker/insider/status.ts`, `tests/unit/insider-read.test.ts`

- [ ] **T11** Write routes: `push` (schema check, one D1 batch ≤ 6 statements), `push-image`, `job` (status for
  `tool:status`), `queue` (R6 input); part mode ready behind a flag (R11, R18). [local] [secret]
  - Acceptance: R11.a (401, 400, D1 unchanged), interrupted part push keeps the old version; D1 queries per call
    counted in the test.
  - Verify: `npm test -- insider-push`
  - Files: `worker/insider/push.ts`, `worker/insider/queue.ts`, `worker/insider/job.ts`,
    `tests/unit/insider-push.test.ts`

- [ ] **T12** Request route: input parsing, fixed Gamma endpoints, event choice token, `Limits` counters before any
  Gamma call, one-statement admission (R3, R4, R5). [local] (stubbed Gamma) · [G-net] for production
  - Acceptance: R3.a and R4.a with Gamma stubbed and counted; 30 parallel requests admit exactly 2.
  - Verify: `npm test -- insider-request`
  - Files: `worker/insider/request.ts`, `worker/insider/gamma.ts`, `worker/limits` (012's `insider_*` tables, in
    011's Durable Object), `tests/unit/insider-request.test.ts`

- [ ] **T13** Removal: `POST /api/insider/remove` (one batch: block list, hide markets, delete images) and
  `jobs/insider/remove.sh`; runbook text names 013 R19 for the case-study JSON (R13). [local] [secret]
  - Acceptance: R13.a with caches warmed and the job offline.
  - Verify: `npm test -- insider-remove`; `jobs/insider/remove.sh --local <wallet>` against `wrangler dev`.
  - Files: `worker/insider/remove.ts`, `jobs/insider/remove.sh`, `jobs/insider/README.md`,
    `tests/unit/insider-remove.test.ts`

- [ ] **T14** Job orchestration against the local Worker: queue fetch, run order, 7-night limit, 04:50 stop, lock
  with PID (plus start and expiry, for 011 R20), `ollama stop`, memory pause, late-start exit, push (R6, R21). [local]
  - Acceptance: R6.a with a stub clock; R21.a lock cases (hung request, `kill -9`, stale lock, late wake) in tests
    with a fake clock; a full dry run pushes to `wrangler dev`.
  - Verify: `python -I -m pytest jobs/insider -k "order or lock"`; `python -I -m jobs.insider.run --push
    http://127.0.0.1:8787`
  - Files: `jobs/insider/run.py`, `jobs/insider/lock.py`, `jobs/insider/push.py`, `jobs/insider/tests/test_run.py`

## Part C: the window (front end, with fixture or `wrangler dev` data)

- [ ] **T15** Try view: market list and Previous/Next, chart from 006 with move markers, keyboard move list, top 3
  candidates with picture, full address, username, profile link, label, score, disclaimer, credit
  (`shwetanshu07`), all strings as text (R1, R2, R12, R19). [local]
  - Acceptance: R12.a, R19.a at the window size; first view is Maduro.
  - Verify: `npm run e2e -- insider-try`
  - Files: `src/sheet/demos/insider.ts`, `src/sheet/demos/insider-api.ts`, `src/sheet/demos/insider.css`,
    `tests/e2e/insider-try.spec.ts`

- [ ] **T16** Full result in 013's expanded view; request form and status; `tool:stage` (`mode: "replay"`, `at`,
  `null` at end) and `tool:status` in 013's form (R2, R5, R18, R19). Depends on 013's expand task. [local]
  - Acceptance: R5.a display, R18.a, R19.a at 390 px and ≥ 760 px.
  - Verify: `npm run e2e -- insider-full`
  - Files: `src/sheet/demos/insider-full.ts`, `src/sheet/demos/insider-request.ts`, `src/sheet/demos/insider.ts`,
    `tests/e2e/insider-full.spec.ts`

- [ ] **T17** Fallback and clean-up: `/insider/fallback.json` (no wallet, ≤ 60 KB), its `noindex` line in
  `public/_headers`, remove the 006 simulated demo and replace its tests, same-origin check (R14, R16, R17). [local]
  - Acceptance: R14.a, R17.a, 001 R22 budget passes (`npm run build`), 010 R9 same-origin e2e passes.
  - Verify: `npm run build`; `npm run e2e -- insider-fallback sheet`
  - Files: `public/insider/fallback.json`, `public/_headers` (one line), `src/sheet/demos/insider-data.ts` (deleted),
    `tests/e2e/insider-fallback.spec.ts`, `tests/e2e/sheet-demos.spec.ts` (006 cases replaced)

## Part D: production and the Mac (gated)

- [ ] **T18** Production D1 and secrets: create remote `rargu-insider`, apply the migration, set
  `INSIDER_PUSH_TOKEN` (Worker secret and the Mac's keychain), deploy the Worker routes with Try hidden behind a
  flag (R11, R16). [G-deploy] [G-net] [secret]
  - Acceptance: `/api/insider/markets` answers an empty list with `noindex`; `/api/insider/push` answers 401 without
    the token; the site's live same-origin check passes.
  - Verify: `curl -sI https://rargu.dev/api/insider/markets`; `npm run e2e -- --grep @live`
  - Files: `wrangler.jsonc` (remote id), `jobs/insider/README.md` (runbook)

- [ ] **T19** Mac setup and the first night: Python env, `launchd` agent (03:00 start, 04:55 watchdog process-group kill,
  011 R20), `pmset repeat wakeorpoweron`, `OWNER_TZ` check, token from the keychain; then the first real night for
  the 6 start markets; then the R22 eval on that data (R6, R21, R22). [owner-at-Mac] [new-dep: same pins as T2]
  [secret]
  - Acceptance: R21.a measured (peak RSS < 800 MB with `/usr/bin/time -l`, ends before 04:50, no model in
    `ollama ps` during the run, no lock after); six markets published; R22 files and verdict in
    `~/.rargu/insider-eval/`.
  - Verify: the job log and summary lines; `ollama ps` at 03:30; `ls ~/.rargu/`; `curl` of `/api/insider/markets`.
  - Files: `jobs/insider/launchd/dev.rargu.insider.plist`, `jobs/insider/README.md`

- [ ] **T20** C3: record the first full nightly run and the R22 verdict in the ledger (date, run count, caps, rule
  version). No wallet address in the ledger; the verdict goes to 013 (R22, 013 C3). [local]
  - Acceptance: ledger entry present; `rg -n "0x[0-9a-fA-F]{40}"` finds no address in it.
  - Verify: read the entry; the `rg` command.
  - Files: `docs/specs/012-insider-live/challenges.md` (C2 entries), the ledger file named in 013

- [ ] **T21** C4: write-up body and diagram JSON with the R18 stage ids; credit by GitHub username; no mention of
  the spare computer's model (013 R9, R17). [local]
  - Acceptance: `npm run build` passes 013 R17 for the insider write-up.
  - Verify: `npm run build`; `rg -n -i "macbook|Shwetanshu Raj" content/` finds nothing.
  - Files: `content/projects/polymarket-insider-trading.md`, `content/projects/diagrams/insider.json`

- [ ] **T22** Release checks: R11.b/R11.c measured on the deployed Worker (CPU per route, subrequests, D1 queries per
  call for the largest push, a removal and a read); part mode on if CPU > 10 ms; full `npm run lint`, `npm test`,
  `npm run e2e:all`. [G-net]
  - Acceptance: every measured value under the Free limits (10 ms, 50, 50), written in the ledger.
  - Verify: `npx wrangler tail` with CPU fields during a test push; Cloudflare dashboard metrics.
  - Files: ledger file

- [ ] **T23** C5 and release: owner reads the write-up and the Try tab in a preview (013 C5), then deploy with Try
  on (R1, R2). [G-deploy]
  - Acceptance: owner OK recorded; live same-origin check passes; `/p/insider/` and the Try tab work on rargu.dev.
  - Verify: `npm run deploy` (with the owner's OK); `npm run e2e -- --grep @live`
  - Files: `docs/specs/012-insider-live/spec.md` (status), `docs/specs/README.md`

## Can start now [local]

T1–T8 (Python job against the public APIs from the dev machine), T7's TypeScript half, and T15–T17 with fixture
data. T9–T14 start when 011 S0 is merged. T18 onward are gated (G-deploy, G-net, owner at the Mac).
