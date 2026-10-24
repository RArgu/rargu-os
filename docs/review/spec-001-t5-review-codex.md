# Spec 001 T5: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a167a2-1278-7342-9ac2-5ccbc57b40c8 · **Tokens:** 84,798
- **Date:** 2026-10-23 · **Scope:** uncommitted T5 working tree against `649ec36` (plus the untracked
  `src/sheet/gestures.ts`, `src/sheet/windows.ts`, `tests/e2e/sheet-windows.spec.ts`)
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Zoom during a drag corrupts the release velocity (samples are absolute ÷ zoom) | Accepted. Cumulative screen delta ÷ zoom. |
| 2 | A settled held window does not follow a zoom without a scroll change; edge scroll does not restart | Accepted. View change hook; held windows follow and wake the loop. |
| 3 | Home click from another pointer cancels a drag | Accepted. Pointer Home ignored while another pointer owns a gesture; keyboard kept. |
| 4 | Cancel during a pinch leaves "paper" owned | Accepted. Cancel ends the whole paper gesture. |
| 5 | Blur during a Safari gesture leaves zoom suppressed | Accepted. Gesture state cleared on cancel. |
| 6 | Home focus ring on the title bar is ~1.5:1 / ~1.0:1 (R18) | Accepted. Inset ring on the button; pair added to the contrast table. |
| 7 | No page test proves sway or the pin wobble | Accepted. Controlled-time tests of rotation while held, after the pin, at rest, and catch/re-throw. |
| 8 | Home at rest schedules an idle frame (R22) | Accepted. |

Also from the T5 agent's own report: a window grab now stops a running paper glide, and the R10.a 120 Hz page is
watched for console errors.

## Codex output (verbatim)

Evidence below is **observed** through `git diff HEAD` and `nl -ba`. Effects marked **derived** follow from the code. No browser reproductions or tests were run.

1. **Medium — Zoom changes corrupt release velocity**  
   [src/sheet/windows.ts:90](/Users/rargu/DevPageOS/src/sheet/windows.ts:90)

   **Observed:** Samples store absolute coordinates divided by the current zoom:
   ```ts
   s.samples.push([e.timeStamp, e.clientX / z, e.clientY / z]);
   ```
   **Derived:** Samples taken before and after a zoom use different coordinate scales. At client X = 600, changing zoom from 1 to 0.5 changes the recorded X from 600 to 1200 without pointer motion. A small subsequent move can produce a large throw. This violates R8’s release-velocity formula.

   **Fix:** Accumulate screen-coordinate deltas divided by zoom. Record that cumulative displacement, excluding scroll and zoom movement.

2. **Medium — A settled drag does not follow every view change**  
   [src/sheet/windows.ts:271](/Users/rargu/DevPageOS/src/sheet/windows.ts:271), [src/sheet/view.ts:77](/Users/rargu/DevPageOS/src/sheet/view.ts:77)

   **Observed:** Window updates listen only for:
   ```ts
   vp.addEventListener("scroll", refollow, { passive: true });
   vp.addEventListener("wheel", refollow, { passive: true });
   ```
   `refollow()` does not call `run()`. `zoomAround()` does not notify windows directly.

   **Derived:** Once the held window settles, its animation loop stops. A zoom button or Safari gesture can change zoom without changing clamped scroll offsets. No listener then updates the grab point. For example, zooming out at scroll `(0, 0)` can leave P away from the pointer. Also, scrolling inward after edge auto-scroll stops at a limit does not restart auto-scroll. These violate R8.a and R10.

   **Fix:** Notify windows whenever zoom or scroll changes. Recompute held positions and wake the loop when edge scrolling becomes possible.

3. **Medium — Home bypasses gesture ownership**  
   [src/sheet/windows.ts:225](/Users/rargu/DevPageOS/src/sheet/windows.ts:225), [src/sheet/windows.ts:267](/Users/rargu/DevPageOS/src/sheet/windows.ts:267)

   **Observed:** Button presses skip the ownership check:
   ```ts
   if (e.button !== 0 || (e.target as Element).closest("button")) return;
   ```
   Home clicks execute unconditionally:
   ```ts
   .addEventListener("click", () => home(s));
   ```
   `home()` cancels the gesture when that window is held.

   **Derived:** Another pointer can activate Home during a drag and cancel the first pointer’s gesture. Controls also never claim ownership themselves. This conflicts with R21 and the instruction to ignore further pointers during a window drag.

   **Fix:** Include pointer interactions with controls in ownership handling. Suppress clicks from rejected pointers while preserving keyboard activation.

4. **Medium — Canceling a pinch leaves ownership behind**  
   [src/sheet/view.ts:258](/Users/rargu/DevPageOS/src/sheet/view.ts:258), [src/sheet/gestures.ts:32](/Users/rargu/DevPageOS/src/sheet/gestures.ts:32)

   **Observed:** Cancellation uses the normal per-pointer release:
   ```ts
   if (!pts.delete(e.pointerId)) return;
   free(e.pointerId);
   if (pts.size < 2) pinch = null;
   ```
   `free()` retains ownership while another ID remains:
   ```ts
   if (!ids.delete(id) || ids.size) return;
   ```

   **Derived:** If one pointer receives `pointercancel` or loses capture during a pinch, pinch processing stops, but the remaining pointer still owns `"paper"`. New window and minimap gestures remain blocked. R21 requires cancellation to end the gesture.

   **Fix:** On cancellation or lost capture, cancel the entire paper gesture. Clear all pointer IDs and release their captures.

5. **Medium — Blur leaves Safari pinch state active**  
   [src/sheet/view.ts:150](/Users/rargu/DevPageOS/src/sheet/view.ts:150), [src/sheet/gestures.ts:39](/Users/rargu/DevPageOS/src/sheet/gestures.ts:39)

   **Observed:** Safari state clears only on `gestureend`. Wheel zoom returns while that state exists:
   ```ts
   if (gesture !== null) return;
   ```
   The blur handler calls `cancel()`, which clears only the registered pointer gesture.

   **Derived:** Blur between `gesturestart` and `gestureend` can leave `gesture` non-null. Subsequent Ctrl-wheel zoom remains suppressed after focus returns. This violates R21’s blur cleanup rule. The stale-state path already existed in T4 but remains relevant to T5’s gesture owner.

   **Fix:** Include Safari gesture state in view cancellation and clear it on blur.

6. **Medium — Home’s focus ring fails contrast on the title bar**  
   [src/sheet/sheet.css:110](/Users/rargu/DevPageOS/src/sheet/sheet.css:110), [src/sheet/sheet.css:204](/Users/rargu/DevPageOS/src/sheet/sheet.css:204)

   **Observed:** The inherited ring is:
   ```css
   outline: 2px solid var(--focus);
   outline-offset: 2px;
   ```
   It appears outside Home, over the bar’s `var(--accent)` background.

   **Derived:** The token pairs provide approximately **1.50:1 in light mode** and **1.01:1 in dark mode**, below R18’s 3:1 requirement. The contrast table omits `focus` against `accent` ([tests/unit/sheet-content.test.ts:218](/Users/rargu/DevPageOS/tests/unit/sheet-content.test.ts:218)).

   **Fix:** Give Home an inset `--focus` ring over a `--paper` background, or provide an equivalent contrasting backing. Add the actual focus/background pair to the contrast test.

7. **Medium — Tests do not verify sway or pin-wobble integration**  
   [tests/e2e/sheet-windows.spec.ts:255](/Users/rargu/DevPageOS/tests/e2e/sheet-windows.spec.ts:255), [tests/e2e/sheet-windows.spec.ts:288](/Users/rargu/DevPageOS/tests/e2e/sheet-windows.spec.ts:288)

   **Observed:** The assertion described as checking lean checks only a class:
   ```ts
   expect((await pose(page, "castlesiege")).lifted).toBe(true);
   ```
   Throw tests check the final position after `rest()`. No assertion checks an intermediate angle or pin response.

   **Derived:** Removing the pin kick or forcing rendered rotation to zero would leave these assertions satisfied. T3’s pure-function tests would also remain unchanged. The page integration of R8’s sway, additive kick, and caught/rethrown wobble is therefore unprotected.

   **Fix:** Use controlled time and pointer samples to inspect the page’s rendered angle before and after pinning. Include a catch/rethrow case and assert a nonzero throw distance.

8. **Low — Home at rest schedules an idle animation callback**  
   [src/sheet/windows.ts:200](/Users/rargu/DevPageOS/src/sheet/windows.ts:200)

   **Observed:**
   ```ts
   if (to[0] === s.x && to[1] === s.y) return run();
   ```
   **Derived:** Pressing Home on a fully settled window at home schedules a callback even though nothing moves. The callback then skips that window. This violates R22’s explicit idle-frame rule.

   **Fix:** Return immediately when position, flight, rotation, angular velocity, and lift require no further work.

**What I could not check**

- Lint, unit tests, e2e tests, build output, or bundle size, because execution was prohibited.
- Actual pointer-capture loss, native blur behavior, Safari trackpad events, and rendered focus appearance.
- Actual 60/120 Hz behavior or an idle performance trace.
- Runtime requests and storage behavior. Static inspection found no added network calls, storage writes, dependencies, or old-OS edits.
- Browser behavior of the deferred T6/T7 features. Their absence is not reported as a T5 defect.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/001-sheet/spec.md (the whole spec; this task is T5: R7, R8, R9, R10, R21 and the moved-window part of R16.a, plus Approach "Physics" and "Gestures", and R22: no animation-frame callback while nothing moves)
- docs/specs/001-sheet/tasks.md (row T5)
- The mock code the change ports: docs/mockups/rargu-os-src/part2.js (makeWin, pan, pinch)
- src/sheet/physics.ts and tests/unit/physics.test.ts (done in T3, the formulas)
- The change under review: the uncommitted working tree against HEAD. Run `git diff HEAD` and read the new untracked files src/sheet/gestures.ts, src/sheet/windows.ts, tests/e2e/sheet-windows.spec.ts. Also read src/sheet/view.ts, src/sheet/main.ts, scripts/sheet-content.ts, tests/e2e/compact-sheet.spec.ts, tests/e2e/helpers.ts, playwright.config.ts.

Task: review the T5 change for
1. correctness against each T5 requirement and acceptance check (R7.a, R8.a, R9.a, R10.a, R21.a, R21.b, R16.a) and against the Physics approach (grab point exact under the pointer at any zoom and at edges; release velocity in sheet px excluding auto-scroll; flight, cap, clamp, pin kick added to the current angular velocity; edge auto-scroll rate in screen px per second, frame-rate independent),
2. the one-gesture owner (one owner at a time; pointercancel, lost capture and window blur end the gesture with no throw),
3. bugs: state left behind after cancel, frames scheduled while idle (R22), z-order, double-click vs Home button, focus, scroll/zoom during a drag,
4. tests that cannot fail, that sleep or count frames instead of waiting on state, or that check helpers instead of the page,
5. accessibility of the new Home control (name, keyboard, focus ring with --focus), and spec drift (anything that belongs to T6: card buttons, Reset, panTo; or T7: Alt+arrow moves, full reduced motion).

Constraints (owner rules): static site, no third-party requests, no visitor state in storage, same layout for every visitor, respect prefers-reduced-motion, no new dependencies, no change to old-OS code (src/kernel, src/fs, src/wm, src/boot, src/apps, index.html). Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with a list of what you could not check.
