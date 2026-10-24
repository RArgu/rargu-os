# Spec 009 implementation review (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only
- **Session id:** 01a16d56-2249-7aa3-9186-151652f67c12 · **Tokens:** 203,841
- **Date:** 2026-10-24 · **Scope:** `9d4ae90..01e027c` (T1+T3, T2)
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | 404: a resize keeps a flight's old kick when its direction reverses | Accepted. Rebuild the flight from the current position; fixture with a reversed direction. Fixed. |
| 2 | 404: Home right after Enter leaves the queued throw active | Accepted. Cancel the flight in the at-home branch; Enter-then-Home fixture. Fixed. |
| 3 | Catch test accepts a re-throw with no inertia (pre-existing) | Accepted. Measure from the release position. Fixed. |

## Codex output (verbatim)

What this change does: It removes held tilt and scale, reduces pin wobble, adds temporary layer hints, rebuilds the 404 page, removes `musicHint`, and fixes phone marking.

I found two Medium defects and one Low test gap. No High findings. Observations below come from `git diff`, `nl -ba`, `rg`, and memory-only Node probes.

1. **Medium — Resize leaves a flight’s pin kick inconsistent with its new direction.** [public/404.html:469](/Users/rargu/DevPageOS/public/404.html:469)

   **Observed evidence:** Resize changes only `"w.fl.to = clamp(w, w.fl.to)"`. The flight retains its original start, time, duration, and kick.

   A controlled JSDOM probe started a rightward flight from translation 240 toward 600. A resize clamped its target to 144. The next frame jumped from 381.87 to 196.31, and the leftward landing produced **−0.49°** rotation.

   **Derived problem:** With the top-center grab, that leftward flight requires a positive kick. The retained negative kick violates R6’s adoption of R3’s pin-velocity rule. The [resize test](/Users/rargu/DevPageOS/tests/unit/page-404.test.ts:462) checks the final position but misses this.

   **Fix:** Rebuild the flight from its current position to the clamped target. Recalculate its duration, start time, and kick. Add a resize fixture that reverses the flight direction.

2. **Medium — Home can leave a queued throw active.** [public/404.html:330](/Users/rargu/DevPageOS/public/404.html:330)

   **Observed evidence:** The equal-position branch returns through `"w.th || w.v ? run() : draw(w)"` without clearing `w.fl`.

   A controlled JSDOM probe pressed Enter, then Home before the first animation frame. One frame remained pending. The digit ultimately rested at **translation 360**, rather than home at zero.

   **Derived problem:** Home sees the current position already at home and preserves the pending outward flight. This breaks R6.b’s Home behavior. Existing Home fixtures start after the digit has moved.

   **Fix:** Cancel or replace the previous flight before the equal-position return. Test Enter followed by Home with no intervening frame.

3. **Low — The catch test still accepts a re-throw with no inertia.** [tests/e2e/sheet-windows.spec.ts:952](/Users/rargu/DevPageOS/tests/e2e/sheet-windows.spec.ts:952)

   **Observed evidence:** The test drags 120 px left, then checks `"Math.hypot(end.x - c.x, end.y - c.y) > 20"` against the position **before that drag**.

   **Derived problem:** The held movement alone satisfies this assertion. Disabling the re-throw after a catch can therefore pass. This gap also exists in `9d4ae90`; the direction change did not introduce it.

   **Fix:** Record the release position and require subsequent flight beyond it. The lower 0.2° catch threshold remains valid: it establishes nonzero rotation before checking that the catch resets it.

The requirement coverage is otherwise sound by source inspection:

| Requirement | Code and test assessment |
|---|---|
| **R1** | [The central hint function](/Users/rargu/DevPageOS/src/sheet/windows.ts:88) covers held, flight, and wobble state. [R1.a](/Users/rargu/DevPageOS/tests/e2e/sheet-windows.spec.ts:827) checks motion and rest. [Raster tests](/Users/rargu/DevPageOS/tests/e2e/sheet-raster.spec.ts:186) detect a persistent change after dragging. |
| **R2** | Held transforms have no scale or tilt. The independent parser detects both. Pointer probes retain checks at 100%, 50%, and a sheet edge. |
| **R3** | The [fixed fixtures](/Users/rargu/DevPageOS/tests/unit/physics.test.ts:187) provide sufficient coverage despite the 2000 px/s browser case’s limitation. |
| **R4** | The trace checks actual displacement, a real throw, and Paint count. Its configuration matches the approved setup. |
| **R5** | Removal is complete. `rg` found no remaining source references to `musicHint` or `speaker`. Playback calls remain. The new unit checks can fail on either regression. |
| **R6** | Behavioral, metadata, token, size, accessibility, no-JS, touch, and routing checks exist. Findings 1–2 identify missing interruption cases. |
| **R7** | Desktop geometry is unchanged. The [phone test](/Users/rargu/DevPageOS/tests/e2e/compact-sheet.spec.ts:649) covers start, manual pan, and crawler navigation, including unchanged scroll. |
| **R8** | No additional source regression found. Full verification of the current HEAD remains **Unverified** in this review. |

**Observed:** A memory-only replay of the actual physics produced throw/Home peaks of **1.817°/2.669°**. Substituting the old constants produced **3.359°/4.933°**. Thus, the fixed fixtures reject the old constants independently of browser input timing.

**Derived:** I found no persistent sheet layer hint through throw, wobble, Home, catch, Reset, cancellation, reduced motion, pointer cancellation, resize, or navigation while held. Cleanup reaches `hint()` or `draw()`. Home sets the hint on its first animation frame. Existing cancellation tests do not assert the hint on every terminal path.

**Derived:** Removing `setOpen()` does not remove required minimap, accessibility, or focus work. Folding changes no minimap geometry. `fold()` still updates `aria-expanded`, and the explicit focus paths remain. No removed held-state reader remains. R9, R10, R21, and R22 retain their substantive checks.

**Observed:** The [perf project](/Users/rargu/DevPageOS/playwright.config.ts:62) runs after all four projects with one worker. Skipping it after another failure is acceptable: `e2e:all` already fails. It can run alone with `npx playwright test --project=perf --no-deps`. Its metric is repeatable, not strictly deterministic. The ledger records five results of 43 Paint events; I did not reproduce those runs.

**Observed:** The 404 remains static, uses same-origin fonts, and contains no storage access. Its whole-file gzip size is **5,374 bytes**. Roles and Tab stops are script-added, names are distinct, and focus uses a paper band. Checked-in `_headers` contains no blocking CSP. The jsdom declaration is a narrow test typing shim with no runtime effect. No dependencies changed.

**Observed checks passed:** `npm run lint`, `./node_modules/.bin/tsc --noEmit`, and `git diff --check 9d4ae90..HEAD`. The working tree remains clean.

**Verdict: Fix 1 and 2 before shipping. Strengthen 3.**

**Not checked:** I did not run unit, build, Playwright, or Wrangler suites because their configured paths write files. Browser rendering, historical screenshot equality, production headers, real touch, screen readers, GPU memory, and CI stability remain **Unverified** here.
## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first: AGENTS.md; docs/specs/009-preview-polish/spec.md (all, incl. Critique and Approval record) and tasks.md; docs/review/spec-009-critique-codex.md (11 findings the spec was revised for); docs/ledger/2026-10-24-spec-009.md (Fable decisions, T1–T3 sections with their evidence); docs/specs/001-sheet/spec.md where 009 amends it (Physics, R8.c, R12/R12.b, R20 note).

The change under review: `git diff 9d4ae90..HEAD` (T1+T3 commit, T2 commit). Read every changed file: src/sheet/physics.ts, src/sheet/windows.ts, src/sheet/view.ts, src/sheet/main.ts, src/apps/lib/open.ts, src/apps/castlesiege/main.ts, src/apps/tracker/main.ts, public/404.html, playwright.config.ts (new perf project), playwright.routing.config.ts, and the tests (tests/unit/physics.test.ts, page-404.test.ts, jsdom.d.ts, no-music-hint.test.ts; tests/e2e/drag-perf.spec.ts, sheet-raster.spec.ts, routing-404.spec.ts, sheet-windows.spec.ts, compact-sheet.spec.ts, sheet-card.spec.ts, sheet-a11y.spec.ts).

Check: (1) every requirement R1–R8 against code and a test that can fail (R3.b noted as unable to catch the old constants at 2000 px/s — is the remaining coverage enough?); (2) windows.ts will-change set/clear: every path (held, throw, wobble, Home, catch mid-flight, Reset, cancel, reduced motion, pointercancel, a resize, navigation while held) clears the hint at rest and never leaves it on; (3) removing the held swing: any code still reading the removed state; R8.a pointer accuracy at both zooms; R9/R10/R21/R22 unaffected; (4) the loosened existing wobble test (catch-mid-wobble pause threshold 0.5° → 0.2°, re-throw direction) and throwStill change: did they weaken a check; (5) the perf project: runs last, skipped when another test fails — is that acceptable for e2e:all, can it be run alone, is its metric deterministic; (6) 404 page: correctness of the physics copy, the gesture owner, blur/cancel, rAF cleanup, resize, a11y (roles added after init, names, focus ring contrast), no-JS, CSP/_headers, size; tests/unit/jsdom.d.ts as a typing shim (any risk); (7) R7: mark() via area(): desktop unchanged, phone behaviour, setOpen removal side effects (anything else relied on the redraw: minimap, aria-expanded, focus); (8) R5: removal complete; (9) rules: static site, no third-party requests, no storage, no new deps, reduced motion.

Constraints: read-only commands only.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, evidence (quote), why it is wrong against which requirement, and a fix. Keep observed facts apart from inference. End with a verdict and what you could not check.
