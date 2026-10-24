# Spec 005 critique (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -s read-only --ephemeral`
- **Model / effort:** gpt-6.1-sol / high
- **Session id:** 01a166e9-b0a1-7d61-8ccd-51b6208b948f · **Tokens:** 101,536
- **Date:** 2026-10-22 · **Commit:** 7b02c09

## Dispositions

Checked by Claude: 001 R2.b text (sprite imports would fail it), `wizard.json` durations, `reused.js:64` (no
cancel). All 11 accepted.

| # | Sev | Disposition | Change |
|---|---|---|---|
| 1 | High | Accepted | 001 Amendment 1 (R2.c) allows the six PNG/JSON files; needs owner re-approval. |
| 2 | Medium | Accepted | R3: eligibility rule; test layout far away; one mount. |
| 3 | Medium | Accepted | R6: a new run cancels the old; unmount cancels timers. |
| 4 | Medium | Accepted | R7: live preference changes; no layer animation. |
| 5 | Medium | Accepted | R4: in-view and hidden-tab suspension with resume checks. |
| 6 | Medium | Accepted | R1.a, R2.a, R6.a/b stronger. |
| 7 | Medium | Accepted | R5: loading and error with Retry. |
| 8 | Medium | Accepted | R1 Pause/Resume and unit names; R8 keyboard and `aria-pressed`. |
| 9 | Medium | Accepted | R9: named views and closed list of allowed differences. |
| 10 | Medium | Accepted | R10 + 007 assumption 1 keep the sprites. |
| 11 | Low | Accepted | JSON durations chosen; listed as an allowed difference. |

## Codex output (verbatim)

Revise spec 005 before approval. The main issues are the import policy, interrupted runs, and acceptance checks that permit incomplete behavior.

**Evidence:** Observed facts come from `nl -ba`, `rg`, `python3 -B -c`, `shasum -a 256`, and an isolated `node -e` simulation. Predicted consequences are labeled **Derived**. The approved HTML hash matches `docs/mockups/README.md:10` and contains the reviewed mock scripts.

1. **High — The proposed sprite imports conflict with spec 001.** [005/spec.md:55](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:55)

   **Observed:** Spec 001 permits `src/apps/` modules only through registered lazy app imports (`001-sheet/spec.md:66`). Spec 005 proposes JSON imports from that directory while explicitly bypassing the app host (`005/spec.md:12`).

   **Derived:** The proposed `import.meta.glob` route can fail the required import guard. Registering Castle Wars as a hosted app would contradict this spec’s approach.

   **Spec fix:** Add an explicit amendment to 001 R2.b permitting the six named sprite PNGs and their generated metadata. Keep Castle Wars application code forbidden. Require a build fixture that accepts these assets and rejects an unrelated app import.

2. **Medium — R6’s loading check can pass without testing deferral.** [005/spec.md:46](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:46)

   **Observed:** Castle Wars starts at x=1040 (`001-sheet/spec.md:148`). At the mock’s 1440-pixel desktop start view, it already overlaps the viewport (`part2.js:137`, `part3.js:3`). Spec 002 also expands that viewport for loading (`002-app-host/spec.md:62`).

   **Derived:** “No request before it came near” imposes no delay when the window starts near. A loader that never requests anything also passes R6.a.

   **Spec fix:** Replace “not with the sheet’s first load” with “not before eligibility; initially eligible windows may load immediately.” Test a fixture initially outside the expanded viewport. Assert zero requests before eligibility, successful loading afterward, and one mount despite repeated activation. Cover moved windows and zoom changes.

3. **Medium — Restarting Pentimento can leave multiple runs active.** [005/spec.md:29](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:29)

   **Observed:** Each mock activation creates another timer chain without canceling its predecessor (`reused.js:64`). An isolated execution with presses at 0 and 100 ms produced three layers and duplicated command lines. R4.a tests restarting only after completion.

   **Derived:** A direct port can display “done: 2 layers” while showing three layers. Pending work can also update an unmounted window.

   **Spec fix:** Add: “A new run cancels the previous run before resetting the sketch. Unmount cancels timers and prevents later callbacks from changing the window.” Test restart midway through extraction, exactly two final layers, one ordered command sequence, and no updates after unmount. Require repeated mount/unmount calls to avoid duplicate handlers.

4. **Medium — Reduced-motion checks omit CSS animation and live preference changes.** [005/spec.md:30](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:30)

   **Observed:** The mock animates new Pentimento layers with `pop .4s` (`part1.html:140`). Its motion preference is captured once (`part2.js:5`). R5.a checks final state timing, but does not prohibit that CSS animation.

   **Derived:** Immediate insertion can satisfy R5.a while the new layer still scales and fades. A startup-only preference check can ignore later changes.

   **Spec fix:** Require both demos to respond to preference changes. Under reduced motion, disable layer transitions and animations, cancel sprite timers, and draw the selected tag’s first frame. If Pentimento is running, commit its final state immediately. Test startup and both preference directions. Define this independently of host 002, since these demos do not require it.

5. **Medium — R3.a does not verify hidden-tab suspension or resumption.** [005/spec.md:41](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:41)

   **Observed:** R3 requires both viewport visibility and tab visibility (`005/spec.md:28`). Its acceptance check covers only an offscreen window and unchanged reduced-motion screenshots.

   **Derived:** An implementation that continues timers in a hidden tab can pass. A permanently stopped animator can also pass.

   **Spec fix:** Define separate loading and animation predicates: mount near the viewport, animate only inside it. Add positive frame advancement before suspension, unchanged callback counts while offscreen or hidden, and resumed advancement afterward. Evaluate the window’s current position at every zoom. Count timer callbacks as well as animation-frame callbacks.

6. **Medium — The functional checks permit frozen sprites and hardcoded metadata.** [005/spec.md:36](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:36)

   **Observed:** R1.a checks only membership in the attack range. R2.a reads `wizard.json`, rather than testing the generated metadata. R4.a checks layers but omits the command sequence and honesty label.

   **Derived:** A frozen first attack frame passes R1.a. Hardcoded runtime metadata passes R2.a if the test independently reads the source file. Removing the sketch disclaimer does not fail R4.a.

   **Spec fix:** Require observed advancement and wraparound for all five selectable animations across all six units. Test the actual metadata generator with a changed fixture. Assert Pentimento’s ordered scripted commands, two-layer result, and visible disclaimer before, during, and after replay. Keep these checks about the scripted sketch. Real detection, extraction, and inpainting remain outside scope (`005/spec.md:66`, `content/projects/pentimento.md:10`).

7. **Medium — Sprite loading has no failure or readiness contract.** [005/spec.md:52](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:52)

   **Observed:** The mock draws automatically only after all six image loads succeed. It has no error handler (`reused.js:43`). Animation buttons call drawing directly (`reused.js:45`). Spec 005 supplies no replacement behavior.

   **Derived:** One failed PNG can leave the whole display blank indefinitely. Host 002’s retry behavior does not cover these independent demos.

   **Spec fix:** Require a visible loading state and a local error with Retry. Define how animation selection behaves before images are ready. Test one failed image, successful retry without duplicate timers, and continued operation of other windows.

8. **Medium — Automatic looping has no pause control, and content accessibility is untested.** [005/spec.md:26](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:26)

   **Observed:** Every selectable animation loops. There is no pause action. The mock preserves selected-button state through `aria-pressed`, but its canvas names only “Castle Wars unit animations” (`reused.js:45`, `part1.html:265`). Spec 001’s accessibility requirement covers window navigation, not these controls (`001-sheet/spec.md:53`).

   **Derived:** A visitor cannot freeze a frame without changing a system preference. A screen-reader visitor receives no names for the six displayed units.

   **Spec fix:** Add Pause/Resume while retaining animation by default, consistent with the owner’s animated-sprite decision (`OWNER_QUESTIONS.md:18`). Require native keyboard controls, selected-state announcements, and text naming the six units. Require a concise Pentimento completion announcement. Test keyboard activation, preserved focus, selected state, and pause behavior.

9. **Medium — Visual acceptance permits arbitrary explanations and omits interaction states.** [005/spec.md:48](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:48)

   **Observed:** R7.a accepts any “reasoned” difference. It names no viewport, theme, or demo state. The earlier shell critique already identified this acceptance weakness (`docs/review/spec-001-critique-codex.md:160`).

   **Derived:** Missing content or changed geometry can pass with an explanation. A comparison of the initial view alone cannot inspect Pentimento.

   **Spec fix:** Require comparisons with each window centered at desktop and phone sizes, in both themes. Cover Castle Wars’ selectable states and Pentimento before and after a run. Accept only recorded owner decisions or explicit spec exceptions. Treat other differences as defects. Keep shell geometry changes in 001 and Quick tools layout changes in 004.

10. **Medium — Spec 007 incorrectly classifies the sprite source as removable old-OS material.** [005/spec.md:16](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:16)

    **Observed:** Spec 005 requires assets under `src/apps/castlewars/art/`. Spec 007 lists four retained apps and classifies the other apps as old-OS-only (`007-switch-over/spec.md:16`). It later deletes unused apps (`007-switch-over/spec.md:30`).

    **Derived:** That inventory is incorrect once 005 depends on Castle Wars art. Generated asset URLs can obscure this dependency during deletion review.

    **Spec fix:** Add a dependency note requiring 007 to retain the six PNGs and their metadata sources. Correct 007’s inventory before switch-over. Asset deletion belongs in 007, not this implementation.

11. **Low — Animation timing has two possible sources without an explicit choice.** [005/spec.md:55](/Users/rargu/DevPageOS/docs/specs/005-wip-windows/spec.md:55)

    **Observed:** The proposed metadata retains only dimensions and tags. The mock uses fixed animation intervals (`reused.js:40`). The JSON supplies per-frame durations, including unequal attack durations (`wizard.json:88`, `wizard.json:96`) and different walk durations between units (`archer.json:24`, `wizard.json:24`).

    **Derived:** Implementers can choose different timing policies while claiming to follow the real sheets.

    **Spec fix:** State the timing policy explicitly. If preserving the mock, name its five intervals and say source durations are intentionally unused. If using JSON durations, include them in generated metadata and record the approved difference.

**Could not check:** No `src/sheet/` implementation exists, as confirmed by `rg --files src/sheet tests`. Browser rendering, actual chunk output, accessibility behavior, performance, and live motion changes remain **Unverified**. I did not run build, lint, tests, or browser suites. The build and test pipelines generate files (`package.json:13`, `package.json:17`, `playwright.config.ts:16`). No files changed and no network actions ran.

## Prompt (verbatim)

You are an independent read-only reviewer for DevPageOS (being redesigned as RArgu OS). Do not modify files.

Read first: AGENTS.md; docs/specs/005-wip-windows/spec.md (the spec under review); docs/specs/001-sheet/spec.md, docs/specs/002-app-host/spec.md and the other specs in docs/specs/ it depends on (critiques in docs/review/); docs/OWNER_QUESTIONS.md (owner decisions, binding); docs/mockups/README.md; docs/mockups/rargu-os-src/reused.js (Castle Wars and Pentimento sections), docs/mockups/rargu-os-src/part2.js, src/apps/castlewars/art/*.json, content/projects/pentimento.md.

Task: critique spec 005 before the owner approves it. Check that each requirement is right about the current code and mock (cite path:line), testable, and that each acceptance check can fail. Look for missing requirements, conflicts with other specs or owner decisions, honesty of labels (simulated data, unbuilt features), performance and reduced motion, accessibility, and work that belongs in another spec.

Constraints: No network actions, no deploys, no file changes. Owner decisions in docs/OWNER_QUESTIONS.md are binding; flag a conflict rather than override one.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, the evidence, and a concrete fix to the spec text. Keep observed facts apart from inference. End with what you could not check.
