# Spec 004 T4–T6: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only
- **Session id:** 01a16b02-7108-7a63-a05f-75f3edd81e0d · **Tokens:** 205,323
- **Date:** 2026-10-24 · **Scope:** committed range `970973b..f71c6cf` (T4 Paint, T5 Music, T6 Notes)
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Paint's width ratio counts rotation as zoom (R5) | Accepted. Inverse transform. |
| 2 | Paint keeps the old zoom when the sheet zooms mid-pan (R5) | Accepted. |
| 3 | Paint's new pan algorithm also runs on the old OS (R14) | Accepted. Gate it; old OS keeps its incremental pan. |
| 4 | A failed demo load still enables Play (R6) | Accepted. |
| 5 | Notes tests cannot catch permanently inert content (R10) | Accepted. |
| 6 | WAV test counts a click attempt as a download (R13) | Accepted. |
| 7 | R7.b test adds the 0.5 s ring-out the acceptance text does not name | Accepted: lead clarification in the spec (the WAV is song length + the renderer's 0.5 s ring-out, ± 0.1 s). |

## Codex output (verbatim)

What this change does: adds Paint pan scaling, Music readiness and export guards, and Notes’ Escape route. I found five Medium issues and two Low issues.

**Evidence:** I used `git diff 970973b..f71c6cf`, `git show f71c6cf:<path>`, and read-only, in-memory Node/jsdom probes. Probe results below use the committed code with simulated browser geometry.

1. **Medium — Paint’s width ratio measures rotation as zoom.** [src/apps/paint/main.ts:947](/Users/rargu/DevPageOS/src/apps/paint/main.ts:947)

   **Observed:** The scale measurement is `"view.getBoundingClientRect().width / view.offsetWidth"`. The window transform includes rotation at `src/sheet/windows.ts:93`.

   **Derived:** A rotated bounding box includes part of the element’s height. This ratio therefore differs from sheet zoom. Dividing horizontal and vertical deltas separately also ignores rotation. In the handler probe, a 100 px leftward pan with a simulated 360 × 200 view at 8° moved the picture approximately **93 px left and 13 px vertically**. This breaks R5’s promise that the picture follows the fingers.

   **Fix:** Convert movement through the current inverse transform, including rotation. The probe technique in `src/ui/menu.ts:244` already handles this transform. Add a rotated-window pan test.

2. **Medium — Paint keeps the old scale when sheet zoom changes during a pan.** [src/apps/paint/main.ts:949](/Users/rargu/DevPageOS/src/apps/paint/main.ts:949)

   **Observed:** `startPan()` stores `"k"` once. Movement continues to divide by `"pan.k"` at line 979. The host permits Ctrl/⌘-wheel sheet zoom inside running apps (`src/sheet/host/window.ts:317`).

   **Observed probe:** After pan start at 100%, changing the simulated zoom to 160% made a subsequent 100 px finger movement move the picture **160 px**.

   **Why wrong:** R5 applies at any sheet zoom. The existing R5.a tests set zoom before starting each gesture, so they miss this case.

   **Fix:** Read the current transform during movement and rebase pan state when it changes. Test a real Ctrl-wheel zoom while CDP touches remain down.

3. **Medium — Paint’s new pan algorithm also changes the old OS.** [src/apps/paint/main.ts:979](/Users/rargu/DevPageOS/src/apps/paint/main.ts:979)

   **Observed:** Only scale selection uses `onSheet(os)`. The cached scroll state, fractional accumulation, and explicit clamping run on every display:
   > `pan.x = Math.max(0, Math.min(maxX, pan.x - …))`

   **Observed probe:** With a non-sheet display, I changed scroll position from 200 to 300 during a pan, then moved the fingers 10 px left. The baseline finished at **310**. The reviewed commit jumped to **210**.

   **Derived:** Another scroll input during a touch pan can now be overwritten by the cached position. Regardless of that case, the replacement algorithm is not sheet-gated as R14 requires.

   **Fix:** Keep the original incremental pan behavior on non-sheet displays. Gate the complete replacement algorithm and add an old-OS touch regression test.

4. **Medium — A failed demo load still enables Music’s Play controls.** [src/apps/tracker/main.ts:1314](/Users/rargu/DevPageOS/src/apps/tracker/main.ts:1314)

   **Observed:** Readiness changes in:
   > `void first.finally(() => { … ready = true; … })`

   `load()` catches read and parse failures at line 548. The completion handler therefore enables Play after the error alert closes.

   **Observed probe:** A rejected demo read produced an error alert, then enabled Play with the title **“Music - untitled”**.

   **Why wrong:** R6 requires the demo to parse before Music becomes ready. The accepted critique also explicitly requires successful parsing (`docs/review/spec-004-critique-codex.md:65`). The held-read test covers delay, but not failure.

   **Fix:** Report load success explicitly. Enable Play after successful parsing and provide a retry or successful Open route after failure. Add rejected-read and invalid-demo tests.

5. **Medium — Notes’ tests cannot detect permanently inert content.** [tests/e2e/quick-tools-notes.spec.ts:243](/Users/rargu/DevPageOS/tests/e2e/quick-tools-notes.spec.ts:243)

   **Observed:** The later-Tab test asserts:
   > `expect(await focusInNotes(page)).toBe(true)`

   That helper returns true for the window frame itself. The two exit tests never return to Notes after exercising its inert-content skip.

   **Derived:** Removing the restoration timeout at `src/apps/writer/main.ts:489` would leave Notes’ children inert without failing these assertions. Preventing Tab while focus remains on the frame would also satisfy the later-Tab assertion. These checks do not protect R10’s continued navigation.

   **Fix:** After the actual Escape→Tab skip, return to Notes. Assert the exact expected focus targets, restored `inert` states, and usable editor. Cover menu/dialog cancellation and forward/backward order.

   **Observed limit:** The in-memory probe confirmed normal restoration, Escape prevention of the host route, and disarming after another key. It cannot validate native Tab navigation or screen readers.

6. **Low — The WAV test treats an automatic click attempt as a successful download.** [tests/e2e/quick-tools-music.spec.ts:346](/Users/rargu/DevPageOS/tests/e2e/quick-tools-music.spec.ts:346)

   **Observed:** The test uses:
   > `if (autos === 0) await link.click();`

   `autos` counts calls to `HTMLAnchorElement.click()`, not download events. The test also does not require activation to expire before releasing rendering.

   **Derived:** It can pass without exercising the fallback link. It can also wait indefinitely for an automatic attempt that the browser refused, despite a working fallback. This leaves the requested WebKit expiry case unproved under R13/002 R6.

   **Fix:** Add a deterministic blocked-download test. For the expiry case, hold rendering until activation becomes inactive, then release it. Assert no automatic download, press the fallback link, and verify exactly one valid WAV. Use polling rather than a fixed sleep.

7. **Low — R7.b’s duration assertion differs from the approved acceptance text.** [tests/e2e/quick-tools-music.spec.ts:379](/Users/rargu/DevPageOS/tests/e2e/quick-tools-music.spec.ts:379)

   **Observed:** The test accepts:
   > `songSeconds(await demo()) + 0.5`

   R7.b instead requires song length ±0.1 s (`docs/specs/004-quick-tools/spec.md:69`). The existing renderer adds a 0.5 s tail (`src/apps/tracker/engine.ts:1006`).

   **Why wrong:** The test verifies the renderer’s current behavior, but does not demonstrate R7.b as written.

   **Fix:** Explicitly resolve the acceptance text to include the retained ring-out before claiming R7.b passes. Keep the exported-sample duration assertion.

The R4.a, R6.a, R7.a, and R9.a tests have meaningful pixel, audio, note, or byte assertions. R5.a checks movement, unchanged pixels, and unchanged sheet state at its three fixed zooms. The WAV test checks cancellation, concurrency, headers, and nonzero PCM. The 90 s calculation is sound: **7,982,144 bytes**, including ring-out, below **8,388,608 bytes**. No fixed sleeps were added to the new tests.

**Verdict:** Fix 1–4 and strengthen 5 before treating T4–T6 as verified.

**Could not check:** Native browser gestures, downloads, screen-reader behavior, or real main-thread export latency. I did not run the build, unit, or browser pipelines because they write generated files. The ledger’s timing claims remain unverified by this review. I ignored the uncommitted working tree and modified no files.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first: AGENTS.md; docs/specs/004-quick-tools/spec.md (all, incl. owner decisions: Esc alone in Notes; 90 s WAV cap; the lead notes) and tasks.md (rows T4, T5, T6); docs/review/spec-004-critique-codex.md; docs/ledger/2026-10-23-spec-004.md; docs/specs/002-app-host/spec.md (files/download rule, R17, Lead notes incl. the Esc-then-Tab host route).
The change under review: committed range `git diff 970973b..f71c6cf` (T4 Paint, T5 Music, T6 Notes; built in parallel). Read every changed file (src/apps/paint/main.ts, src/apps/tracker/main.ts, src/apps/writer/main.ts, the new tests tests/e2e/quick-tools-paint.spec.ts, compact-quick-tools-paint.spec.ts, quick-tools-music.spec.ts, quick-tools-notes.spec.ts, tests/unit/tracker.test.ts, the host-input.spec.ts changes, fixtures). Ignore the uncommitted working tree.

Task: review T4–T6. Check: (1) each acceptance check (R4.a, R5.a, R6.a, R7.a, R7.b, R9.a, R10.a and the 90 s cap) against the code with a test that can fail; (2) every change gated on os.env.DISPLAY === "sheet"; the old OS apps unchanged (R14); (3) Paint: the zoom measurement (screen width / layout width) under rotation/wobble, at the scroll limit, during a sheet zoom change mid-pan; two-finger pan vs the host's gesture owner; Open limits and error paths; (4) Music: ready gating, single export, the cap math incl. ring-out and rounding, WebKit activation expiry → fallback link, main-thread blocking during render; (5) Notes: the Esc-alone route and its one-shot Tab skip (inert for one key press) — any way it can leave the window inert, trap focus, or break Tab order for screen readers; interaction with the host's route and with dialogs/menus; (6) tests that cannot fail, sleeps, synthetic input where real input is possible.
Constraints: static site, no third-party requests, no storage, no new dependencies. Read-only commands only.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, evidence (quote), why it is wrong against which requirement, and a fix. Keep observed facts apart from inference. End with what you could not check.
