# Spec 003: Codex implementation review (whole spec, T9)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a16a4a-6437-7fb1-b900-8a9c76697f7f · **Tokens:** 211,575
- **Date:** 2026-10-23 · **Scope:** committed range `9223298..64cc59e` (T1–T8). Covers T1, T6, T7 and T8, which had
  no separate review.
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Invalid settings in a `.siege` file silently replace the game (R10) | Accepted. Strict validation before `setGame()` on the sheet. |
| 2 | Imported history has no limit on replay work (R10, R8) | Partly accepted: a measured action limit and validation before replacing the game; no engine restructuring. |
| 3 | No host close/restart test for CastleSiege (002 R10, 003 R1/R13) | Accepted (test-build-only close path). |
| 4 | R2 tests count reference entries without checking visibility | Accepted. |
| 5 | Mid-victory test is timing-sensitive (R9) | Accepted. |
| — | Hard level is reachable but R8 measures Easy and Normal only | Not changed: R8 names Easy and Normal. Listed for the owner. |

## Codex output (verbatim)

No High finding established. I would resolve the Medium findings before marking 003 Verified (local).

**Observed** evidence below comes from `git diff 9223298..64cc59e`, `nl -ba`, `rg`, and read-only inspection of existing build assets. Runtime consequences are **derived** or **inferred** as marked. I did not repeat the four accepted T2–T5 findings.

1. **Medium — Invalid settings silently replace the current game**

   [session.ts:147](/Users/rargu/DevPageOS/src/apps/castlesiege/session.ts:147), [main.ts:1077](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:1077)

   **Observed:**

   ```ts
   mode: raw.mode === "hotseat" ? "hotseat" : "bot",
   human: isSide(raw.human) ? raw.human : "white",
   level: raw.level === "normal" || raw.level === "hard" ? raw.level : "easy",
   style: raw.style === -1 || raw.style === 1 ? raw.style : 0,
   ```

   **Derived:** A correctly tagged file with `actions: []`, `mode: {}`, `human: 7`, `level: []`, and `style: "bad"` passes. Open replaces the current game with normalized defaults and shows no error.

   This violates **R10**: an invalid file must show an error and keep the game. The existing corrupt-file test covers malformed JSON, not invalid settings.

   **Fix:** Add strict validation for sheet imports before `setGame()`. Preserve any required old-OS compatibility under **R13**. Test wrong types, unknown values, and missing required fields against an existing game.

2. **Medium — Imported history has no limit on replay work or retained state**

   [session.ts:50](/Users/rargu/DevPageOS/src/apps/castlesiege/session.ts:50), [session.ts:156](/Users/rargu/DevPageOS/src/apps/castlesiege/session.ts:156), [main.ts:857](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:857)

   **Observed:**

   ```ts
   save.actions.forEach((a, i) => {
     const r = applyAction(state, ruleset, a);
     // ...
     states.push(state);
   });
   ```

   `parseSave()` replays the file. `setGame()` immediately replays it again. Every generated state copies its repetition map:

   ```ts
   nextState.positionCounts = { ...prevCounts, [k]: (prevCounts[k] ?? 0) + 1 };
   ```

   — [core.ts:636](/Users/rargu/DevPageOS/src/apps/castlesiege/engine/core.ts:636)

   **Derived:** A long legal prefix followed by an illegal move must finish synchronous replay before rejection. Retaining every state gives quadratic growth in repetition-map entries as distinct positions accumulate.

   **Inferred:** A sufficiently long imported game can freeze or exhaust the renderer. The host’s 8 MiB file limit does not limit replay memory to 8 MiB. No CastleSiege test covers this case. This leaves **R10’s no-crash handling** and the requested responsiveness audit incomplete.

   **Fix:** Make sheet replay incremental and cancellable. Avoid retaining a complete repetition map in every history snapshot. Add documented import limits where needed, and test a long legal prefix with an invalid final move. Validate before replacing the current game.

3. **Medium — CastleSiege shutdown and restart through the host have no integration test**

   [main.ts:1390](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:1390), [main.ts:829](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:829)

   **Observed:**

   ```ts
   const shutdown = (): void => {
     stopBot();
     music.stop();
     for (const off of offs) off();
   };
   ```

   The minimum reply delay uses an untracked timer:

   ```ts
   if (wait > 0) await new Promise((r) => setTimeout(r, wait));
   if (ctl.signal.aborted) return;
   ```

   **Derived:** The abort check should prevent a stale move, although the timer remains scheduled until it expires. Existing host tests close Writer, Tracker, and fixtures. CastleSiege’s sheet tests never close its app instance.

   This is a verification gap for **002 R10** and **003 R1/R13**, not proof of a leak. Reload and Open/New Game tests do not exercise host termination.

   **Fix:** Add a test-only host close path, without adding visible Close UI. Cover a live search, the reply delay, pending music loading, and active playback. Restart immediately, release stale work, and assert default state, stopped playback, correct process membership, and no changes from the previous instance.

4. **Low — R2 tests count the reference entries without proving visibility**

   [castlesiege-sheet.spec.ts:149](/Users/rargu/DevPageOS/tests/e2e/castlesiege-sheet.spec.ts:149)

   **Observed:**

   ```ts
   await expect(win.locator(".cs-cell")).toHaveCount(63);
   await expect(win.locator(".cs-side .cs-ref-item")).toHaveCount(6);
   ```

   The geometry check skips zero-size boxes and never checks `visibility` or opacity.

   **Derived:** Setting the piece reference to `visibility: hidden` preserves its count and geometry. These checks still pass while all six references disappear.

   This leaves the visibility part of **R2.a** without a direct assertion.

   **Fix:** Assert visibility for every board cell and reference entry. Keep the existing clipping and geometry checks.

5. **Low — The mid-victory test can fail when the runner pauses too late**

   [castlesiege-sheet.spec.ts:779](/Users/rargu/DevPageOS/tests/e2e/castlesiege-sheet.spec.ts:779)

   **Observed:**

   ```ts
   await expect.poll(slides).toBeGreaterThan(0);
   await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
   expect(await animating(page, `${WIN} .cs-victory`)).toBeGreaterThan(0);
   ```

   The victory animations finish within 960 ms.

   **Derived:** If runner communication is delayed beyond their completion, the test pauses no active victory animation and fails despite correct behavior.

   This makes **R9** verification sensitive to load.

   **Fix:** Capture and pause the victory animations inside the page when they start. Then change the preference and assert cancellation. Also cover enabling reduced motion during an active piece slide.

The remaining audit results:

- **Observed:** The R8 trace selects renderer-main-thread `RunTask` events, counts the task containing the start marker, and includes subsequent tasks through the reply marker. CPU throttling is ×4. The injected 250 ms task uses the same failure function. See [castlesiege-sheet-perf.spec.ts:124](/Users/rargu/DevPageOS/tests/e2e/castlesiege-sheet-perf.spec.ts:124).
- **Unverified:** That test does not establish the same limit for Hard, long-history replay, or search replacement through Open/New Game. Hard is reachable. Search still contains synchronous recursive calls, so the 12 ms yield target is not a universal upper bound. See [alphabeta.ts:362](/Users/rargu/DevPageOS/src/apps/castlesiege/ai/alphabeta.ts:362).
- **Observed:** The changed sheet behaviors are gated by `onSheet`. I found no new production old-OS behavior change. The four prior accepted fixes are present.
- **Observed:** `rg` found neither `__csThink` nor `__csMusic` in existing `dist/assets`. Both hooks are guarded by build mode in source.
- **Observed:** No new automatic CastleSiege network call was found. The online action calls `openExternal()`. Rules HTML comes from the repository document through the build-time renderer. Imported `.siege` content never reaches `innerHTML`.
- **Observed:** Existing production assets total **97.948 KiB gzip**, using a read-only traversal of literal asset references and gzip level 6. This agrees with 97.9 KiB and leaves about **2.05 KiB**. A fresh build was not checked.
- **Observed:** `layout.ts:25`, `docs/specs/001-sheet/spec.md:154`, and `tests/e2e/sheet.spec.ts:535` agree on **620 × 654**, with **demo height 427**.
- **Observed:** The inaccurate sheet help text is already recorded as an owner item in `003/spec.md:120`. It remains unresolved.

| Requirement / acceptance | Test, or missing coverage |
|---|---|
| R1.a–b | `tests/e2e/castlesiege-sheet.spec.ts:71`, `:97`. Host close/restart: **no test**. |
| R2.a | `tests/e2e/castlesiege-sheet.spec.ts:218`, `:233`; measurement at `castlesiege-sheet-perf.spec.ts:376`. Reference visibility: **no direct test**. |
| R3 | `tests/e2e/castlesiege-sheet.spec.ts:233`, including zoom bounds. |
| R4.a | `tests/e2e/castlesiege-sheet.spec.ts:282`; HTML safety assertions at `tests/unit/host-fs.test.ts:482`. |
| R5.a | `tests/e2e/castlesiege-sheet.spec.ts:504`, `:854`; cancellation unit test at `tests/unit/castlesiege/session.test.ts:107`. |
| R6.a | `tests/e2e/castlesiege-sheet.spec.ts:561`. |
| R7.a | `tests/e2e/castlesiege-sheet.spec.ts:675`; pending playback cancellation at `tests/unit/castlesiege-music.test.ts:140`. Direct Music-off during theme playback: **no app test**. |
| R8.a | `tests/e2e/castlesiege-sheet-perf.spec.ts:258`, `:294`, `:324`. Hard and replacement-path traces: **no test**. |
| R9.a | `tests/e2e/castlesiege-sheet.spec.ts:744`. Preference enabled during an active piece slide: **no test**. |
| R10.a | `tests/e2e/castlesiege-sheet.spec.ts:969`; illegal actions at `tests/unit/castlesiege/session.test.ts:69`; oversized host import at `tests/unit/host-fs.test.ts:267`. Wrong settings, long replay, and Black-side/Black-to-move download round trip: **no test**. |
| R11.a | `tests/e2e/castlesiege-sheet.spec.ts:1038`. |
| R12.a | `tests/e2e/castlesiege-sheet.spec.ts:413`. |
| R13.a | `tests/e2e/castlesiege.spec.ts:86`, `:463`, `:519`. Production hook absence checked manually, without a regression test. |

**Could not check:** Runtime reproduction, fresh build size, lint, unit tests, browser tests, timing under load, or actual audio playback. Per your constraints, I ran no tests, network, deploy, or git-write commands.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/003-castlesiege-live/spec.md (all, incl. "Advisor decisions" and notes) and tasks.md
- docs/specs/002-app-host/spec.md (Boundaries, "Lead notes"), docs/specs/001-sheet/spec.md (layout table, R13, R19, R21, R22)
- Earlier reviews whose accepted fixes are in: docs/review/spec-003-t2-t5-review-codex.md. Do not repeat fixed findings; look across tasks (T1, T6, T7, T8 had no separate review).
- docs/review/spec-003-mock-vs-build.md
- The change under review: the whole spec 003 implementation, committed range `git diff 9223298..64cc59e`. Use `--stat` first, then read every changed file under src/apps/castlesiege/, src/sheet/, scripts/, and the tests (tests/e2e/castlesiege-sheet.spec.ts, castlesiege-sheet-perf.spec.ts, castlesiege.spec.ts, tests/unit/castlesiege*, tests/unit/host-fs.test.ts, and changes to sheet*.ts).

Task: an implementation review of spec 003 as a whole before Verified (local). Check:
1. every requirement R1–R13 and acceptance check against the code and a test that can fail; list any requirement without a real test;
2. cross-task bugs in CastleSiege on the sheet: start defaults vs Open/New Game vs opponent/level/style changes vs bot cancellation vs music (theme/victory) vs reduced motion vs menu rebuild vs Save/Open vs history scroll; app close/restart through the host (002 R10) with timers, music and the bot still running;
3. R13: every sheet behaviour gated; the old OS unchanged; test-only hooks (`__csThink`, `__csMusic`) absent from production and harmless;
4. R8: the trace method is sound (what it counts, throttling, the negative test), and the bot cannot block > 200 ms in other paths (e.g. New Game/Open while thinking, Hard level if reachable on the sheet, hint/eval code);
5. R10: `.siege` parsing of untrusted files (invalid JSON, huge files, wrong types, illegal positions) — no crash, error shown, game kept;
6. R12: no request to castlesiege.fly.dev; R4 rules HTML safety;
7. budget (97.9 KiB of 100) and the window size change (654) consistency across layout.ts, tests and the 001 table;
8. test quality: tests that cannot fail, page.clock/seams that hide real behaviour, flakiness under load.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, old OS unchanged. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. Then a short table: requirement -> test (file:line) or "no test". End with what you could not check.
