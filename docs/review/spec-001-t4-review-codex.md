# Spec 001 T4: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a16775-1379-7cc3-8e3b-9e9bed1aaeed · **Tokens:** 105,215
- **Date:** 2026-10-23 · **Scope:** uncommitted T4 working tree against `cc482d5` (plus the untracked `src/sheet/view.ts`,
  `tests/e2e/compact-sheet.spec.ts`)
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | `$` sequences in content corrupt the generated HTML (`String.replace` with a string) | Accepted. Replacement callbacks; `$'`/`$&` fixture. |
| 2 | Glide schedules frames while blocked at a scroll limit (R22) | Accepted. Clamp per axis, stop when nothing moves, no glide under 20 px/s. |
| 3 | Plain wheel scrolling is not `deltaMode`-normalized | Rejected. Native scroll meets R4 and keeps native momentum. The Approach's normalization is applied to wheel zoom. |
| 4 | Paper pan and minimap drag can be active at once | Accepted. Minimal one-owner rule now, minimap tracks its pointer id; T5 adds `gestures.ts`. |
| 5 | Pinch-end test uses CDP `touchEnd` against the protocol text | Partly accepted. The test now proves the state from page-side pointer events, not from the CDP reading. |
| 6 | Generated links accept unsafe URL schemes | Accepted. Only `http(s)` and `/resume`; the build fails otherwise. |
| 7 | R7.a has no overlap; R16.a moves no window | Accepted. Real overlap with `elementFromPoint`; R16 test renamed, moved-window reload in T5. |
| 8 | Fixed frame-count waits | Accepted. Wait on logged events or state; reduced motion for the + at 160 % check. |

## Codex output (verbatim)

**What this change does:** Adds eight placeholder windows, sheet navigation, zoom, and a minimap, plus desktop and phone tests.

Code evidence below is **observed** through `git diff HEAD`, `nl -ba`, and `rg`. Runtime effects are **derived**, unless stated otherwise.

1. **Medium — Content dollar sequences corrupt the generated HTML**  
   [scripts/sheet-content.ts:181](/Users/rargu/DevPageOS/scripts/sheet-content.ts:181)

   **Evidence:** `.replace("<!-- windows -->", windows(list))` supplies generated content as a replacement string.

   **Derived:** JavaScript interprets `$$`, `$&`, ``$` ``, and `$'` inside that string. A summary containing `$'` inserts the remaining HTML, including the entry script. Escaping `<` and quotes does not prevent this. This breaks literal content generation under R11/R14. A read-only `node -e` expression confirmed the substitution behavior.

   **Fix:** Use replacement callbacks for both markers: `.replace("<!-- windows -->", () => windows(list))`. Add dollar sequences to the escaping fixture.

2. **Medium — Glide continues scheduling frames against a scroll limit**  
   [src/sheet/view.ts:124](/Users/rargu/DevPageOS/src/sheet/view.ts:124)

   **Evidence:** The loop writes `vp.scrollLeft = x`, then continues solely while `Math.hypot(vx, vy) > 20`.

   **Derived:** At the left boundary, dragging the paper right and releasing produces a glide toward negative scroll positions. The browser clamps every write to zero, but callbacks continue until velocity decays. Nothing moves during those callbacks, contrary to R22.

   **Fix:** Clamp each axis to its scroll range and clear velocity on blocked axes. Stop scheduling when neither axis can move. Also avoid starting a glide below the stop speed.

3. **Medium — Ordinary wheel events bypass the required normalization**  
   [src/sheet/view.ts:142](/Users/rargu/DevPageOS/src/sheet/view.ts:142)

   **Evidence:** `if (!(e.ctrlKey || e.metaKey)) return;` runs before the `deltaMode` conversion.

   **Derived:** Plain wheel scrolling uses the browser’s native line or page distance. It does not enforce the Approach’s lines × 16 and pages × view-height rules. Modifier-wheel zoom receives the specified conversion, but ordinary pan does not.

   **Fix:** Normalize both wheel axes before choosing pan or zoom. Prevent the native action when applying normalized scrolling. Add page-level checks for ordinary line-mode and page-mode wheel events.

4. **Medium — Paper pan and minimap drag can control the view simultaneously**  
   [src/sheet/view.ts:332](/Users/rargu/DevPageOS/src/sheet/view.ts:332)

   **Evidence:** Minimap input sets `mapDrag = true` after `stop()`. However, `stop()` only cancels animation frames. Paper movement still uses `pan.sl - (e.clientX - pan.x)`.

   **Derived:** Hold one finger on the paper, then press the minimap with another. Both handlers remain active. The next paper movement restores its old scroll baseline and jumps away from the minimap position. The minimap also accepts movement from any pointer while `mapDrag` is true.

   This violates the Approach’s one-owner gesture rule and affects current R4/R6 behavior.

   **Fix:** Cancel or reject the existing gesture before another view input takes ownership. Track the minimap’s pointer ID and ignore other pointers. Extend that ownership mechanism for window drag in T5.

5. **Medium — The partial finger-lift test contradicts the CDP contract**  
   [tests/e2e/compact-sheet.spec.ts:103](/Users/rargu/DevPageOS/tests/e2e/compact-sheet.spec.ts:103)

   **Evidence:**  
   `await touch(cdp, "touchEnd", [[b[0], b[1] + 50, 1]]);`

   The bundled protocol definition states: “TouchEnd and TouchCancel must not contain any touch points.” It also defines `touchPoints` as active points, rather than released points. See [protocol.d.ts:9399](/Users/rargu/DevPageOS/node_modules/playwright-core/types/protocol.d.ts:9399).

   **Derived:** This sequence cannot establish the claimed condition: finger B released while finger A remains down. Whether Chromium rejects or otherwise handles this request is **Unverified**. The R5 pinch-end check is therefore unreliable.

   **Fix:** Correct the helper to use active-point semantics. Use a supported sequence that leaves only A active. Observe B’s `pointerup`, then move A and assert that the view remains unchanged.

6. **Low — Generated project links accept unsafe URL schemes**  
   [scripts/sheet-content.ts:152](/Users/rargu/DevPageOS/scripts/sheet-content.ts:152)

   **Evidence:** Links use `<a href="${esc(l)}" ...>`. The only URL parsing is `new URL(url)` in `linkText`.

   **Derived:** Parsing accepts schemes such as `javascript:` and `data:`. HTML escaping preserves those schemes. A future content edit can therefore emit an unsafe navigation URL. Current project URLs are HTTPS, so this is a latent security gap in R14 generation.

   **Fix:** Validate allowed protocols before rendering. For the current project links, accept HTTP and HTTPS only. Reject other schemes with a file-and-field error.

7. **Low — Two acceptance tests omit their required starting conditions**  
   [tests/e2e/sheet.spec.ts:316](/Users/rargu/DevPageOS/tests/e2e/sheet.spec.ts:316), [tests/e2e/sheet.spec.ts:402](/Users/rargu/DevPageOS/tests/e2e/sheet.spec.ts:402)

   **Evidence:** R7.a compares numeric `zIndex` values between windows at separate home positions. R16.a changes zoom and scroll, then reloads.

   **Derived:** R7.a never establishes overlapping windows or checks which window draws above the other. R16.a never moves a window, so its home-position assertion cannot detect saved window positions. These tests cover useful behavior, but not their full acceptance claims.

   **Fix:** Give R7.a an overlapping fixture and verify the visible window at an overlap point. Name the existing R16 test as a view-reset check. Keep the moved-window reload check pending until T5 supplies real drag input.

8. **Low — Fixed frame counts substitute for input or completion state**  
   [tests/e2e/sheet.spec.ts:226](/Users/rargu/DevPageOS/tests/e2e/sheet.spec.ts:226), [tests/e2e/compact-sheet.spec.ts:105](/Users/rargu/DevPageOS/tests/e2e/compact-sheet.spec.ts:105)

   **Evidence:** The tests call `frames(page, 20)` and `frames(page, 3)`.

   **Derived:** These waits measure elapsed frames. They do not establish that the relevant input reached its handler or that an animation completed. The phone assertion can inspect an unchanged view without proving the remaining finger’s movement was processed.

   **Fix:** Observe the relevant page input event before asserting no movement. For the maximum-zoom boundary check, use reduced motion and assert the post-click transform directly.

**Scope assessment:** **Observed:** The diff changes no old-OS files or dependency manifests. Window dimensions match the layout constants. Focus styles use `--focus`. T5 window drag, T6 card behavior/phone folding/panTo, and T7 keyboard window movement remain deferred as planned.

**Could not check:**

- Build, lint, unit tests, or browser suites. None were run.
- Actual R4–R7 browser acceptance, including scrollbar behavior, fit after rotation, and rendered placeholder clipping.
- Physical Safari trackpad behavior under R5.d. **Unverified.**
- Canvas pixels, screen-reader behavior, runtime focus visibility, and performance traces.
- Real moved-window reload behavior under R16.a, pending T5.
- Full R17 motion completion and R19 window focus behavior, scheduled for T7.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/001-sheet/spec.md (the whole spec; this task is T4: R4, R5, R6, R7, R16, plus Approach "Gestures", "Layout table", "Deferred differences", and R22's "no animation-frame callback while nothing moves")
- docs/specs/001-sheet/tasks.md (row T4)
- The mock sources the code ports: docs/mockups/rargu-os-src/part1.html and docs/mockups/rargu-os-src/part2.js
- The change under review: the uncommitted working tree against HEAD. Run `git diff HEAD` and read the new untracked files src/sheet/view.ts and tests/e2e/compact-sheet.spec.ts. Also read the files they use: src/sheet/main.ts, src/sheet/layout.ts, src/sheet/sheet.css, scripts/sheet-content.ts, next.html, tests/e2e/sheet.spec.ts, tests/e2e/helpers.ts, playwright.config.ts.

Task: review the T4 change for
1. correctness against each T4 requirement and its acceptance check (R4.a, R4.b, R5.a–d, R6.a, R7.a, R7.b, R16.a),
2. spec drift (anything the spec forbids or anything built that belongs to a later task: T5 window drag, T6 card buttons/phone fold/panTo, T7 keyboard window moves),
3. bugs in pan, glide, zoom-at-point, pinch, Safari gesture handling, wheel deltaMode, resize-to-fit, minimap drawing and input,
4. tests that cannot fail, that sleep instead of waiting on state, or that test helpers instead of the page,
5. accessibility (focus, names, keyboard) and performance (idle animation frames, layout thrash),
6. security of the build-time HTML generation (escaping).

Constraints (owner rules):
- The site is static. No third-party requests. No visitor state in browser storage. Same layout for every visitor.
- Respect prefers-reduced-motion.
- No new dependencies. Old-OS code (src/kernel, src/fs, src/wm, src/boot, src/apps, index.html) must not change.
- Focus rings use --focus (owner fix of the mock's low-contrast colours, mock v0.6).
- Do not run network, deploy or git-write commands. You may run read-only commands (git diff, grep, cat). Do not run the test suites.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with a list of what you could not check.
