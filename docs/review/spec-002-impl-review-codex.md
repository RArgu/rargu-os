# Spec 002: Codex implementation review (whole spec, T9)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a169d1-31c0-70d2-9d66-407312540190 · **Tokens:** 594,625
- **Date:** 2026-10-23 · **Scope:** committed range `9bbaf2d..e2595f6` (T1–T8). This review also covers T8, which
  had no separate review.
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Host recovery leaves stale retry controls in other windows (R12) | Accepted. |
| 2 | A rejected pointer press can still click a button (001 R21) | Accepted. |
| 3 | Reset and blur free ownership without cancelling the app's gesture (001 R13, R21) | Accepted. |
| 4 | File operations bypass the start-attempt guard (R10, R12) | Accepted. |
| 5 | Concurrent CSS retries can start an app without its stylesheet (R12, R13) | Accepted. |
| 6 | No deterministic suspended-audio test (R17) | Accepted. |
| 7 | The placeholder test compares two empty arrays (001 R7) | Accepted. |
| — | Missing branch checks (prevented shortcut, Esc + Shift+Tab, eligibility after move at zoom) and 001 R22 with apps run/restarted/closed | Accepted. |
| — | `__hostBlockDownloads` in production | Kept: Codex agrees it only forces the existing fallback link. |

## Codex output (verbatim)

I found **five Medium defects and two Low test gaps**. Fix findings 1–5 before marking 002 **Verified (local)**.

**Observed** below means source or artifact inspection with `git diff`, `nl -ba`, `rg`, or read-only Python. **Derived** failures follow from that code. I did not reproduce them in a browser.

1. **Medium — Recovering the host leaves stale retry controls in other windows**

   [src/sheet/host/load.ts:402](/Users/rargu/DevPageOS/src/sheet/host/load.ts:402), [src/sheet/host/window.ts:176](/Users/rargu/DevPageOS/src/sheet/host/window.ts:176), [src/sheet/host/failure.ts:17](/Users/rargu/DevPageOS/src/sheet/host/failure.ts:17)

   **Observed:**
   ```ts
   run.area.dataset.host = "starting";
   ```
   A main window then uses `area.append(root)`. Neither operation removes an existing bootstrap error. Its old retry handler remains:
   ```ts
   area.replaceChildren();
   retry();
   ```

   **Derived:** Fail the initial host load while several windows are eligible. Retry one window, then activate another through the card. The second app starts beside its stale error. Pressing that old retry button removes the running app’s DOM, while its process remains running. This breaks **R12 recovery**.

   **Fix:** Remove bootstrap error UI when an idle run starts. Invalidate obsolete retry handlers. Add a test that recovers two affected windows through different activation paths.

2. **Medium — A rejected pointer press can still activate a button**

   [src/sheet/main.ts:228](/Users/rargu/DevPageOS/src/sheet/main.ts:228), [src/ui/widgets.ts:30](/Users/rargu/DevPageOS/src/ui/widgets.ts:30)

   **Observed:** A rejected claim only blocks `pointerdown`:
   ```ts
   e.preventDefault();
   e.stopPropagation();
   return;
   ```
   Shared buttons execute through a separate event:
   ```ts
   on: { click: onClick }
   ```

   **Derived:** Preventing `pointerdown` does not suppress the subsequent `click`. While one finger holds Paint, another can tap Tracker’s Play button and execute its action. This violates **001 R21’s single gesture rule**.

   The current test only counts `pointerdown` on Music’s root. It does not tap a control or check its action ([compact-host.spec.ts:148](/Users/rargu/DevPageOS/tests/e2e/compact-host.spec.ts:148)).

   **Fix:** Track rejected pointer sequences and suppress their resulting activation events. Preserve keyboard activation. Test Tracker’s actual Play action while Paint owns the gesture.

3. **Medium — Reset and blur release ownership without cancelling the app gesture**

   [src/sheet/main.ts:224](/Users/rargu/DevPageOS/src/sheet/main.ts:224), [src/apps/paint/main.ts:952](/Users/rargu/DevPageOS/src/apps/paint/main.ts:952)

   **Observed:** The cancellation callback only removes listeners and frees the pointer:
   ```ts
   const done = () => {
     for (const t of ENDS) removeEventListener(t, up, true);
     free(id);
   };
   ```
   Paint retains its stroke until `pointerup` or `pointercancel`. Its move handler continues when the pointer ID matches:
   ```ts
   if (!stroke || stroke.id !== ev.pointerId) return;
   advance(stroke, ev);
   ```

   **Derived:** Start a stroke, then activate Reset by keyboard while holding the pointer. The host releases ownership, but Paint retains the stroke and capture. Further movement continues drawing. Blur without a later pointer-up can leave the same stale state. This breaks **001 R13 and R21**.

   **Fix:** Separate normal release from cancellation. Cancellation must notify the original app target and release its capture. Cancel the whole app pointer set on cancellation or lost capture. Test pixels and capture after Reset and blur.

4. **Medium — File operations bypass the start-attempt guard**

   [src/sheet/host/load.ts:238](/Users/rargu/DevPageOS/src/sheet/host/load.ts:238), [src/sheet/host/fs.ts:162](/Users/rargu/DevPageOS/src/sheet/host/fs.ts:162), [src/sheet/host/fs.ts:190](/Users/rargu/DevPageOS/src/sheet/host/fs.ts:190)

   **Observed:** The OS receives the filesystem without a lifetime check:
   ```ts
   fs: files.fs,
   ```
   Writes mutate shared memory and attempt downloads before the guarded offer callback:
   ```ts
   const bytes = vfs.write(abs, data, o);
   if (isDocumentPath(abs)) offer(bytes.slice(), basename(abs));
   ```
   `openFile()` also resumes after picker and file-read awaits without checking the attempt.

   **Derived:** A delayed save from an ended attempt can overwrite a document written by its replacement. It can also download after closure, while its fallback link is suppressed by `live()`. Paint has this asynchronous boundary:
   ```ts
   await os.fs.writeFile(file, await encode());
   ```
   See [paint/main.ts:1042](/Users/rargu/DevPageOS/src/apps/paint/main.ts:1042).

   Pending pickers also retain their input and window-focus listener until normal settlement. Host cleanup cannot cancel them. This leaves **R10/R12 lifecycle cleanup** incomplete across T2, T7, and T8.

   **Fix:** Give file operations an attempt lifetime or abort signal. Check it before mutations and downloads, including after awaits. Abort pending pickers during cleanup. Test a delayed save/import across close and restart.

5. **Medium — Concurrent CSS retries can start an app without its stylesheet**

   [src/sheet/host/css-retry.ts:16](/Users/rargu/DevPageOS/src/sheet/host/css-retry.ts:16), [src/sheet/host/load.ts:408](/Users/rargu/DevPageOS/src/sheet/host/load.ts:408)

   **Observed:**
   ```ts
   const links = [...failedCss];
   failedCss.clear();
   await Promise.all(/* reload links */);
   ```
   Each retry independently calls `reloadCss()`.

   **Derived:** After two app stylesheets fail, retry A consumes both failed links. Retry B sees an empty set and continues before those reloads finish. The preload helper already remembers the failed CSS URLs. B can therefore reach `running` without CSS. If its replacement stylesheet fails again, B remains running without styles. This breaks **R12 recovery and R13**.

   Existing failure tests retry one window at a time.

   **Fix:** Share an in-flight CSS reload promise across callers. Every dependent start must await it and receive its failure. Test two concurrent retries with one replacement stylesheet held, then failed.

6. **Low — Suspended-audio recovery has no deterministic test**

   [tests/e2e/host-files.spec.ts:317](/Users/rargu/DevPageOS/tests/e2e/host-files.spec.ts:317)

   **Observed:**
   ```ts
   if (a.state !== "running") {
     await expect(play).toBeEnabled();
     await play.click();
     // assert another resume
   }
   ```
   The test does not force suspension.

   **Derived:** When audio starts normally, a broken second-attempt path passes unchanged. **R17’s suspended-context branch** therefore lacks a reliable regression check.

   **Fix:** Add a controlled case where the first resume leaves the context suspended. Require a second real click to attempt resume again. Keep the real-audio case separately.

7. **Low — The remaining placeholder test compares two empty arrays**

   [tests/e2e/sheet.spec.ts:448](/Users/rargu/DevPageOS/tests/e2e/sheet.spec.ts:448)

   **Observed:** `BUILT` now contains all eight window IDs. Both sides exclude those IDs:
   ```ts
   expect(areas.filter((a) => !BUILT.includes(a.id!))).toEqual(
     TABLE.filter(([id]) => !BUILT.includes(id)).map(/* ... */),
   );
   ```

   **Derived:** This assertion is always `[] === []`. Missing demo areas or incorrect placeholder properties cannot fail it. It no longer verifies **001 R7**.

   **Fix:** Delete the obsolete test, or replace it with assertions for the current hosted start controls and reserved sizes.

Every **R1–R18** has at least one substantive test. This is a source coverage map, not a passing test result.

| Requirement / acceptance | Test |
|---|---|
| R1 / R1.a | `tests/unit/host-os.test.ts:97`, `:153`, `:240`; runtime trap: `tests/e2e/host-files.spec.ts:327` |
| R2 / R2.a | `tests/unit/host-window.test.ts:41`; `tests/e2e/host-load.spec.ts:47` |
| R3 / R3.a | `tests/e2e/host-window.spec.ts:162`; minimum size: `tests/unit/host-dialogs.test.ts:306` |
| R4 / R4.a, R4.b | `tests/unit/host-dialogs.test.ts:45`, `:67`, `:78`; `tests/e2e/host-window.spec.ts:69`, `:209` |
| R5 / R5.a, R5.b | `tests/e2e/host-input.spec.ts:68`, `:114`, `:366`, `:390`, `:408` |
| R6 / R6.a–c | `tests/e2e/host-files.spec.ts:75`, `:114`, `:130`, `:144`, `:173`; path rules: `tests/unit/host-fs.test.ts:79` |
| R7 / R7.a | `tests/e2e/host-files.spec.ts:210`; resources/storage: `tests/unit/host-fs.test.ts:394`, `:509` |
| R8 / R8.a | `tests/e2e/host-files.spec.ts:234` |
| R9 / R9.a, R9.b | `tests/unit/host-bus.test.ts:55`; `tests/e2e/host-proc.spec.ts:92`, `:298` |
| R10 / R10.a, R10.b | `tests/e2e/host-proc.spec.ts:147`, `:199`, `:258`, `:308`; late file operations: **no test** |
| R11 / R11.a, R11.b | `tests/e2e/host-load.spec.ts:79`, `:134`, `:247`, `:263`, `:281`; touch: `compact-host.spec.ts:111` |
| R12 / R12.a | `tests/e2e/host-load.spec.ts:153`, `:179`, `:203`, `:318`, `:343`, `:360`; multiwindow recovery/concurrent CSS retry: **no test** |
| R13 / R13.a | `tests/e2e/host-styles.spec.ts:207`, `:212`, `:219`; CSS transform: `tests/unit/host-css.test.ts:8` |
| R14 / R14.a | `tests/e2e/host-styles.spec.ts:405`, `:435` |
| R15 / R15.a | `tests/unit/host-os.test.ts:362`; `tests/e2e/host-styles.spec.ts:506`; menus: `host-input.spec.ts:284` |
| R16 / R16.a | `tests/e2e/host-styles.spec.ts:551`, `:569` |
| R17 / R17.a | `tests/e2e/host-files.spec.ts:289`; forced suspension: **no test** |
| R18 / R18.a | `tests/e2e/host-input.spec.ts:194`, `:237`, `:257`, `:459`; touch: `compact-host.spec.ts:77`, `:134` |
| 001 R13/R21 with an active app gesture | Reset/blur cancellation of app state: **no test** |
| 001 R22 after all four apps run/restart and stop | **No dedicated test**. `tests/e2e/sheet-perf.spec.ts:99` covers the initial view. |

Additional missing branch checks: an app handler preventing a matching menu shortcut; Esc then **Shift+Tab** exit; eligibility after moving an unstarted hosted window at a non-default zoom. Existing tests cover adjacent behavior.

Other review results:

- **Observed:** Path normalization and document classification use directory boundaries. Save names use `basename()`, and reject empty/dot names. Menu and dialog data use `textContent`, not `innerHTML`. `openExternal()` restricts schemes and supplies `noopener,noreferrer`. See `memfs.ts:13`, `fs.ts:29`, `fs.ts:205`, `ui/dom.ts:26`, `host/os.ts:192`.
- **Observed:** The existing production graph contains no `__host`, `__hostMain`, `__hostMenu`, fixture IDs checked, or `?host=` override. `__hostBlockDownloads` remains. **Derived:** that hook is acceptable: it only forces the existing fallback and grants no additional capability.
- **Observed:** The guard checks source-level registry edges. The prior helper-import bypass has a regression test (`tests/unit/sheet-guard.test.ts:64`). Production rejects bundled test modules (`vite.config.ts:37`).
- **Observed:** Read-only traversal and gzip level 6 calculation of existing `dist/` assets gives **93.905 KiB**, leaving **6.095 KiB**. **Inferred:** 003/004 content can exhaust that margin. Unexposed `rm`, `rename`, and `watch` implementations are avoidable host code, but I measured no saving.
- **Observed:** The range changes no app, kernel, old filesystem, or window-server source, and adds no dependency. The shared menu also includes the previously accepted keyboard-selection scrolling fix. Theme listeners live once per host; window listeners use an abort controller; CastleSiege disconnects its observer on termination.
- **Observed:** The new host tests use real clicks, keys, chooser events, and touch input extensively. No fixed `waitForTimeout` sleeps appeared. **Inferred:** “same position twice” polling can report settled motion during a scheduling stall (`compact-host.spec.ts:63`, `host-styles.spec.ts:768`). Exact screenshot equality is also sensitive to rendering timing under parallel load.

**Could not check:** I ran no tests, lint, build, browser, network, deploy, or git-write commands. Fresh production output, dev/build parity, actual downloads, focus and insets, touch behavior, listener growth, audio output, Safari behavior, and old-OS boot remain **Unverified**. Existing `dist/` files do not prove a fresh build of `e2595f6`. No files were modified.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/002-app-host/spec.md (all, incl. Boundaries with the advisor amendment and "Lead notes") and tasks.md
- docs/specs/001-sheet/spec.md (R2.a + Amendment 2, R2.b, R12, R13, R18, R19, R21, R22, "Advisor decisions")
- Earlier per-task reviews whose accepted fixes are in: docs/review/spec-002-t1-review-codex.md, spec-002-t2-review-codex.md, spec-002-t3-review-codex.md, spec-002-t4-t6-review-codex.md, spec-002-t5-t7-review-codex.md. Do not repeat fixed findings; look for problems across tasks.
- The change under review: the whole spec 002 implementation, committed range `git diff 9bbaf2d..e2595f6` (T1–T8). Use `--stat` first, then read every changed file under src/sheet/host/, src/sheet/*.ts, src/ui/, scripts/, vite.config.ts, playwright.config.ts, and the tests (tests/unit/host-*, gestures, menu-placement, sheet-guard; tests/e2e/host-*.spec.ts, compact-host.spec.ts, and changes to sheet*.ts).

Task: an implementation review of spec 002 as a whole before Verified (local). Check:
1. every requirement R1–R18 and acceptance check against the code and a test that can fail; list any requirement without a real test;
2. cross-task bugs: start/stop/restart/close lifecycle with panels, menus, gestures, focus, theme listeners, bus subscriptions, download offers; leaks of listeners/observers across restarts; idle frames (001 R22) with apps running;
3. security: the memory fs path handling, download names, openExternal, menu text rendering (any innerHTML from app/menu data?), test-only hooks absent from production (`__host`, `__hostMain`; `__hostBlockDownloads` is still in production — acceptable?), the `?host=` URL hook;
4. the build: guard (registry edge only), `?host` CSS split and the CSS transform, manualChunks "ui" effect on `/`, `no-test-modules`, `dist-e2e`, budget 93.9 KiB of 100 — anything avoidable, any risk 003/004 will break it;
5. 001 regressions: keyboard (R4.b, R19 incl. the Esc-then-Tab exit), gestures (R21), Reset (R13), card navigation (R12), focus reveal, insets;
6. old OS at `/` unchanged except the approved `src/ui/dom.ts` and `src/ui/menu.ts` placement change and the `ui` chunk split;
7. test quality: tests that cannot fail, sleeps, synthetic events where real input is possible, flakiness risks under parallel load (several fixes tonight were for WebKit timing).

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, app source unchanged in 002 except the approved shared-UI changes, old OS working. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. Then a short table: requirement -> test (file:line) or "no test". End with what you could not check.
