# Spec 001 T7: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a16802-9987-7a72-a924-8f9ca782e8aa · **Tokens:** 113,263
- **Date:** 2026-10-23 · **Scope:** uncommitted T7 working tree against `9e8422d` (plus the untracked
  `tests/e2e/sheet-a11y.spec.ts`), after the advisor's desktop insets and the fit correction
- **Prompt:** below the output.

## Dispositions

The lead agent checked findings 1, 3 and 6 directly in the code (`view.ts:372` returns before the glide under reduced
motion; `view.ts:564` skips the reveal while `panRaf` runs; `--focus` and `--shadow` are both `#1d2b53` in light).
The others follow from the quoted code.

| # | Finding | Disposition |
|---|---|---|
| 1 | Reduced-motion flick stops at release; completion formula differs from the glide (R17) | Accepted. One destination computed at release. |
| 2 | A wheel cancels a pan but leaves its completion callback | Accepted. |
| 3 | Tab during a navigation pan is not revealed (R19) | Accepted. |
| 4 | Home button sends its own focus off screen (R19) | Accepted. |
| 5 | Resize and media change do not keep focus visible (R19) | Accepted. |
| 6 | Light window ring over its own shadow is 1:1 (R18) | Accepted. |
| 7 | Rings inside windows shrink with zoom | Accepted. |
| 8 | Fit with classic scrollbars clips the sheet (R5.b) | Accepted. |
| 9 | Tall desktop views cannot scroll away the top inset | Accepted. |
| 10 | Preference change leaves a queued physics frame (R22) | Accepted. |

Also sent with the fixes: two Firefox flakes seen in the lead's rerun (`sheet-a11y.spec.ts:203` two scrolls for one
Tab; `sheet-a11y.spec.ts:423` throw 510 px, expected > 511).

## Codex output (verbatim)

**Observed:** I read the requested files and ran `git diff HEAD -- src tests`. No files changed. Evidence below comes from those read-only reads. Behavioral results are **derived**, not browser reproductions.

1. **Medium — Reduced-motion glide does not preserve its landing**
   
   [src/sheet/view.ts:372](/Users/rargu/DevPageOS/src/sheet/view.ts:372)

   **Observed:** Release exits with `if (reduced()) return;` before calculating velocity or calling `glide()`. The mid-motion completion instead uses `0.18 * (1 - 20 / Math.hypot(vx, vy))` at line 236.

   **Derived:** A reduced-motion flick stops at release instead of committing the normal glide’s destination. The completion formula also differs from the normal frame-by-frame integration. For an unclamped 1000 px/s glide, that integration travels approximately 184.95 px at 60 Hz; the completion formula gives 176.4 px. Both violate R17’s unchanged landing math.

   **Fix:** Calculate one glide destination at release. Use that destination for normal animation, reduced-motion release, and preference changes. Test the exact destination; the current assertion at `sheet-a11y.spec.ts:564` only requires movement “further on.”

2. **Medium — A canceled pan can return after a preference change**
   
   [src/sheet/view.ts:248](/Users/rargu/DevPageOS/src/sheet/view.ts:248)

   **Observed:**
   ```ts
   cancelAnimationFrame(glideRaf);
   cancelAnimationFrame(panRaf);
   panRaf = 0;
   if (!(e.ctrlKey || e.metaKey)) return;
   ```
   This leaves `finish` intact. The reduced-motion listener later calls `halt()?.()`.

   **Derived:** Start card navigation, interrupt it with ordinary wheel scrolling, then enable reduced motion. The canceled navigation’s completion callback moves the view to its old destination. The same stale state exists for canceled glide.

   **Fix:** Cancel through a shared function that clears the corresponding frame ID and completion callback together. Add this interruption sequence to the page tests.

3. **Medium — Tab during navigation can leave the new focus hidden**
   
   [src/sheet/view.ts:564](/Users/rargu/DevPageOS/src/sheet/view.ts:564)

   **Observed:**
   ```ts
   if (t === vp || panRaf || byPointer) return;
   ```

   **Derived:** The `panRaf` condition suppresses every focus reveal during navigation. For example, activate Paint from the card, then immediately press Shift+Tab into Insider Trading’s last link. The old pan continues toward Paint and can leave the newly focused link outside the view or under the card. This violates R19.

   **Fix:** Suppress only the focus event deliberately issued by card navigation. A subsequent keyboard focus change must cancel the old pan and reveal its new target. Test rapid Tab and Shift+Tab without waiting for navigation to finish.

4. **Medium — The Home control can send its own focus offscreen**
   
   [src/sheet/windows.ts:287](/Users/rargu/DevPageOS/src/sheet/windows.ts:287)

   **Observed:** The Home button calls only `home(s)`. Camera reveal occurs separately in the window-root key handler:
   ```ts
   view.reveal(x, y, s.w, s.h);
   ```

   **Derived:** Move CastleSiege far right with Alt+Arrow, Tab to its Home button, then press Enter. The window returns home, but the camera remains at its former position. Focus stays on the now-offscreen button. This violates R19’s “focus is always visible,” including under reduced motion.

   **Fix:** Make Home preserve visibility when focus belongs to that window. Apply this to the button and Home key through the same path. Test with the home position outside the current view.

5. **Medium — Resize and media changes do not preserve focus visibility**
   
   [src/sheet/view.ts:633](/Users/rargu/DevPageOS/src/sheet/view.ts:633)

   **Observed:** `resized()` measures insets, enforces minimum zoom, and retargets an existing pan. It never reveals the active element. The observer calls only:
   ```ts
   new ResizeObserver(() => measure()).observe(card);
   ```

   **Derived:** Focus Pentimento at 1280 × 800, then resize to 390 × 844. The inset compensation preserves its previous screen position, approximately x = 492, outside the new viewport. No new `focusin` event repairs this. Card geometry changes can similarly cover existing focus. This violates R19.

   **Fix:** After geometry changes, reveal the active sheet element or retarget its active navigation. Use the same reconciliation path for resize, media changes, and relevant observer updates.

6. **Medium — The light window ring crosses an identical shadow color**
   
   [src/sheet/sheet.css:248](/Users/rargu/DevPageOS/src/sheet/sheet.css:248)

   **Observed:** At 100%, the window outline is 2 px wide with a 2 px offset. Windows have `box-shadow: 5px 5px 0 var(--shadow)`. In light mode, both `--focus` and `--shadow` are `#1d2b53`.

   **Derived:** The right and bottom outline segments occupy the window’s navy shadow. Their contrast is **1:1**, below R18’s 3:1 requirement. Overlapping window backgrounds introduce further unchecked pairs.

   The test misses this because [sheet-a11y.spec.ts:169](/Users/rargu/DevPageOS/tests/e2e/sheet-a11y.spec.ts:169) substitutes the parent’s background:
   ```ts
   off >= 0 ? bg(el.parentElement) : …
   ```
   It does not account for shadows or overlapping siblings.

   **Fix:** Give the indicator a controlled contrasting backing or two-color treatment. Verify the rendered backgrounds it crosses, including shadows and overlapping windows.

7. **Low — Focus rings inside windows still shrink with zoom**
   
   [src/sheet/sheet.css:248](/Users/rargu/DevPageOS/src/sheet/sheet.css:248)

   **Observed:** Only `.win:focus-visible` uses `--ring`. Home buttons and project links retain the global `2px` outline.

   **Derived:** At the phone start zoom, their rings are approximately 1.15 screen px. At 13% fit, they are approximately 0.26 screen px. The compensation therefore does not protect all Tab stops under R19. The desktop traversal checks these controls only at 100%; the phone test checks region rings only.

   **Fix:** Compensate descendant focus indicators too, with offsets that remain visible inside the window’s clipping boundary. Test Home and link focus at phone zoom and fit.

8. **Low — Fit can clip the sheet when scrollbars consume space**
   
   [src/sheet/view.ts:119](/Users/rargu/DevPageOS/src/sheet/view.ts:119)

   **Observed:** Fit uses `vp.offsetWidth` and `vp.offsetHeight`. The new desktop padding remains part of the scrollable extent.

   **Derived:** At 1440 × 700 with non-overlay scrollbars, height determines fit. The left inset forces a horizontal scrollbar, reducing `clientHeight`, but the sheet remains 700 px tall. Its bottom is clipped after fit. This violates R5.b.

   **Fix:** Calculate against usable client dimensions and reconcile after scrollbar geometry changes. Test a short desktop viewport with space-consuming scrollbars.

9. **Low — Tall desktop views cannot scroll away the top inset**
   
   [src/sheet/view.ts:577](/Users/rargu/DevPageOS/src/sheet/view.ts:577)

   **Observed:** Desktop start calls `vp.scrollTo(insetL, inset)` with a 24 px top inset.

   **Derived:** At 1440 × 1800, the 1640 px sheet plus 24 px padding is shorter than the viewport. Vertical scrolling clamps to zero. CastleSiege therefore starts at screen **(360, 124)** instead of **(360, 100)**. Reset has the same result. This breaks the advisor’s unchanged first-screen decision.

   **Fix:** Ensure the start-view scroll range can consume the inset even when the sheet is shorter than the viewport. Add a tall-desktop start and Reset case.

10. **Low — Preference changes leave an unnecessary physics callback queued**
    
    [src/sheet/windows.ts:318](/Users/rargu/DevPageOS/src/sheet/windows.ts:318)

    **Observed:** The preference listener clears flights, rotation, velocity, and lift, but does not cancel `raf`.

    **Derived:** Enable reduced motion during the last active flight with no held window. Everything settles immediately, yet the queued physics callback still executes while nothing moves. This violates R22.

    The controlled test helper can conceal this: [sheet-a11y.spec.ts:23](/Users/rargu/DevPageOS/tests/e2e/sheet-a11y.spec.ts:23) executes pending callbacks, then returns only the remaining queue size. A zero result does not prove no callback ran.

    **Fix:** Cancel the physics frame when settling removes all motion. Count executed callbacks separately from pending callbacks, or use the required idle performance trace.

**Could not check:**

- Lint, unit tests, e2e tests, build output, or performance traces, per your restriction.
- Native browser history handling, pointer-focus behavior, and WebKit focus-scroll ordering.
- The late-CSS startup branch in WebKit. Static inspection shows mutually exclusive immediate/deferred startup and a one-shot load listener; I found no demonstrated double-start defect.
- Rendered focus pixels, clipping, accessibility-tree output, or scrollbar behavior in actual browsers.
- Runtime requests and storage use. The reviewed source diff adds no dependency, request, storage call, or old-OS code change.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/001-sheet/spec.md (the whole spec, including "Advisor decisions" at the end: phone top inset and desktop left/top insets; this task is T7: R17 reduced motion and R19 keyboard, plus R18 focus-ring contrast, R4.b arrow keys and R22: no animation-frame callback while nothing moves)
- docs/specs/001-sheet/tasks.md (row T7)
- The change under review: the uncommitted working tree against HEAD. Run `git diff HEAD -- src tests` and read the new untracked file tests/e2e/sheet-a11y.spec.ts. Also read src/sheet/main.ts, src/sheet/view.ts, src/sheet/windows.ts, src/sheet/gestures.ts, src/sheet/layout.ts, src/sheet/sheet.css, scripts/sheet-content.ts, tests/e2e/helpers.ts, playwright.config.ts.

Task: review the T7 change for
1. correctness against R17 (every move commits at once under reduced motion: throw, Home, Reset, navigation, zoom buttons, glide; no tilt or wobble; a preference change mid-motion ends the motion at its target) and R19 (windows are named regions reachable by Tab in project-list order; a focused window comes into view without a second scroll; Alt+Arrow moves a focused window 24 sheet px; Home key sends it home; focus always visible and never under the card), and acceptance R17.a, R19.a, R19.b;
2. the desktop left/top insets (advisor decision): is every coordinate path (toSheet, toScreen, zoom at a point, pinch, fit, minimap box/clicks/centre, panTo, focus reveal, window drag and edge auto-scroll, card navigation, nearest marking, resize, media change, ResizeObserver) consistent? Does the first screen stay as before (CastleSiege at screen 360,100)? Does fit still use the full view (R5)?
3. bugs: keyboard handling conflicts (Alt+Arrow vs browser back, Home key in text fields or inside window content, arrows on controls inside windows now panning), focus handling races (focusin vs navigation pan, pointer focus), the WebKit late-CSS start-view wait (could it leave the page wrong or run twice?), frames while idle (R22), state left behind;
4. tests that cannot fail, that sleep or count frames instead of waiting on state, or that check helpers instead of the page;
5. accessibility: region names, focus ring contrast 3:1 on every background it can cross, zoom-scaled ring width.

Constraints (owner rules): static site, no third-party requests, no visitor state in storage, same layout for every visitor, respect prefers-reduced-motion, no new dependencies, no change to old-OS code (src/kernel, src/fs, src/wm, src/boot, src/apps, index.html). Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with a list of what you could not check.
