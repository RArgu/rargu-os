# 005 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (ponytail), then run lint, unit and the named e2e. Start after 001 is `Verified (local)`.

- [x] **T1** Frame-data generator (R2, R10)
  - Acceptance: one Vite plugin step reads the six JSON files in `src/apps/castlewars/art/` and exports
    `{ w, h, tags, durations }` per unit; the PNGs are imported as asset URLs (001 R2.c). The build fails with a
    message if any of the six PNG or JSON files is missing, so a later deletion (007) cannot pass unseen. The 001
    guard fixture with these assets passes; a fixture importing another `src/apps/castlewars/` file fails.
  - Verify: `npm test` (unit R2.a on a fixture JSON and on the real `wizard.json`: 80 × 50, walk = frames 2–9);
    `npm run build` (missing-file and guard fixtures).
  - Files: `scripts/castlewars-frames.ts`, `vite.config.ts`, `tests/unit/castlewars-frames.test.ts`,
    `tests/fixtures/castlewars/`.
- [x] **T2** Shared visibility helper (R3, R4)
  - Acceptance: `visibility.ts` reports "eligible" (current rectangle at current zoom overlaps the view expanded as in
    002 R11) and "visible" (current rectangle overlaps the view and the tab is visible). It reacts to pan, zoom,
    window moves and `visibilitychange`. 006 reuses it.
  - Verify: `npm test` (unit: eligible and visible at several zooms, hidden tab).
  - Files: `src/sheet/demos/visibility.ts`, `tests/unit/visibility.test.ts`.
- [x] **T3** Castle Wars mount, loading and retry (R1, R3, R5)
  - Acceptance: `castlewars.ts` exports `mount(el)` / `unmount()`; one mount per window, also after repeated
    activation. Sprite PNGs load when the window first becomes eligible or on activation. "Loading units…" shows
    until all six load. One failed image shows an error and Retry; Retry loads once with one timer chain. Buttons
    pressed before load set the animation that starts on load. The six units draw pixel-sharp; idle, walk, attack,
    victory and death loop with each frame's own JSON duration; the footer names the animation; text below the
    canvas names the six units.
  - Verify: `npm run e2e` (e2e R1.a with fake timers, R1.b at zoom 160 %, R3.a with a test layout, R5.a with a route
    returning 500).
  - Files: `src/sheet/demos/castlewars.ts`, `src/sheet/main.ts`, `src/sheet/sheet.css`, `tests/e2e/castlewars.spec.ts`.
- [x] **T4** Castle Wars pause, visibility and controls (R4, R8)
  - Acceptance: animation runs only while the window is visible and resumes from the same frame. A visitor's Pause
    stays paused across leaving and returning. Controls are native buttons, work by keyboard, set `aria-pressed` on
    the chosen animation, keep focus and never drag the window.
  - Verify: `npm run e2e` (e2e R4.a off-view and hidden tab, R8.a).
  - Files: `src/sheet/demos/castlewars.ts`, `tests/e2e/castlewars.spec.ts`.
- [x] **T5** Pentimento sketch (R6, R8)
  - Acceptance: `pentimento.ts` shows the sample image with text, the layers list and the command panel. "Run the
    agent" plays detect text → extract to a layer → fill behind it → "done: 2 layers" and adds the text layer. A new
    run cancels the previous run first; unmount cancels all timers. The footer and an on-screen line say "Sketch of
    the planned agent CLI · nothing built yet". A short completion message goes to a live region. The Run button is
    a native button that keeps focus and never drags the window.
  - Verify: `npm run e2e` (e2e R6.a including the second press and unmount mid-run, R6.b; R8 keyboard check on Run).
  - Files: `src/sheet/demos/pentimento.ts`, `src/sheet/main.ts`, `src/sheet/sheet.css`, `tests/e2e/pentimento.spec.ts`.
- [x] **T6** Reduced motion in both windows (R7)
  - Acceptance: at start and on a live change in either direction, Castle Wars shows the first frame of the chosen
    tag and changes only on a button press; a running Pentimento sketch jumps to its final state; new layers have no
    CSS animation.
  - Verify: `npm run e2e` (e2e R7.a).
  - Files: `src/sheet/demos/castlewars.ts`, `src/sheet/demos/pentimento.ts`, `src/sheet/sheet.css`,
    `tests/e2e/wip-motion.spec.ts`.
- [x] **T7** Mock comparison and budget (R9)
  - Acceptance: compare-vs-mock against v0.6 for the R9 views (each window centred at 1440 × 900 and 390 × 844, light
    and dark; Castle Wars on each animation, paused; Pentimento before and after a run) lists only the allowed
    differences. The `/next` first-load JS + CSS stays ≤ 100 KiB gzip (001 R22), with sprites outside it.
  - Verify: `docs/review/spec-005-mock-vs-build.md` (R9.a); `npm run build` size report; 001 e2e R22.a.
  - Files: `docs/review/spec-005-mock-vs-build.md`.
- [x] **T8** Implementation review
  - Acceptance: Codex read-only review of the 005 diff saved to `docs/review/spec-005-impl-review-codex.md` with
    dispositions; accepted fixes done; R10 noted for 007's inventory (the six PNG and JSON files are kept); status set
    to `Verified (local)`.
  - Verify: review file; full `npm run lint && npm test && npm run e2e:all`.
  - Files: `docs/review/`, `docs/specs/README.md`, `docs/ledger/`.

Coverage: R1–R10 all mapped.
