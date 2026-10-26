# 011 tasks

Ordered by dependency. Check a box only after its verification has run. Spec: [spec.md](spec.md) (approved
2026-10-26).

**Tags:** [local] can be done now, no gate · [owner-at-Mac] the owner works at the spare computer ·
[new-dep: name] Ask-first dependency · [secret: names] the owner sets `wrangler secret` values · [G-net] a new network
call from the site or Worker · [G-deploy] anything deployed, also a test Worker.

**Rules for every task:** tests first and seen failing (spec-driven step 6); `npm run lint` and `npm test` pass;
the e2e named in the task passes; commands and results go in the session's `docs/ledger/` file. **C2:** add a
`challenges.md` entry when a problem took more than ~30 minutes or changed the plan. Public text uses GitHub
usernames only and never names the owner's computer model (spec Boundaries).

**Order:** C1 → S0 (012 waits for S0) → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 (all [local]) · T0 [owner-at-Mac] at
any time, before T0b · T9 after T1–T2 · T0b after T0 and T7 · T10a after T0b and T9 · T-eval (C3) → C4 → C5 → T10.

## Local now

- [ ] **C1** Challenges log (013 content contract)
  - Tags: [local]
  - Acceptance: `challenges.md` exists in this folder with the 013 entry format and one entry: "Cloudflare Free
    limits forced a browser-driven crawl" (spec Why, research §7.1), Public: yes.
  - Verify: review.
  - Files: `docs/specs/011-crawler-live/challenges.md`

- [ ] **S0** Shared infrastructure, owned by 011 (R24, R17; 012 depends on it)
  - Tags: [local] (runs with `wrangler dev` and stubs; no new dependency: Worker types from `npx wrangler types`,
    `Limits` SQL tested with Node's built-in `node:sqlite`, **Unverified** that it needs no flag on Node 22.18)
  - Acceptance: `wrangler.jsonc` has `main: "worker/index.ts"`, `assets.run_worker_first: ["/api/*"]`, the `LIMITS`
    Durable Object binding with its SQLite migration, the `AI` binding, vars `LIVE_CRAWL`, `OWNER_TZ`
    (`America/New_York`), `LLM_URL`. The router sends `/api/crawl/*` to `worker/crawl/` (stub answers) and every
    other `/api/*` to the shared 404 JSON. Every `/api/*` answer has `Cache-Control: no-store`, `X-Robots-Tag:
    noindex`, `Content-Type: application/json`. `Limits` has the 011 tables (spec Approach), the `insider_*` tables
    of 012 R4, reservation methods in one transaction, and an alarm that deletes counter rows older than 2 days.
    `public/_headers` exists with a comment line only. R24.a (S0-alone part) passes.
  - Verify: `npm test` (router, headers, `Limits` reserve/release/cleanup, parallel reservations at each cap
    boundary); `npx wrangler dev` + `npm run e2e:routing` (static routes unchanged, `/api/unknown` 404 with headers);
    `npm run build` (assets unchanged).
  - Files: `worker/index.ts`, `worker/limits.ts`, `wrangler.jsonc`, `public/_headers`, `tests/unit/worker-shared.test.ts`

- [ ] **T1** Fetch gate: URL rules, public-DNS check, tags, redirects, robots.txt, link bounds (R8, R10 fetch part)
  - Tags: [local] (DoH, robots and pages stubbed; `HTMLRewriter` runs under `wrangler dev`)
  - Acceptance: R8.a, R8.b, R8.c, R8.d pass; `/api/crawl/fetch` reserves in `Limits` before any outbound call and
    refuses over 100 fetches, over 4 in flight, a second request to one host, an expired or stopped token.
  - Verify: `npm test` (URL table, IP ranges, CNAME and redirect chains, forged tags, credentials in URLs, link and
    URL-length bounds); a local integration test against `wrangler dev` with a stub web server.
  - Files: `worker/crawl/fetch.ts`, `worker/crawl/dns.ts`, `worker/crawl/robots.ts`, `worker/crawl/token.ts`,
    `tests/unit/crawl-fetch.test.ts`

- [ ] **T2** Start, judge, label and stop routes with stubs (R3, R4, R7 Worker side, R9, R10, R13, R16, R21 stop)
  - Tags: [local] (Turnstile with Cloudflare's documented test keys, seeds, Ollama and Workers AI stubbed; secrets as
    local `.dev.vars` test values, git-ignored)
  - Acceptance: R4.a; R7.c (one judge call site-wide, lease freed on Stop); R9.a; R10.a; R10.b (evaluation key);
    R13.a; `/start` answers token, tagged seeds and `judge`; `/stop` ends the token and frees leases; topic block
    list and kill switch work.
  - Verify: `npm test` (route tests with stubbed `fetch`, `AI` and `Limits`); `wrangler dev` smoke test.
  - Files: `worker/crawl/routes.ts`, `worker/crawl/seeds.ts`, `worker/crawl/llm.ts`, `src/shared/crawl-types.ts`,
    `tests/unit/crawl-routes.test.ts`

- [ ] **T3** Strategies and metrics in the browser (R5, spec Definitions, R9 metrics)
  - Tags: [local] (the Python reference values come from the original code in the session clone, standard library
    only; no new dependency on the site. The stemmer: a small in-repo Porter stemmer, or [new-dep: a stemmer
    package] if the owner prefers; propose before writing)
  - Acceptance: R5.a (formulas against recorded Python values), R5.b (tokenizer fixtures), R9.a metrics against the
    `c_metrics.py` values; URL key and host rules as Definitions.
  - Verify: `npm test`; the Python script and its output recorded in the ledger.
  - Files: `src/sheet/demos/crawler-live/strategies.ts`, `.../metrics.ts`, `.../text.ts`,
    `tests/unit/crawler-strategies.test.ts`, `tests/fixtures/crawler/`

- [ ] **T4** Run loop, lifecycle and events (R6, R15, R21)
  - Tags: [local] (API stubbed in Playwright)
  - Acceptance: R6.a; R6.b in Chromium, Firefox and WebKit; R15.a, R15.b, R15.c; R21.a. The run keeps going while the
    panel is hidden.
  - Verify: `npm test`; `npm run e2e:all` for R6.b; `npm run e2e` for the rest.
  - Files: `src/sheet/demos/crawler-live/run.ts`, `.../events.ts`, `src/sheet/demos/crawler-live.ts`,
    `tests/e2e/crawler-live-run.spec.ts`

- [ ] **T5** Try panel UI, accessibility, layout (R1, R2, R11, R14, R18, R23)
  - Tags: [local] (Turnstile widget stubbed in e2e)
  - Acceptance: R2.a, R11.a, R18.a (both sizes, sheet and expanded, light and dark, keyboard, focus kept, reduced
    motion mid-run), R23.a (Try chunk lazy, 100 KiB shell and 150 KiB total, no task > 100 ms). Public text follows the
    username and computer-name rules.
  - Verify: `npm run e2e`; `npm run build` (budget guard); `compare-vs-mock` is not needed (no mock for Try), but
    screenshots of R18.a views go in the ledger.
  - Files: `src/sheet/demos/crawler-live/panel.ts`, `.../panel.css`, `scripts/sheet-content.ts`,
    `tests/e2e/crawler-live-ui.spec.ts`

- [ ] **T6** Download: CSV and zip (R12)
  - Tags: [new-dep: `fflate`] (Ask first)
  - Acceptance: R12.a (parsed CSV, formula prefix, quotes, newlines, Unicode, (URL, strategy) records); README credit
    line exactly as R12 (usernames only); Download works after Stop.
  - Verify: `npm test`; `npm run e2e` (download event, unzip in the test).
  - Files: `src/sheet/demos/crawler-live/csv.ts`, `.../zip.ts`, `package.json`, `tests/unit/crawler-zip.test.ts`

- [ ] **T7** Mac local proxy code (R20, R7 Mac side)
  - Tags: [local] (Node, no dependency; fake Ollama in tests)
  - Acceptance: passes only `POST /api/chat` (fixed model, R13 settings) and `GET /api/version`; refuses
    02:55–05:00 `OWNER_TZ` time and while a valid lock exists; ignores a lock with a dead pid or a passed expiry;
    refuses if the Mac's time zone differs from `OWNER_TZ`; logs no page text.
  - Verify: `npm test` (fake clock, fake lock files, fake Ollama).
  - Files: `jobs/llm-proxy/proxy.mjs`, `jobs/llm-proxy/README.md` (no hostnames or tokens),
    `tests/unit/llm-proxy.test.ts`

- [ ] **T8** Network and e2e checks (R17, R23, 010 R9 amendment)
  - Tags: [local]
  - Acceptance: the same-origin check in `tests/e2e/sheet.spec.ts` runs through Try (load, Turnstile, stubbed run,
    Stop, Download, Read, Expand) and allows only same origin, the 010 R9 beacon and `challenges.cloudflare.com`; it
    fails on any other origin (unit test of the filter).
  - Verify: `npm test`; `npm run e2e`; `npm run e2e:all`; `npm run e2e:routing`.
  - Files: `tests/e2e/sheet.spec.ts`, `tests/e2e/net-filter.ts`, `tests/unit/net-filter.test.ts`

## Needs the owner

- [ ] **T0** Benchmark on the Mac (assumption 8, R5 model choice, LLM page share)
  - Tags: [owner-at-Mac] [new-dep: Ollama and `cloudflared` on the Mac, not in the repo]
  - Acceptance: for `gemma3:1b`, `llama3.2:1b` (and `gemma3:4b` as a stretch check): prompt and output speed, load
    time, a 10-minute sustained run, `vm_stat` swap and free memory; judge agreement with `qwen3-30b-a3b-fp8` on 30
    pages of 3 topics. Pass rule as spec Approach (no swap growth, ≥ 2 GB free with the model unloaded, ≥ 70 %
    agreement). The chosen model and the LLM page share (default 12) are written in the ledger and in R5/R10 if 12
    changes (a spec change needs the owner's OK).
  - Verify: ledger numbers from `ollama run <model> --verbose`, `vm_stat`, About This Mac (CPU model).
  - Files: `docs/ledger/<session>.md`, `docs/specs/011-crawler-live/challenges.md`

- [ ] **T9** Limits check on a test Worker (R22, assumptions 4, 5, 9)
  - Tags: [G-deploy] (a `workers.dev` test Worker) [G-net] [secret: `TURNSTILE_SECRET` (test key), `LINK_TAG_KEY`,
    `IP_HASH_KEY` on the test Worker]
  - Acceptance: every route ≤ 8 ms CPU and ≤ 45 subrequests on the worst-case fixtures; neurons per label measured
    over one full run; the private-DNS runtime result recorded; static asset requests not counted as Worker requests
    (dashboard). If CPU fails: stop and ask the owner (assumption 5). If 30 runs/day do not fit 10,000 neurons: stop
    and ask (assumption 9).
  - Verify: `wrangler tail` CPU and subrequest numbers, the Workers AI dashboard; all in the ledger and `challenges.md`.
  - Files: `scripts/crawl-limits-check.ts`, `tests/fixtures/crawler/worst-case/`, `docs/ledger/<session>.md`

- [ ] **T0b** Always-on Mac setup, Tunnel and Access (R7, R20, research §11.1)
  - Tags: [owner-at-Mac] [secret: `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`] [G-net] (the Tunnel hostname)
  - Acceptance: lid open on a stand, battery health on, no sleep on power, `autorestart`; Ollama (chosen model, long
    `OLLAMA_KEEP_ALIVE`), the T7 proxy and `cloudflared` as launchd services; Access app with a service token on the
    Tunnel hostname; a request without the token is refused; Mac time zone = `OWNER_TZ`. Setup steps in a local
    runbook (not in git). R20.a manual cases run together with 012's job when it exists.
  - Verify: manual checks in the ledger (`curl` with and without the token from outside, reboot test).
  - Files: local runbook only (`docs/handoffs/` is git-ignored); ledger.

- [ ] **T10a** Preview integration with real services
  - Tags: [G-deploy] (preview Worker) [G-net] [secret: `TURNSTILE_SECRET` (real), `BRAVE_API_KEY`, `EVAL_KEY`,
    access token values on the preview Worker]
  - Acceptance: a full run on the preview with the real Turnstile site key, real seeds, the Mac judge and Workers AI;
    the judge goes offline when the Mac's proxy stops; 02:55–05:00 shows busy. Prelaunch checks in the ledger: the
    terms of DuckDuckGo, Wikipedia (User-Agent policy) and Brave, and the excerpt length; a conflict stops the work
    for the owner (spec Approach).
  - Verify: manual run in a browser; ledger.
  - Files: `wrangler.jsonc` (preview env), `docs/ledger/<session>.md`

- [ ] **T-eval** Evaluation run set, with **C3** (R19)
  - Tags: [G-deploy] (runs against the preview Worker) [G-net] [secret: `EVAL_KEY`]
  - Acceptance: R19.a; the 10 original topics × 3 runs, at most 10 per night, outside 02:55–05:00; the results table
    and every failed, partial, offline or unlabeled run in the ledger (C3: date, run count, models, caps).
  - Verify: `node scripts/crawl-eval.ts` output; ledger.
  - Files: `scripts/crawl-eval.ts`, `docs/ledger/<session>.md`

- [ ] **C4** Write-up body and diagram JSON (013 content contract)
  - Tags: [local]
  - Acceptance: the write-up sections per 013 R8, results from T-eval only, 3–5 challenges from `challenges.md`
    (Public: yes only), teammates by GitHub username only, no computer model named; the diagram JSON uses the R15
    stage ids; `npm run build` passes 013 R17.
  - Verify: `npm run build`; `npm test`.
  - Files: `content/projects/focused-web-crawler.md`, the diagram JSON path named by 013

- [ ] **C5** Owner reads and approves the write-up in a preview
  - Tags: [owner] (ships with the tool)
  - Acceptance: owner OK recorded in the ledger and OWNER_QUESTIONS.
  - Verify: `npm run build && npm run preview`.
  - Files: `docs/OWNER_QUESTIONS.md`

- [ ] **T10** Release
  - Tags: [G-deploy] [G-net] [secret: the production values of all R16 secrets]
  - Acceptance: R22 release check on the release SHA; `npm run lint`, `npm test`, `CI=1 npm run e2e:all`,
    `CI=1 npm run e2e:routing` on a clean tree; deploy with `npm run deploy:live`; R17.a and R24.a on the live site;
    the previous Worker version id recorded for rollback; `LIVE_CRAWL` kill switch tested live.
  - Verify: live checks in the ledger.
  - Files: `docs/ledger/<session>.md`, `docs/specs/011-crawler-live/spec.md` (status)
