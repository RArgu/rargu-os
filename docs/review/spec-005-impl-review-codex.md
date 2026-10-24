# Spec 005: Codex implementation review (whole spec, T8)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a1688c-04da-7f72-bd96-291cde91fb15 · **Tokens:** 167,966
- **Date:** 2026-10-23 · **Scope:** committed range `076dae1..17b5eef` (T1–T6). T7 (mock comparison) was committed
  while the review ran (`a5a858f`), so the review's "T7 unchecked" note is already resolved. This review also covers
  T6, which had no separate review.
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Control ownership survives lost capture and unmount (001 R21) | Accepted. |
| 2 | A control press does not stop an active paper glide | Accepted. |
| 3 | The stylesheet-readiness fix has no test that fails on the old code | Accepted. |
| 4 | Pentimento focus rings shrink with zoom (001 R19) | Accepted. |
| — | Coverage gap: Pause combined with a hidden tab (R4) | Accepted. |
| — | R9 "no completed comparison" | Resolved by T7 (`docs/review/spec-005-mock-vs-build.md`). |

## Codex output (verbatim)

Reviewed `076dae1..17b5eef` only. **Observed** evidence comes from `git diff` and `git show 17b5eef:<path> | nl -ba`. References below use that commit’s line numbers. No High findings.

1. **Medium — Control ownership survives lost capture and unmount.**  
   [src/sheet/demos/press.ts:17](/Users/rargu/DevPageOS/src/sheet/demos/press.ts:17)

   **Observed:**
   ```ts
   const end = () => {
     removeEventListener("pointerup", up, true);
     removeEventListener("pointercancel", up, true);
   };
   ```
   Ownership is released only by `up()`. The helper has no `lostpointercapture` handler or abort cleanup for these global listeners. Pentimento unmount calls `off?.abort()` at [pentimento.ts:141](/Users/rargu/DevPageOS/src/sheet/demos/pentimento.ts:141).

   **Derived:** A touch control that loses implicit capture remains the gesture owner until pointerup or blur. Unmount during a held press also leaves ownership and global listeners behind. Subsequent paper, window, or control presses can be rejected. This violates 001 R21’s cancellation rule.

   **Fix:** Give each accepted press one cleanup function that removes listeners and releases ownership. Call it on pointerup, pointercancel, lost capture, and signal abort. Add coverage for lost capture and unmount while pressed.

2. **Medium — A control press does not stop an active paper glide.**  
   [src/sheet/demos/press.ts:26](/Users/rargu/DevPageOS/src/sheet/demos/press.ts:26)

   **Observed:**
   ```ts
   if (!claim("control", id, 1, end)) {
     dropped = b;
     e.preventDefault();
     return;
   }
   addEventListener("pointerup", up, true);
   ```
   The successful path never stops view motion. Paper release frees ownership before starting its glide in [view.ts:374](/Users/rargu/DevPageOS/src/sheet/view.ts:374). Window presses explicitly call `view.stop()` at [windows.ts:252](/Users/rargu/DevPageOS/src/sheet/windows.ts:252).

   **Derived:** Flicking the paper, then holding Pause or Run while the glide continues, permits a control gesture and paper motion together. The control continues moving under the pointer. This leaves the new controls outside 001 R21’s existing glide cancellation behavior.

   **Fix:** Stop view motion after a control successfully claims ownership. Pass a callback into `ownPresses`. Test a real press during a clock-controlled glide and assert that scrolling stops.

3. **Medium — The stylesheet-readiness fallback lacks a failing regression test.**  
   [tests/e2e/castlewars.spec.ts:454](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:454)

   **Observed:**
   ```ts
   if (browserName === "webkit")
     await expect(page.locator(".railtoggle")).toBeAttached();
   else await js;
   css();
   ```
   These conditions do not establish that `createView()` entered its unstyled fallback. The committed ledger explicitly states:
   > “the new tests pass on the old code too”

   See [docs/ledger/2026-10-23.md:354](/Users/rargu/DevPageOS/docs/ledger/2026-10-23.md:354).

   **Derived:** Replacing the stylesheet listener with the former page-load listener can leave these tests green. The accepted implementation fix is present, but its protection of 001 R15 and initialization remains untested.

   **Fix:** Add a focused fixture that starts `createView()` before sheet CSS applies. Deliver stylesheet readiness while page load remains pending. Assert that framing completes then. Removing the stylesheet listener must fail that test.

4. **Low — Pentimento focus rings shrink with sheet zoom.**  
   [src/sheet/demos/pentimento.css:73](/Users/rargu/DevPageOS/src/sheet/demos/pentimento.css:73)

   **Observed:** Neither Run nor the focusable command panel overrides the global rule:
   ```css
   :focus-visible {
     outline: 2px solid var(--focus);
     outline-offset: 2px;
   }
   ```
   See [sheet.css:110](/Users/rargu/DevPageOS/src/sheet/sheet.css:110). Castle Wars uses `var(--ring, 2px)`, which `view.ts:143` adjusts for zoom.

   **Derived:** Pentimento’s ring is about 1.15 screen px at the phone’s start zoom and 0.26 px at 13% fit. This weakens 001 R19’s visible-focus behavior and misses the existing two-screen-pixel convention. The phone Tab test stops after Castle Wars, before reaching Pentimento ([compact-sheet.spec.ts:639](/Users/rargu/DevPageOS/tests/e2e/compact-sheet.spec.ts:639)).

   **Fix:** Apply the sheet’s `--ring` width to Run and `.cmd`. Extend keyboard coverage through Pentimento at phone start zoom and fit.

The following is **observed test coverage**, not a claim that tests passed during this review.

| Requirement / acceptance | Test |
|---|---|
| R1, R1.a, R1.b | [castlewars.spec.ts:228](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:228), [:250](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:250), [:282](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:282) |
| R2, R2.a | [castlewars-frames.test.ts:35](/Users/rargu/DevPageOS/tests/unit/castlewars-frames.test.ts:35), [:113](/Users/rargu/DevPageOS/tests/unit/castlewars-frames.test.ts:113), [:136](/Users/rargu/DevPageOS/tests/unit/castlewars-frames.test.ts:136) |
| R3, R3.a | [castlewars.spec.ts:302](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:302), [:335](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:335), [:354](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:354), [:375](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:375) |
| R4, R4.a | [castlewars.spec.ts:568](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:568), [:597](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:597), [:626](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:626). Tab visibility is simulated. **No test** combines Pause with hiding the tab. |
| R5, R5.a | [castlewars.spec.ts:503](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:503), [:526](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:526) |
| R6, R6.a, R6.b | [pentimento.spec.ts:66](/Users/rargu/DevPageOS/tests/e2e/pentimento.spec.ts:66), [:101](/Users/rargu/DevPageOS/tests/e2e/pentimento.spec.ts:101), [:119](/Users/rargu/DevPageOS/tests/e2e/pentimento.spec.ts:119), [:136](/Users/rargu/DevPageOS/tests/e2e/pentimento.spec.ts:136). Unmount: [pentimento.test.ts:68](/Users/rargu/DevPageOS/tests/unit/pentimento.test.ts:68). |
| R7, R7.a | [wip-motion.spec.ts:137](/Users/rargu/DevPageOS/tests/e2e/wip-motion.spec.ts:137), [:158](/Users/rargu/DevPageOS/tests/e2e/wip-motion.spec.ts:158), [:169](/Users/rargu/DevPageOS/tests/e2e/wip-motion.spec.ts:169), [:182](/Users/rargu/DevPageOS/tests/e2e/wip-motion.spec.ts:182), [:214](/Users/rargu/DevPageOS/tests/e2e/wip-motion.spec.ts:214), [:242](/Users/rargu/DevPageOS/tests/e2e/wip-motion.spec.ts:242). **No test** protects the media listener’s removal across unmount/remount or completion followed by repeated preference changes. |
| R8, R8.a | [castlewars.spec.ts:756](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:756), [pentimento.spec.ts:155](/Users/rargu/DevPageOS/tests/e2e/pentimento.spec.ts:155), [:169](/Users/rargu/DevPageOS/tests/e2e/pentimento.spec.ts:169), [compact-demos.spec.ts:94](/Users/rargu/DevPageOS/tests/e2e/compact-demos.spec.ts:94), [:120](/Users/rargu/DevPageOS/tests/e2e/compact-demos.spec.ts:120) |
| R9, R9.a | **No test or completed comparison.** T7 remains unchecked at [tasks.md:52](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/tasks.md:52). |
| R10 | Missing-file build protection: [castlewars-frames.test.ts:165](/Users/rargu/DevPageOS/tests/unit/castlewars-frames.test.ts:165). Future 007 retention remains unverified. |

**Derived from inspection:** T6 cancels the pending timeout before completing Pentimento synchronously. Its listener checks `timer`, so a completed run does not restart on another preference event. Unmount aborts that listener and disconnects the observer. I found no additional timer-chain defect there.

The 001 R7 exclusion remains limited to the two implemented demos. The 635 px layout value agrees with the amended spec. Sprite imports stay within the guard’s six-basename exception. Existing guard, contrast, and idle-frame tests remain applicable.

**Verdict:** Address the findings and complete T7 before `Verified (local)`.

**Could not check:** Runtime reproduction, lint, tests, builds, bundle size, browser traces, mock screenshots, actual focus pixels, screen-reader announcements, or real tab visibility. I ran no network, test, deploy, or git-write commands and changed no files.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/005-wip-windows/spec.md (all, including "Advisor decisions" and the amended R9) and tasks.md
- docs/specs/001-sheet/spec.md (R2.a/R2.b/R2.c, R7, R13, R15, R17, R18, R19, R21, R22, the layout table, "Advisor decisions")
- Earlier per-task reviews whose accepted fixes are in: docs/review/spec-005-t1-t2-review-codex.md, docs/review/spec-005-t3-t5-review-codex.md. Do not repeat a fixed finding; look for problems across tasks.
- Mock: docs/mockups/rargu-os-src/part1.html and reused.js (Castle Wars and Pentimento)
- The change under review: the whole spec 005 implementation, committed range `git diff 076dae1..17b5eef` (T1–T6). Read every changed file under src/sheet/, scripts/, vite.config.ts and the tests (tests/unit/castlewars-frames.test.ts, visibility.test.ts, pentimento.test.ts, tests/e2e/castlewars.spec.ts, pentimento.spec.ts, compact-demos.spec.ts, wip-motion.spec.ts, and changes to sheet*.ts).
- Ignore the uncommitted working tree (other agents are working on spec 006 files).

Task: an implementation review of spec 005 as a whole before Verified (local). Check:
1. every requirement R1–R10 and acceptance check against the code and a test that can fail; list any requirement without a real test;
2. cross-task bugs: visibility helper + Castle Wars timers + reduced motion + Pause + Retry + activation + the one-gesture owner ("control" kind) + 001 behaviours (Reset, navigation, focus reveal, insets); T6's reduced-motion listener in Pentimento (cancel, unmount, double completion);
3. 001 regressions caused by 005: the view init change (stylesheet readiness instead of page load), gestures.ts changes, layout change (Pentimento 635), the 001 R7 inert test scope, the build guard and R2.a request rules with sprites;
4. timers/frames while idle (001 R22), leaks, listeners not removed;
5. accessibility: aria-pressed, live regions, names, focus, contrast of new colours (R18);
6. test quality: tests that cannot fail, sleeps, instrumentation that changes behaviour, fake input where real input is possible.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, no change to old-OS code or files under src/apps/, never art-source/. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. Then a short table: requirement -> test (file:line) or "no test". End with what you could not check.
