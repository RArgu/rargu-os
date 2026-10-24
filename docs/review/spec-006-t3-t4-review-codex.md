# Spec 006 T3 and T4: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a168b2-dc36-78a3-9827-7c2f2df2bc82 · **Tokens:** 135,407
- **Date:** 2026-10-23 · **Scope:** uncommitted T3 (crawler) + T4 (insider) working tree against `5cbeab7`. One
  review: the tasks were built in parallel.
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | A finished insider chart does not redraw on a DPR change (R10) | Accepted. |
| 2 | Crawler lists shortened and insider cards compressed to fit the 001 window heights (R12) | Accepted. Lead decision, following the 005 Pentimento advisor precedent: restore the mock's inner sizes and grow both windows in the 001 layout table (001 Approach allows later specs to change sizes). The extra height comes from the real project text (as 001 L3), not from the demos. |
| 3 | Crawler browser test uses the page's own functions as its expected values (R1.a) | Accepted. |
| 4 | Insider idle test does not prove timers stop (R5.a) | Accepted. |
| 5 | Insider canvas aspect-ratio on the border box (~2 px short) | Accepted. |
| 6 | Crawler footer missing from the composited contrast table (R8) | Accepted. |

## Codex output (verbatim)

No High findings. Four Medium and two Low findings follow.

**Observed:** I reviewed HEAD `5cbeab7` with `git status --short`, `git diff HEAD`, `nl -ba`, `sed`, and `rg`. Consequences below are **derived** unless stated otherwise.

1. **Medium — A completed chart does not follow a later DPR change.**  
   [src/sheet/demos/insider.ts:168](/Users/rargu/DevPageOS/src/sheet/demos/insider.ts:168)

   **Observed:** DPR is read inside `draw()`. The resize subscription is only:
   ```ts
   sized = new ResizeObserver(draw);
   sized.observe(canvas);
   ```

   **Derived:** Move a completed chart between displays with different DPR values while its CSS size stays unchanged. The content-box observer has no size change to report, and playback has stopped. The backing store keeps its previous resolution, contrary to R10. The existing DPR test covers separate initial contexts.

   **Fix:** Subscribe to resolution changes and redraw without changing `at`. Remove that subscription on unmount. Add a check for DPR changing while a completed chart keeps its CSS size.

2. **Medium — The layout changes exceed R12’s allowed differences.**  
   [src/sheet/demos/crawler.css:28](/Users/rargu/DevPageOS/src/sheet/demos/crawler.css:28), [src/sheet/demos/insider.css:31](/Users/rargu/DevPageOS/src/sheet/demos/insider.css:31)

   **Observed:** The crawler replaces the mock’s fixed `height:178px` list with `flex:1; min-height:0`. Its footer now occupies the demo area. Insider cards use:
   ```css
   padding: 4px 7px;
   line-height: 1.2;
   ```
   The mock uses `padding:5px 7px` and inherits `line-height:1.55`.

   **Derived:** These choices shorten the crawler lists and compress the wallet cards. R12 permits data, wording, contrast, accessibility, and motion differences. It does not permit this general layout compression. Comments explain the choices but do not establish approval.

   **Fix:** Restore the mock’s internal dimensions. Resolve the required window height through the documented layout process, or record an explicit approved exception before accepting T6.

3. **Medium — The crawler browser test shares its numerical oracle with the page.**  
   [tests/e2e/crawler.spec.ts:100](/Users/rargu/DevPageOS/tests/e2e/crawler.spec.ts:100)

   **Observed:** Expected browser output uses the same production functions:
   ```ts
   const c = crawl(crawlerStream(SEED));
   const p = precision(col);
   ```
   The browser test advances roughly 60 further steps and checks `length <= ROW_CAP`. The exact 40/800 totals and 200-step fixture run occur only in jsdom.

   **Derived:** A shared precision error can pass the browser comparison. For example, rounding precision to tenths preserves the fixture’s 30/40/50/60 percentages but corrupts other ratios. The exact browser fixture check required by T3/R1.a remains absent.

   **Fix:** Compute seeded browser expectations independently from raw page records. Also run the 10/200-step fixture through the real renderer in a browser-only test harness excluded from production. Assert literal percentages, totals, and exactly 14 retained rows.

   **Observed:** The current injection itself is appropriately isolated: `mount` accepts a source argument, while [main.ts:150](/Users/rargu/DevPageOS/src/sheet/main.ts:150) passes none. I found no visitor-facing selector for it.

4. **Medium — The insider idle test does not establish that callbacks stop.**  
   [tests/e2e/insider.spec.ts:521](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:521)

   **Observed:** The test named “no timer is left” checks only:
   ```ts
   expect(await draws(page)).toBe(n);
   expect(await hour(page)).toBe(HOURS - 1);
   ```
   Instrumentation exposes `__timers`, but no test reads it. The off-screen test also saves `ran(page)` without asserting it remains unchanged during the absence.

   **Derived:** A recurring callback that leaves the chart unchanged passes these checks. That misses R5.a’s callback requirement and the requested idle-work check.

   **Fix:** Assert zero pending timers and unchanged executed-callback counts after completion and while off screen. Keep the chart-state assertions too. The current implementation appears to stop its chain correctly by inspection.

5. **Low — The canvas repeats Pentimento’s border-box aspect-ratio defect.**  
   [src/sheet/demos/insider.css:18](/Users/rargu/DevPageOS/src/sheet/demos/insider.css:18)

   **Observed:**
   ```css
   width: 100%;
   height: auto;
   aspect-ratio: 900 / 420;
   border: 2px solid var(--outline);
   ```
   Shared CSS applies `box-sizing:border-box`. The mock gets its ratio from the canvas’s intrinsic content dimensions.

   **Derived:** The ratio now governs the border box. For the same width, its outer height is approximately 2.13 sheet px shorter than the mock. Drawing geometry and content below shift accordingly. This is an additional R12 difference.

   **Fix:** Apply the ratio to the content box, accounting for border width, or place the border on a wrapper. Check outer dimensions and drawn geometry against the mock.

6. **Low — The composited contrast table omits the crawler footer.**  
   [tests/unit/demo-contrast.test.ts:407](/Users/rargu/DevPageOS/tests/unit/demo-contrast.test.ts:407)

   **Observed:** `STYLES` adds an `"insider footer"` chain but no crawler footer chain. The crawler footer now sits under `.crawl-demo`.

   **Derived:** A crawler-specific footer color or ancestor opacity regression escapes this composited check. The generic token-pair test cannot detect that cascade change. This leaves incomplete coverage of R8’s “every text” requirement.

   **Fix:** Add the crawler footer’s actual element chain, with `paper-2` as its background and a 4.5:1 minimum.

**Other review results:** By source inspection, each demo owns one timeout chain. Replay, Pause, visibility changes, and unmount clear the applicable timeout. Crawler rows use `textContent` and text nodes. Build-generated wallet text is escaped. Simulation labels, native action names, `aria-describedby`, and shared `--ring` focus styles are present. I found no new storage, dependency, third-party request, or old-OS runtime import.

The existing test edits preserve their intent: `.button.home` narrows the Home count correctly, horizontal scrolling still exercises Castle Wars visibility, and the fourth reverse Tab accounts for Replay. The new timing waits use the fake clock. The insider `timeStamp` override changes event timing, but I found no changed throw behavior on its tested control paths.

**Could not check:** Tests, lint, build size, browser rendering, actual accessibility output, live DPR behavior, or the stated 147 px crawler measurement. No files changed. No test, network, deploy, or git-write commands ran. T5’s remaining motion/network checks and T6’s live-theme/mock comparison remain unverified.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/006-data-demos/spec.md (all) and tasks.md (rows T3 and T4; T5 does reduced motion + no-network tests, T6 live theme change + mock comparison)
- docs/review/spec-006-critique-codex.md and docs/review/spec-006-t1-t2-review-codex.md
- docs/specs/001-sheet/spec.md (R7, R17, R18, R19, R21, R22, "Advisor decisions") and the built 005 patterns these windows copy: src/sheet/demos/castlewars.ts, pentimento.ts, press.ts, visibility.ts
- Mock: docs/mockups/rargu-os-src/part1.html and reused.js (crawler and insider)
- The change under review: the uncommitted working tree against HEAD (5cbeab7). Run `git status` and `git diff HEAD`, and read the new untracked files: src/sheet/demos/crawler.ts, crawler.css, insider.ts, insider.css, tests/e2e/crawler.spec.ts, tests/e2e/insider.spec.ts, tests/unit/crawler-mount.test.ts, tests/unit/insider-mount.test.ts. Also read src/sheet/demos/crawler-data.ts, insider-data.ts, demos.css, tests/unit/demo-contrast.test.ts, src/sheet/main.ts, scripts/sheet-content.ts.

Task: review T3 (crawler window: R1 four streaming columns, precision per column, footer sum, Pause/Resume; R3 sentence visible without scrolling; R5 rows at rest, start on first visible, stop off screen / hidden tab, resume same state, Pause stays; R6 unmount cancels; R9 button names match action, Enter/Space, no window drag) and T4 (insider window: R2 chart draws over time, spike, trade dots by size, flagged list with wallet, amount, hours before and highlighted dots; R3 both sentences; R5; R6 Replay and unmount cancel every pending callback; R9 Replay + text summary next to the canvas; R10 logical sheet px geometry, DPR backing store, resize keeps playback state). Check:
1. correctness against each acceptance check (R1.a, R1.b, R2.a, R3.a, R5.a, R6.a, R9.a, R10.a);
2. timers: one chain each, cancellation on Replay/Pause/visibility/unmount/reduced motion, no timers or frames while idle (001 R22), leaks;
3. how the R1.a fixture is injected (must not be reachable by a visitor) and whether the e2e really proves the page's numbers;
4. the data-to-DOM path: no innerHTML with data (XSS-safe even though data is local), no real-looking addresses/URLs presented as real (R3);
5. layout decisions: the crawler footer moved inside the demo area and shorter lists (147 px vs the mock's 178); the insider list squeezed to fit; canvas aspect-ratio applied to the border box (a 2 px height slip, as Pentimento had);
6. accessibility (names, live regions if any, aria-describedby summary, focus rings with --ring, contrast entries for new colours), and gesture ownership for the new buttons (press.ts);
7. tests that cannot fail, sleeps, instrumentation that changes behaviour, and changes the agents made to other tests (sheet-windows.spec.ts home-button count, castlewars.spec.ts scroll direction, sheet-a11y.spec.ts Shift+Tab count): do they keep the tests' intent?

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, no old-OS code or files under src/apps/, never art-source/. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
