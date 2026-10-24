# Spec 005 T1 and T2: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a16859-3f9c-7c53-a9f0-190b6e6cfbc6 · **Tokens:** 99,680
- **Date:** 2026-10-23 · **Scope:** uncommitted T1 + T2 working tree against `076dae1` (branch `spec-005-wip`). One
  review for both tasks: they were built in parallel and touch different files.
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Visibility tests use a fake windows object; the real `onMove` hook is untested | Partly accepted. The helper is not wired into `/next` until T3; T3's e2e must move a watched window by drag, throw, Home, Reset and Alt+Arrow and check the watcher sees it. Added to the T3 brief. |
| 2 | Build test does not check the generated `{ w, h, tags, durations, src }` | Accepted (T1). |
| 3 | Missing-file tests always import the virtual module, so `buildStart` is untested | Accepted (T1). |
| 4 | The helper has no factory-level `destroy()` | Rejected. It is created once per page and never recreated; a teardown would be unused code (ponytail). The inaccurate "at most once a frame" comment it found in `windows.ts` was fixed. |

## Codex output (verbatim)

No High findings. The findings below concern regression coverage and helper cleanup.

Evidence comes from `git status --short`, `git diff HEAD`, `nl -ba`, `rg`, and read-only JSON inspection with `python3 -B -c`. Consequences are labeled **Derived**.

1. **Medium — Tests bypass the real window-movement hook.** [tests/unit/visibility.test.ts:183](/Users/rargu/DevPageOS/tests/unit/visibility.test.ts:183)

   **Observed:** The test moves a fake window and emits the event itself:
   ```ts
   st.pos = to;
   moveCbs.forEach((cb) => cb(id));
   ```
   It never calls `createWindows()`.

   **Derived:** Removing the notification from `windows.ts:95` would leave these assertions unaffected. T2 requires visibility updates after real window moves, including Home, Reset and reduced-motion commits.

   **Fix:** Add an integration test using `createWindows()` with a DOM fixture. Cover drag, flight, Home, Reset, Alt+Arrow and live reduced-motion commits. Assert that visibility changes reach the watcher and frame scheduling stops after motion settles.

2. **Medium — The build test does not verify the generated metadata.** [tests/unit/castlewars-frames.test.ts:88](/Users/rargu/DevPageOS/tests/unit/castlewars-frames.test.ts:88)

   **Observed:** The build assertions check only a unit name and PNG filenames:
   ```ts
   expect(code.type === "chunk" && code.code).toContain("wizard");
   ```
   The changed-data fixture tests `parseFrames()` separately.

   **Derived:** The virtual module could omit `durations`, rename `tags`, or export incorrect dimensions without these build assertions detecting it. This leaves T1’s exported `{ w, h, tags, durations, src }` contract unprotected.

   **Fix:** Build a fixture that exposes the imported object, then inspect its value. Assert all five fields, inclusive tag endpoints, duration order and emitted PNG URLs. Include changed metadata through the plugin path.

3. **Medium — Missing-file tests do not protect builds without the virtual import.** [tests/unit/castlewars-frames.test.ts:29](/Users/rargu/DevPageOS/tests/unit/castlewars-frames.test.ts:29)

   **Observed:** Every missing-file test builds the same entry:
   ```ts
   rollupOptions: { input: { next: join(fixtures, "entry.js") } }
   ```
   That entry imports `virtual:castlewars-frames`. Both `buildStart` and `load` currently call `check()`.

   **Derived:** Removing `buildStart: check` would leave the fixture’s failure path intact through `load()`. A build without the virtual import could then miss deleted art. T1 explicitly requires missing files to fail the build.

   **Fix:** Add a clean entry without the virtual import. Build it with the plugin and assert failure for each of the twelve missing files. Keep the existing importing fixture.

4. **Low — The helper cannot release its own subscriptions.** [src/sheet/demos/visibility.ts:94](/Users/rargu/DevPageOS/src/sheet/demos/visibility.ts:94)

   **Observed:** The factory installs permanent subscriptions:
   ```ts
   view.onChange(() => check());
   wins.onMove((id) => check(id));
   document.addEventListener("visibilitychange", () => check());
   addEventListener("resize", () => check());
   ```
   A watch’s stop function only calls `watches.delete(w)`.

   **Derived:** Individual unsubscribe works. However, recreating the helper retains each previous instance through these listeners, even after all watches stop. This is a lifecycle limitation for T2’s shared helper.

   **Fix:** Add a factory-level `destroy()` with named event handlers. Make `onChange` and `onMove` return unsubscribe functions. Test destruction and recreation.

Static inspection found no mismatch in the current frame data: sizes, inclusive ranges, durations and frame order are preserved. PNG imports fit 001 R2.c. The missing-file check covers production builds and dev startup; deletion after dev startup has no unconditional recheck.

The visibility math correctly expands each side by half the view size and uses `toSheet()` for zoom and insets. Every listed movement path reaches `draw()`. Callback deduplication is present, and the helper schedules no animation frames. However, `onMove`’s “at most once a frame” comment is inaccurate: pointer handlers and the animation loop both call `draw()` directly.

**Could not check:** Build, lint, test results, browser behavior, emitted bundles or runtime idle traces. Per your constraints, I ran no test, build, network, deploy or git-write commands and changed no files.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/005-wip-windows/spec.md and tasks.md (rows T1 and T2); docs/specs/001-sheet/spec.md R2.b, R2.c, R22 and "Advisor decisions" (scroller insets); docs/specs/002-app-host/spec.md R11 (the expanded view rule); docs/specs/006-data-demos/spec.md R5 (006 reuses the visibility helper)
- The change under review: the uncommitted working tree against HEAD. Run `git status` and `git diff HEAD`, and read the new untracked files: scripts/castlewars-frames.ts, src/sheet/demos/visibility.ts, tests/unit/castlewars-frames.test.ts, tests/unit/visibility.test.ts, tests/fixtures/castlewars/*. Also read vite.config.ts, scripts/sheet-guard.ts, src/sheet/windows.ts, src/sheet/view.ts, and one of the JSON files in src/apps/castlewars/art/ (e.g. wizard.json).

Task: review two tasks.
T1 (frame-data generator, R2, R10): correctness of parsing Aseprite JSON (frame size, tag ranges inclusive, per-frame durations, frame order), the virtual module shape { w, h, tags, durations, src }, PNG assets imported as URLs and compliant with 001 R2.c, the build failing when any of the 12 files is missing (also in dev?), fixtures and tests that can fail.
T2 (visibility helper, R3, R4): the pure rule (eligible = current rect overlaps the view expanded by half a view width and height per side; visible = overlaps the view and the tab is visible), coordinate conversion with zoom and the scroller insets, reacting to pan, zoom, window moves (new onMove hook in windows.ts), visibilitychange and resize; callbacks only on change; no animation frames while idle (001 R22); unsubscribe/leaks; whether the onMove hook fires for every way a window moves (drag, flight, Home, Reset, Alt+Arrow, reduced-motion commits).

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, no change to old-OS code or files under src/apps/ (reading the art is allowed), never art-source/. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
