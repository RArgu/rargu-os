# Spec 006 T1 and T2: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a16886-e8e7-7973-93cf-d991c570dfd3 · **Tokens:** 78,607
- **Date:** 2026-10-23 · **Scope:** six new untracked files (built early, in parallel with 005, on top of `b3a6bd0`):
  `src/sheet/demos/crawler-data.ts`, `insider-data.ts`, `demos.css`, `tests/unit/crawler-data.test.ts`,
  `insider-data.test.ts`, `demo-contrast.test.ts`. One review for both tasks.
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Contrast test reads only modelled properties; an added background or ancestor opacity escapes it (R8.a) | Accepted. |
| 2 | Generated sizes never hit 13–19, so an off-by-one in the ≥ 20 rule passes (R2) | Accepted. Hand-built market with boundary cases. |
| 3 | Opacity multiplied twice for selectors on the same element | Accepted. |
| 4 | R1.a fixture not connected to the stream API | Accepted. Shared fixture and a source injection point. |

The lead accepted two implementer choices: the flag window is 1 ≤ spike − hour ≤ 14 ("the 14 hours before"), and
the contrast test stays in its own file (`demo-contrast.test.ts`) instead of the 001 table.

## Codex output (verbatim)

No High findings. Four findings follow. **Observed** evidence comes from `nl -ba`, `sed`, `rg`, and `git status --short`. Consequences below are **derived**, unless stated otherwise.

1. **Medium — The contrast test can miss the rendered background.**  
   [tests/unit/demo-contrast.test.ts:126](/Users/rargu/DevPageOS/tests/unit/demo-contrast.test.ts:126), [line 187](/Users/rargu/DevPageOS/tests/unit/demo-contrast.test.ts:187)

   **Observed:** Row entries specify `bg: [WIN]`. Measurement parses `rules(cssText)` but reads only the properties named in that table. The opacity guard likewise inspects only `rules(demos())`.

   **Derived:** Adding `background: var(--ink-dim)` to the rejected-row rule makes its text contrast exactly **1:1**, while this test still measures against `--win-bg`. Opacity on an applicable ancestor in `sheet.css` also escapes the guard. This weakens R8.a’s requirement to measure actual composited contrast.

   **Fix:** Check applicable background and opacity declarations against the modeled layers. Include shared ancestor rules. Fail when a declaration changes those layers without a corresponding measurement.

2. **Medium — Generated trades cannot test the lower size boundary.**  
   [src/sheet/demos/insider-data.ts:79](/Users/rargu/DevPageOS/src/sheet/demos/insider-data.ts:79), [tests/unit/insider-data.test.ts:18](/Users/rargu/DevPageOS/tests/unit/insider-data.test.ts:18)

   **Observed:** Sizes come from:
   ```ts
   Math.round(big ? 20 + rnd() * 40 : 2 + rnd() * 10)
   ```
   Every rule check uses generated markets. These contain sizes **2–12 or 20–60**, never 13–19.

   **Derived:** Changing the predicate to `t.size >= FLAG_MIN - 1` leaves all these checks unchanged. The oracle independently uses the spec’s numbers, but its inputs cannot expose this R2 error.

   **Fix:** Add a hand-built `Market` with literal expected flags. Include sizes 19 and 20 at 14 hours before, plus qualifying sizes at 15, 1, and 0 hours before.

3. **Low — Opacity is multiplied twice for the same row element.**  
   [tests/unit/demo-contrast.test.ts:134](/Users/rargu/DevPageOS/tests/unit/demo-contrast.test.ts:134), [line 194](/Users/rargu/DevPageOS/tests/unit/demo-contrast.test.ts:194)

   **Observed:** Rejected rows use `fade: [LI, NO]`. Measurement multiplies both selectors’ opacity values:
   ```ts
   (a, sel) => a * parseFloat(css.get(sel)?.opacity ?? "1")
   ```

   **Derived:** Both selectors match the same `<li>`. CSS resolves their declarations through the cascade. For example, generic `opacity: .7` and rejected `opacity: 1` produce an opaque rejected row. This test measures `.7`, potentially rejecting compliant text. That is incorrect compositing under R8.a.

   **Fix:** Resolve one opacity per element. Multiply opacity only across distinct ancestor and child elements.

4. **Low — The R1.a fixture has no connection to seed S or the browser stream.**  
   [tests/unit/crawler-data.test.ts:43](/Users/rargu/DevPageOS/tests/unit/crawler-data.test.ts:43), [src/sheet/demos/crawler-data.ts:95](/Users/rargu/DevPageOS/src/sheet/demos/crawler-data.ts:95)

   **Observed:** The 40-page fixture is local to the unit test and uses `ok: i < col + 3`. It never calls `crawlerStream`. The seeded stream can skip columns through `if (rnd() < 0.45) continue`.

   **Derived:** The test independently checks counters, but does not establish R1.a’s seeded fixture stream. T3 cannot currently reuse this fixture through the supplied stream API.

   **Fix:** Extract shared fixture steps and literal expected totals. Define a source injection point for T3, defaulting to `crawlerStream(SEED)`, so unit and e2e checks consume the same fixture.

The remaining static review found no generator defect. **Derived:** `1 <= spike - hour <= 14` correctly represents the generated integer hours. Sizes are rounded before classification, so displayed and classified amounts agree. See [insider-data.ts:68](/Users/rargu/DevPageOS/src/sheet/demos/insider-data.ts:68).

**Observed:** Crawler counters remain cumulative while rows are capped at 14. Its iterator retains state between calls. Insider data is separate from playback. These APIs can support pause/resume and replay without redesign. Callback cancellation remains T3/T4 work. See [crawler-data.ts:89](/Users/rargu/DevPageOS/src/sheet/demos/crawler-data.ts:89) and [insider-data.ts:52](/Users/rargu/DevPageOS/src/sheet/demos/insider-data.ts:52).

**Observed:** The data modules contain no DOM, storage, network calls, or executable `Math.random`. Wallets use invented `W-XXXX` labels. Crawler hosts match the required mock lists. Their presentation still needs the R3 simulation label.

**Could not check:** Test execution, prior failing-test evidence, or the provenance of pinned expected values. T3/T4 renderers are absent, so actual canvas colors, complete text-style coverage, visible labels, live themes, pause/resume, and callback cancellation remain **Unverified**. No files changed or test, network, deploy, or git-write commands ran.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/006-data-demos/spec.md (all) and tasks.md (rows T1, T2); docs/review/spec-006-critique-codex.md; docs/specs/001-sheet/spec.md R18 (contrast 4.5:1 normal, 3:1 large >= 24 px; light and dark)
- Mock: docs/mockups/rargu-os-src/reused.js (crawler placeholder and insider chart) and part1.html (crawler and insider CSS)
- The change under review: six NEW untracked files (not in git yet; ignore other working-tree changes): src/sheet/demos/crawler-data.ts, src/sheet/demos/insider-data.ts, src/sheet/demos/demos.css, tests/unit/crawler-data.test.ts, tests/unit/insider-data.test.ts, tests/unit/demo-contrast.test.ts. Also read src/sheet/sheet.css (the token values in :root and the dark block) and tests/unit/sheet-content.test.ts (the 001 contrast table, for comparison).

Task: review spec 006 T1 (seeded data modules: R1 precision = relevant / processed per strategy, at most 14 rows per column, footer total; R2 flag rule: size >= 20 ($k) and within the 14 hours before the spike, hours before = spike hour - trade hour; R4 same seed same data, another seed different) and T2 (R8: rejected rows keep the cross and strike-through with no opacity that drops text below 4.5:1; every row style and the canvas chart text meet R18 in both themes, computed as composited contrast). Check:
1. correctness of the generators and the flag rule, including the window boundary (the implementer chose 1 <= spike - hour <= 14) and rounding of sizes;
2. that the unit tests can fail and are independent of the code (expected values not just copied from the generator; the rule recomputed independently);
3. whether the API will serve the planned T3/T4 e2e (R1.a: a fixture stream of seed S with 10 pages per column with known pass/fail) and R5/R6 (pause/resume from the same state; replay cancels);
4. the contrast test: does it parse the real tokens, composite opacity/alpha correctly onto the real background, cover every text style the demos will render (including canvas text drawn from CSS variables), and fail on unaccounted opacity?
5. no real-looking wallet addresses, market names or URLs presented as real (R3); no Math.random; no DOM in data modules.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
