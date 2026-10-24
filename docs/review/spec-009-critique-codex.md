# Spec 009 critique (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only
- **Session id:** 01a16d24-d34d-7021-9ad8-9071e05d2c57 · **Tokens:** 146,079
- **Date:** 2026-10-24 · **Scope:** `docs/specs/009-preview-polish/spec.md` (Draft, `a4eebe0`) and the Fable 404 draft
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Home torque understated; 2.669° peak for the largest valid Home | Accepted. Fixtures by window/start/destination/grab; Home peak ≤ 3.0°, throws ≤ 2.5°; times from the pin. |
| 2 | 404 pointer throw bypasses the cap; reduced motion changes the landing | Accepted (R6.b). |
| 3 | `will-change` is a hint; memory of eight permanent layers | Accepted, other fix: the hint only while a window moves (R1). |
| 4 | No check of text quality after zoom | Accepted (R1.b). |
| 5 | R4 not defined for a hard gate | Accepted: defined setup, one worker, gate on Paint count only (≤ 150), 5 runs. |
| 6 | Tests and mock need explicit amendments | Accepted (R2.a names the tests; 001 R20 note). |
| 7 | 404 interruptions unspecified | Accepted (R6.c). |
| 8 | 404 accessibility contract | Accepted (R6.d). |
| 9 | 404 short screens, resize, overlap | Accepted (R6.e). |
| 10 | Constants test cannot catch behaviour drift | Accepted (R6.b primary, R6.a secondary). |
| 11 | R7 covers one phone position | Accepted (R7.a). |

## Codex output (verbatim)

The draft needs revision before approval. The main problems are the Home fixture, the 404 throw behavior, and performance checks that do not yet define a repeatable measurement.

**Evidence:** “Observed” below means source inspection with `nl -ba` or `rg`, or an identified Node check. “Derived” means a calculation from that evidence. “Inferred” identifies a risk that needs browser or device verification.

1. **High — The Home fixture understates the possible torque.** [009 R3.a](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:50)

   **Evidence — observed:** The acceptance says “Home from the far corner (torque ≈ 782).” The advisor’s `osc.mjs:18` uses a distance of 1,500 px. Actual Home timing follows [physics.ts:72](/Users/rargu/DevPageOS/src/sheet/physics.ts:72).

   **Derived:** CastleSiege can start at `(2380, 986)` and return to `(360, 100)`. With a title-bar grab at `(310, 12)`, the distance is 2,205.76 px and torque is about 1,050.55. A Node replay of the proposed oscillator at `dt = 1/120` produces a **2.669° peak**, above 2.5°.

   **Why it matters:** The proposed constants cannot meet the written Home acceptance for valid geometry.

   **Fix to the spec:** Define fixtures by window, starting position, destination, and grab point. Cover the largest valid Home torques. Then revise either the Home peak limit or the proposed constants.

   Also define the timing origin in R6.b. “Settles in < 0.8 s” differs from R3’s “0.8 s after the pin.” A capped throw can take about **0.24 + 0.617 = 0.857 s** at 120 Hz.

2. **High — The 404 pointer throw bypasses the cap and changes its landing under reduced motion.** [009 R6](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:39)

   **Evidence — observed:** In the supplied draft, `throwAt()` applies the 360 px cap at lines 331–334. Pointer release instead calls `fly()` directly at line 390. Line 388 also sets release velocity to zero under reduced motion.

   **Observed — Node/JSDOM event check:** In an unclamped viewport, a 50 px move over 10 ms ends at translation **568.80 px** normally and **50 px** with reduced motion. The sheet formula gives **410 px**: release position 50 plus the 360 px cap.

   **Why it matters:** Equal constants do not produce the sheet’s behavior. R6.b’s current wording—“lands at release”—also appears to authorize the reduced-motion difference.

   **Fix to the spec:** Require identical computed landing positions with either motion preference. Route pointer and keyboard throws through the capped landing calculation. Add an unclamped 5,000 px/s fixture and compare both motion preferences.

3. **Medium — R1 tests a CSS hint, not eight compositor layers, and leaves memory cost unbounded.** [009 R1.a](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:45)

   **Evidence — observed:** R1 requires “Every sheet window is its own compositor layer.” Acceptance checks only `willChange === "transform"`. The CSS specification permits browsers to decline layer promotion, including for memory reasons. [CSS Will Change specification](https://drafts.csswg.org/css-will-change/#will-change)

   **Derived:** The eight window rectangles total 2,329,044 pixels. Full RGBA backing images would require about **8.9 MiB at DPR 1**, **80 MiB at DPR 3**, or **205 MiB at DPR 3 and scale 1.6**. These are estimates, not measured allocations. Tiling, clipping, shadows, and additional layers change actual cost.

   **Why it matters:** The 150 KiB download budget does not constrain graphics memory. The phone test uses DPR 1.

   **Fix to the spec:** Describe `will-change` as the chosen hint, not a guaranteed browser allocation. Require measured layer and memory evidence on a named phone and WebKit configuration. Define an acceptable memory increase before requiring permanent hints on all eight windows. WebKit documents this tradeoff explicitly. [WebKit Layers documentation](https://webkit.org/web-inspector/layers-tab/)

4. **Medium — R1 has no acceptance check for text quality after zoom.** [009 R1–R2](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:34)

   **Evidence — observed:** The sheet scales the parent with `world.style.transform = scale(Z)` at [view.ts:151](/Users/rargu/DevPageOS/src/sheet/view.ts:151). R4 measures only 100% zoom.

   **Inferred:** Permanent child layers can preserve an earlier raster scale while the parent zooms. Chromium explicitly preserves raster scales for `will-change: transform` under some conditions. This can trade sharper text for faster transforms. [Chromium implementation](https://chromium.googlesource.com/chromium/src/+/master/cc/layers/picture_layer_impl.cc), [Chrome explanation](https://developer.chrome.com/blog/re-rastering-composite?hl=en)

   **Why it matters:** Removing held scale does not remove the parent’s scale. A fix for perceived blur could introduce persistent blur after zoom.

   **Fix to the spec:** Add settled visual comparisons at phone fit, 50%, 100%, and 160%, after zooming in both directions. Check Chromium and WebKit, including text inside hosted apps. Require no additional blur against the same-scale baseline. Permit a raster-refresh or limited promotion strategy if permanent hints fail.

5. **Medium — R4 is not sufficiently defined for a hard CI gate.** [009 R4.a](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:55)

   **Evidence — observed:** Acceptance allows at most one frame above 34 ms. The main Playwright configuration uses `fullyParallel: true`. The advisor probe records every wrapped application callback, rather than one sample per displayed frame. Its baseline contains **314 callback records but 158 unique frame timestamps**. It also takes screenshots inside the measured interval.

   **Inferred:** Runner load, screenshot capture, browser scheduling, and input delivery can change this result without a regression. Application callbacks also cannot measure displayed frames during periods when no callback runs.

   **Why it matters:** The threshold can reject a good build or accept a broken measurement.

   **Fix to the spec:** Define viewport, DPR, browser version, launch flags, trace categories, measured phases, input schedule, and frame metric. Exclude screenshots. Assert that the complete drag actually occurred. Run performance checks with one worker and establish repeatability before choosing a hard threshold. Keep unstable timing measurements as reports until then.

   The 357-versus-60 Paint result supports a rendering-cost improvement. It does not establish that frame pacing is never a cause of the owner’s symptom.

6. **Medium — The drag change needs explicit test and mock amendments.** [009 Approach](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:71)

   **Evidence — observed:** [sheet-windows.spec.ts:689](/Users/rargu/DevPageOS/tests/e2e/sheet-windows.spec.ts:689) requires held rotation above 0.5°. Its transform parser at line 143 recognizes rotation only when followed by `scale(...)`. Removing the scale term can make that parser silently report rotation zero. [compact-sheet.spec.ts:349](/Users/rargu/DevPageOS/tests/e2e/compact-sheet.spec.ts:349) also requires the literal suffix `rotate(0deg) scale(1)`.

   **Why it matters:** Some tests must change. Others could lose their ability to detect wobble defects.

   **Fix to the spec:** Name the held-lean test for replacement. Require transform parsing that independently detects translation, rotation, and scale. Preserve the catch, pin, and throw assertions.

   R8.a, R9, R10, R21, and R22 do **not** inherently conflict with removing lean or scale. Preserve their checks for pointer accuracy at both zooms, edge scrolling, Home, cancellation, and idle scheduling.

   Add an explicit 001 R20 exception for the new motion. The existing start/Reset mock comparison does not show held motion. Compare held and post-pin states and record these as intentional 009 differences.

7. **Medium — “The sheet’s feel” leaves 404 interruption behavior unspecified.** [009 R6.b](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:60)

   **Evidence — observed:** The draft has no blur handler or global gesture owner. Each digit accepts its own pointer. Home does not cancel a held pointer, while `tick()` skips held windows. The reduced-motion change handler clears motion state but does not cancel the pending animation frame.

   **Observed — Node/JSDOM check:** One frame remains pending after a live change to reduced motion.

   **Why it matters:** Home during a drag, two fingers on separate digits, tab blur, and live preference changes differ from the sheet or remain undefined.

   **Fix to the spec:** State the required behavior for these cases. Require cancellation without a throw, Home interrupting a hold, and no pending animation after a reduced-motion commit. Test preference changes during flight and wobble. Either retain the sheet’s single-gesture rule or record the intentional exception.

8. **Medium — R6 lacks a complete accessibility contract.** [009 R6](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:39)

   **Evidence — observed:** Draft lines 253 and 261 give both fours the same accessible name. All three digits remain focusable buttons without JavaScript. Focus does not raise a digit above overlapping windows. Pointer press calls `preventDefault()` without explicitly focusing it.

   The light focus ring and shadow both use navy. The sheet already supplies a paper band to prevent that contrast problem at [sheet.css:255](/Users/rargu/DevPageOS/src/sheet/sheet.css:255).

   **Why it matters:** Keyboard focus can remain hidden behind another digit. Without JavaScript, assistive technology announces controls whose advertised actions do nothing.

   **Fix to the spec:** Require distinct names and concise descriptions of the keys. Enable interactive roles and Tab stops only after initialization. Define pointer focus and bring focused digits to the front. Require visible focus with 3:1 contrast against adjacent colors.

   If `role="button"` remains, explicitly specify and test its Enter/Space action. Otherwise, choose semantics that match the implemented interaction.

9. **Medium — The 404 can lose usable content after resize or on a short screen.** [009 R6.b](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:60)

   **Evidence — observed:** Draft line 75 sets `body { overflow: hidden }`. The page stacks digits, a 36 px gap, copy, and links. It has no resize handler. Landings clamp against viewport dimensions when `fly()` starts. Raised digits can also overlap the links.

   **Derived:** A viewport that shrinks during a flight can leave its old target outside the new viewport. Content taller than a short viewport has no normal scrolling path.

   **Why it matters:** “Links work without JS” needs visibility and reachability, including landscape and enlarged text.

   **Fix to the spec:** Require reachable links at portrait and landscape sizes, enlarged text, and with JavaScript disabled. Allow document scrolling when needed. Define resize behavior for resting digits and active flights. Keep links usable after digits overlap them.

   Add explicit mobile/touch and WebKit coverage. The routing configuration currently has no mobile or WebKit projects.

10. **Medium — The constants test would pass despite the draft’s known physics defects.** [009 R6.a](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:58)

    **Evidence — observed:** R6.a checks equality of “kick, ζ, ω, τ, cap.” The draft declares matching proposed values but bypasses its cap on pointer release.

    **Why it matters:** Declaration equality does not prove behavior. A source-text test also depends on whether a number is a named constant or an inline expression.

    **Fix to the spec:** Make independent behavioral fixtures the primary drift guard. Exercise actual pointer and keyboard handlers with a controlled clock. Cover the flight midpoint, capped landing, pin kick, settling, Home, and reduced-motion equivalence. Keep a constants check only as an additional check with a defined extraction method.

    Add acceptance for currently unchecked R6 claims: `noindex`, theme token values, and the accessibility requirements above.

11. **Low — R7’s acceptance covers only one phone position.** [009 R7.a–b](/Users/rargu/DevPageOS/docs/specs/009-preview-polish/spec.md:64)

    **Evidence — observed:** R7 promises that opening or closing the card does not change the mark. Acceptance checks CastleSiege at the start and Pentimento on desktop.

    **Why it matters:** A special case that always marks CastleSiege on phones could pass both checks.

    **Fix to the spec:** Add a phone case after navigating elsewhere and after manually panning. Assert that the mark and scroll position remain unchanged across open/close. Update the `nearest()` helper to use the folded bar’s geometry.

    **Observed:** The proposed `area(true)` → `area()` change does not change desktop geometry. Both branches already use identical desktop bounds at [view.ts:482](/Users/rargu/DevPageOS/src/sheet/view.ts:482).

Other checks found no additional blocker. `rg` found only the three named `musicHint` calls and no dependent tests. Its only effects are its private flag, a sound-policy read, and notification. Removing it preserves playback calls. The draft keeps both routing regexes valid, uses existing same-origin fonts, and measures **4,490 bytes gzip** for the whole HTML file. The checked-in `_headers` contains no CSP that blocks its inline code. The draft has no font preloads. Treat preloading as an explicit performance decision, not an implied requirement.

Acceptance checks that preserve existing behavior can already pass on current code. R1’s CSS check should fail now. R2 and R3 need specified timing and nonzero torque to ensure meaningful failures. R5’s source check fails now. R6’s new title and interaction checks fail now, but its size and storage guards already pass. R7.a targets the reported defect. R7.b and R8 are preservation checks.

**Could not check:** Browser rendering, real touch, screen-reader behavior, GPU memory, Safari hardware, production response headers, or CI timing stability. I did not run lint, unit, build, Playwright, or Wrangler suites. The Node checks used memory only. No files were modified.
## Prompt (verbatim)

You are an independent read-only critic for RArgu OS (the repo in the current directory). Do not modify files.

Read: AGENTS.md; .agents/skills/spec-driven/SKILL.md; the new spec docs/specs/009-preview-polish/spec.md (Draft); the specs it amends: docs/specs/001-sheet/spec.md (R7–R10, R12, R17, R22, Approach "Physics"), docs/specs/007-switch-over/spec.md (approval record: the T11 preview feedback); docs/OWNER_QUESTIONS.md ("Wobble"); the code it names: src/sheet/sheet.css, src/sheet/physics.ts, src/sheet/windows.ts, src/sheet/view.ts (mark/area), src/sheet/main.ts, src/apps/lib/open.ts, src/sheet/host/load.ts (notify), public/404.html, tests/e2e/routing.spec.ts, scripts/routes.ts, tests/e2e/sheet-perf.spec.ts, tests/e2e/compact-sheet.spec.ts. A draft 404 page by the advisor is at /private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/fable-009-404-draft.html (read it).

Critique the spec before it is built: (1) is each requirement testable as written, and can each acceptance check fail on the current code; are numbers consistent with the code (torques, constants, timings); (2) does removing the held lean/scale break other 001 requirements or tests (R8.a, R9, R10, R21, R22, Home, throws, the mock comparison) and is that amended; (3) will-change on eight windows: memory/phone cost, text crispness at zoom ≠ 100 % (layers rasterised at one scale may blur on zoom), interaction with the sheet's own transform and with WebKit; (4) R4 perf criteria: stable in CI headless or flaky; (5) R5: is anything else relying on musicHint; (6) R6: the 404 draft against the requirements: accessibility (role, labels, focus, keyboard), touch, reduced motion live changes, no-JS, CSP/_headers, fonts preload, size, the constants-drift test design, routing test impact; (7) R7: does mark() with area() break desktop behaviour or other tests; (8) missing requirements or risks; scope creep.

Answer format: findings ordered by severity (High/Medium/Low), each with the spec section or path:line, evidence (quote), why it matters, and a concrete fix to the spec. Keep observed facts apart from inference. End with what you could not check.
