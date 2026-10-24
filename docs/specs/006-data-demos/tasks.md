# 006 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (ponytail), then run lint, unit and the named e2e. Start after 001 is `Verified (local)` and
005 T2 (the shared visibility helper) is done.

- [x] **T1** Seeded data modules (R1, R2, R4)
  - Acceptance: `crawler-data.ts` and `insider-data.ts` are seeded generators, one module per demo, using the mock's
    host/path lists and invented wallet ids. Same seed gives the same data; another seed gives different data.
    Crawler precision per strategy = relevant ÷ processed; each column keeps at most 14 rows. Insider flags a trade
    when its size ≥ 20 ($k) and it falls in the 14 hours before the spike; hours before = spike hour − trade hour.
  - Verify: `npm test` (unit R1.a counters and row cap, R2.a flag list for seed S, R4.a).
  - Files: `src/sheet/demos/crawler-data.ts`, `src/sheet/demos/insider-data.ts`, `tests/unit/crawler-data.test.ts`,
    `tests/unit/insider-data.test.ts`.
- [x] **T2** Contrast of rows and chart text (R8)
  - Acceptance: rejected rows keep ✗ and strike-through with no opacity that drops text below 4.5:1; ✓ rows, ✗ rows
    and canvas text meet 001 R18 in light and dark.
  - Verify: `npm test` (unit R8.a, composited contrast in both themes, added to the 001 contrast table test).
  - Files: `src/sheet/demos/demos.css`, `tests/unit/demo-contrast.test.ts`.
- [x] **T3** Crawler window (R1, R3, R5, R6, R9)
  - Acceptance: `crawler.ts` exports `mount(el)` / `unmount()`. Four columns stream simulated pages (✓/✗, score,
    host/path) with precision per column; the footer shows the sum of processed pages. At rest rows already show.
    Streaming starts when the window first becomes visible, stops off screen or in a hidden tab, and resumes from
    the same state; a visitor's Pause stays. The Pause button's name matches its action (Pause / Resume); Enter and
    Space work and never drag the window. The R3 sentence shows without scrolling. Unmount cancels every pending
    callback.
  - Verify: `npm run e2e` (e2e R1.a against the fixture stream, R1.b, R3.a, R5.a, R9.a).
  - Files: `src/sheet/demos/crawler.ts`, `src/sheet/demos/demos.css`, `src/sheet/main.ts`,
    `tests/e2e/data-demos.spec.ts`.
- [x] **T4** Insider window (R2, R3, R5, R6, R9, R10)
  - Acceptance: `insider.ts` exports `mount(el)` / `unmount()`. The invented market's chart draws over time, marks
    the spike and dots trades by size; flagged trades show wallet id, amount and hours before, with a highlighted dot
    at each one's hour. At rest the full chart and list show. Replay and unmount cancel every pending callback of the
    previous run. A text summary (spike hour, price change, flagged count) sits next to the canvas. The window says
    the R3 sentence and that it flags candidates and does not prove insider trading. The chart draws in logical sheet
    px; its backing store follows device pixel ratio; a resize keeps the playback state.
  - Verify: `npm run e2e` (e2e R2.a, R3.a, R5.a, R6.a, R9.a for Replay, R10.a at DPR 1 and 2).
  - Files: `src/sheet/demos/insider.ts`, `src/sheet/demos/demos.css`, `src/sheet/main.ts`,
    `tests/e2e/data-demos.spec.ts`.
- [x] **T5** Reduced motion and no network (R7, R11)
  - Acceptance: with reduced motion at start, after Replay and on a live change, rows, chart, flagged list and footer
    are complete at the next frame with no streaming. From navigation through Pause/Resume and Replay to completion,
    no request goes beyond the page's own build assets.
  - Verify: `npm run e2e` (e2e R7.a, R11.a with request logging).
  - Files: `src/sheet/demos/crawler.ts`, `src/sheet/demos/insider.ts`, `tests/e2e/data-demos.spec.ts`.
- [x] **T6** Live theme change and mock comparison (R8, R12)
  - Acceptance: after a live theme change, row and canvas text use the new theme's colours (canvas redrawn).
    compare-vs-mock against v0.6 for the R12 views (each window centred at 1440 × 900 and 390 × 844, light and dark;
    crawler paused; chart complete; Replay before the spike with time and seed frozen) lists only the allowed
    differences.
  - Verify: `npm run e2e` (e2e part of R8: computed colours before and after the scheme change);
    `docs/review/spec-006-mock-vs-build.md` (R12.a).
  - Files: `src/sheet/demos/insider.ts`, `tests/e2e/data-demos.spec.ts`, `docs/review/spec-006-mock-vs-build.md`.
- [x] **T7** Implementation review
  - Acceptance: Codex read-only review of the 006 diff saved to `docs/review/spec-006-impl-review-codex.md` with
    dispositions; accepted fixes done; status set to `Verified (local)`.
  - Verify: review file; full `npm run lint && npm test && npm run e2e:all`.
  - Files: `docs/review/`, `docs/specs/README.md`, `docs/ledger/`.

Coverage: R1–R12 all mapped.
