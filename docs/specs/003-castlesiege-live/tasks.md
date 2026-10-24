# 003 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (ponytail), then run lint, unit and the named e2e. Start after 002 is `Verified (local)`.

- [x] **T1** Measure the bot and the window first (R2, R8)
  - Acceptance: CastleSiege runs in its window through the 002 registry, with the resources
    `/usr/share/music/castlesiege-{theme,victory}.trk` and `/usr/share/doc/castlesiege.md` added to the allowlist.
    No other app change yet. A Chromium trace with CPU throttling ×4 records the longest main-thread task while the
    bot thinks, at Easy and Normal, from the start position and two fixed mid-game positions. The demo area and menu
    row heights for the wide layout at `--u` = 1 px and 16 px text are measured, and the outer size (inside the ~620
    px width) is written into the 001 layout table (`src/sheet/layout.ts` and the table in 001's Approach). Results
    go into the ledger. **Stop** if any task is over 200 ms: do not write other code; propose a Worker or deeper
    slicing as a spec amendment and wait for the owner (a Worker is Ask first).
  - Verify: `npm run e2e` (measurement run of e2e R8.a in Chromium, no pass/fail yet); ledger entry with the numbers
    per level and position; e2e R7.b of 001 with the new size.
  - Files: `src/sheet/host/resources.ts`, `src/sheet/layout.ts`, `docs/specs/001-sheet/spec.md` (layout table row),
    `tests/e2e/castlesiege-sheet-perf.spec.ts`, `docs/ledger/`.
- [x] **T2** Sheet start defaults and no autosave (R1, R13)
  - Acceptance: on `env.DISPLAY === "sheet"` only, each start is a new game against the bot, visitor White, Easy,
    Balanced, Music off. Autosave of the game and of `config.from` is off; explicit Save/Open still work. The old OS
    CastleSiege is unchanged.
  - Verify: `npm run e2e` (e2e R1.a, R1.b; R13.a: existing `tests/e2e/castlesiege.spec.ts` on `/`); `npm test`
    (existing `tests/unit/castlesiege/`).
  - Files: `src/apps/castlesiege/main.ts`, `src/apps/castlesiege/session.ts`, `tests/e2e/castlesiege-sheet.spec.ts`.
- [x] **T3** Wide layout on every screen (R2, R3)
  - Acceptance: the root has class `wide` at 1440 × 900 and 390 × 844; all 63 cells, the moves list, the six piece
    reference entries and the controls show with no clipped overflow; computed text size is 16 px. On a 390 px phone
    001's phone fit opens the same window at about 63 %.
  - Verify: `npm run e2e` (e2e R2.a in Chromium and mobile; R3 via 001 R15.a with the new size, mobile project).
  - Files: `src/apps/castlesiege/styles.css`, `src/apps/castlesiege/main.ts`, `tests/e2e/castlesiege-sheet.spec.ts`.
- [x] **T4** Menu row, Help panel and Play online (R4, R12, R13)
  - Acceptance: on the sheet the menu has Game (New Game…, Undo, Flip board, Save…, Open…), Options (Opponent: Bot /
    Hot-seat, Bot level, Bot style, Music) and Help (How to play, Rules, Play online ↗, About), in that order, with no
    Exit, lesson or Guide items. How to play and Rules open a panel in the window with `castlesiege.md` rendered by
    `marked`. Play online opens `https://castlesiege.fly.dev` in a new tab; the sheet makes no request to that host.
    The old OS still opens Reader for How to play when the lesson file is missing.
  - Verify: `npm run e2e` (e2e R4.a, R12.a with request logging; R13.a old-OS check with the lesson file removed).
  - Files: `src/apps/castlesiege/main.ts`, `src/apps/castlesiege/rules-panel.ts`,
    `tests/e2e/castlesiege-sheet.spec.ts`, `tests/e2e/castlesiege.spec.ts`.
- [x] **T5** Opponent switch and menu state (R5, R6)
  - Acceptance: changing Opponent keeps position and history; Hot-seat cancels a pending bot reply; level and style
    apply to the next search. The menu is rebuilt on state changes, so menu items, shortcuts and side controls agree
    (Undo enabled in the menu exactly when the side Undo button is). The rebuild is gated to the sheet unless the
    owner agrees to fix the old OS too (Ask first).
  - Verify: `npm run e2e` (e2e R5.a, R6.a); `npm test` (unit for the cancel of a pending reply in
    `tests/unit/castlesiege/`).
  - Files: `src/apps/castlesiege/main.ts`, `src/apps/castlesiege/session.ts`, `tests/e2e/castlesiege-sheet.spec.ts`,
    `tests/unit/castlesiege/session.test.ts`.
- [x] **T6** Music, sound and reduced motion (R7, R9)
  - Acceptance: no sound effects. Theme and victory music play only with Music on. Music off stops either song at
    once and cancels pending playback; Music on after a finished game does not start victory music. With reduced
    motion (at start or changed mid-game or mid-victory) there is no piece slide, victory drop or title flash.
  - Verify: `npm run e2e` (e2e R7.a with the test hook on the `Music` object, R9.a); `npm test`
    (`tests/unit/castlesiege-music.test.ts` extended).
  - Files: `src/apps/castlesiege/music.ts`, `src/apps/castlesiege/main.ts`, `src/apps/castlesiege/styles.css`,
    `tests/e2e/castlesiege-sheet.spec.ts`, `tests/unit/castlesiege-music.test.ts`.
- [x] **T7** Save/Open and history scroll (R10, R11)
  - Acceptance: Save… downloads a `.siege` file through the 002 rule; Open… of that file restores mode, side, level,
    style, history, side to move and position; an invalid file shows an error and keeps the game. History updates
    scroll only the move list element (no `scrollIntoView`), so the sheet view and focus never change.
  - Verify: `npm run e2e` (e2e R10.a with the Playwright `download` event, R11.a); `npm run e2e:all` Firefox and
    WebKit projects for R10.a.
  - Files: `src/apps/castlesiege/main.ts`, `tests/e2e/castlesiege-sheet.spec.ts`.
- [x] **T8** Bot responsiveness check and old-OS regression (R8, R13)
  - Acceptance: the T1 trace test becomes a pass/fail check: no task over 200 ms during 3 bot replies (×4 throttling,
    Easy and Normal, three positions), and a window drag during the search moves the window. A test that injects a
    250 ms task makes the check fail. All sheet-only code is behind `env.DISPLAY === "sheet"`; the old OS
    CastleSiege suite passes. compare-vs-mock for the CastleSiege window, with differences listed and reasoned.
  - Verify: `npm run e2e` (e2e R8.a trace in Chromium, plus the 250 ms negative test; R13.a); compare-vs-mock notes
    in `docs/review/spec-003-mock-vs-build.md`.
  - Files: `tests/e2e/castlesiege-sheet-perf.spec.ts`, `tests/e2e/castlesiege.spec.ts`,
    `docs/review/spec-003-mock-vs-build.md`.
- [x] **T9** Implementation review
  - Acceptance: Codex read-only review of the 003 diff saved to `docs/review/spec-003-impl-review-codex.md` with
    dispositions; accepted fixes done; status set to `Verified (local)`.
  - Verify: review file; full `npm run lint && npm test && npm run e2e:all`.
  - Files: `docs/review/`, `docs/specs/README.md`, `docs/ledger/`.

Coverage: R1–R13 all mapped.
