# Spec 001: Codex implementation review (whole spec, T9)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a1682f-73c6-7070-8862-342c9e671df2 · **Tokens:** 194,101
- **Date:** 2026-10-23 · **Scope:** committed range `c93db2d..1098968` (T1–T8, 10 commits)
- **Prompt:** below the output.

## Dispositions

The lead agent checked findings 4 and 7 directly (`scripts/sheet-content.ts` uses `status in STATUS`;
`scripts/sheet-guard.ts` allows any `art/*.png|json`). The others follow from the quoted code.

| # | Finding | Disposition |
|---|---|---|
| 1 | Reset can end framed on a focused window (Home's focus reveal overrides the start view) (R13) | Accepted. |
| 2 | Navigation during a flight targets the old position (R12) | Accepted. |
| 3 | Guard misses transitive CSS `@import` and external resources (R2, R2.b) | Accepted. |
| 4 | `status in STATUS` accepts `constructor`, `__proto__` (R14.b) | Accepted. |
| 5 | Glide keeps scheduling frames after reaching a boundary (R22) | Accepted. |
| 6 | Phone fit subtracts the bar inset; R5 says fit uses the full view | Accepted. Same rule as the T7 correction on desktop. |
| 7 | Castle Wars art exception allows any sibling PNG/JSON (R2.c) | Accepted. Six basenames only. |
| 8 | Zoom-interruption test can miss its window under load | Accepted. |
| 9 | Reset idle test runs no window flight | Accepted. |

Coverage gaps named in the table and also accepted: no lost-capture cancellation test (R21), no minimap drawing
assertion (R6), no inert-placeholder assertion (R7). R1.c (wrangler) stays a recorded manual check (T1 ledger).

## Codex output (verbatim)

What this change does: Adds `/next` with the sheet, eight windows, navigation, window physics, generated content, and build guards.

**Verdict: fix the Medium findings before marking this Verified (local).** No High findings.

**Observed:** I inspected `c93db2d..1098968` with `git diff`, `git show`, numbered source reads, and searches. Protected old-OS source files are unchanged. I ignored the working tree. Code quotes below are observed; behavioral conclusions are derived unless marked otherwise. No tests or network commands ran.

1. **Medium — Reset can finish at the wrong window**

   [src/sheet/main.ts:117](/Users/rargu/DevPageOS/src/sheet/main.ts:117), [src/sheet/windows.ts:343](/Users/rargu/DevPageOS/src/sheet/windows.ts:343)

   **Evidence:**
   ```ts
   view.start();
   for (const s of LAYOUT) wins.home(s.id);
   ```
   Each Home call can then override that start view:
   ```ts
   if (s.el.contains(document.activeElement))
     view.reveal(s.home[0], s.home[1], s.w, s.h);
   ```

   **Derived:** If Notes retains focus when Reset activates, its Home call pans toward Notes after `view.start()` frames CastleSiege. Reset therefore violates R13. Programmatic activation preserves this focus. **Inferred:** Safari pointer activation can reach this path because buttons can leave prior focus intact.

   **Fix:** Make Reset’s view authoritative. Start the Home flights before calling `view.start()`, or suppress Home’s focus reveal during Reset. Add a test with Notes focused when Reset activates.

2. **Medium — Navigation targets a moving window’s old position**

   [src/sheet/main.ts:104](/Users/rargu/DevPageOS/src/sheet/main.ts:104), [src/sheet/view.ts:507](/Users/rargu/DevPageOS/src/sheet/view.ts:507)

   **Evidence:**
   ```ts
   const [x, y] = wins.pos(s.id);
   view.panTo(x, y, s.w, s.h);
   ```
   `panTo()` calculates fixed `tx` and `ty`. Meanwhile, window flight continues:
   ```ts
   [s.x, s.y] = flightAt(s.fl.f, t);
   ```

   **Derived:** Choose a project while its throw is still in flight. Navigation centers the position captured at the click, while the window continues toward its landing. The final window can be hundreds of pixels away from the intended center. This breaks R12’s centering behavior. Current navigation tests wait for the throw to settle first.

   **Fix:** Resolve the navigation target from the window’s current position while it moves, then reconcile centering at landing. Preserve the throw’s destination. Add a controlled-time test that navigates during flight.

3. **Medium — The guard misses transitive CSS and external resources**

   [scripts/sheet-guard.ts:48](/Users/rargu/DevPageOS/scripts/sheet-guard.ts:48)

   **Evidence:**
   ```ts
   for (const id of chunk.moduleIds) {
     const path = relative(root, id.split("?")[0]);
     if (FORBIDDEN.test(path) && !ALLOWED.test(path)) bad.push(path);
   }
   ```
   CSS assets receive only a size calculation:
   ```ts
   if (asset?.type === "asset") gzip += gzipSync(asset.source).length;
   ```

   **Derived:** Adding `@import "../wm/wm.css"` to `sheet.css` can bypass the forbidden-module check. Vite folds CSS imports into their parent stylesheet and tracks those files as watch dependencies, rather than separate Rollup modules. The local Vite source confirms this dependency path at `node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:43134`.

   External CSS imports or resource URLs also have no build rejection path. This falls short of R2 and R2.b. The existing CSS fixture tests a direct TypeScript import, which does not exercise this bypass.

   **Fix:** Track and validate transitive CSS dependencies before extraction. Validate emitted HTML/CSS resource URLs and external module references. Add negative fixtures for CSS `@import` and an external resource. Ordinary static, literal dynamic, and shared chunk imports are already traversed correctly.

4. **Medium — Status validation accepts values outside the required set**

   [scripts/sheet-content.ts:60](/Users/rargu/DevPageOS/scripts/sheet-content.ts:60)

   **Evidence:**
   ```ts
   if (!(status in STATUS)) fail("status");
   ```

   **Derived:** `constructor`, `toString`, and `__proto__` satisfy `in` through the object’s prototype. An allowlisted project with one of these statuses can build with `undefined` badge content instead of failing with a file-and-field error. This violates R14.b.

   **Fix:** Use `Object.hasOwn(STATUS, status)`. Add inherited property names to the invalid-status cases.

5. **Medium — Glide keeps running after it reaches a boundary**

   [src/sheet/view.ts:227](/Users/rargu/DevPageOS/src/sheet/view.ts:227), [src/sheet/view.ts:242](/Users/rargu/DevPageOS/src/sheet/view.ts:242)

   **Evidence:** Blocked axes are removed only when glide starts:
   ```ts
   if ((vx > 0 && x0 <= 0) || (vx < 0 && x0 >= maxX)) vx = 0;
   ```
   Later frames clamp position but continue solely by elapsed time:
   ```ts
   vp.scrollLeft = Math.min(maxX, Math.max(0, x0 - vx * k));
   glideRaf = e < T ? requestAnimationFrame(step) : 0;
   ```

   **Derived:** Start ten pixels before the right limit with `vx = -1000` and `vy = 0`. Scrolling reaches the boundary after roughly 0.01 seconds, but callbacks continue until approximately 0.70 seconds. Nothing moves during that remaining interval, contrary to R22.

   This is distinct from the fixed T4 case: **starting** at a blocked boundary now works. **Reaching** a boundary during glide remains uncovered.

   **Fix:** Stop scheduling once every moving axis reaches its boundary. Clear the completion state too. Add a test that begins near a boundary.

6. **Medium — Phone Fit subtracts an inset despite the full-view requirement**

   [src/sheet/view.ts:124](/Users/rargu/DevPageOS/src/sheet/view.ts:124)

   **Evidence:**
   ```ts
   (vp.clientHeight - (matchMedia(PHONE).matches ? inset : 0)) / SHEET.h
   ```

   **Derived:** At a height-limited phone viewport, such as 760 × 390, Fit uses the height below the bar instead of the full view. Its zoom is therefore smaller than R5 specifies. The 390 × 844 test is width-limited, so it cannot detect this subtraction.

   The advisor decisions retain R5’s full-view rule. They specify bar clearance for start, Reset, and navigation.

   **Fix:** Calculate Fit from the full client dimensions and scroll its inset away as needed. Add a height-limited phone or rotation case that asserts the expected scale.

7. **Medium — The Castle Wars exception allows arbitrary sibling assets**

   [scripts/sheet-guard.ts:10](/Users/rargu/DevPageOS/scripts/sheet-guard.ts:10)

   **Evidence:**
   ```ts
   const ALLOWED = /^src\/apps\/castlewars\/art\/[^/]+\.(png|json)$/;
   ```

   **Derived:** A newly added `art/extra.json` or `art/unapproved.png` passes the guard. R2.c permits the six specified sprite PNGs and their companion JSON files, not every file with those extensions.

   **Fix:** Use the six approved basenames with the two permitted extensions. Add a fixture proving that an additional sibling asset fails.

8. **Low — The zoom-interruption test can miss its interruption window**

   [tests/e2e/sheet-card.spec.ts:440](/Users/rargu/DevPageOS/tests/e2e/sheet-card.spec.ts:440)

   **Evidence:**
   ```ts
   await page.click("#zOut");
   await resetWhile(
     page,
     '!["100%", "80%"].includes(document.querySelector("#zPct").textContent)',
   );
   ```

   **Derived:** The observer starts after the asynchronous click returns. Under parallel load, the 220 ms zoom can finish before observation starts. The predicate then never becomes true, and the test waits until timeout. Activating Reset inside the observed frame fixes only the latter half of this race.

   **Fix:** Use the controlled clock already present in the accessibility suite. Start zoom, advance to a verified intermediate state, and activate Reset before advancing again.

9. **Low — The Reset performance test does not exercise window flights**

   [tests/e2e/sheet-perf.spec.ts:132](/Users/rargu/DevPageOS/tests/e2e/sheet-perf.spec.ts:132)

   **Evidence:**
   ```ts
   // move away first so Reset has a flight to run
   await page.mouse.wheel(600, 400);
   ```

   **Derived:** Wheel scrolling moves the view. All windows remain at home, so Reset starts no window flight. The test cannot detect an idle-loop defect specific to Reset’s window animations. This weakens its claimed R13/R22 coverage.

   **Fix:** Move a window away from home, assert its changed sheet position, then Reset and collect the idle trace.

Coverage below describes assertions in the committed tests, **not results from this review**. Paths are relative to `tests/`.

| Requirement | Coverage and gaps |
|---|---|
| R1 | `e2e/sheet.spec.ts:6`; old-OS boot: `e2e/desktop.spec.ts:20`. **R1.c: no automated test**. Wrangler results are recorded in `docs/ledger/2026-10-22-build.md:57`. |
| R2 | Requests: `e2e/sheet.spec.ts:14`. Guard fixtures: `unit/sheet-guard.test.ts:27`. CSS/external-resource gaps: finding 3. |
| R2.b | Static, lazy, direct CSS, and app imports: `unit/sheet-guard.test.ts:27`, `:32`, `:35`, `:38`. **No shared/preload or transitive CSS fixture.** |
| R2.c | Allowed art: `unit/sheet-guard.test.ts:24`. **No test rejecting an extra sibling asset**; finding 7. |
| R3 | Both no-JS sizes and link targets: `e2e/sheet.spec.ts:52`. |
| R4 | Mouse: `e2e/sheet.spec.ts:165`; arrows/text field: `:218`; touch: `e2e/compact-sheet.spec.ts:100`; glide landing: `e2e/sheet-a11y.spec.ts:790`. Grid has manual comparison only. |
| R5 | Pointer anchor: `e2e/sheet.spec.ts:241`; fit/resize: `:257`; maximum: `:282`; synthetic Safari events: `:296`; touch pinch: `e2e/compact-sheet.spec.ts:119`; classic scrollbars: `e2e/sheet-scrollbars.spec.ts:12`. **Physical Safari trackpad: no automated test.** Landscape gap: finding 6. |
| R6 | Click, drag, and keyboard: `e2e/sheet.spec.ts:338`. **No test asserting minimap grid, window rectangles, or viewport rectangle drawing.** |
| R7 | Overlap: `e2e/sheet.spec.ts:381`, `e2e/sheet-windows.spec.ts:309`; layout/demo sizes: `e2e/sheet.spec.ts:431`. **No explicit inert-placeholder assertion.** |
| R8 | Independent fixtures: `unit/physics.test.ts:27`, `:51`, `:76`; settle bounds: `:124`; grab point: `e2e/sheet-windows.spec.ts:356`; sway/pin/catch: `:679`, `:718`, `:737`. |
| R9 | Double-click and pointer/keyboard Home: `e2e/sheet-windows.spec.ts:452`. |
| R10 | Rate comparison, held point, release without flight: `e2e/sheet-windows.spec.ts:501`. Uses timer-driven simulated rates, not hardware refresh rates. |
| R11 | Generated identity/escaping: `unit/sheet-content.test.ts:19`; clipboard refusal/success: `e2e/sheet-card.spec.ts:143`, `:164`. |
| R12 | Moved-window navigation: `e2e/sheet-card.spec.ts:204`; tools: `:239`; keyboard: `:249`; nearest: `:277`; phone marking: `e2e/compact-sheet.spec.ts:588`. **No navigation-during-flight test**; finding 2. |
| R13 | Throw/zoom Reset, repeated Reset, drag cancellation: `e2e/sheet-card.spec.ts:354`, `:372`, `:383`; view-motion interruption: `:423`, `:440`; phone: `e2e/compact-sheet.spec.ts:438`. Preserved window focus is untested; finding 1. |
| R14 | Allowlist: `unit/sheet-content.test.ts:60`; invalid fields: `:83`; HTML escaping: `:138`; schemes: `:164`; rendered content: `e2e/sheet.spec.ts:452`. Prototype-name gap: finding 4. |
| R15 | Phone fit/bar: `e2e/compact-sheet.spec.ts:382`; toggle/Escape/focus return: `:398`; title clearance: `:494`. |
| R16 | Zoom/view/storage: `e2e/sheet.spec.ts:478`; moved-window reload: `e2e/sheet-windows.spec.ts:611`. |
| R17 | Immediate throw/Home/Reset/zoom: `e2e/sheet-a11y.spec.ts:648`, `:672`; mid-motion changes: `:698`, `:733`, `:752`, `:809`; glide destination: `:797`. |
| R18 | Contrast pairs: `unit/sheet-content.test.ts:218`; keyboard rings: `e2e/sheet-a11y.spec.ts:421`; shadow/overlap pixels: `:1023`. The table covers the current opaque text/background pairs. |
| R19 | Names/order/focus/one scroll: `e2e/sheet-a11y.spec.ts:421`; movement: `:531`; Home: `:591`; interruptions/resize: `:955`, `:970`, `:999`; phone: `e2e/compact-sheet.spec.ts:606`. |
| R20 | **No automated comparison test.** Manual report: `docs/review/spec-001-mock-vs-build.md:5`. D1 was fixed but not re-shot, per `:68`. |
| R21 | Touch ownership: `e2e/compact-sheet.spec.ts:171`, `:186`, `:262`; cancel/blur: `e2e/sheet-windows.spec.ts:569`; canceled pinch: `e2e/compact-sheet.spec.ts:323`. **No explicit lost-capture cancellation test.** |
| R22 | Budget failure: `unit/sheet-guard.test.ts:43`; idle callbacks/trace: `e2e/sheet-perf.spec.ts:99`, `:107`, `:127`; initially blocked glide: `e2e/sheet.spec.ts:198`. **No general demo-asset assertion or boundary-reaching glide test.** Findings 5 and 9 apply. |

What I could not check:

- Lint, unit tests, e2e suites, build output, or the actual gzip total.
- Runtime requests, storage behavior, Wrangler routing, and old-OS/resume regressions.
- Browser rendering, clipping, native focus behavior, accessibility-tree output, and actual contrast pixels.
- Physical Safari trackpad input, native capture loss, and hardware 60/120 Hz behavior.
- Mock screenshots or the private comparison artifact. I inspected their sources and committed report.
- Owner confirmation of the two advisor decisions. Both remain marked “Owner to confirm” in `docs/specs/001-sheet/spec.md:219` and `:228`.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/001-sheet/spec.md (the whole spec, including "Advisor decisions" at the end) and docs/specs/001-sheet/tasks.md
- docs/mockups/README.md and the mock sources docs/mockups/rargu-os-src/part1.html and part2.js (the approved layout and behaviour baseline)
- The change under review: the whole spec 001 implementation, committed range `git diff c93db2d..1098968` (10 commits, T1–T8). Use `git diff c93db2d..1098968 --stat` first, then read every changed file under src/sheet/, scripts/, vite.config.ts, next.html, content/projects/, public/fonts/ (licence only), and the tests (tests/unit/*sheet*, physics, tests/e2e/sheet*.ts, compact-sheet.spec.ts, helpers.ts, playwright.config.ts). Earlier per-task reviews are in docs/review/spec-001-t4/t5/t6/t7-review-codex.md; their accepted fixes are in. Do not repeat a finding that is already fixed; do look for problems that only show across tasks.
- Ignore the uncommitted working tree (another agent is editing old-OS tests in parallel).

Task: an implementation review of spec 001 as a whole, before it is marked Verified (local). Check:
1. every requirement R1–R22 and acceptance check against the code and tests: is each one met and covered by a test that can fail? List any requirement with no real test.
2. cross-task bugs: interactions between gestures, window physics, view animations (zoom, glide, navigation pan), Reset, focus reveal, phone/desktop insets, resize and media changes, reduced motion; state left behind; frames scheduled while idle (R22).
3. build guards (R1, R2, R2.b, R2.c, R22 budget): can the forbidden-import check be bypassed (dynamic imports, CSS, shared chunks, preload)? Does `/` (old OS) and `/resume` stay unchanged except as R1 allows?
4. security and content: HTML escaping of identity and project content (R11, R14), link schemes, no third-party requests, no storage use.
5. accessibility (R18, R19): contrast table completeness, focus visibility, names, keyboard traps.
6. test quality: tests that cannot fail, fixed sleeps, frame counting instead of state, synthetic events where real input is possible, flakiness risks under parallel load.
7. spec drift: anything built that the spec does not ask for, or that contradicts the mock without a recorded reason.

Constraints (owner rules): static site, no third-party requests, no visitor state in storage, same layout for every visitor, respect prefers-reduced-motion, no new runtime dependencies, no change to old-OS code (src/kernel, src/fs, src/wm, src/boot, src/apps, index.html). Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. Then a short table: requirement → covered by which test (file:line) or "no test". End with a list of what you could not check.
