# Spec 006: Codex implementation review (whole spec, T7)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a168d0-dcac-7843-a829-1e5ac3c3a86f · **Tokens:** 144,038
- **Date:** 2026-10-23 · **Scope:** committed range `516a625..d39fdb4` (T1–T5 and the code part of T6). This review
  also covers T5 and the T6 code, which had no separate review.
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Contrast test reverses stylesheet order (a later insider rule could hide wallet text) (R8) | Accepted. |
| 2 | Chart tests compare dots with the line, not with independent coordinates (R2) | Accepted. |
| 3 | No test proves Pause and Replay join the gesture owner (001 R21) | Accepted. |

## Codex output (verbatim)

No High findings. Three Medium findings leave verification gaps before **Verified (local)**.

**Observed evidence:** committed source read with `git diff 516a625..d39fdb4` and `git show d39fdb4:<path> | nl -ba`. The consequences below are **derived**, not reproduced in a browser.

1. **Medium — The contrast test reverses stylesheet precedence.**

   [tests/unit/demo-contrast.test.ts:438](/Users/rargu/DevPageOS/tests/unit/demo-contrast.test.ts:438)

   **Observed:**
   ```ts
   rulesOf([read("src/sheet/sheet.css"), ...others(), demosCss])
   ```
   This puts `demos.css` last. The page imports crawler styles, then `demos.css`, then insider styles. See [crawler.ts:14](/Users/rargu/DevPageOS/src/sheet/demos/crawler.ts:14), [insider.ts:17](/Users/rargu/DevPageOS/src/sheet/demos/insider.ts:17), and [main.ts:10](/Users/rargu/DevPageOS/src/sheet/main.ts:10).

   **Derived:** Adding this rule to `insider.css` produces invisible wallet text:
   ```css
   .ins-demo .flags b { color: var(--win-bg); }
   ```
   The unit test instead lets `demos.css` restore the accent color. The browser theme test checks rows and canvas text, not wallets. This leaves a false negative under **R8/R8.a**.

   **Fix:** Match the page’s stylesheet order in the contrast test. Add a regression check proving that a later wallet-color override fails.

2. **Medium — Chart tests do not verify hour or price coordinates independently.**

   [tests/e2e/insider.spec.ts:346](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:346)

   **Observed:** The test compares dots with the rendered line:
   ```ts
   expect(all[i].x).toBeCloseTo(line[t.hour][0], 2);
   expect(all[i].y).toBeCloseTo(line[t.hour][1], 2);
   ```
   It checks the line’s point count, but does not check those points against expected hour and price coordinates.

   **Derived:** Replacing the shared `X()` mapping with `() => PAD` collapses the price line and every trade onto one vertical line. These assertions still agree. The DPR tests also compare two renders of the same mapping. This misses **R2/R2.a**: trades must appear at their actual hours on the market’s price chart.

   **Fix:** Assert numeric X/Y coordinates from independent plot bounds and pinned price values. Check flagged dots against those expected coordinates.

3. **Medium — No test proves that Pause and Replay claim gesture ownership.**

   [tests/e2e/crawler.spec.ts:446](/Users/rargu/DevPageOS/tests/e2e/crawler.spec.ts:446), [tests/e2e/insider.spec.ts:633](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:633)

   **Observed:** Both tests drag from a button and assert that the window stays put. However, the window handler already excludes buttons:
   ```ts
   if (e.button !== 0 || (e.target as Element).closest("button")) return;
   ```
   See [windows.ts:248](/Users/rargu/DevPageOS/src/sheet/windows.ts:248).

   **Derived:** Removing either new `ownPresses()` call leaves these tests passing. A second finger could then pan the paper while Pause or Replay is held. Existing touch tests cover Castle Wars and Pentimento only. Thus the new integration with **001 R21** has no effective regression test.

   **Fix:** Extend the touch ownership checks to Pause and Replay. Verify blocked competing presses, stopped glide, and ownership release after cancellation.

No requirement R1–R11 is wholly untested. The gaps above concern specific behavior and false negatives.

| Requirement / acceptance | Test or gap |
|---|---|
| R1 / R1.a | [crawler-mount.test.ts:62](/Users/rargu/DevPageOS/tests/unit/crawler-mount.test.ts:62), [200 steps:89](/Users/rargu/DevPageOS/tests/unit/crawler-mount.test.ts:89), [browser tally:246](/Users/rargu/DevPageOS/tests/e2e/crawler.spec.ts:246) |
| R1.b | [crawler.spec.ts:293](/Users/rargu/DevPageOS/tests/e2e/crawler.spec.ts:293) |
| R2 / R2.a | [rule boundaries:87](/Users/rargu/DevPageOS/tests/unit/insider-data.test.ts:87), [rendered flags:333](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:333). **No independent coordinate test.** |
| R3 / R3.a | [crawler.spec.ts:317](/Users/rargu/DevPageOS/tests/e2e/crawler.spec.ts:317), [insider.spec.ts:424](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:424) |
| R4 / R4.a | [crawler-data.test.ts:164](/Users/rargu/DevPageOS/tests/unit/crawler-data.test.ts:164), [insider-data.test.ts:125](/Users/rargu/DevPageOS/tests/unit/insider-data.test.ts:125) |
| R5 / R5.a | [crawler.spec.ts:366](/Users/rargu/DevPageOS/tests/e2e/crawler.spec.ts:366), [insider.spec.ts:482](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:482) |
| R6 / R6.a | [Replay:582](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:582), [crawler unmount:146](/Users/rargu/DevPageOS/tests/unit/crawler-mount.test.ts:146), [insider unmount:86](/Users/rargu/DevPageOS/tests/unit/insider-mount.test.ts:86) |
| R7 / R7.a | [data-demos.spec.ts:213](/Users/rargu/DevPageOS/tests/e2e/data-demos.spec.ts:213), including Replay and live preference change |
| R8 / R8.a | [demo-contrast.test.ts:472](/Users/rargu/DevPageOS/tests/unit/demo-contrast.test.ts:472), [live themes:417](/Users/rargu/DevPageOS/tests/e2e/data-demos.spec.ts:417). **Cascade gap above.** |
| R9 / R9.a | [Pause keyboard:427](/Users/rargu/DevPageOS/tests/e2e/crawler.spec.ts:427), [summary:399](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:399), [Replay keyboard:607](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:607), [focus rings:254](/Users/rargu/DevPageOS/tests/e2e/sheet-a11y.spec.ts:254) |
| R10 / R10.a | [DPR:679](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:679), [resize:693](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:693), [simulated live DPR:719](/Users/rargu/DevPageOS/tests/e2e/insider.spec.ts:719) |
| R11 / R11.a | [data-demos.spec.ts:305](/Users/rargu/DevPageOS/tests/e2e/data-demos.spec.ts:305) |
| R12 / R12.a | No comparison reviewed. Separate mock comparison is pending. |

**Not checked:** test execution, actual browser rendering, accessibility output, real hidden-tab or display-DPR behavior, or the final bundle size. I did not modify files or run network, deploy, git-write, or test commands.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/006-data-demos/spec.md (all, including "Lead decisions") and tasks.md
- docs/specs/001-sheet/spec.md (R2.a, R7, R17, R18, R19, R21, R22, the layout table, "Advisor decisions")
- Earlier per-task reviews whose accepted fixes are in: docs/review/spec-006-t1-t2-review-codex.md, docs/review/spec-006-t3-t4-review-codex.md. Do not repeat a fixed finding; look for problems across tasks.
- Mock: docs/mockups/rargu-os-src/part1.html and reused.js (crawler and insider)
- The change under review: the whole spec 006 implementation, committed range `git diff 516a625..d39fdb4` (T1–T5 and the code part of T6). Read every changed file under src/sheet/, scripts/ and the tests (tests/unit/crawler-data, insider-data, demo-contrast, crawler-mount, insider-mount; tests/e2e/crawler.spec.ts, insider.spec.ts, data-demos.spec.ts, and changes to sheet*.ts, castlewars.spec.ts).
- Ignore the uncommitted working tree.

Task: an implementation review of spec 006 as a whole before Verified (local). Check:
1. every requirement R1–R12 and acceptance check against the code and a test that can fail; list any requirement without a real test (R12 is the mock comparison, being done separately);
2. cross-task bugs: visibility + Pause + reduced motion + live theme + Replay + DPR changes + unmount; the shared press/gesture owner; 001 and 005 regressions caused by 006 (layout growth, BUILT list, test edits, main.ts wiring order, bundle size);
3. timers/frames while idle (001 R22), listeners not removed, leaks;
4. R3/R11: honest labelling, no request beyond own build assets, no real-looking data;
5. accessibility (names match actions, summary text, focus rings, contrast coverage of every rendered text incl. canvas);
6. test quality: tests that cannot fail, sleeps, instrumentation that changes behaviour, oracles shared with production code.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, no old-OS code or files under src/apps/, never art-source/. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. Then a short table: requirement -> test (file:line) or "no test". End with what you could not check.
