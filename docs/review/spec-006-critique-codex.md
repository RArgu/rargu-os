# Spec 006 critique (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -s read-only --ephemeral`
- **Model / effort:** gpt-6.1-sol / high
- **Session id:** 01a166e9-b0a1-7841-8163-5c90174620f3 · **Tokens:** 110,464
- **Date:** 2026-10-22 · **Commit:** 7b02c09

## Dispositions

Checked by Claude: `part1.html:149` (opacity .45), `part1.html:291` (static aria-label), `reused.js:103` (pending
wallet callbacks). All 10 accepted. The rejected-row contrast fix follows the owner's 2026-10-22 ruling "fix the weak
pairs".

| # | Sev | Disposition | Change |
|---|---|---|---|
| 1 | Medium | Accepted | R3: exact wording; candidates-only line. |
| 2 | Medium | Accepted | R9: chart text summary; correct button names. |
| 3 | Medium | Accepted | R6: Replay cancels old callbacks. |
| 4 | Medium | Accepted | R5, R7: visibility, hidden tab, live preference. |
| 5 | Medium | Accepted | R1, R2: precision and flag rules; fixtures. |
| 6 | Medium | Accepted | R8: rejected rows ≥ 4.5:1. |
| 7 | Medium | Accepted | R1: 14 rows per column. |
| 8 | Medium | Accepted | R12: named views, frozen seed and time, allowed differences. |
| 9 | Medium | Accepted | R11: requests through all controls. |
| 10 | Low | Accepted | R10: logical px, DPR check. |

## Codex output (verbatim)

Spec 006 needs revision before approval.

**Observed** evidence comes from `nl -ba`, `rg`, and read-only `node --input-type=module -e` checks. **Derived** describes consequences of that evidence.

1. **Medium — The simulation label still permits misleading feature claims.** [006 spec:26](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:26)

   **Observed:** Both mock notes describe a “real version” that steps through recorded datasets. See [crawler copy:298](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/part1.html:298) and [insider copy:313](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/part1.html:313). The owner instead defines future tools that run a crawler or check a supplied market ID ([owner decisions:19](/Users/rargu/DevPageOS/docs/OWNER_QUESTIONS.md:19)).

   **Derived:** Copying those notes passes R3.a while leaving the future feature unclear. The simulation label also does not preserve the distinction between suspicious candidates and proven insiders.

   **Spec fix:** Require explicit copy: “Simulated demo. The interactive tool is planned and is not available here.” Preserve the candidates-only qualification from [project content:16](/Users/rargu/DevPageOS/content/projects/polymarket-insider-trading.md:16). Test both statements.

2. **Medium — The chart lacks an accessible equivalent, and Pause has an incorrect name after activation.** [006 spec:25](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:25)

   **Observed:** The canvas has only a general label ([markup:311](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/part1.html:311)). The crawler button retains `aria-label="Pause"` when its icon changes to Play ([markup:291](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/part1.html:291), [handler:81](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/reused.js:81)). Spec 001’s named window regions do not describe chart contents.

   **Derived:** A screen reader cannot obtain the price movement from the chart. It also receives the wrong action name when the crawler is paused.

   **Spec fix:** Require a text summary with the spike time, price change, and flagged trades. Require native buttons with accurate action names. Add Enter/Space checks for Pause, Resume, and Replay, including preserved focus and no window drag.

3. **Medium — Replay can receive wallet entries from the previous run.** [006 spec:40](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:40)

   **Observed:** Replay cancels the animation frame but retains delayed wallet callbacks ([reused.js:103](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/reused.js:103)). A Node check executed those functions with controlled callbacks. After Replay reset the chart to hour `0.9`, two callbacks from the previous run inserted wallets.

   **Derived:** Porting this code violates “the list empties until the spike.” A replay test performed before the first spike misses the failure.

   **Spec fix:** Add: “Replay and unmount cancel every pending callback from the previous run.” Test Replay immediately after the first wallet appears. Assert that no old entries return before the new spike.

4. **Medium — Visibility and reduced-motion checks leave important states untested.** [006 spec:28](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:28)

   **Observed:** R5.a tests only an off-screen window. R6.a checks only two equal screenshots. The mock captures the motion preference once ([part2.js:5](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/part2.js:5)), runs a permanent crawler interval, and disconnects the chart observer after its first entry ([reused.js:80](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/reused.js:80), [:106](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/reused.js:106)).

   **Derived:** Frozen, incomplete content passes R6.a. Hidden-tab work and ignored preference changes can pass the listed checks.

   **Spec fix:** Define visibility using the current transformed window rectangle. Require suspension of frames and timers off screen or in a hidden tab. Resume from the same state and preserve the visitor’s Pause choice. Under reduced motion, require complete rows, chart, wallets, and footer by the next frame, including after Replay and a live preference change. Assert those contents and callback counts.

5. **Medium — Acceptance checks do not establish data correctness.** [006 spec:36](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:36)

   **Observed:** R1.a accepts any precision percentage. R2.a accepts any 1–4 wallets with amounts and hours. R4.a proves repeatability, not valid results. The mock calculates cumulative precision and derives wallet amounts and timing from trades ([reused.js:77](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/reused.js:77), [:104](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/reused.js:104)).

   **Derived:** Hardcoded percentages, an incorrect page total, or wallets unrelated to chart dots can pass.

   **Spec fix:** Define precision as relevant pages divided by all processed pages per strategy. Define the footer as the sum across strategies. Define trade amount units, the flag rule, and `hoursBefore = spikeHour − tradeHour`. Add independent fixtures with exact expected percentages, totals, selected trades, amounts, and times. Check that list entries correspond to chart markers.

6. **Medium — Matching the mock conflicts with the required text contrast.** [006 spec:30](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:30)

   **Observed:** Rejected rows use `opacity: .45` ([part1.html:149](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/part1.html:149)). Using the mock’s foreground and background colors, Node calculations give **2.63:1 light** and **3.75:1 dark** for ordinary row text. Both fail 001 R18’s 4.5:1 minimum.

   **Derived:** A faithful port fails R7. R7.a checks only dark chart-axis color, so it misses this conflict.

   **Spec fix:** Explicitly list rejected-row contrast as a required mock correction. Retain the ✗ and strike-through without reducing text below 4.5:1. Test composited colors, including opacity, in both themes. Verify canvas text and a live theme change as well.

7. **Medium — The endless crawler has no retention limit.** [006 spec:24](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:24)

   **Observed:** The mock limits each column to 14 DOM rows ([reused.js:77](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/reused.js:77)). Spec 006 omits that limit and any bound on retained generated history.

   **Derived:** An implementation can append indefinitely while passing the three-second acceptance check.

   **Spec fix:** Add: “Retain at most 14 rows per column. Keep cumulative counters without retaining discarded page records.” After many simulated steps, assert the row limit and correct cumulative statistics.

8. **Medium — The visual check does not name the demo views or allowed differences.** [006 spec:31](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:31)

   **Observed:** R8 has no acceptance case or comparison states. The comparison skill requires the spec to name those states ([skill:20](/Users/rargu/DevPageOS/.agents/skills/compare-vs-mock/SKILL.md:20)). The demos occupy separate positions on the sheet ([001 layout:150](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:150)). The mock crawler also uses unseeded randomness.

   **Derived:** Default screenshots can omit demo details. Uncontrolled data and animation create differences that cannot distinguish defects from expected variation.

   **Spec fix:** Add R8.a covering each demo after navigation, at desktop and phone sizes, in both themes. Include crawler paused, chart complete, and Replay before the spike. Freeze time and data for comparison. List permitted differences explicitly, including seeded data, corrected labels, accessibility, contrast, and motion behavior.

9. **Medium — The network check misses requests triggered by controls.** [006 spec:48](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:48)

   **Observed:** R9.a observes five seconds with the windows visible. It does not activate either control.

   **Derived:** A request made only by Replay passes the check despite violating R9 and the real-tools boundary.

   **Spec fix:** Record requests before navigation and exercise initial playback, Pause/Resume, and Replay through completion. Exclude only documented build assets. Fail on any demo data or service request. Keep real API integration in later specs, as required by [owner decisions:19](/Users/rargu/DevPageOS/docs/OWNER_QUESTIONS.md:19).

10. **Low — Device-pixel-ratio sizing has no acceptance check.** [006 spec:55](/Users/rargu/DevPageOS/docs/specs/006-data-demos/spec.md:55)

    **Observed:** The approach promises DPR sizing. The source renderer uses canvas backing dimensions directly for coordinates and text ([reused.js:93](/Users/rargu/DevPageOS/docs/mockups/rargu-os-src/reused.js:93)). No check covers the conversion.

    **Derived:** Increasing backing dimensions without converting drawing units can change padding, text size, and marker size.

    **Spec fix:** Define drawing coordinates in logical sheet pixels. Require backing dimensions to follow DPR without changing chart geometry. Compare DPR 1 and 2, and verify that resizing preserves playback state.

**Could not check:** No `src/sheet/` implementation exists (`rg --files src/sheet`). Browser layout, accessibility output, actual performance, DPR rendering, and motion behavior remain **Unverified**. I did not run build, lint, unit, or e2e commands. Build and test pipelines generate files ([package.json:13](/Users/rargu/DevPageOS/package.json:13), [:17](/Users/rargu/DevPageOS/package.json:17), [playwright.config.ts:16](/Users/rargu/DevPageOS/playwright.config.ts:16)). No files changed, network actions ran, or deploys occurred.

## Prompt (verbatim)

You are an independent read-only reviewer for DevPageOS (being redesigned as RArgu OS). Do not modify files.

Read first: AGENTS.md; docs/specs/006-data-demos/spec.md (the spec under review); docs/specs/001-sheet/spec.md, docs/specs/002-app-host/spec.md and the other specs in docs/specs/ it depends on (critiques in docs/review/); docs/OWNER_QUESTIONS.md (owner decisions, binding); docs/mockups/README.md; docs/mockups/rargu-os-src/reused.js (crawler and insider sections), docs/mockups/rargu-os-src/part1.html, content/projects/focused-web-crawler.md, content/projects/polymarket-insider-trading.md.

Task: critique spec 006 before the owner approves it. Check that each requirement is right about the current code and mock (cite path:line), testable, and that each acceptance check can fail. Look for missing requirements, conflicts with other specs or owner decisions, honesty of labels (simulated data, unbuilt features), performance and reduced motion, accessibility, and work that belongs in another spec.

Constraints: No network actions, no deploys, no file changes. Owner decisions in docs/OWNER_QUESTIONS.md are binding; flag a conflict rather than override one.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, the evidence, and a concrete fix to the spec text. Keep observed facts apart from inference. End with what you could not check.
