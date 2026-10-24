# Spec 002 T5 and T7: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a1697b-6efd-7c22-b76a-a112083ea3c9 · **Tokens:** 195,167
- **Date:** 2026-10-23 · **Scope:** uncommitted T5 (menu row, shortcuts, input routing) + T7 (bus, processes,
  close) working tree against `f921694`; one review, built in parallel
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | An ended attempt can alter a restarted app (R10, R12) | Accepted (T7 agent). Attempt identity. |
| 2 | Self-spawn during startup deadlocks (R9) | Accepted (T7 agent). |
| 3 | A throwing child-close callback prevents termination (R10) | Accepted (T7 agent). |
| 4 | Real-app focus defeats keyboard menu entry; no keyboard exit from Writer (R5, 001 R19) | Accepted (T5 agent). Host keyboard route out of an app. |
| 5 | Disabled menu branches remain executable (R5) | Accepted (T5 agent). |
| 6 | Shifted native editing chords not exempt (R5) | Accepted (T5 agent). |
| 7 | Keyboard selection can scroll out of view in a long menu | Accepted (T5 agent). |
| 8 | Menu replacement and disposal leave popups open (R5, R10) | Accepted (T5 agent). |
| 9 | Popup placement ignores window rotation (wobble) (R18) | Accepted (T5 agent). |
| 10 | Two apps can own pointer gestures at once (001 R21) | Accepted (T5 agent). |
| 11 | The advisor's `popupMenu` placement unit test is missing | Accepted (T5 agent). The owner-questions row said "added" too early; corrected by the lead. |

Codex also confirmed: plain wheel over an app not panning the sheet matches R18 (trackpad users pan from the paper);
ctrl/meta wheel still zooms.

## Codex output (verbatim)

Reviewed against `f921694` using `git status --short`, `git diff HEAD`, `nl -ba`, and `rg`. **Observed** means source inspection. **Derived** means a consequence of that code.

1. **High — An ended attempt can alter a restarted app** — [load.ts:225](/Users/rargu/DevPageOS/src/sheet/host/load.ts:225), [load.ts:366](/Users/rargu/DevPageOS/src/sheet/host/load.ts:366)

   **Observed:** OS callbacks retain the mutable `run`:
   ```ts
   if (run.main) return panels.child(opts);
   run.main = createMainWindow(...)
   ```
   The stale-attempt check runs only after `await mod.default(os)`. Bus subscriptions remain available after `bus.drop(pid)`.

   **Derived:** Close an app while `main()` awaits, restart it, then release the old continuation. That continuation can create windows, register handlers on the new attempt, or restore subscriptions for the dead PID. An old window’s `close: () => end(run)` can also end the replacement. This breaks **R10/R12**.

   **Fix:** Give each attempt an identity and invalidate it before cleanup. Guard its OS callbacks and window methods against that identity. Reject late subscriptions for retired PIDs. Add a held-start fixture covering close, restart, and late continuation.

2. **Medium — Self-spawn during startup deadlocks** — [load.ts:311](/Users/rargu/DevPageOS/src/sheet/host/load.ts:311), [load.ts:401](/Users/rargu/DevPageOS/src/sheet/host/load.ts:401)

   **Observed:**
   ```ts
   await host.start(run.winId, !visitor);
   ```
   `host.start()` returns the existing `run.start`.

   **Derived:** A fixture whose `main()` awaits `os.proc.spawn(os.app.id)` waits for its own startup promise. Neither call completes. This violates **R9’s PID resolution**.

   **Fix:** Resolve an already-starting self-spawn with the current attempt’s PID instead of awaiting itself. Test this explicitly.

3. **Medium — A throwing child-close callback prevents app termination** — [load.ts:269](/Users/rargu/DevPageOS/src/sheet/host/load.ts:269), [window.ts:580](/Users/rargu/DevPageOS/src/sheet/host/window.ts:580)

   **Observed:** Cleanup calls `run.panels?.closeAll()`. Forced child closure still invokes callbacks without error isolation:
   ```ts
   for (const cb of [...closeCbs]) if (cb() === false && ask) return;
   ```
   The host sets `run.state = "closed"` only after cleanup returns.

   **Derived:** A throwing child callback aborts cleanup. The main window already has `closed = true`, but the process remains listed and dialogs can remain unsettled. Later close calls do nothing. This breaks **R10**.

   **Fix:** Isolate callbacks during forced panel cleanup and remove each panel in `finally`. Complete host termination even when a panel or focus callback throws. Signal-handler errors are already isolated correctly.

4. **Medium — Real-app focus behavior defeats keyboard menu entry and normal exit** — [window.ts:116](/Users/rargu/DevPageOS/src/sheet/host/window.ts:116), [load.ts:147](/Users/rargu/DevPageOS/src/sheet/host/load.ts:147)

   **Observed:** The menu bar is outside `win.root`. Activating the app invokes `focused(true)`. Writer then runs:
   ```ts
   if (focused && !win.root.contains(document.activeElement)) area.focus();
   ```
   Writer also prevents both Tab and Shift+Tab and inserts spaces ([writer/main.ts:445](/Users/rargu/DevPageOS/src/apps/writer/main.ts:445)).

   **Derived:** Tabbing from the window frame into Writer’s menu header redirects focus into the editor. Ordinary Tab navigation then cannot return to the menu or sheet controls. Tracker has the same menu-entry redirection. This breaks **R5 keyboard access and 001 R19**.

   **Fix:** Preserve requested focus on host menu controls across app focus callbacks. Provide an explicit keyboard route from the editor to its window frame. Test real Tab entry and exit. The current fixture test uses `.focus()` instead of Tab ([host-input.spec.ts:166](/Users/rargu/DevPageOS/tests/e2e/host-input.spec.ts:166)).

5. **Medium — Disabled menu branches remain executable** — [shortcuts.ts:22](/Users/rargu/DevPageOS/src/sheet/host/shortcuts.ts:22), [window.ts:137](/Users/rargu/DevPageOS/src/sheet/host/window.ts:137)

   **Observed:** Shortcut recursion precedes the disabled check:
   ```ts
   if (item.children) {
     const hit = matchShortcut(item.children, ev);
   }
   ```
   Menu navigation calls `open()` directly, which also lacks a disabled check.

   **Derived:** A shortcut beneath a disabled parent still executes. Arrow navigation from an open menu can also open a disabled neighboring header. The disabled-leaf fixture misses both cases. This violates **R5**.

   **Fix:** Skip disabled branches before recursion. Make header navigation skip disabled entries, and guard `open()` itself.

6. **Medium — Shifted native editing shortcuts are not exempt** — [shortcuts.ts:40](/Users/rargu/DevPageOS/src/sheet/host/shortcuts.ts:40)

   **Observed:**
   ```ts
   if (editable && ctrl && !ev.shiftKey && EDIT_KEYS.has(key)) continue;
   ```

   **Derived:** A menu item declaring `Ctrl+Shift+Z` or `Ctrl+Shift+V` takes native redo or plain-text paste inside an editor. This contradicts **R5’s “never take native text-editing keys”** requirement. Copying the old matcher preserves this defect.

   **Fix:** Protect native shifted editing chords too. Add matcher cases for textarea and contenteditable targets, checking that unmatched events remain uncanceled.

7. **Medium — Keyboard selection can disappear below a scrolling menu** — [menu.ts:77](/Users/rargu/DevPageOS/src/ui/menu.ts:77)

   **Observed:** `setActive()` only changes classes:
   ```ts
   rows[i]?.row.classList.add("active");
   ```
   Menus have `max-height: 100%; overflow-y: auto` ([base.css:813](/Users/rargu/DevPageOS/src/ui/base.css:813)).

   **Derived:** Tracker’s Song menu exceeds its available root height. ArrowDown can select lower commands without scrolling them into view. Enter then executes an invisible selection. This breaks **R5 keyboard usability and 001 R19**.

   **Fix:** Adjust the menu’s own `scrollTop` when keyboard selection changes. Avoid scrolling ancestor containers. Test the bottom commands of Tracker’s Song menu.

8. **Medium — Menu replacement and disposal leave old popups alive** — [window.ts:258](/Users/rargu/DevPageOS/src/sheet/host/window.ts:258), [window.ts:305](/Users/rargu/DevPageOS/src/sheet/host/window.ts:305)

   **Observed:** `setMenu()` replaces the row without closing its popup. `dispose()` removes DOM without closing it either. The shared popup remains registered in `menu.ts`’s global `stack`.

   **Derived:** Replacing a menu while it is open leaves obsolete actions available. Programmatic app closure can leave detached popup references and callbacks until another action closes menus. This breaks **R5 replacement behavior and R10 cleanup**.

   **Fix:** Retain this window’s popup handle. Close it before menu replacement and disposal. Test replacement while open and programmatic closure with a submenu open.

9. **Medium — Popup conversion does not support window rotation** — [menu.ts:201](/Users/rargu/DevPageOS/src/ui/menu.ts:201), [windows.ts:93](/Users/rargu/DevPageOS/src/sheet/windows.ts:93)

   **Observed:**
   ```ts
   const k = bounds.width / root.offsetWidth || 1;
   ```
   Sheet windows use `rotate(...) scale(...)`, including residual wobble.

   **Derived:** A rotated bounding rectangle includes contributions from both root dimensions. Its width ratio is not the scale, and subtracting its bounding-box origin does not recover local coordinates. Opening a menu during wobble can therefore misplace or clip it. The reduced-motion, 50% test excludes this case. This weakens **R18** during normal **001 R8** motion.

   **Fix:** Convert screen coordinates through the inverse transform, or calculate anchors in untransformed local coordinates. Add a rotated-window placement check.

10. **Medium — Two different apps can own simultaneous pointer gestures** — [main.ts:227](/Users/rargu/DevPageOS/src/sheet/main.ts:227), [gestures.ts:25](/Users/rargu/DevPageOS/src/sheet/gestures.ts:25)

    **Observed:** Every app calls:
    ```ts
    claim("app", id, 10, done)
    ```
    The gesture manager distinguishes only `"app"`, not the owning window, and replaces its cancellation callback on each claim.

    **Derived:** Hold a Paint stroke, then press a Tracker control with another finger. Both claims succeed, allowing independent app gestures. Cancellation also invokes only the latest pointer’s cleanup. This leaves T5’s full routing incomplete against **001 R21**.

    **Fix:** Track the owning app alongside its pointer set. Allow additional pointers only within that app, and cancel the complete set together.

11. **Low — The advisor’s required popup regression test is absent** — [spec.md:183](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:183)

    **Observed:** The amendment requires “a unit test for `popupMenu` with an offset, zoomed root.” `rg -n 'popupMenu' tests/unit` finds none. The owner decision says that test was added.

    **Derived:** The shared old-OS change lacks the explicit verification required by its scope exception.

    **Fix:** Add the promised placement test, including the origin/scale-1 old-OS case. Correct the decision record until that test exists.

Other checks: **Derived**, the placement formula preserves existing old-OS coordinates when its overlay origin is `(0, 0)` and scale is `1`. Plain wheel blocking matches **R18**: trackpad users must move onto paper to pan. Ctrl/Meta wheel still reaches sheet zoom.

**Observed:** Read-only gzip calculation of the existing production graph gives **92.52 KiB**, leaving **7.48 KiB**. That graph contains no T5/T7 fixture IDs, `__hostMenu`, or `__hostMain`. The matcher preserves the old key-based Ctrl-or-Meta, Alt, and repeat behavior. The diff adds no dependencies or app-source changes.

**Not checked:** No files changed. No tests, build, browser, network, deploy, or git-write commands ran. Actual scrolling, focus, touch cancellation, wobble placement, idle frames, old-OS boot, and a fresh-build budget remain **Unverified**.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/002-app-host/spec.md (all, incl. "Lead notes") and tasks.md (rows T5 and T7; T8 for scope); docs/review/spec-002-critique-codex.md, spec-002-t3-review-codex.md, spec-002-t4-t6-review-codex.md
- docs/specs/001-sheet/spec.md (R4.b arrow keys, R12 navigation, R19 keyboard, R21 gestures, R22 budget)
- The change under review: uncommitted working tree against HEAD f921694 (T5 menu row, shortcuts, input routing; T7 bus, processes, close — built in parallel). Run `git status` and `git diff HEAD`; read the new files: src/sheet/host/shortcuts.ts, tests/e2e/host-input.spec.ts, tests/e2e/host-proc.spec.ts, tests/unit/host-bus.test.ts, tests/fixtures/host/apps/fx-menu, fx-spawn. Also src/sheet/host/window.ts, load.ts, os.ts, panels.css, src/sheet/main.ts, src/ui/menu.ts diff, tests/e2e/host-helpers.ts.
- Old semantics to match (read only): src/wm/wm.ts (menu bar, shortcut matcher ~1231-1239), src/kernel (bus delivery, proc list, signals on close); the apps' menus, onClose and onSignal uses.

Task: review T5 (R5 menu row with submenus, separators, disabled, checks, radio; replace on setMenu; shortcuts once, only for the active app, after the app's own handlers, never native text-editing keys in text fields; R18 input inside a running app goes to the app, only the title bar drags, the sheet never pans from inside a running app, menus inside the window at any zoom) and T7 (R9 bus with sender pid, throwing subscriber isolated, unsubscribe; proc.list; spawn starts if needed with argv on first start, panTo, resolves pid, other targets reject naming them; R10 onClose false keeps the app; end once: signals, subscriptions, dialogs settle, leaves proc.list, placeholder until activated). Check:
1. correctness and edge cases; keyboard access to menus; shortcut matching (⌘ vs Ctrl per platform, Shift/Alt, key vs code, repeat), preventDefault only on match; text-field exemptions; blocking of browser scroll keys inside apps vs. the sheet's own keyboard behaviour (001 R4.b/R19) and accessibility (can a keyboard user still leave an app and pan the sheet?);
2. wheel routing (plain wheel never pans the sheet over an app; ctrl/meta still zooms) — consequences for trackpad users; is it what R18 requires?
3. the src/ui/menu.ts change: old OS positions unchanged? any risk;
4. T7: close/end-once idempotency, races (close during start, spawn during close, spawn of self, background caller), pid reuse, eligibility not restarting a closed app, focus after close, signal handler errors, bus leaks;
5. 001 regressions and the budget (92.5 KiB of 100);
6. tests that cannot fail, sleeps, synthetic events where real input is possible, test-only hooks in production.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, app source unchanged in 002 (except src/ui/dom.ts; src/ui/menu.ts is under an advisor decision), old OS working. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
