# Spec 001 T6: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a167d3-1ae7-7f33-b8d9-8bda5882fce6 · **Tokens:** 106,861
- **Date:** 2026-10-23 · **Scope:** uncommitted T6 working tree against `8c84e50` (plus the untracked
  `tests/e2e/sheet-card.spec.ts`), after the advisor's phone inset (decision A)
- **Prompt:** below the output.

## Dispositions

Each finding was checked against the code by the lead agent before it was accepted.

| # | Finding | Disposition |
|---|---|---|
| 1 | Card navigation does not cancel a held window; the scroll watcher moves it (R12) | Accepted. Navigation cancels the active gesture first. |
| 2 | Reset leaves Safari pinch state; a later `gesturechange` changes the reset zoom (R13) | Accepted. Cleared through the view's cancel path. |
| 3 | Resize during a navigation pan keeps the old target | Accepted. Target recomputed on resize. |
| 4 | Phone inset omits the top safe area of the card | Accepted. Inset measured from the card's real bottom edge. |
| 5 | Phone Reset hides its own focused button | Accepted. Focus goes to the toggle. |
| 6 | Opening or closing About leaves `aria-current` stale (R12.b) | Accepted. Redraw on card state change. |
| 7 | `wins.cancel()` leaves a queued window frame (R22) | Accepted. |
| 8 | Reduced-motion and interruption tests read state in a later browser call | Accepted. Activate and read in one `page.evaluate()`. |

## Codex output (verbatim)

Eight findings, ordered by severity. None is High.

**Observed evidence** comes from `git diff HEAD -- src tests` and numbered source reads with `nl -ba`, `sed`, and `rg`. Effects below are **derived from the code**, not browser reproductions.

1. **Medium — Navigation can move a held window**  
   [src/sheet/main.ts:85](/Users/rargu/DevPageOS/src/sheet/main.ts:85), [src/sheet/windows.ts:293](/Users/rargu/DevPageOS/src/sheet/windows.ts:293)

   **Observed:** Navigation calls `view.panTo(x, y, s.w, s.h)` without canceling the active gesture. The scroll watcher calls `follow(s)` for every held window.

   **Derived:** Hold a window, focus its card button with the keyboard, then press Enter. Navigation scrolls the sheet. `follow()` changes that window’s sheet coordinates to keep it under the stationary pointer. Navigation therefore moves the window, against **R12**. An active paper or minimap drag can also overwrite the navigation pan.

   **Fix:** Cancel the active gesture before reading the target position and starting navigation. Add coverage for keyboard navigation during a held window, paper pan, and minimap drag.

2. **Medium — Reset leaves Safari pinch state active**  
   [src/sheet/main.ts:98](/Users/rargu/DevPageOS/src/sheet/main.ts:98), [src/sheet/view.ts:228](/Users/rargu/DevPageOS/src/sheet/view.ts:228)

   **Observed:** Reset calls `cancelGesture()` and `view.start()`. Neither clears the separate Safari `gesture` value. A later `gesturechange` still runs:

   > `zoomAround(gesture.z * g.scale, gesture.p, g.clientX, g.clientY);`

   **Derived:** Start a Safari pinch, activate Reset through the keyboard, then continue the pinch. The old gesture changes the reset zoom and view. This violates **R13: cancels any gesture**, including Reset’s stable end state.

   **Fix:** Clear Safari gesture state through the view’s input-cancellation path. Ignore further changes from that gesture until a new `gesturestart`. Test this event sequence on the page.

3. **Medium — Resize leaves navigation aimed at the old viewport**  
   [src/sheet/view.ts:444](/Users/rargu/DevPageOS/src/sheet/view.ts:444), [src/sheet/view.ts:540](/Users/rargu/DevPageOS/src/sheet/view.ts:540)

   **Observed:** `panTo()` captures `tx` and `ty` once. Its callback continues toward them:

   > `vp.scrollLeft = x0 + (tx - x0) * e;`

   Resize calls `measure()` and redraws, but does not update or cancel that pan.

   **Derived:** Start navigation at a client width of 1280, then resize to 1440 before completion. The horizontal destination remains 80 px away from the new center. Crossing the phone breakpoint also changes the inset while the pan retains its old vertical destination. This breaks **R12** and inset consistency during resize/rotation.

   **Fix:** Recompute the active navigation destination after resize using the new area and inset. Test resize during the navigation animation.

4. **Medium — The phone inset omits the card’s safe-area displacement**  
   [src/sheet/view.ts:79](/Users/rargu/DevPageOS/src/sheet/view.ts:79), [src/sheet/sheet.css:377](/Users/rargu/DevPageOS/src/sheet/sheet.css:377)

   **Observed:** The inset is the folded card’s height plus `16`. The card’s actual top includes:

   > `top: calc(16px + env(safe-area-inset-top, 0px));`

   `panTo()` clamps its destination to zero.

   **Derived:** Let a thrown window land at sheet `y = 0`, then navigate to it on a phone with a positive top safe area. At the scroll limit, its top is `foldedHeight + 16`. The card’s bottom is that value **plus the safe-area offset**. The card covers the window’s title bar. This defeats **advisor decision A’s clearance rule**.

   **Fix:** Include the top safe-area displacement in the reserved inset. Use the same measured folded-bar boundary for navigation and scroll limits. Add a positive-safe-area case with a window at `y = 0`.

5. **Medium — Phone Reset hides the focused control**  
   [src/sheet/main.ts:98](/Users/rargu/DevPageOS/src/sheet/main.ts:98), [src/sheet/sheet.css:602](/Users/rargu/DevPageOS/src/sheet/sheet.css:602)

   **Observed:** Reset calls `setOpen(false)` without assigning focus. Closing applies:

   > `.rail.folds:not(.open) .more { display: none; }`

   Reset is inside `.more`.

   **Derived:** Open About, focus Reset, then press Enter. Reset hides its own focused button without returning focus to a visible control. The Escape path handles this, but Reset does not. This leaves a focus defect in **T6’s phone close/reset behavior**.

   **Fix:** Return focus to the toggle after phone Reset, using `preventScroll`. Keep navigation’s explicit focus transfer to its target window. Add a keyboard phone Reset assertion.

6. **Low — Opening or closing About leaves nearest marking stale**  
   [src/sheet/main.ts:23](/Users/rargu/DevPageOS/src/sheet/main.ts:23), [src/sheet/view.ts:408](/Users/rargu/DevPageOS/src/sheet/view.ts:408)

   **Observed:** `setOpen()` changes the card height without requesting a redraw. Nearest marking runs only during `draw()`, while its center depends on:

   > `const t = phone ? cb.bottom + 16 : 24;`

   **Derived:** Opening About changes the center used to select the nearest project. The existing `aria-current` remains until another event redraws the minimap. It can therefore mark the wrong project under **R12.b**.

   **Fix:** Request a redraw after each card state change once the view exists. Test marking across open/close without an intervening scroll.

7. **Low — Reset leaves an obsolete window animation callback queued**  
   [src/sheet/windows.ts:313](/Users/rargu/DevPageOS/src/sheet/windows.ts:313)

   **Observed:** `cancel()` clears flight, rotation, and lift state:

   > `s.fl = null;`  
   > `s.th = s.v = s.lift = 0;`

   It does not cancel the window loop’s `raf`.

   **Derived:** If Reset commits all windows immediately under reduced motion, a previously queued `tick()` still executes after movement has ended. This is unnecessary work under **R13/R22**. It is a single leftover callback, not evidence of a permanent idle loop.

   **Fix:** Cancel and clear the window loop handle in `cancel()`. Subsequent animated Home flights can start the loop again.

8. **Low — Timing tests do not establish the claimed interruption or deadline**  
   [tests/e2e/sheet-card.spec.ts:292](/Users/rargu/DevPageOS/tests/e2e/sheet-card.spec.ts:292), [tests/e2e/sheet-card.spec.ts:408](/Users/rargu/DevPageOS/tests/e2e/sheet-card.spec.ts:408)

   **Observed:** Reduced-motion tests await `click()`, then make separate browser calls before inspecting state. Their comment says:

   > `// no frame has run: the click itself set the view`

   The zoom-cancellation test starts zoom and then performs another asynchronous click without proving zoom is still active.

   **Derived:** Browser frames can run between these calls. A delayed test can pass after an unwanted animation finishes. Likewise, Reset can run after zoom naturally completes. These tests do not establish **R17’s immediate completion** or **R13’s interruption behavior**.

   **Fix:** Activate the control and capture its immediate DOM state within one `page.evaluate()` call. For interruption tests, establish an intermediate motion state and activate Reset within that same browser turn.

**Other checks:** The ordinary inset equations agree across coordinate conversion, zoom, pointer pinch, minimap drawing/clicks, and held-window following. Desktop explicitly receives zero inset. The no-JS folding guard, native toggle semantics, status live region, and `aria-current="location"` have no clear static defect. These observations come from `view.ts`, `main.ts`, and `sheet.css`.

**Scope:** `tabIndex = -1` supports T6 navigation focus. Tab order, focus-ring polish, Alt+arrows, and full mid-motion preference handling remain T7 work, as recorded in [tasks.md:41](/Users/rargu/DevPageOS/docs/specs/001-sheet/tasks.md:41). The reviewed source diff changes no protected old-OS file and adds no dependency, storage use, or third-party request.

**Could not check:**

- Runtime acceptance results, lint, unit tests, builds, or e2e tests. No test commands were run.
- Actual Safari gestures, safe-area rendering, screen-reader announcements, or browser focus behavior.
- The R22 two-second performance trace and production bundle budget.
- Visual comparison with the mock.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/001-sheet/spec.md (the whole spec, including "Advisor decisions" at the end; this task is T6: R11.b, R12, R13, R15, plus R17 where navigation/Reset run under reduced motion, R16 and R22: no animation-frame callback while nothing moves)
- docs/specs/001-sheet/tasks.md (row T6)
- The mock code the change ports: docs/mockups/rargu-os-src/part2.js (lines 1-15 copy and rail toggle; 135-175 visibleArea, panTo, data-go, data-tool, reset, markNearest) and part1.html (card markup and phone CSS)
- The change under review: the uncommitted working tree against HEAD. Run `git diff HEAD -- src tests` and read the new untracked file tests/e2e/sheet-card.spec.ts. Also read src/sheet/windows.ts, src/sheet/gestures.ts, src/sheet/layout.ts, scripts/sheet-content.ts, tests/e2e/helpers.ts, playwright.config.ts.

Task: review the T6 change for
1. correctness against each acceptance check (R11.b, R12.a, R12.b, R13.a, R15.a) and the requirement text: navigation goes to the window's current position, centred beside the card, moves focus to the window and never moves it; nearest marking; Reset cancels any gesture and animation, flies every window home, sets the start zoom, frames CastleSiege's home, and gives the same end state when pressed twice or during a drag; phone bar with Escape and focus return; phone fit;
2. the phone top inset (advisor decision A): is every coordinate path (toSheet, toScreen, zoom at a point, pinch, fit, minimap box and clicks, panTo, window drag and edge auto-scroll, resize/rotation, card open/close) consistent with the inset? Any case where desktop gets an inset?
3. bugs: state left behind after Reset, races between the navigation pan and other gestures, frames scheduled while idle (R22), focus, accessibility of the toggle, toast (live region) and aria-current marking, no-JS card (R3);
4. tests that cannot fail, that sleep or count frames instead of waiting on state, or that check helpers instead of the page;
5. spec drift (anything belonging to T7: Tab order of windows, focus rings, Alt+arrow moves, full reduced motion).

Constraints (owner rules): static site, no third-party requests, no visitor state in storage, same layout for every visitor, respect prefers-reduced-motion, no new dependencies, no change to old-OS code (src/kernel, src/fs, src/wm, src/boot, src/apps, index.html). Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with a list of what you could not check.
