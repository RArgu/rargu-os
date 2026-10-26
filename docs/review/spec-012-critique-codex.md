# Spec 012 critique (Codex)

- CLI: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config`, read-only, ephemeral
- Model: gpt-6.1-sol, reasoning effort high
- Session id: 01a17987-63e3-7c22-be60-7459b5e1cf66 · tokens used: 136,448
- Date: 2026-10-26 · Spec: `docs/specs/012-insider-live/spec.md` (Draft, untracked) at HEAD `9b9f520`

## Dispositions

| # | Severity | Disposition | Why |
|---|---|---|---|
| 1 | High | Accepted | Checked: R13 removed a wallet only "at the next push", R20 cached pictures `immutable` for a year, R17 bundled a result with wallets. New R13: one removal procedure (D1 result rows, image rows, list row, wallet index); pictures `max-age=86400`; the fallback holds no wallet (R17); downloaded copies cannot be recalled (said in Risks). 013's case-study JSON is a cross-spec request. |
| 2 | High | Accepted | Checked live 2026-10-26: v2 rows have no maker/taker field and no fill id. `taker_only=true` gave 1,000 rows with 1,000 unique tx hashes; `taker_only=false` gave identical full-key rows in one tx (wallet `0x79cbe531…` BUY No 2,345 twice). New R7: two streams, role from the taker stream, no dedupe on row content, boundary-second re-read; fixtures from captured pages. |
| 3 | High | Accepted | Checked: R6 froze closed markets while R7 allowed partial ones; R5.a promised readiness. New collection and publish states, run order, 7-night limit, readiness shown as an estimate; the 6 start markets are seeded by the owner and are outside the 5-per-night queue limit. |
| 4 | High | Accepted | Checked: 011 R20 uses owner time; 012 used PC local time. New R21: one `OWNER_TZ`, HTTP timeouts and retry budget, a separate `launchd` watchdog at 04:55, lock content with pid and expiry, bounded memory pause. Stale-lock handling in 011's proxy is a cross-spec request. |
| 5 | High | Accepted | R4 now counts every attempt before any Gamma call, in 011's `Limits` object (one counter backend), with an HMAC IP key, a daily global lookup budget and single-statement D1 admission. |
| 6 | Medium | Accepted | R11 now: result ≤ 600 KB, pictures on a separate route (one per request, ≤ 8 KB), D1 batch ≤ 6 statements, image clean-up, CPU benchmark in tasks with a defined split fallback. |
| 7 | Medium | Accepted | Math contract added (research §13): UTC buckets, rows not time (as the original), sample std, merge, representative time, dollars, populations, ties. Fixtures get exact values. |
| 8 | Medium | Accepted | Keyword rule, day-level news rise, `type=TRADE` on `/v2/activity` (parameter observed in the v2 openapi), and "no data" factors at 0 points with a visible coverage note. |
| 9 | Medium | Accepted | Nested schema with limits; text rendering only; links built from validated addresses; `https:` news links only. |
| 10 | Medium | Accepted | Image fetch rules: HTTPS, exact host, no redirects, byte, pixel and time limits, Pillow bomb check. Gamma URLs built from fixed endpoints. |
| 11 | Medium | Accepted | Wording fixed: `max-age` is a browser cache only; every `/api` request counts. A list row (`insider_list`) added. The 429-over-limit claim is now "documented, not tested". Request budget with 011 in research §9. |
| 12 | Medium | Accepted | Fallback is a static JSON (not imported into JS), ≤ 60 KB, no wallets, `noindex` in `public/_headers`. `noindex` is called a limited mitigation. |
| 13 | Medium | Partly | Counters: 011's `Limits` object (accepted). Events: 012 adopts 011 R15's `tool:stage` form and 013 R11's `tool:status`. D1 holds 012 data only (011 stores no results), so the "shared D1" wording is corrected. Ownership of `worker/index.ts` and bindings is a cross-spec request to 011. |
| 14 | Medium | Accepted | Checked `src/sheet/demos/insider.css:13` (200 px column). New R19 with layouts, wrapping addresses, keyboard and status rules, and tests; 006 R2/R3/R11 tests replaced. |
| 15 | Medium | Accepted | Checked: the report gives only prefixes (`0x31a56e9E61eD21De0…`, `0x5ed3…b19e` Vivaldi007, `0x1caa6a7ad0c6916…46a0`). R22 now resolves full addresses first into a sourced file, fails on ambiguity, versions rule and data, and calls the result selected examples, not accuracy. |

Counts: 14 accepted, 1 partly, 0 rejected. No finding needs a new owner decision.

## Codex output (verbatim)

**Verdict: fix the High findings before approval.** The stored design avoids the large Worker analysis workload, but several requirements conflict or lack enforceable limits.

**Evidence labels:** **Observed** means file content inspected with `nl -ba` or `rg`. Research claims were read, not independently reproduced.

1. **High — Removal does not remove already published results.**

   **Observed:** [012/spec.md:50](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:50) excludes blocked wallets only at the next push. Results cache for five minutes at line 52. Pictures cache as immutable for one year at line 57. Lines 135–139 nevertheless promise immediate hiding and picture removal.

   **Derived:** A SQL block-list update leaves existing result JSON, browser-cached pictures, and the bundled featured result available. Frozen closed markets also contradict the promise that changed pictures refresh nightly.

   **Fix:** Define one removal procedure covering stored JSON, image rows, list summaries, fallback data, and 013 case-study JSON. Use revalidation for removable content and invalidate any edge cache. Test removal after warming every cache, with the Mac offline. State that previously downloaded copies cannot be recalled.

2. **High — The trade contract cannot yet support trustworthy analysis.**

   **Observed:** [012/spec.md:44](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:44) collects maker and taker rows. R8 requires taker-only VWAP. The fields recorded in [research.md:48](/Users/rargu/DevPageOS/docs/specs/012-insider-live/research.md:48) contain no maker/taker discriminator or unique fill identifier.

   **Inferred:** An implementation could count both sides in VWAP, discard distinct fills during deduplication, or misidentify wallet exposure.

   **Fix:** Specify a verified mapping from API rows to taker trades and wallet legs. Define a stable deduplication key. If necessary, collect taker trades separately. Add captured fixtures with multiple fills in one transaction, maker rows, complementary tokens, and equal timestamps. Stop implementation if the API cannot distinguish these cases.

3. **High — Partial collection can become permanently incomplete while the UI promises readiness.**

   **Observed:** [012/spec.md:43](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:43) freezes closed markets after their final run. R7 permits partial results and later continuation. However, [research.md:259](/Users/rargu/DevPageOS/docs/specs/012-insider-live/research.md:259) says cursor reuse across nights is unverified. Acceptance R5.a predicts readiness from five markets per night.

   **Derived:** A closed partial market needs another run despite the freeze rule. An expired cursor can force repeated traversal of the same history. Large markets invalidate the queue’s readiness calculation.

   **Fix:** Define separate collection and publication states. Keep incomplete closed markets eligible. Prove cross-night continuation or define a bounded failure outcome. Specify scheduling between refreshes, backfills, and new requests. Present readiness as an estimate. Also resolve the first-night contradiction: R6 allows five new markets, while R21.a expects all six start markets.

4. **High — The deadline and lock cleanup need an independent enforcement mechanism.**

   **Observed:** [012/spec.md:58](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:58) requires cleanup by 05:00, using `trap`/`finally`. R7 has no HTTP timeout or retry budget. Critical memory pressure pauses collection. [011/spec.md:65](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:65) uses owner time, while 012 uses PC local time.

   **Derived:** A stalled request, prolonged pause, sleep, or forced process termination can prevent cleanup. A stale lock can disable the judge after 05:00.

   **Fix:** Use one named time zone across both specs. Add bounded requests, retries, and a hard process deadline enforced outside the collector. Give the lock an owner and expiry, with recovery before judge admission. Test a hung request, forced termination, stale lock, late wake, and critical memory pressure.

5. **High — Request limits do not define protection before outbound work or atomic admission.**

   **Observed:** [012/spec.md:40](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:40) resolves input through Gamma. R4 limits requests but does not say whether malformed input, rejected markets, or event-list lookups consume the allowance. Atomic enforcement is unspecified.

   **Inferred:** Repeated rejected lookups could consume Gamma calls and Worker CPU without consuming the intended limit. Concurrent requests could exceed queue or store caps.

   **Fix:** Reserve an attempt before any Gamma call. Define charging for event selection and duplicates. Specify trusted client-IP handling, atomic counter updates, deduplication, and queue/store admission. Add a global lookup budget, secret-backed IP hashing, and enforced two-day deletion. Test concurrent requests at each boundary and repeated invalid requests.

6. **Medium — The push protocol lacks a bounded Free-plan implementation.**

   **Observed:** [012/spec.md:48](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:48) uploads one result of up to 1 MB. R20 includes images. R8–R10 permit 100 distinct candidates per market. [research.md:164](/Users/rargu/DevPageOS/docs/specs/012-insider-live/research.md:164) leaves push CPU unverified and states a 50-query D1 limit.

   **Derived:** One insert per image could exceed 50 queries. The current storage estimate also omits image growth and cleanup. A one-megabyte body bound alone does not prove compliance with 10 ms CPU.

   **Fix:** Define the wire schema, encoded image budget, batching, image cleanup, and atomic publication. Set maximum queries and bytes per upload. Benchmark the largest permitted push and Gamma event response on Free. Define a specific smaller-upload fallback before implementation. Two bounded Gamma calls are comfortably below 50 subrequests, but redirects and storage operations must also be counted.

7. **Medium — The scoring rules allow materially different results.**

   **Observed:** [012/spec.md:45](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:45) leaves bucket gaps, standard-deviation convention, move merging, representative timestamps, and ranking ties undefined. R10 leaves percentile populations, bet timestamps, and entry-price weighting undefined.

   **Derived:** Two implementations can satisfy the prose and label different real wallets.

   **Fix:** Add a mathematical contract covering UTC bucket boundaries, empty buckets, minimum history, standard deviation, move grouping, representative time, dollars versus shares, score populations, and tie-breaking. Give fixtures exact expected moves, wallet amounts, factors, and totals. Include downward Yes moves, sparse data, no moves, and no candidates.

8. **Medium — Missing news and wallet-age data have no scoring semantics.**

   **Observed:** [012/spec.md:44](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:44) requires historical GDELT data and wallet activity. R10 awards points from both. [research.md:80](/Users/rargu/DevPageOS/docs/specs/012-insider-live/research.md:80) records frequent GDELT failures. The spec defines neither keyword generation nor failure handling.

   **Inferred:** Failed news requests could silently award or remove points. An activity record could be mistaken for a first trade unless its type is checked.

   **Fix:** Define keyword generation, news granularity, the seven-day baseline, and the chosen news-rise timestamp. Require a verified trade-type filter for wallet age. Represent unavailable factors explicitly, with a fixed scoring policy and visible coverage limits. Test 429, empty history, short market history, and non-trade activity.

9. **Medium — The authenticated upload still carries untrusted content.**

   **Observed:** [012/spec.md:48](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:48) validates only top-level keys and stores text unchanged. Usernames, questions, and news links originate upstream. No nested schema or browser rendering rule is specified.

   **Inferred:** The bearer token authenticates the collector, but does not make upstream strings safe. An HTML-based renderer or unchecked link could introduce script execution.

   **Fix:** Define versioned nested types, lengths, array limits, finite numeric ranges, wallet formats, and allowed link schemes. Render strings as text. Construct Polymarket profile links from validated addresses. Reject malformed uploads before any write. Test hostile names, `javascript:` links, unsupported versions, and interrupted publication.

10. **Medium — Image checks do not bound redirects or decoded memory.**

    **Observed:** [012/spec.md:57](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:57) limits the initial host and compressed size, but omits redirect policy, download deadlines, pixel dimensions, and decoder limits.

    **Inferred:** A small compressed image can require substantial decoded memory, violating the 800 MB process budget. Redirect following can escape the intended host restriction.

    **Fix:** Require HTTPS and exact parsed-host matching. Disable redirects or validate every hop. Bound streamed bytes, dimensions, pixels, decode time, and download time. Reject decompression-bomb warnings. Construct Gamma requests from fixed endpoints rather than fetching submitted URLs. Test hostile URL forms, redirects, oversized decoded images, and malformed files.

11. **Medium — Browser cache headers do not establish the claimed Worker savings.**

    **Observed:** [012/spec.md:52](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:52) says `max-age=300` prevents repeat views from reaching the Worker. No edge-cache implementation is specified. The schema at line 93 also contains no precomputed list row for the promised one-row `/markets` read.

    **Derived:** Browser caching helps an existing visitor. It does not establish shared caching across new visitors. Images and status polling also consume API requests.

    **Fix:** Describe browser caching accurately or specify an edge cache compatible with removal. Define the summary row and its transactional updates. Budget Worker requests, D1 reads/writes, images, and polling together with 011. Reconcile 012’s “observed 429” claim with [011/spec.md:27](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:27), which treats routing behavior as unverified. Test fallback for every non-success response and network failure.

12. **Medium — The bundled fallback has no explicit privacy or performance contract.**

    **Observed:** [012/spec.md:54](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:54) bundles the featured result. R14 gives headers only to `/api/*`. [scripts/sheet-guard.ts:76](/Users/rargu/DevPageOS/scripts/sheet-guard.ts:76) applies the 150 KiB budget to all reachable JavaScript and CSS, including lazy chunks.

    **Derived:** Importing the result into JavaScript could consume the remaining budget. Serving it as an ordinary static JSON file misses the specified API header rule. A `noindex` header on JSON also does not apply that directive to the HTML document that renders it.

    **Fix:** Specify a separate, bounded fallback JSON asset with its own `noindex` header, image behavior, and removal procedure. Preserve the JavaScript/CSS budgets and cap chart points and replay duration. Describe indexing protection as a limited mitigation, not guaranteed exclusion of rendered identities.

13. **Medium — The shared storage and event contracts disagree.**

    **Observed:** [013/spec.md:268](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:268) requires `{ lastRun, nextRun, waiting }` status events. 012 defines neither their emission nor their data source. Its stage events lack 011’s `state` and terminal-clear contract. [012/spec.md:95](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:95) leaves the counter backend undecided. Although 012 calls D1 shared, 011 specifies a shared Durable Object and rejects D1 result storage.

    **Fix:** Assign ownership of `worker/index.ts`, bindings, migrations, and counters. Choose one counter backend. Define shared event types, timestamps, initial snapshots, clearing, and delivery after switching to Read. Add job-status and collecting-state update protocols. Align case-study loading with 013’s Origin trigger, rather than 012’s window-open wording.

14. **Medium — The new UI needs explicit layout and accessibility acceptance checks.**

    **Observed:** [012/spec.md:56](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:56) inherits the old demo checks. The current candidate column is 200 px wide in [insider.css:13](/Users/rargu/DevPageOS/src/sheet/demos/insider.css:13), within a 320 px demo area. It does not accommodate the newly required full addresses, pictures, factors, request controls, and navigation without further rules.

    **Derived:** Native buttons alone do not make move selection, form errors, status updates, or the expanded result accessible.

    **Fix:** Define layouts at the existing sheet size and 390 px expanded width. Require wrapping addresses, keyboard move selection, labeled fields, associated errors, restrained status announcements, and bounded scrolling. Test live reduced-motion changes, hidden-tab cleanup, Expand/Restore, zero candidates, and rapid market switching. Amend the obsolete 006 simulation and no-network tests explicitly.

15. **Medium — The report evaluation cannot reliably identify its expected wallets.**

    **Observed:** [012/spec.md:59](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:59) permits prefix, suffix, or username matching. It does not provide canonical addresses for every case.

    **Inferred:** Renamed profiles or ambiguous matches can produce incorrect evaluation results. Conditional publication can also appear to be broader validation than it is.

    **Fix:** Record canonical full addresses and their report sources before evaluation. Fail ambiguous identity resolution explicitly. Version the rule and dataset. Keep the owner’s publication condition, but describe any published check as selected historical examples, not an accuracy estimate.

**Could not check:** Current Cloudflare limits, quota-response behavior, API schemas, cursor persistence, historical GDELT coverage, Polymarket terms, image rights, or legal sufficiency. No network calls were made. Mac runtime, memory, deadline behavior, and Worker CPU remain unmeasured. No files were modified, and no build or tests were run.