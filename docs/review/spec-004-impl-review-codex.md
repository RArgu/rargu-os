# Spec 004 implementation review (Codex, whole spec)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only
- **Session id:** 01a16b26-053f-7ae2-bb09-0164ca5f76ef · **Tokens:** 234,204
- **Date:** 2026-10-24 · **Scope:** committed range `9eeeeb7..fb07a04` (T1–T7 and the T4–T6 review fixes)
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | A pending demo load can overwrite a new song (R6) | Accepted. Invalidate the pending demo when the visitor chooses another document; regression tests. Fixed. |
| 2 | T7 activation accepts focus that the app's own start took back (R11, 001 R13/R19) | Accepted. Activation only if that navigation is still current; Reset or focus leaving revokes it. Fixed. |
| 3 | `data-nav` hides real keyboard focus changes from the view (001 R19) | Accepted. Limit the skip to the start's own programmatic focus. Fixed (skip removed; the start's focus waits instead). |
| T8 D2 | Music instrument panel 3 px too narrow, "Periodi" cut (pre-existing at old-OS scale 1) | Accepted as a sheet-only fix (`docs/review/spec-004-mock-vs-build.md`). Fixed. |

## Codex output (verbatim)

1. **Medium — A pending demo can overwrite a new song.** [src/apps/tracker/main.ts:526](/Users/rargu/DevPageOS/src/apps/tracker/main.ts:526)

   **Observed:** `reset()` sets `"ready = true"`. New calls `reset(newSong(), null)`, while the initial `openDemo()` continues independently.

   An in-memory probe held the demo read, selected New, and entered a note. Play became enabled before the demo parsed. Releasing the read replaced the modified song with `demo.trk` and erased the note.

   **Derived:** This bypasses R6’s readiness rule and loses edits. The existing delayed-read test releases the demo before any document action, so it misses this race.

   **Fix:** Disable New/Open until initial loading settles, or invalidate the pending demo when the visitor chooses another document. Add held-demo → New/edit → release and Open → release regression tests.

2. **Medium — T7 checks focus after startup has already stolen it.** [src/sheet/main.ts:212](/Users/rargu/DevPageOS/src/sheet/main.ts:212)

   **Observed:** The guard is `"w.contains(document.activeElement)"` after `h.start()` resolves. Writer’s existing startup calls `"area.focus()"` before returning at [writer/main.ts:567](/Users/rargu/DevPageOS/src/apps/writer/main.ts:567).

   An in-memory probe used the actual host and Writer modules. Two pending Notes activations produced `data-nav="2"`. After focus moved to Reset, startup completed and focused the textarea. Notes became active. The counter correctly cleared, and Writer started once.

   **Derived:** The new guard accepts focus that startup itself reclaimed. Moving to another control does not cancel the pending activation. After Reset, `data-nav` can also suppress the reveal of that late focus. This breaks T7’s stated focus condition and conflicts with 001 R13/R19.

   **Fix:** Keep startup inert until completion, then promote and activate only if that navigation remains current. Revoke pending activation when focus leaves or Reset runs. Test delayed startup after both actions.

3. **Medium — `data-nav` suppresses real keyboard focus changes.** [src/sheet/view.ts:607](/Users/rargu/DevPageOS/src/sheet/view.ts:607)

   **Observed:** The handler returns for any target matching `".closest('[data-nav]')"`. It does not distinguish startup focus from Tab navigation, or check whether a navigation pan still exists. The marker lasts until startup settles.

   In an in-memory view probe with simulated geometry, a focused Home control stayed behind the card. Clearing the marker allowed the same handler to reveal it.

   **Derived:** If loading remains pending after a visitor interrupts the pan and scrolls, subsequent keyboard focus within that window can remain obscured. Native focus scrolling does not account for the overlay card. This violates 001 R19. Existing T7 tests leave focus in the target and let navigation finish.

   **Fix:** Restrict suppression to the initial programmatic activation. Let subsequent keyboard focus halt the pan and reveal its target. Add delayed-start → interrupted pan → real Tab/Shift+Tab tests.

**Observed verification:** I reviewed `git diff 9eeeeb7..fb07a04`, the changed source/tests, and the named specifications and reviews. `npm run lint` and `node_modules/.bin/tsc --noEmit` passed.

**Derived from source:** The Paint inverse matrix is correct, and an isolated probe confirmed horizontal movement and probe removal. Writer’s blur restoration addresses the reported inert race. Added policy/debug hooks are e2e-gated. The diff adds no dependencies, browser storage, third-party requests, or server code.

**Verdict: Fix findings 1–3 before approval.**

**Could not check:** Native browser focus, gestures, downloads, audible playback, screen readers, or export latency. Build and unit/e2e pipelines generate files, so I did not run them. Ledger results remain independently unverified. I modified no files.
## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first: AGENTS.md; docs/specs/004-quick-tools/spec.md (all, incl. owner decisions: Esc alone in Notes; 90 s WAV cap; lead notes; the R7.b clarification) and tasks.md; docs/review/spec-004-critique-codex.md, docs/review/spec-004-t2-t3-review-codex.md, docs/review/spec-004-t4-t6-review-codex.md (earlier findings, all accepted and fixed); docs/ledger/2026-10-23-spec-004.md; docs/specs/002-app-host/spec.md and docs/specs/001-sheet/spec.md where 004 touches them (download rule, focus rules, card navigation R12, layout table).

The change under review: the whole spec 004 implementation, committed range `git diff 9eeeeb7..fb07a04` (T1–T7 plus the T4–T6 review fixes). Read every changed file under src/ and tests/. Pay special attention to the parts not yet reviewed: T7 (src/sheet/main.ts startApp/activate and the `data-nav` counter, src/sheet/host/load.ts Host.activate, src/sheet/host/window.ts focus() override, src/sheet/view.ts focusin skip, src/sheet/host/os.ts test-only `?policy=compact`) and the review fixes in commit fb07a04 (Paint pan through the inverse transform and the restored old-OS pan; Tracker Play readiness; Writer inert restore).

Check: (1) every requirement R1–R14 against code with a test that can fail; (2) all app changes gated on os.env.DISPLAY === "sheet", old OS unchanged (R14); test-only code reachable only when import.meta.env.MODE === "e2e"; (3) T7: can `data-nav` leak (counter never decremented, e.g. on host start failure or a second click), can activation steal focus the visitor moved away, does the focusin skip hide a real keyboard focus change from the view, interaction with Reset and with a pan in flight; (4) the fixes: correctness of the inverse-transform math and probe cleanup; Play readiness after failure; the inert restore race; (5) tests that cannot fail, fixed sleeps, synthetic input where real input is possible; (6) rules: static site, no third-party requests, no visitor state in browser storage, prefers-reduced-motion respected, no new dependencies.

Constraints: read-only commands only.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, evidence (quote), why it is wrong against which requirement, and a fix. Keep observed facts apart from inference. End with a verdict and what you could not check.
