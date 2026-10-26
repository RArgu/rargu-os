# Spec 011 critique (Codex)

- CLI: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config`, read-only, ephemeral
- Model: gpt-6.1-sol, reasoning effort high
- Session id: 01a17987-63e3-71f2-91f1-2c0c577ff4a8 · tokens used: 98,762
- Date: 2026-10-26 · Spec: `docs/specs/011-crawler-live/spec.md` (Draft, untracked) at HEAD `9b9f520`

## Dispositions

Each finding was checked against the files by the 011 lead on 2026-10-26.

| # | Severity | Disposition | Why |
|---|---|---|---|
| 1 | High | Accepted | Checked: R8 refused only names and IP literals; research §2 leaves private-range behaviour **Unverified**. R8 now needs all A/AAAA answers public (DoH, per host, on each redirect and robots.txt); R8.a has DNS cases; R22 records the runtime's own behaviour. DNS rebinding between the check and the fetch stays a residual risk (stated by the R22 runtime test). |
| 2 | High | Accepted | `DOMParser` documents have no browsing context (inferred, assumption 7), but this was not tested. R6 now forbids moving nodes into the page; R6.b intercepts every request in three engines with a resource-heavy fixture. |
| 3 | High | Accepted | Checked: concurrency was only in the browser (R6), the lease was per run (R7), counters had no reservation (R10). Now `Limits` reserves before each outbound call (fetch, label by batch, judge), holds per-run and per-host in-flight counts and a per-call judge lease; token expiry, Stop, `CF-Connecting-IP` and parallel-request tests (R7.c, R10.a) added. |
| 4 | High | Accepted | Checked: no bound on links or URL length. R8 adds 100 links, 2,048-character URLs, 64 KB robots.txt, decoded-body limit, 128 KB seed pages; R22 defines T1 (deployed Free test Worker, worst-case fixtures, ≤ 8 ms CPU, ≤ 45 subrequests). Owner stop kept (assumption 5). |
| 5 | High | Accepted | Checked: 011 R20 said "until the job ends (05:00 at the latest)"; 012 R21 says "judge is off 02:55–05:00". Fixed to 02:55–05:00 every night, Mac local time; PID in the lock, stale-lock rule, launchd kill at 04:58, R20.a manual cases. The 012 part is a cross-spec request. |
| 6 | Medium | Accepted | Checked: R5 1,500 vs R7 4,000 characters; no output or thinking limits; first-word parser accepted `YES…`. R13 is now one LLM contract (limits, temperature, thinking off, exact-answer parser); injection is described as a limit of the numbers; T1 measures neurons, with an owner stop if 30 runs/day do not fit (assumption 9). |
| 7 | Medium | Accepted | Checked against `doctool/doc_mana.py:34-73`, `j_script_run_c_dynamicfocus.py:60-66` and `g_evaluator/c_metrics.py:44-170`. New "Definitions" section: URL key, host, profile, frontier, processed and accepted pages, order, stop, label and metric populations. R5.a (formulas, pre-tokenized) and R5.b (tokenizer) are separate. |
| 8 | Medium | Partly | Correct: 30 runs from one IP do not fit 3 runs per IP per day, and Turnstile needs a person. A bypass changes how the owner's per-IP cap applies, so it is **NEEDS OWNER Q-C1** (options in the spec). Schedule outside 02:55–05:00, failed and partial runs listed, and the T0 quality threshold (≥ 70 % agreement) added. |
| 9 | Medium | Accepted | Checked: `013-project-readme-window/spec.md:268-270` needs `tool:status` `{ judge: "online" \| "offline" }`; 011 adds `busy`. R15 now sends `tool:status` with `busy`, throttles `tool:stage` to one per 500 ms with one active stage, and clears on end, Stop and error. 013 must add `busy` (cross-spec request). |
| 10 | Medium | Accepted | Checked: `012-insider-live/spec.md:92` allows "D1 or 011's `Limits`"; `wrangler.jsonc` has no script. 011 now defines the `Limits` schema, IP hashing and retention, `/api/*` headers and 404; ownership of the shared router and bindings is a cross-spec request. |
| 11 | Medium | Accepted | Checked: Stop had no lifecycle and no release route. R21 adds Stop, new Start, unload, run-id guard, `/api/crawl/stop`, tab-switch behaviour, Download after Stop; R21.a tests a delayed old answer. |
| 12 | Medium | Accepted | R12 now: one record per (URL, strategy) pair, RFC 4180 quoting, formula prefix, BOM; R12.a parses the CSV. |
| 13 | Medium | Partly | Accepted: counter retention (2 days, hashed IP), log rules, a visitor data note (R14), prelaunch terms checks in the ledger. Not resolvable here: legal permission for excerpts stays **Unverified**; the owner chose 300-character excerpts (Q5). A conflict found at the check stops the work for the owner. |
| 14 | Medium | Rejected (for 011) | It concerns 012's removal path and 013's case-study JSON, not 011. Forwarded as a cross-spec request. |
| 15 | Medium | Accepted | Checked: `src/sheet/layout.ts:49` (crawler window), `src/sheet/sheet.css:191` (`overflow: clip`). The Try panel scrolls inside itself, 6 rows at sheet size, 2 × 2 columns when narrow; R18 adds focus keeping, live-region errors, and R18.a views. |
| 16 | Medium | Accepted | Checked: `tests/e2e/sheet.spec.ts:54` checks navigation only; `scripts/sheet-guard.ts:76` has 150 KiB and the 100 KiB shell budget. The network check now runs through Try; R23 adds lazy load, both budgets and a long-task check; the commands are listed. |

Counts: 13 accepted, 2 partly, 1 rejected (for 011, forwarded).

## Codex output (verbatim)

**Verdict: fix the High findings before owner approval.** The browser-driven design is plausible within the stated subrequest limit. CPU use and abuse protection remain unproven.

**Observed** below means local file evidence read with `nl -ba` and `rg`. **Derived** means a consequence of that evidence. External limits were not reverified.

1. **High — The SSRF guard does not establish that destinations are public.**  
   **Observed:** [011 spec:54](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:54) rejects IP literals and selected hostname forms. [Research:87](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/research.md:87) leaves private-address reachability unverified.  
   **Derived:** A valid hostname can resolve to a private address. A signed link proves discovery, not destination safety.  
   **Fix:** Make public-destination enforcement a prerequisite. Define the runtime guarantee or mechanism, including redirects and robots fetches. Test private DNS answers and DNS changes. If Workers already blocks these destinations, record that guarantee and verify it.

2. **High — Browser HTML parsing can defeat the home-IP and same-origin promises.**  
   **Observed:** [011 spec:52](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:52) sends fetched HTML to `DOMParser`. Its protection is “no script runs, nothing inserted.”  
   **Inferred risk:** Inert HTML parsing is not a sufficient guarantee against resource downloads. Image or iframe markup could cause browser requests and expose the visitor’s IP.  
   **Fix:** Require parsing that cannot load resources. Add intercepted-browser tests with images, frames, resource URLs, scripts, and event attributes. Assert zero page-derived requests and safe text-only rendering.

3. **High — Client concurrency limits do not protect the Worker or Mac.**  
   **Observed:** [011 spec:52](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:52) places concurrency control in the browser. R7 grants one **run** the judge lease. R10 names counters without defining atomic reservations.  
   **Derived:** A caller can submit concurrent requests using one valid token. One run can also submit all judge calls together.  
   **Fix:** Require atomic reservations before outbound work, including label-batch sizes. Enforce per-host fetch limits and one active judge call on the server. Define token expiry, lease ownership, replay handling, trusted IP extraction, and request-frequency limits. Test simultaneous requests at every cap boundary.

4. **High — The 10 ms CPU prerequisite lacks bounded work and a complete pass rule.**  
   **Observed:** [011 spec:30](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:30) leaves CPU fit unverified. [Approach:114](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:114) requires HTML parsing, link extraction, and HMAC generation. No link-count or URL-length limit is stated.  
   **Derived:** A 256 KB page can contain thousands of links. Body size alone does not bound signing and serialization costs sufficiently. Seed parsing and ten-page label requests also need measurement.  
   **Fix:** Define T1 explicitly. Bound extracted links, URL lengths, robots bodies, decompressed bodies, and API payloads. Measure worst-case requests on the deployed Free runtime. Specify redirect, cache, and robots subrequest accounting. Preserve the owner stop if signed-link processing fails.

5. **High — The nightly lock protocol has conflicting schedules and incomplete crash recovery.**  
   **Observed:** [011 spec:65](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:65) permits reopening when the job ends. [012 spec:58](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:58) fixes judge downtime at 02:55–05:00. Cleanup relies on `trap` or `finally`.  
   **Derived:** Early completion has two valid interpretations. Forced termination can leave a stale lock. Removing a lock at 05:00 can permit overlap if a child process survives.  
   **Fix:** Choose one schedule and timezone for both specs. Define a supervisor that stops surviving job processes before reopening Ollama. Specify stale-lock recovery and local proxy enforcement. Test early completion, reboot, forced termination, a hung child, and an in-flight judge call.

6. **Medium — AI limits and answer parsing do not support the budget assumptions.**  
   **Observed:** [Research:177](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/research.md:177) assumes roughly 500 input tokens and three output tokens per label. [011 spec:55](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:55) does not require output-token or reasoning limits. R5 uses 1,500 judge characters, while R7 accepts 4,000.  
   **Derived:** Character limits do not guarantee token counts. Model defaults, prompt overhead, and reasoning output can invalidate the daily estimate. R13’s first-word parser also accepts an injected answer beginning with `YES`.  
   **Fix:** Pin model settings, token limits, reasoning behavior, and truncation in one shared contract. Measure actual neuron usage. Define handling for malformed answers and batch failures. Describe prompt injection as a metric-quality limitation, then test its effect.

7. **Medium — Strategy initialization and metric populations are ambiguous.**  
   **Observed:** [011 spec:51](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:51) requires seed means and IDF-weighted similarity. R9 defines metrics, but does not settle which fetched, accepted, or rejected pages enter each metric.  
   **Derived:** Implementations can disagree about seed costs, shared fetches, duplicate URLs, domain identity, IDF updates, and whether rejected pages count toward precision. Stemming also prevents general equality with the original lemmatizer under R5.a.  
   **Fix:** Add normative pseudocode and small fixtures. Define bootstrap accounting, shared caches, URL normalization, domain meaning, tie-breaking, and metric denominators. Separate tests of the original formulas from tests of the changed text processing.

8. **Medium — The evaluation schedule violates the per-IP cap.**  
   **Observed:** [011 spec:56](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:56) permits three runs per IP daily. [Approach:133](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:133) schedules 30 real runs over 2–3 nights.  
   **Derived:** One evaluation machine can complete at most nine runs in three daily allocations. An unattended script also needs a defined Turnstile path.  
   **Fix:** Specify an authenticated evaluation mode that preserves the site-wide and AI caps while handling the per-IP limit explicitly. Schedule outside judge downtime. Record failed, incomplete, and unlabeled runs, plus the model-selection quality threshold.

9. **Medium — The diagram event contract is incomplete and internally inconsistent.**  
   **Observed:** [013 spec:268](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:268) requires crawler `tool:status` events. [011 spec:61](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:61) defines only `tool:stage`. R7 adds `busy`, absent from 013’s judge status union.  
   **Derived:** The diagram can remain silent or stale. Four concurrent fetches also make “events in order” ambiguous for a single active box.  
   **Fix:** Define shared event types, targets, stage IDs, status values, and terminal clearing. Specify how concurrent stages select the displayed stage. Test real tool emissions through the 013 listener.

10. **Medium — Shared Worker and storage ownership are not settled.**  
    **Observed:** [011 spec:118](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:118) requires a shared SQLite `Limits` object. [012 spec:92](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:92) calls D1 shared and allows either D1 counters or `Limits`. Current [wrangler.jsonc:11](/Users/rargu/DevPageOS/wrangler.jsonc:11) contains only static assets.  
    **Derived:** Separate implementations can choose different counters or replace each other’s bindings and dispatcher.  
    **Fix:** Assign one shared infrastructure task. Define bindings, SQLite migrations, D1 ownership, counter namespaces, cleanup, and route dispatch. Include common API headers and error responses. Verify both implementation orders, unknown API routes, and unchanged static routing. No KV dependency is currently required.

11. **Medium — Stop, mode changes, and lease release lack acceptance checks.**  
    **Observed:** [011 spec:48](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:48) includes Stop. R15 preserves a run through Expand, but does not define Stop, switching to Read/Demo, or stale responses after another Start. R7.c requires lease release, while the route table has no release operation.  
    **Derived:** Old callbacks can modify a new run, and stopped runs can retain the judge lease for eight minutes.  
    **Fix:** Define a run lifecycle. Specify cancellation, download availability, mode-switch behavior, and authenticated lease release. Test delayed responses after Stop and restart. Include reduced-motion changes without restarting work or changing quotas.

12. **Medium — Downloaded CSV contains untrusted spreadsheet input.**  
    **Observed:** [011 spec:58](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:58) exports titles and excerpts from arbitrary pages. R12.a checks only file presence and line count.  
    **Derived:** A page title beginning with `=` can become a spreadsheet formula. Quotes and newlines also invalidate a simple physical-line count.  
    **Fix:** Specify CSV escaping and formula neutralization. Define whether records represent URLs or URL–strategy pairs. Test formulas, quotes, newlines, Unicode, and shared URLs by parsing the exported CSV.

13. **Medium — Privacy and legal prerequisites are not acceptance gates.**  
    **Observed:** [011 spec:160](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:160) restricts topic/IP storage. It does not define logging retention or crawler IP hashing. [Research:198](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/research.md:198) leaves seed-service terms unverified.  
    **Derived:** Application storage rules do not cover Worker logs, proxy logs, search providers, or Workers AI processing. Robots compliance alone does not establish permission to redistribute excerpts.  
    **Fix:** Define daily-counter retention, log redaction, and the visitor-facing data-flow notice. Add recorded prelaunch checks for provider terms and excerpt use. Legal permission remains **Unverified** in this review.

14. **Medium — Sibling removal promises do not cover cached and duplicated identities.**  
    **Observed:** [012 spec:50](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:50) promises immediate hiding. Results cache for five minutes, and [profile images:57](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:57) cache immutably for one year. [013 spec:113](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:113) publishes separate case-study JSON.  
    **Derived:** Updating D1 does not remove cached responses, bundled fallback identities, or report JSON. `noindex` also does not guarantee that rendered case-study text stays out of search results.  
    **Fix:** Add one correction procedure covering D1, images, caches, fallback data, and case studies. Define achievable removal timing. Test each copy and describe indexing protection as a mitigation.

15. **Medium — Try layout and accessibility lack measurable checks.**  
    **Observed:** [011 spec:66](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:66) requires native controls and reduced motion. The crawler has a fixed [522 px window:49](/Users/rargu/DevPageOS/src/sheet/layout.ts:49), while [window CSS:191](/Users/rargu/DevPageOS/src/sheet/sheet.css:191) clips overflow. No Try scrolling policy is specified.  
    **Derived:** Controls, Turnstile, metrics, and four columns can be clipped. Continuously replacing newest-first links can also discard keyboard focus.  
    **Fix:** Define internal scrolling and responsive column behavior. Test sheet and expanded views at the named desktop/phone sizes. Include field labels, error announcements, keyboard-only operation, focus preservation during updates, contrast, and live motion-preference changes.

16. **Medium — Verification does not exercise the new network and performance paths.**  
    **Observed:** [011 spec:63](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:63) amends 010 R9 for Turnstile. The current [live check:54](/Users/rargu/DevPageOS/tests/e2e/sheet.spec.ts:54) tests navigation and idle work. The build enforces [100 KiB shell and 150 KiB total:76](/Users/rargu/DevPageOS/scripts/sheet-guard.ts:76).  
    **Derived:** Navigation-only checks miss Try’s requests. Passing the bundle-size guard does not establish responsiveness during parsing and scoring.  
    **Fix:** Extend checks through Try loading, Turnstile, crawling, Stop, Download, and Read/Expand. Allow only approved Turnstile destinations. Verify lazy loading and both size budgets. Add a representative maximum-run responsiveness check and record the required lint, unit, and relevant e2e commands.

**Not checked:** current Cloudflare/Ollama limits, model availability, provider terms, Tunnel/Access behavior, actual DNS protections, Mac performance, or original Python outputs. No network actions, deploys, or file changes occurred. Tests were not run.